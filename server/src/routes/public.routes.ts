import { Router } from 'express';
import { PublicController } from '../controllers/public.controller';

const router = Router();
const publicController = new PublicController();

router.get('/restaurants/:restaurantSlug/tables/:tableToken', publicController.resolveTable);
router.get('/restaurants/:restaurantSlug/tables/:tableToken/menu', publicController.getMenu);

// Public Order Creation & Getters
router.post('/restaurants/:restaurantSlug/tables/:tableToken/orders', publicController.createOrder);
router.get('/orders/:orderId', publicController.getOrder);
router.get('/orders/:orderId/status', publicController.getOrderStatus);

export default router;
