import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { app, httpServer } from '../src/index';
import { Restaurant } from '../src/models/Restaurant';
import { Category } from '../src/models/Category';
import { MenuItem } from '../src/models/MenuItem';
import { Table } from '../src/models/Table';
import { IntegrationSyncLog } from '../src/models/IntegrationSyncLog';
import { IntegrationFactory } from '../src/integrations/core/IntegrationFactory';
import { NotImplementedError } from '../src/integrations/core/NotImplementedError';

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

describe('Phase 12 POS Integration Seam & Sync Logs Tests', () => {
  it('should successfully factory-resolve NoOp integration and write an ORDER_SYNCED log on order placement', async () => {
    // 1. Setup restaurant with integrationConfig provider 'NONE'
    const restaurant = await Restaurant.create({
      name: 'Integration Diner',
      slug: 'integration-diner',
      isActive: true,
      integrationConfig: {
        provider: 'NONE',
        config: {},
      },
    });

    const table = await Table.create({
      restaurantId: restaurant._id,
      tableNumber: '1',
      displayName: 'Table 1',
      token: 'secureTokenTable1IntegrationSeam',
      isActive: true,
      qrCodeUrl: '/dummy',
    });

    const category = await Category.create({
      restaurantId: restaurant._id,
      name: 'Grills',
      isActive: true,
    });

    const item = await MenuItem.create({
      restaurantId: restaurant._id,
      categoryId: category._id,
      name: 'Steak',
      price: 1500,
      isAvailable: true,
    });

    // 2. Place an order
    const orderRes = await request(app)
      .post(`/api/v1/public/restaurants/${restaurant.slug}/tables/${table.token}/orders`)
      .send({
        items: [{ itemId: item.id, quantity: 1 }],
      });

    expect(orderRes.status).toBe(201);
    expect(orderRes.body.success).toBe(true);

    const orderId = orderRes.body.data._id;

    // Give asynchronous non-blocking promise thread a tiny tick to execute saving to DB
    await new Promise((resolve) => setTimeout(resolve, 150));

    // 3. Verify IntegrationSyncLog exists and is set to 'ORDER_SYNCED'
    const log = await IntegrationSyncLog.findOne({ orderId: new mongoose.Types.ObjectId(orderId) });
    expect(log).not.toBeNull();
    expect(log?.provider).toBe('NONE');
    expect(log?.status).toBe('ORDER_SYNCED');
  });

  it('should factory-resolve PETPOOJA stub and throw NotImplementedError when pushOrder is called', async () => {
    const adapter = IntegrationFactory.getAdapter('PETPOOJA');
    expect(adapter.pushOrder({})).rejects.toThrow(NotImplementedError);
  });
});
