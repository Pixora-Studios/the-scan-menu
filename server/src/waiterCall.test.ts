import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { app, httpServer } from '../src/index';
import { User } from '../src/models/User';
import { Restaurant } from '../src/models/Restaurant';
import { RestaurantStaff } from '../src/models/RestaurantStaff';
import { Table } from '../src/models/Table';
import { WaiterCall } from '../src/models/WaiterCall';
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
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

describe('Phase 7 Waiter Call Integration Tests', () => {
  it('should successfully place a waiter call, check active status, and perform deduplication rate-limiting', async () => {
    const restaurant = await Restaurant.create({
      name: 'Eatery Pizza',
      slug: 'eatery-pizza',
      isActive: true,
    });

    const table = await Table.create({
      restaurantId: restaurant.id,
      tableNumber: '10',
      displayName: 'Table 10',
      token: 'secureToken21CharactersLongTable10',
      isActive: true,
      qrCodeUrl: '/api/v1/restaurants/someid/tables/someid/qr',
    });

    // 1. Check initially active waiter call (should be null)
    const initActiveRes = await request(app)
      .get(`/api/v1/public/tables/${table.token}/waiter-call/active`);

    expect(initActiveRes.status).toBe(200);
    expect(initActiveRes.body.success).toBe(true);
    expect(initActiveRes.body.data).toBeNull();

    // 2. Call waiter
    const callRes = await request(app)
      .post(`/api/v1/public/tables/${table.token}/waiter-call`);

    expect(callRes.status).toBe(201);
    expect(callRes.body.success).toBe(true);
    expect(callRes.body.data.status).toBe('PENDING');
    expect(callRes.body.data.tableNumberSnapshot).toBe('10');

    const firstCallId = callRes.body.data._id;

    // 3. Duplicate call waiter: should perform deduplication and return 200 with the SAME record
    const dupCallRes = await request(app)
      .post(`/api/v1/public/tables/${table.token}/waiter-call`);

    expect(dupCallRes.status).toBe(200);
    expect(dupCallRes.body.success).toBe(true);
    expect(dupCallRes.body.data._id).toBe(firstCallId);
    expect(dupCallRes.body.data.status).toBe('PENDING');

    // 4. Check active waiter call lookup: should return our open call
    const activeRes = await request(app)
      .get(`/api/v1/public/tables/${table.token}/waiter-call/active`);

    expect(activeRes.status).toBe(200);
    expect(activeRes.body.success).toBe(true);
    expect(activeRes.body.data._id).toBe(firstCallId);
    expect(activeRes.body.data.status).toBe('PENDING');
  });

  it('should enforce status transitions and permissions on staff operations', async () => {
    // 1. Setup staff and restaurant
    const passwordHash = await bcrypt.hash('PixoraDemo123!', 10);
    const staff = await User.create({
      email: 'staff-waiter@pixora.dev',
      passwordHash,
      role: 'STAFF',
      name: 'Staff Sockets',
      isActive: true,
    });

    const restaurant = await Restaurant.create({
      name: 'Eatery Pizza',
      slug: 'eatery-pizza',
      isActive: true,
    });

    await RestaurantStaff.create({
      userId: staff.id,
      restaurantId: restaurant.id,
      role: 'STAFF',
      isActive: true,
    });

    const table = await Table.create({
      restaurantId: restaurant.id,
      tableNumber: '10',
      displayName: 'Table 10',
      token: 'secureToken21CharactersLongTable10',
      isActive: true,
      qrCodeUrl: '/api/v1/restaurants/someid/tables/someid/qr',
    });

    // Login
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'staff-waiter@pixora.dev', password: 'PixoraDemo123!' });
    const token = loginRes.body.data.accessToken;

    // Create a PENDING WaiterCall
    const waiterCall = await WaiterCall.create({
      restaurantId: restaurant.id,
      tableId: table.id,
      tableNumberSnapshot: table.tableNumber,
      status: 'PENDING',
    });

    // A. Invalid transition: directly transitioning PENDING -> RESOLVED should be rejected
    const invalidRes = await request(app)
      .patch(`/api/v1/restaurants/${restaurant.id}/waiter-calls/${waiterCall._id}/resolve`)
      .set('Authorization', `Bearer ${token}`);

    expect(invalidRes.status).toBe(400);
    expect(invalidRes.body.success).toBe(false);
    expect(invalidRes.body.error.code).toBe('INVALID_STATUS_TRANSITION');

    // B. Valid: STAFF acknowledges PENDING -> ACKNOWLEDGED
    const ackRes = await request(app)
      .patch(`/api/v1/restaurants/${restaurant.id}/waiter-calls/${waiterCall._id}/acknowledge`)
      .set('Authorization', `Bearer ${token}`);

    expect(ackRes.status).toBe(200);
    expect(ackRes.body.success).toBe(true);
    expect(ackRes.body.data.status).toBe('ACKNOWLEDGED');
    expect(ackRes.body.data.acknowledgedAt).toBeDefined();

    // C. Valid: STAFF resolves ACKNOWLEDGED -> RESOLVED
    const resolveRes = await request(app)
      .patch(`/api/v1/restaurants/${restaurant.id}/waiter-calls/${waiterCall._id}/resolve`)
      .set('Authorization', `Bearer ${token}`);

    expect(resolveRes.status).toBe(200);
    expect(resolveRes.body.success).toBe(true);
    expect(resolveRes.body.data.status).toBe('RESOLVED');
    expect(resolveRes.body.data.resolvedAt).toBeDefined();
    expect(resolveRes.body.data.resolvedBy.toString()).toBe(staff.id);
  });
});
