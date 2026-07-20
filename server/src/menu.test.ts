import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { app, httpServer } from '../src/index';
import { User } from '../src/models/User';
import { Restaurant } from '../src/models/Restaurant';
import { RestaurantStaff } from '../src/models/RestaurantStaff';
import { Category } from '../src/models/Category';
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
});
