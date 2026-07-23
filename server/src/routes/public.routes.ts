import { Router } from 'express';
import { PublicController } from '../controllers/public.controller';
import { WaiterCallController } from '../controllers/waiterCall.controller';
import rateLimit from 'express-rate-limit';

const router = Router();
const publicController = new PublicController();
const waiterCallController = new WaiterCallController();

const isTest = process.env.NODE_ENV === 'test';

// Tight public rate limiters to prevent API abuse and order spamming (disabled or relaxed in tests)
const orderCreationLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: isTest ? 10000 : 5, // max 5 orders per 10 minutes per IP
  message: {
    success: false,
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many order placements from this connection. Please wait 10 minutes before placing another order.',
      details: null,
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const waiterCallLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: isTest ? 10000 : 5, // max 5 waiter calls per 5 minutes per IP
  message: {
    success: false,
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many floor assistance requests from this connection. Please wait 5 minutes.',
      details: null,
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const publicGetLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: isTest ? 10000 : 60, // max 60 read requests per 1 minute per IP
  message: {
    success: false,
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many requests from this connection. Please wait 1 minute.',
      details: null,
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Table resolution & Menu fetches (Limited to 60 req/min)
router.get('/restaurants/:restaurantSlug/tables/:tableToken', publicGetLimiter, publicController.resolveTable);
router.get('/restaurants/:restaurantSlug/tables/:tableToken/menu', publicGetLimiter, publicController.getMenu);

// Public Order Creation & Getters (Order placing limited to 5 orders/10 mins)
router.post('/restaurants/:restaurantSlug/tables/:tableToken/orders', orderCreationLimiter, publicController.createOrder);
router.get('/orders/:orderId', publicGetLimiter, publicController.getOrder);
router.get('/orders/:orderId/status', publicGetLimiter, publicController.getOrderStatus);
router.get('/table-sessions/:sessionId', publicGetLimiter, publicController.getTableSession);

// Public Waiter Call Endpoints (Assistance limited to 5 calls/5 mins)
router.post('/tables/:tableToken/waiter-call', waiterCallLimiter, waiterCallController.createWaiterCall);
router.get('/tables/:tableToken/waiter-call/active', publicGetLimiter, waiterCallController.getActiveWaiterCall);

export default router;
