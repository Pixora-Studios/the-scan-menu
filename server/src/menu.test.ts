import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { app, httpServer } from '../src/index';
import { User } from '../src/models/User';
import { Restaurant } from '../src/models/Restaurant';
import { RestaurantStaff } from '../src/models/RestaurantStaff';
import { Category } from '../src/models/Category';
import { Table } from '../src/models/Table';
import { MenuItem } from '../src/models/MenuItem';
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

describe('Phase 3 Categories & Menu Items Integration Tests', () => {
  it('should block category deletion if it contains menu items, and allow otherwise', async () => {
    // 1. Setup restaurant and manager
    const passwordHash = await bcrypt.hash('PixoraDemo123!', 10);
    const manager = await User.create({
      email: 'manager@pixora.dev',
      passwordHash,
      role: 'MANAGER',
      name: 'Manager',
      isActive: true,
    });

    const restaurant = await Restaurant.create({
      name: 'Pizza Palace',
      slug: 'pizza-palace',
      isActive: true,
    });

    await RestaurantStaff.create({
      userId: manager.id,
      restaurantId: restaurant.id,
      role: 'MANAGER',
      isActive: true,
    });

    // Login
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'manager@pixora.dev', password: 'PixoraDemo123!' });
    const token = loginRes.body.data.accessToken;

    // Create Category
    const catRes = await request(app)
      .post(`/api/v1/restaurants/${restaurant.id}/categories`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Sourdough Pizzas', description: 'Freshly baked' });

    expect(catRes.status).toBe(201);
    const categoryId = catRes.body.data._id;

    // Create a Menu Item inside this category
    const itemRes = await request(app)
      .post(`/api/v1/restaurants/${restaurant.id}/menu-items`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        categoryId,
        name: 'Margherita',
        description: 'Classic cheese pizza',
        price: 59900, // 599.00 INR (paise)
      });
    expect(itemRes.status).toBe(201);

    // Attempt to delete category (should be blocked with 409 Conflict)
    const delCatFail = await request(app)
      .delete(`/api/v1/restaurants/${restaurant.id}/categories/${categoryId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(delCatFail.status).toBe(409);
    expect(delCatFail.body.success).toBe(false);
    expect(delCatFail.body.error.code).toBe('CONFLICT');

    // Delete MenuItem
    const delItem = await request(app)
      .delete(`/api/v1/restaurants/${restaurant.id}/menu-items/${itemRes.body.data._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(delItem.status).toBe(200);

    // Attempt to delete empty category (should now succeed with 200 OK)
    const delCatSuccess = await request(app)
      .delete(`/api/v1/restaurants/${restaurant.id}/categories/${categoryId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(delCatSuccess.status).toBe(200);
    expect(delCatSuccess.body.success).toBe(true);
  });

  it('should reject attaching a menu item to a category belonging to a different restaurant', async () => {
    const passwordHash = await bcrypt.hash('PixoraDemo123!', 10);

    // Create Manager A & Restaurant A
    const managerA = await User.create({
      email: 'managerA@pixora.dev',
      passwordHash,
      role: 'MANAGER',
      name: 'Manager A',
      isActive: true,
    });
    const restaurantA = await Restaurant.create({
      name: 'Restaurant A',
      slug: 'restaurant-a',
      isActive: true,
    });
    await RestaurantStaff.create({
      userId: managerA.id,
      restaurantId: restaurantA.id,
      role: 'MANAGER',
      isActive: true,
    });

    // Create Restaurant B
    const restaurantB = await Restaurant.create({
      name: 'Restaurant B',
      slug: 'restaurant-b',
      isActive: true,
    });

    // Create Category in Restaurant B (different tenant!)
    const categoryB = await Category.create({
      restaurantId: restaurantB.id,
      name: 'Desserts B',
      sortOrder: 0,
      isActive: true,
    });

    // Login as Manager A
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'managerA@pixora.dev', password: 'PixoraDemo123!' });
    const tokenA = loginRes.body.data.accessToken;

    // Create Menu Item for Restaurant A but try to use Category B (should fail with 400 Bad Request)
    const itemRes = await request(app)
      .post(`/api/v1/restaurants/${restaurantA.id}/menu-items`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        categoryId: categoryB.id,
        name: 'Tiramisu',
        description: 'Italian dessert',
        price: 35000,
      });

    expect(itemRes.status).toBe(400);
    expect(itemRes.body.success).toBe(false);
    expect(itemRes.body.error.code).toBe('BAD_REQUEST');
  });

  it('should successfully handle reordering categories in a single bulk action', async () => {
    const passwordHash = await bcrypt.hash('PixoraDemo123!', 10);
    const manager = await User.create({
      email: 'manager@pixora.dev',
      passwordHash,
      role: 'MANAGER',
      name: 'Manager',
      isActive: true,
    });

    const restaurant = await Restaurant.create({
      name: 'Pizza Palace',
      slug: 'pizza-palace',
      isActive: true,
    });

    await RestaurantStaff.create({
      userId: manager.id,
      restaurantId: restaurant.id,
      role: 'MANAGER',
      isActive: true,
    });

    // Login
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'manager@pixora.dev', password: 'PixoraDemo123!' });
    const token = loginRes.body.data.accessToken;

    // Create three categories
    const cat1 = await Category.create({ restaurantId: restaurant.id, name: 'Cat 1', sortOrder: 0, isActive: true });
    const cat2 = await Category.create({ restaurantId: restaurant.id, name: 'Cat 2', sortOrder: 1, isActive: true });
    const cat3 = await Category.create({ restaurantId: restaurant.id, name: 'Cat 3', sortOrder: 2, isActive: true });

    // Call reorder with new sorted array: cat3, cat1, cat2
    const reorderRes = await request(app)
      .patch(`/api/v1/restaurants/${restaurant.id}/categories-reorder`)
      .set('Authorization', `Bearer ${token}`)
      .send({ categoryIds: [cat3.id, cat1.id, cat2.id] });

    expect(reorderRes.status).toBe(200);

    // Verify sortOrder updated in database
    const dbCat1 = await Category.findById(cat1.id);
    const dbCat2 = await Category.findById(cat2.id);
    const dbCat3 = await Category.findById(cat3.id);

    expect(dbCat3?.sortOrder).toBe(0);
    expect(dbCat1?.sortOrder).toBe(1);
    expect(dbCat2?.sortOrder).toBe(2);
  });

  it('should successfully retrieve the nested public menu for a valid restaurant slug and table token', async () => {
    // 1. Setup restaurant
    const restaurant = await Restaurant.create({
      name: 'Gourmet Pizza',
      slug: 'gourmet-pizza',
      isActive: true,
    });

    // 2. Setup table
    const table = await Table.create({
      restaurantId: restaurant.id,
      tableNumber: '12',
      displayName: 'Table 12',
      token: 'secureToken21CharactersLongXYZ',
      isActive: true,
      qrCodeUrl: '/api/v1/restaurants/someid/tables/someid/qr',
    });

    // 3. Setup categories (one active, one inactive)
    const activeCategory = await Category.create({
      restaurantId: restaurant.id,
      name: 'Starters',
      sortOrder: 1,
      isActive: true,
    });

    const inactiveCategory = await Category.create({
      restaurantId: restaurant.id,
      name: 'Drinks Inactive',
      sortOrder: 2,
      isActive: false,
    });

    // 4. Setup menu items (one available, one unavailable under activeCategory, and one under inactiveCategory)
    await MenuItem.create({
      restaurantId: restaurant.id,
      categoryId: activeCategory.id,
      name: 'Garlic Bread',
      description: 'Warm and buttery',
      price: 25000,
      isAvailable: true,
      sortOrder: 1,
    });

    await MenuItem.create({
      restaurantId: restaurant.id,
      categoryId: activeCategory.id,
      name: 'Cheese Sticks',
      description: 'With marinara sauce',
      price: 35000,
      isAvailable: false,
      sortOrder: 2,
    });

    await MenuItem.create({
      restaurantId: restaurant.id,
      categoryId: inactiveCategory.id,
      name: 'Cola',
      description: 'Chilled',
      price: 15000,
      isAvailable: true,
      sortOrder: 1,
    });

    // 5. Test resolveTable public endpoint
    const resolveRes = await request(app)
      .get(`/api/v1/public/restaurants/${restaurant.slug}/tables/${table.token}`);

    expect(resolveRes.status).toBe(200);
    expect(resolveRes.body.success).toBe(true);
    expect(resolveRes.body.data.restaurant.slug).toBe('gourmet-pizza');
    expect(resolveRes.body.data.table.tableNumber).toBe('12');

    // 6. Test public menu endpoint
    const menuRes = await request(app)
      .get(`/api/v1/public/restaurants/${restaurant.slug}/tables/${table.token}/menu`);

    expect(menuRes.status).toBe(200);
    expect(menuRes.body.success).toBe(true);

    const categoriesList = menuRes.body.data;
    // Only active category should be returned
    expect(categoriesList).toHaveLength(1);
    expect(categoriesList[0]._id.toString()).toBe(activeCategory.id);
    expect(categoriesList[0].name).toBe('Starters');

    // Both available and unavailable items in active category should be returned
    expect(categoriesList[0].menuItems).toHaveLength(2);
    expect(categoriesList[0].menuItems[0].name).toBe('Garlic Bread');
    expect(categoriesList[0].menuItems[0].isAvailable).toBe(true);
    expect(categoriesList[0].menuItems[1].name).toBe('Cheese Sticks');
    expect(categoriesList[0].menuItems[1].isAvailable).toBe(false);
  });
});
