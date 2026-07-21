import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { app, httpServer } from '../src/index';
import { User } from '../src/models/User';
import { Restaurant } from '../src/models/Restaurant';
import { RestaurantStaff } from '../src/models/RestaurantStaff';
import { Category } from '../src/models/Category';
import { MenuItem } from '../src/models/MenuItem';
import { Table } from '../src/models/Table';
import bcrypt from 'bcrypt';

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();

  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  await mongoose.connect(mongoUri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
  await new Promise<void>((resolve) => {
    httpServer.close(() => resolve());
  });
});

beforeEach(async () => {
  // Clear collections
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

describe('Phase 5 Orders & State Machine Integration Tests', () => {
  it('should place an order with server-recomputed pricing and tax calculations', async () => {
    // 1. Setup Restaurant (with 5% tax rate) and Table
    const restaurant = await Restaurant.create({
      name: 'Tasty Bites',
      slug: 'tasty-bites',
      taxRatePercent: 5.0,
      isActive: true,
    });

    const table = await Table.create({
      restaurantId: restaurant.id,
      tableNumber: '1',
      displayName: 'Table 1',
      token: 'secureToken21CharactersTable1',
      isActive: true,
      qrCodeUrl: '/api/v1/restaurants/someid/tables/someid/qr',
    });

    // 2. Setup Category & Menu Items
    const category = await Category.create({
      restaurantId: restaurant.id,
      name: 'Pizzas',
      isActive: true,
      sortOrder: 1,
    });

    const item = await MenuItem.create({
      restaurantId: restaurant.id,
      categoryId: category.id,
      name: 'Veg Margherita',
      price: 1000, // 10.00 base price
      isAvailable: true,
      sortOrder: 1,
      addOns: [
        { name: 'Extra Cheese', priceDelta: 200 }, // 2.00
      ],
    });

    // 3. Post order with a client-side cart (with client price manip - base should be 1000 + 200 = 1200)
    // Client sent malicious unitPriceSnapshot = 100, the server MUST ignore it and compute 1200
    const orderRes = await request(app)
      .post(`/api/v1/public/restaurants/${restaurant.slug}/tables/${table.token}/orders`)
      .send({
        items: [
          {
            itemId: item.id,
            quantity: 2,
            selectedAddOns: [{ name: 'Extra Cheese', priceDelta: 50 }], // client manip delta
            specialInstructions: 'No onions',
          },
        ],
        customerNote: 'Deliver quickly',
      });

    expect(orderRes.status).toBe(201);
    expect(orderRes.body.success).toBe(true);

    const createdOrder = orderRes.body.data;
    expect(createdOrder.orderNumber).toBe(1);

    // Recomputed math:
    // unitPriceSnapshot = 1000 (base) + 200 (cheese) = 1200
    // quantity = 2 -> subtotal = 1200 * 2 = 2400
    // tax = Math.round(2400 * 5 / 100) = 120
    // total = 2400 + 120 = 2520
    expect(createdOrder.items[0].unitPriceSnapshot).toBe(1200);
    expect(createdOrder.items[0].selectedAddOns[0].priceDelta).toBe(200);
    expect(createdOrder.subtotal).toBe(2400);
    expect(createdOrder.tax).toBe(120);
    expect(createdOrder.total).toBe(2520);
    expect(createdOrder.customerNote).toBe('Deliver quickly');
    expect(createdOrder.status).toBe('PENDING');
  });

  it('should reject the entire order with ITEMS_UNAVAILABLE if any item becomes unavailable or its category inactive', async () => {
    const restaurant = await Restaurant.create({
      name: 'Tasty Bites',
      slug: 'tasty-bites',
      isActive: true,
    });

    const table = await Table.create({
      restaurantId: restaurant.id,
      tableNumber: '1',
      displayName: 'Table 1',
      token: 'secureToken21CharactersTable1',
      isActive: true,
      qrCodeUrl: '/api/v1/restaurants/someid/tables/someid/qr',
    });

    const activeCat = await Category.create({ restaurantId: restaurant.id, name: 'Active', isActive: true });
    const inactiveCat = await Category.create({ restaurantId: restaurant.id, name: 'Inactive', isActive: false });

    // Item 1: Available
    const item1 = await MenuItem.create({
      restaurantId: restaurant.id,
      categoryId: activeCat.id,
      name: 'Available Pizza',
      price: 1000,
      isAvailable: true,
    });

    // Item 2: Unavailable
    const item2 = await MenuItem.create({
      restaurantId: restaurant.id,
      categoryId: activeCat.id,
      name: 'Unavailable Pizza',
      price: 1000,
      isAvailable: false,
    });

    // Item 3: Category inactive
    const item3 = await MenuItem.create({
      restaurantId: restaurant.id,
      categoryId: inactiveCat.id,
      name: 'Inactive Category Item',
      price: 1000,
      isAvailable: true,
    });

    // Post order with all 3 items -> should reject because item2 is unavailable and item3 has inactive category
    const orderRes = await request(app)
      .post(`/api/v1/public/restaurants/${restaurant.slug}/tables/${table.token}/orders`)
      .send({
        items: [
          { itemId: item1.id, quantity: 1 },
          { itemId: item2.id, quantity: 1 },
          { itemId: item3.id, quantity: 1 },
        ],
      });

    expect(orderRes.status).toBe(400);
    expect(orderRes.body.success).toBe(false);
    expect(orderRes.body.error.code).toBe('ITEMS_UNAVAILABLE');

    const details = orderRes.body.error.details;
    expect(details).toHaveLength(2);
    expect(details.some((d: any) => d.menuItemId === item2.id && d.reason === 'unavailable')).toBe(true);
    expect(details.some((d: any) => d.menuItemId === item3.id && d.reason === 'category_inactive')).toBe(true);
  });

  it('should generate orderNumbers sequentially and concurrently handle requests without duplicates', async () => {
    const restaurant = await Restaurant.create({
      name: 'Tasty Bites',
      slug: 'tasty-bites',
      isActive: true,
    });

    const table = await Table.create({
      restaurantId: restaurant.id,
      tableNumber: '1',
      displayName: 'Table 1',
      token: 'secureToken21CharactersTable1',
      isActive: true,
      qrCodeUrl: '/api/v1/restaurants/someid/tables/someid/qr',
    });

    const category = await Category.create({ restaurantId: restaurant.id, name: 'Active', isActive: true });
    const item = await MenuItem.create({
      restaurantId: restaurant.id,
      categoryId: category.id,
      name: 'Burgers',
      price: 500,
      isAvailable: true,
    });

    // Fire 5 order creation requests near-simultaneously to test concurrency
    const requests = Array.from({ length: 5 }).map(() =>
      request(app)
        .post(`/api/v1/public/restaurants/${restaurant.slug}/tables/${table.token}/orders`)
        .send({
          items: [{ itemId: item.id, quantity: 1 }],
        })
    );

    const responses = await Promise.all(requests);

    for (const res of responses) {
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    }

    const orderNumbers = responses.map((res) => res.body.data.orderNumber);
    // Sort and ensure they are exactly [1, 2, 3, 4, 5]
    orderNumbers.sort((a, b) => a - b);
    expect(orderNumbers).toEqual([1, 2, 3, 4, 5]);
  });

  it('should enforce status transition limits and role authorization checks for cancelation', async () => {
    // 1. Setup restaurant, table, categories, items, and users
    const passwordHash = await bcrypt.hash('PixoraDemo123!', 10);
    const staff = await User.create({
      email: 'staff@pixora.dev',
      passwordHash,
      role: 'STAFF',
      name: 'Staff',
      isActive: true,
    });

    const manager = await User.create({
      email: 'manager@pixora.dev',
      passwordHash,
      role: 'MANAGER',
      name: 'Manager',
      isActive: true,
    });

    const restaurant = await Restaurant.create({
      name: 'Bakehouse',
      slug: 'bakehouse',
      isActive: true,
    });

    // Link both staff and manager to restaurant staff mapping
    await RestaurantStaff.create({ userId: staff.id, restaurantId: restaurant.id, role: 'STAFF' });
    await RestaurantStaff.create({ userId: manager.id, restaurantId: restaurant.id, role: 'MANAGER' });

    const table = await Table.create({
      restaurantId: restaurant.id,
      tableNumber: '15',
      displayName: 'Table 15',
      token: 'secureToken21CharactersLongTable15',
      isActive: true,
      qrCodeUrl: '/api/v1/restaurants/someid/tables/someid/qr',
    });

    const category = await Category.create({ restaurantId: restaurant.id, name: 'Sides', isActive: true });
    const item = await MenuItem.create({
      restaurantId: restaurant.id,
      categoryId: category.id,
      name: 'Fries',
      price: 300,
      isAvailable: true,
    });

    // Logins
    const loginStaff = await request(app).post('/api/v1/auth/login').send({ email: 'staff@pixora.dev', password: 'PixoraDemo123!' });
    const staffToken = loginStaff.body.data.accessToken;

    const loginManager = await request(app).post('/api/v1/auth/login').send({ email: 'manager@pixora.dev', password: 'PixoraDemo123!' });
    const managerToken = loginManager.body.data.accessToken;

    // Create an order
    const orderRes = await request(app)
      .post(`/api/v1/public/restaurants/${restaurant.slug}/tables/${table.token}/orders`)
      .send({ items: [{ itemId: item.id, quantity: 1 }] });
    const orderId = orderRes.body.data._id;

    // A. Verify invalid state transition: PENDING -> SERVED directly should fail with 400
    const invalidTrans = await request(app)
      .patch(`/api/v1/restaurants/${restaurant.id}/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ status: 'SERVED' });

    expect(invalidTrans.status).toBe(400);
    expect(invalidTrans.body.success).toBe(false);
    expect(invalidTrans.body.error.code).toBe('INVALID_STATUS_TRANSITION');

    // B. Verify STAFF can update PENDING -> ACCEPTED
    const validTrans1 = await request(app)
      .patch(`/api/v1/restaurants/${restaurant.id}/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ status: 'ACCEPTED' });

    expect(validTrans1.status).toBe(200);
    expect(validTrans1.body.data.status).toBe('ACCEPTED');

    // C. Verify STAFF is BLOCKED (403) from CANCELLED
    const staffCancel = await request(app)
      .post(`/api/v1/restaurants/${restaurant.id}/orders/${orderId}/cancel`)
      .set('Authorization', `Bearer ${staffToken}`);

    expect(staffCancel.status).toBe(403);
    expect(staffCancel.body.success).toBe(false);

    // Also STAFF patching status to CANCELLED should fail
    const staffPatchCancel = await request(app)
      .patch(`/api/v1/restaurants/${restaurant.id}/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ status: 'CANCELLED' });

    expect(staffPatchCancel.status).toBe(403);
    expect(staffPatchCancel.body.success).toBe(false);

    // D. Verify MANAGER can cancel order
    const managerCancel = await request(app)
      .post(`/api/v1/restaurants/${restaurant.id}/orders/${orderId}/cancel`)
      .set('Authorization', `Bearer ${managerToken}`);

    expect(managerCancel.status).toBe(200);
    expect(managerCancel.body.data.status).toBe('CANCELLED');
  });

  it('should enforce role checks and calculate correct summary metrics for Analytics endpoint', async () => {
    // 1. Setup users and restaurant
    const passwordHash = await bcrypt.hash('PixoraDemo123!', 10);
    const staff = await User.create({
      email: 'staff_analytics@pixora.dev',
      passwordHash,
      role: 'STAFF',
      name: 'Staff',
      isActive: true,
    });

    const manager = await User.create({
      email: 'manager_analytics@pixora.dev',
      passwordHash,
      role: 'MANAGER',
      name: 'Manager',
      isActive: true,
    });

    const restaurant = await Restaurant.create({
      name: 'Analytics Grill',
      slug: 'analytics-grill',
      isActive: true,
    });

    await RestaurantStaff.create({ userId: staff.id, restaurantId: restaurant.id, role: 'STAFF' });
    await RestaurantStaff.create({ userId: manager.id, restaurantId: restaurant.id, role: 'MANAGER' });

    const table = await Table.create({
      restaurantId: restaurant.id,
      tableNumber: '20',
      displayName: 'Table 20',
      token: 'secureToken21CharactersLongTable20',
      isActive: true,
      qrCodeUrl: '/api/v1/restaurants/someid/tables/someid/qr',
    });

    const category = await Category.create({
      restaurantId: restaurant.id,
      name: 'Pizzas',
      isActive: true,
      sortOrder: 1,
    });

    const item = await MenuItem.create({
      restaurantId: restaurant.id,
      categoryId: category.id,
      name: 'Paneer Tikka',
      price: 500,
      isAvailable: true,
      sortOrder: 1,
    });

    // Logins
    const loginStaff = await request(app).post('/api/v1/auth/login').send({ email: 'staff_analytics@pixora.dev', password: 'PixoraDemo123!' });
    const staffToken = loginStaff.body.data.accessToken;

    const loginManager = await request(app).post('/api/v1/auth/login').send({ email: 'manager_analytics@pixora.dev', password: 'PixoraDemo123!' });
    const managerToken = loginManager.body.data.accessToken;

    // Create a served order (to test fulfillmentTime calculation)
    const order1 = await request(app)
      .post(`/api/v1/public/restaurants/${restaurant.slug}/tables/${table.token}/orders`)
      .send({
        items: [
          {
            itemId: item.id,
            quantity: 2,
            selectedAddOns: [],
          },
        ],
      });
    const orderId = order1.body.data._id;

    // Accept, prepare, ready, serve
    await request(app).patch(`/api/v1/restaurants/${restaurant.id}/orders/${orderId}/status`).set('Authorization', `Bearer ${managerToken}`).send({ status: 'ACCEPTED' });
    await request(app).patch(`/api/v1/restaurants/${restaurant.id}/orders/${orderId}/status`).set('Authorization', `Bearer ${managerToken}`).send({ status: 'PREPARING' });
    await request(app).patch(`/api/v1/restaurants/${restaurant.id}/orders/${orderId}/status`).set('Authorization', `Bearer ${managerToken}`).send({ status: 'READY' });
    await request(app).patch(`/api/v1/restaurants/${restaurant.id}/orders/${orderId}/status`).set('Authorization', `Bearer ${managerToken}`).send({ status: 'SERVED' });

    // Define dates for query
    const now = new Date();
    const startDate = new Date(now.getTime() - 60000).toISOString(); // 1 minute ago
    const endDate = new Date(now.getTime() + 60000).toISOString(); // 1 minute later

    // A. STAFF must be blocked from analytics
    const staffResponse = await request(app)
      .get(`/api/v1/restaurants/${restaurant.id}/analytics?startDate=${startDate}&endDate=${endDate}`)
      .set('Authorization', `Bearer ${staffToken}`);

    expect(staffResponse.status).toBe(403);
    expect(staffResponse.body.success).toBe(false);

    // B. MANAGER must succeed
    const managerResponse = await request(app)
      .get(`/api/v1/restaurants/${restaurant.id}/analytics?startDate=${startDate}&endDate=${endDate}`)
      .set('Authorization', `Bearer ${managerToken}`);

    expect(managerResponse.status).toBe(200);
    expect(managerResponse.body.success).toBe(true);

    const data = managerResponse.body.data;
    expect(data.summary.revenue.current).toBe(1000); // 500 * 2 = 1000 cents
    expect(data.summary.orderCount.current).toBe(1);
    expect(data.summary.aov.current).toBe(1000);
    expect(data.summary.fulfillmentTime.current).toBeGreaterThanOrEqual(0);
    expect(data.charts.statusBreakdown.find((x: any) => x.status === 'SERVED')?.count).toBe(1);
    expect(data.tables).toHaveLength(1);
    expect(data.tables[0].displayName).toBe('Table 20');
  });
});
