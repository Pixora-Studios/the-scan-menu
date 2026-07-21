import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createServer, Server as HTTPServer } from 'http';
import { io as ioc, Socket as ClientSocket } from 'socket.io-client';
import express from 'express';
import { SocketService } from '../src/sockets/socket.service';
import { Restaurant } from '../src/models/Restaurant';
import { RestaurantStaff } from '../src/models/RestaurantStaff';
import { User } from '../src/models/User';
import { TokenService } from '../src/services/token.service';

let mongoServer: MongoMemoryServer;
let server: HTTPServer;
let port: number;
const tokenService = new TokenService();

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();

  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  await mongoose.connect(mongoUri);

  // Set up an express app and http server specifically for socket testing
  const app = express();
  server = createServer(app);

  // Initialize Socket.io on our server
  SocketService.getInstance().init(server, 'http://localhost:5173');

  // Start listening on a dynamic random port
  await new Promise<void>((resolve) => {
    server.listen(0, () => {
      const address = server.address();
      port = typeof address === 'string' ? 0 : address?.port || 0;
      resolve();
    });
  });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
});

beforeEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

describe('Phase 6 Socket.IO Authentication & Room Authorization Tests', () => {
  it('should allow joining an order room anonymously without token', async () => {
    const clientSocket: ClientSocket = ioc(`http://localhost:${port}`);

    const orderId = new mongoose.Types.ObjectId().toString();

    await new Promise<void>((resolve, reject) => {
      clientSocket.on('connect', () => {
        clientSocket.emit('join_order', { orderId });
      });

      clientSocket.on('joined_order', (data) => {
        expect(data.orderId).toBe(orderId);
        clientSocket.disconnect();
        resolve();
      });

      clientSocket.on('error', (err) => {
        clientSocket.disconnect();
        reject(new Error(`Should not have received socket error: ${err.message}`));
      });
    });
  });

  it('should reject joining a restaurant room if token is completely missing', async () => {
    const clientSocket: ClientSocket = ioc(`http://localhost:${port}`);

    const restaurantId = new mongoose.Types.ObjectId().toString();

    await new Promise<void>((resolve) => {
      clientSocket.on('connect', () => {
        clientSocket.emit('join_restaurant', { restaurantId });
      });

      clientSocket.on('error', (err) => {
        expect(err.code).toBe('UNAUTHORIZED');
        expect(err.message).toContain('token');
        clientSocket.disconnect();
        resolve();
      });

      clientSocket.on('joined_restaurant', () => {
        clientSocket.disconnect();
        resolve();
      });
    });
  });

  it('should reject joining a restaurant room if token is invalid or expired', async () => {
    const clientSocket: ClientSocket = ioc(`http://localhost:${port}`, {
      auth: { token: 'Bearer invalid_token_here' },
    });

    const restaurantId = new mongoose.Types.ObjectId().toString();

    await new Promise<void>((resolve) => {
      clientSocket.on('connect', () => {
        clientSocket.emit('join_restaurant', { restaurantId });
      });

      clientSocket.on('error', (err) => {
        expect(err.code).toBe('UNAUTHORIZED');
        expect(err.message).toContain('invalid');
        clientSocket.disconnect();
        resolve();
      });

      clientSocket.on('joined_restaurant', () => {
        clientSocket.disconnect();
        resolve();
      });
    });
  });

  it('should successfully join restaurant room if user is MANAGER with active staff record', async () => {
    // 1. Create a mock manager user and restaurant
    const user = await User.create({
      email: 'manager-socket@pixora.dev',
      passwordHash: 'dummyhash',
      role: 'MANAGER',
      name: 'Manager Sockets',
      isActive: true,
    });

    const restaurant = await Restaurant.create({
      name: 'Socket Eatery',
      slug: 'socket-eatery',
      isActive: true,
    });

    // Create staff connection row
    await RestaurantStaff.create({
      userId: user.id,
      restaurantId: restaurant.id,
      role: 'MANAGER',
      isActive: true,
    });

    // 2. Generate a valid token
    const token = tokenService.generateAccessToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    // 3. Connect client socket with token
    const clientSocket: ClientSocket = ioc(`http://localhost:${port}`, {
      auth: { token: `Bearer ${token}` },
    });

    await new Promise<void>((resolve, reject) => {
      clientSocket.on('connect', () => {
        clientSocket.emit('join_restaurant', { restaurantId: restaurant.id });
      });

      clientSocket.on('joined_restaurant', (data) => {
        expect(data.restaurantId).toBe(restaurant.id);
        clientSocket.disconnect();
        resolve();
      });

      clientSocket.on('error', (err) => {
        clientSocket.disconnect();
        reject(new Error(`Failed with socket error: ${err.message}`));
      });
    });
  });
});
