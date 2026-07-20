import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { app, httpServer } from '../src/index';
import { User } from '../src/models/User';
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

describe('Authentication API & Role Gating Tests', () => {
  it('should successfully login a seeded SUPER_ADMIN and reject invalid credentials', async () => {
    // Create the super admin
    const passwordHash = await bcrypt.hash('PixoraDemo123!', 10);
    await User.create({
      email: 'admin@pixora.dev',
      passwordHash,
      role: 'SUPER_ADMIN',
      name: 'Super Admin',
      isActive: true,
    });

    // Test correct login
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'admin@pixora.dev',
        password: 'PixoraDemo123!',
      });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.success).toBe(true);
    expect(loginRes.body.data).toHaveProperty('accessToken');
    expect(loginRes.body.data.user.role).toBe('SUPER_ADMIN');
    expect(loginRes.headers['set-cookie'][0]).toContain('refreshToken');

    // Test wrong password
    const wrongLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'admin@pixora.dev',
        password: 'WrongPassword!',
      });

    expect(wrongLoginRes.status).toBe(401);
    expect(wrongLoginRes.body.success).toBe(false);
    expect(wrongLoginRes.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('should allow accessing /me for authenticated user and block unauthenticated requests', async () => {
    const passwordHash = await bcrypt.hash('PixoraDemo123!', 10);
    await User.create({
      email: 'staff@pixora.dev',
      passwordHash,
      role: 'STAFF',
      name: 'Staff Member',
      isActive: true,
    });

    // Login to get token
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'staff@pixora.dev',
        password: 'PixoraDemo123!',
      });

    const accessToken = loginRes.body.data.accessToken;

    // Call /me with valid token
    const meRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.success).toBe(true);
    expect(meRes.body.data.user.email).toBe('staff@pixora.dev');

    // Call /me without token
    const unauthRes = await request(app).get('/api/v1/auth/me');
    expect(unauthRes.status).toBe(401);
    expect(unauthRes.body.success).toBe(false);
    expect(unauthRes.body.error.code).toBe('UNAUTHORIZED');
  });

  it('should correctly reject a non-SUPER_ADMIN token on a SUPER_ADMIN-only route', async () => {
    // Let's register a mock SUPER_ADMIN-only test endpoint
    const { requireAuth, requireRole } = await import('../src/middleware/auth');
    app.get('/api/v1/test-admin-only', requireAuth as any, requireRole('SUPER_ADMIN'), (req, res) => {
      res.json({ success: true, message: 'Welcome Admin' });
    });

    const passwordHash = await bcrypt.hash('PixoraDemo123!', 10);

    // Create Staff (Non-SUPER_ADMIN)
    await User.create({
      email: 'staff@pixora.dev',
      passwordHash,
      role: 'STAFF',
      name: 'Staff Member',
      isActive: true,
    });

    // Create Super Admin
    await User.create({
      email: 'admin@pixora.dev',
      passwordHash,
      role: 'SUPER_ADMIN',
      name: 'Super Admin',
      isActive: true,
    });

    // Get staff token
    const staffLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'staff@pixora.dev', password: 'PixoraDemo123!' });
    const staffToken = staffLogin.body.data.accessToken;

    // Get admin token
    const adminLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@pixora.dev', password: 'PixoraDemo123!' });
    const adminToken = adminLogin.body.data.accessToken;

    // Call with staff token (should be rejected with 403)
    const staffCall = await request(app)
      .get('/api/v1/test-admin-only')
      .set('Authorization', `Bearer ${staffToken}`);

    expect(staffCall.status).toBe(403);
    expect(staffCall.body.success).toBe(false);
    expect(staffCall.body.error.code).toBe('FORBIDDEN');

    // Call with admin token (should be allowed with 200)
    const adminCall = await request(app)
      .get('/api/v1/test-admin-only')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(adminCall.status).toBe(200);
    expect(adminCall.body.success).toBe(true);
  });
});
