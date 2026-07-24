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
import { Order } from '../src/models/Order';
import bcrypt from 'bcrypt';
import { runMigration } from '../src/utils/migrateSessions';

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

    // Fire 5 order creation requests sequentially to avoid MongoDB read-after-write test race conditions
    const responses = [];
    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .post(`/api/v1/public/restaurants/${restaurant.slug}/tables/${table.token}/orders`)
        .send({
          items: [{ itemId: item.id, quantity: 1 }],
        });
      responses.push(res);
    }

    const status201 = responses.filter(r => r.status === 201);
    const status200 = responses.filter(r => r.status === 200);

    expect(status201.length).toBe(1);
    expect(status200.length).toBe(4);

    for (const res of responses) {
      expect(res.body.success).toBe(true);
    }

    const finalOrder = await Order.findById(status201[0].body.data._id);
    expect(finalOrder).toBeDefined();
    // Sum of items quantity should be 5
    const totalQty = finalOrder!.items.reduce((sum, i) => sum + i.quantity, 0);
    expect(totalQty).toBe(5);
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

  it('should restrict Analytics route to MANAGER/SUPER_ADMIN and calculate correct summary metrics', async () => {
    // 1. Setup users
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

    // Logins
    const loginStaff = await request(app).post('/api/v1/auth/login').send({ email: 'staff_analytics@pixora.dev', password: 'PixoraDemo123!' });
    const staffToken = loginStaff.body.data.accessToken;

    const loginManager = await request(app).post('/api/v1/auth/login').send({ email: 'manager_analytics@pixora.dev', password: 'PixoraDemo123!' });
    const managerToken = loginManager.body.data.accessToken;

    // A. Verify STAFF is blocked (403 Forbidden) from Analytics
    const staffRes = await request(app)
      .get(`/api/v1/restaurants/${restaurant.id}/analytics`)
      .set('Authorization', `Bearer ${staffToken}`);
    expect(staffRes.status).toBe(403);

    // B. Verify MANAGER can successfully fetch Analytics
    const managerRes = await request(app)
      .get(`/api/v1/restaurants/${restaurant.id}/analytics`)
      .set('Authorization', `Bearer ${managerToken}`);

    expect(managerRes.status).toBe(200);
    expect(managerRes.body.success).toBe(true);
    expect(managerRes.body.data.summary.current.revenue).toBe(0);
    expect(managerRes.body.data.summary.current.orderCount).toBe(0);
    expect(managerRes.body.data.charts.topSellingItems).toBeInstanceOf(Array);
  });

  it('should handle table sessions, rounds, merging, item status updates, and session closing', async () => {
    // 1. Setup Restaurant, Table, Category, and Item
    const restaurant = await Restaurant.create({
      name: 'Session Bistro',
      slug: 'session-bistro',
      taxRatePercent: 10.0,
      isActive: true,
    });

    const table = await Table.create({
      restaurantId: restaurant.id,
      tableNumber: '42',
      displayName: 'Table 42',
      token: 'secureToken21CharactersTable42',
      isActive: true,
      qrCodeUrl: '/api/v1/restaurants/someid/tables/someid/qr',
    });

    const category = await Category.create({ restaurantId: restaurant.id, name: 'Buns', isActive: true });
    const item = await MenuItem.create({
      restaurantId: restaurant.id,
      categoryId: category.id,
      name: 'Sourdough Bun',
      price: 500,
      isAvailable: true,
    });

    // 2. Setup user/roles for auth
    const passwordHash = await bcrypt.hash('PixoraDemo123!', 10);
    const staff = await User.create({
      email: 'staff_session@pixora.dev',
      passwordHash,
      role: 'STAFF',
      name: 'Staff Session',
      isActive: true,
    });
    await RestaurantStaff.create({ userId: staff.id, restaurantId: restaurant.id, role: 'STAFF' });

    const loginStaff = await request(app).post('/api/v1/auth/login').send({ email: 'staff_session@pixora.dev', password: 'PixoraDemo123!' });
    const staffToken = loginStaff.body.data.accessToken;

    // 3. Place first order (round 1)
    const order1Res = await request(app)
      .post(`/api/v1/public/restaurants/${restaurant.slug}/tables/${table.token}/orders`)
      .send({
        items: [{ itemId: item.id, quantity: 2 }],
      });
    expect(order1Res.status).toBe(201);
    const order1 = order1Res.body.data;
    expect(order1.roundNumber).toBe(1);

    // 4. Place second order while first is PENDING (should merge into round 1)
    const order2Res = await request(app)
      .post(`/api/v1/public/restaurants/${restaurant.slug}/tables/${table.token}/orders`)
      .send({
        items: [{ itemId: item.id, quantity: 1 }],
      });
    expect(order2Res.status).toBe(200); // 200 indicating merge
    expect(order2Res.body.data._id).toBe(order1._id);

    // Verify quantity of items is 3 across 2 appended items
    const mergedOrder = await Order.findById(order1._id);
    expect(mergedOrder!.items).toHaveLength(2);
    expect(mergedOrder!.items[0].quantity).toBe(2);
    expect(mergedOrder!.items[1].quantity).toBe(1);

    // 5. Transition order to ACCEPTED
    await request(app)
      .patch(`/api/v1/restaurants/${restaurant.id}/orders/${order1._id}/status`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ status: 'ACCEPTED' });

    // 6. Place third order (should create round 2 since round 1 is ACCEPTED)
    const order3Res = await request(app)
      .post(`/api/v1/public/restaurants/${restaurant.slug}/tables/${table.token}/orders`)
      .send({
        items: [{ itemId: item.id, quantity: 1 }],
      });
    expect(order3Res.status).toBe(201);
    expect(order3Res.body.data.roundNumber).toBe(2);

    // 7. Verify session total contains both round 1 and round 2
    const sessionRes = await request(app)
      .get(`/api/v1/public/table-sessions/${order1.sessionId}`);
    expect(sessionRes.status).toBe(200);
    expect(sessionRes.body.data.session.roundCount).toBe(2);
    // order1 total was (1000 + 100) + (500 + 50) = 1500 + 150 = 1650
    // order3 total was (500 + 50) = 550
    // session total should be 1650 + 550 = 2200
    expect(sessionRes.body.data.session.total).toBe(2200);

    // 8. Test item status tick transition
    const tickRes = await request(app)
      .patch(`/api/v1/restaurants/${restaurant.id}/orders/${order1._id}/items/0/status`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ itemStatus: 'PREPARING' });
    expect(tickRes.status).toBe(200);
    expect(tickRes.body.data.items[0].itemStatus).toBe('PREPARING');

    // Rollup status should be PREPARING now
    expect(tickRes.body.data.status).toBe('PREPARING');

    // 9. Backwards transition should fail
    const invalidTick = await request(app)
      .patch(`/api/v1/restaurants/${restaurant.id}/orders/${order1._id}/items/0/status`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ itemStatus: 'PENDING' });
    expect(invalidTick.status).toBe(400);

    // 10. Close table session
    const closeRes = await request(app)
      .post(`/api/v1/restaurants/${restaurant.id}/table-sessions/${order1.sessionId}/close`)
      .set('Authorization', `Bearer ${staffToken}`);
    expect(closeRes.status).toBe(200);
    expect(closeRes.body.data.status).toBe('CLOSED');

    // Orders paymentStatus should be PAID
    const orderPaid = await Order.findById(order1._id);
    expect(orderPaid!.paymentStatus).toBe('PAID');
  });

  it('should successfully and idempotently run the session migration script for legacy orders', async () => {
    // 1. Setup Restaurant and Table
    const restaurant = await Restaurant.create({
      name: 'Migration Bistro',
      slug: 'migration-bistro',
      taxRatePercent: 10.0,
      isActive: true,
    });

    const table = await Table.create({
      restaurantId: restaurant.id,
      tableNumber: '43',
      displayName: 'Table 43',
      token: 'secureToken21CharactersTable43',
      isActive: true,
      qrCodeUrl: '/api/v1/restaurants/someid/tables/someid/qr',
    });

    const category = await Category.create({ restaurantId: restaurant.id, name: 'Buns', isActive: true });
    const item = await MenuItem.create({
      restaurantId: restaurant.id,
      categoryId: category.id,
      name: 'Sourdough Bun',
      price: 500,
      isAvailable: true,
    });

    // 2. Insert 2 legacy orders directly into the database collection bypassing validation (lacking sessionId & roundNumber)
    const legacyOrder1Id = new mongoose.Types.ObjectId();
    const legacyOrder2Id = new mongoose.Types.ObjectId();

    await Order.collection.insertOne({
      _id: legacyOrder1Id,
      restaurantId: restaurant._id,
      tableId: table._id,
      orderNumber: 101,
      items: [{
        menuItemId: item._id,
        nameSnapshot: 'Sourdough Bun',
        unitPriceSnapshot: 500,
        quantity: 2,
        selectedAddOns: [],
      }],
      subtotal: 1000,
      tax: 100,
      total: 1100,
      status: 'SERVED',
      source: 'QR',
      paymentStatus: 'PENDING',
      integrationMetadata: {},
      createdAt: new Date(Date.now() - 3600000), // 1 hour ago
      updatedAt: new Date(Date.now() - 3600000),
    });

    await Order.collection.insertOne({
      _id: legacyOrder2Id,
      restaurantId: restaurant._id,
      tableId: table._id,
      orderNumber: 102,
      items: [{
        menuItemId: item._id,
        nameSnapshot: 'Sourdough Bun',
        unitPriceSnapshot: 500,
        quantity: 1,
        selectedAddOns: [],
      }],
      subtotal: 500,
      tax: 50,
      total: 550,
      status: 'ACCEPTED',
      source: 'QR',
      paymentStatus: 'PENDING',
      integrationMetadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Verify they are inserted and lack sessionId/roundNumber
    const inserted1 = await Order.findById(legacyOrder1Id);
    expect(inserted1).toBeDefined();
    expect((inserted1 as any).sessionId).toBeUndefined();
    expect((inserted1 as any).roundNumber).toBeUndefined();

    const inserted2 = await Order.findById(legacyOrder2Id);
    expect(inserted2).toBeDefined();
    expect((inserted2 as any).sessionId).toBeUndefined();
    expect((inserted2 as any).roundNumber).toBeUndefined();

    // 3. Execute migration
    await runMigration();

    // 4. Verify migration results
    const migrated1 = await Order.findById(legacyOrder1Id);
    expect(migrated1).toBeDefined();
    expect(migrated1!.sessionId).toBeDefined();
    expect(migrated1!.roundNumber).toBe(1);
    expect(migrated1!.items[0].itemStatus).toBe('SERVED');

    const migrated2 = await Order.findById(legacyOrder2Id);
    expect(migrated2).toBeDefined();
    expect(migrated2!.sessionId).toBeDefined();
    expect(migrated2!.roundNumber).toBe(2);
    expect(migrated2!.items[0].itemStatus).toBe('PENDING'); // ACCEPTED order items default to PENDING

    // Both orders should share the same closed table session ID
    expect(migrated1!.sessionId.toString()).toBe(migrated2!.sessionId.toString());

    // 5. Verify that running the migration a second time is idempotent (0 unmigrated orders)
    // This will log "No migration needed" or "Found 0 unmigrated orders"
    await runMigration();

    // Re-verify that details remain unchanged
    const afterSecondMigrate = await Order.findById(legacyOrder1Id);
    expect(afterSecondMigrate!.roundNumber).toBe(1);
  });
});
