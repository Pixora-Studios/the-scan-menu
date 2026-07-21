import express from 'express';
import { createServer } from 'http';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// Under test environment, supply dummy/fallback env variables automatically if they aren't loaded
if (process.env.NODE_ENV === 'test') {
  process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test_access_secret_key_123_abc_456_def';
  process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test_refresh_secret_key_123_abc_456_def';
  process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pixora-qr-test';
  process.env.CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || 'mock_cloud_name';
  process.env.CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY || '123456789012345';
  process.env.CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET || 'mock_api_secret_abc123';
}

// Fail fast at startup if critical environment variables are missing
const requiredEnv = [
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'MONGODB_URI',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
];
const missingEnv = requiredEnv.filter((envName) => !process.env[envName]);

if (missingEnv.length > 0) {
  const errMsg = `FATAL ERROR: Missing required environment variables: [${missingEnv.join(', ')}]`;
  console.error(errMsg);
  process.exit(1);
}

import authRoutes from './routes/auth.routes';
import adminRoutes from './routes/admin.routes';
import menuRoutes from './routes/menu.routes';
import restaurantRoutes from './routes/restaurant.routes';
import orderRoutes from './routes/order.routes';
import waiterCallRoutes from './routes/waiterCall.routes';
import publicRoutes from './routes/public.routes';
import { errorHandler } from './middleware/errorHandler';
import { SocketService } from './sockets/socket.service';
import { logger } from './utils/logger';

const app = express();
const httpServer = createServer(app);

// Security configuration
app.use(helmet());
app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  })
);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per `window`
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Express parser configuration
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Routing
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/admin', adminRoutes);

// Mount orderRoutes first so STAFF role can access orders without being blocked by menuRoutes/restaurantRoutes top-level MANAGER checks.
// Mount menuRoutes BEFORE restaurantRoutes to prevent wildcard param collision clashing (:restaurantId matches categories-reorder etc.)
app.use('/api/v1/restaurants', orderRoutes);
app.use('/api/v1/restaurants', waiterCallRoutes);
app.use('/api/v1/restaurants', menuRoutes);
app.use('/api/v1/restaurants', restaurantRoutes);

app.use('/api/v1/public', publicRoutes);

// Global Error Handler
app.use(errorHandler);

// Socket.io initialization
const socketCorsOrigin = process.env.SOCKET_CORS_ORIGIN || 'http://localhost:5173';
SocketService.getInstance().init(httpServer, socketCorsOrigin);

// Startup logic
export const startServer = async () => {
  const PORT = process.env.PORT || 5000;
  const mongoURI = process.env.MONGODB_URI!;

  try {
    await mongoose.connect(mongoURI);
    logger.info('Successfully connected to MongoDB.');

    httpServer.listen(PORT, () => {
      logger.info(`Server is running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
    });
  } catch (error) {
    logger.error(error, 'Error starting the server');
    process.exit(1);
  }
};

if (require.main === module) {
  startServer();
}

export { app, httpServer };
