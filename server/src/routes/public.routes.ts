import { Router } from 'express';
import { PublicController } from '../controllers/public.controller';
import { WaiterCallController } from '../controllers/waiterCall.controller';

const router = Router();
const publicController = new PublicController();
const waiterCallController = new WaiterCallController();

router.get('/restaurants/:restaurantSlug/tables/:tableToken', publicController.resolveTable);
router.get('/restaurants/:restaurantSlug/tables/:tableToken/menu', publicController.getMenu);

// Public Order Creation & Getters
router.post('/restaurants/:restaurantSlug/tables/:tableToken/orders', publicController.createOrder);
router.get('/orders/:orderId', publicController.getOrder);
router.get('/orders/:orderId/status', publicController.getOrderStatus);

// Public Waiter Call Endpoints
router.post('/tables/:tableToken/waiter-call', waiterCallController.createWaiterCall);
router.get('/tables/:tableToken/waiter-call/active', waiterCallController.getActiveWaiterCall);

export default router;
