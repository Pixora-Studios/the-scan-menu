import { Router } from 'express';
import { OrderController } from '../controllers/order.controller';
import { requireAuth, requireRestaurantAccess, requireRole } from '../middleware/auth';

const router = Router({ mergeParams: true });
const orderController = new OrderController();

// Require authentication for all manager/staff order routes
router.use(requireAuth as any);

// Scoped inside a restaurantId parameter
router.get('/:restaurantId/analytics', requireRestaurantAccess as any, requireRole('MANAGER', 'SUPER_ADMIN') as any, orderController.getAnalytics);
router.get('/:restaurantId/orders', requireRestaurantAccess as any, orderController.listOrders);
router.get('/:restaurantId/orders/active', requireRestaurantAccess as any, orderController.listActiveOrders);
router.get('/:restaurantId/orders/:orderId', requireRestaurantAccess as any, orderController.getOrderDetails);
router.patch('/:restaurantId/orders/:orderId/status', requireRestaurantAccess as any, orderController.updateOrderStatus);
router.post('/:restaurantId/orders/:orderId/cancel', requireRestaurantAccess as any, orderController.cancelOrder);

// Item status tick transitions
router.patch('/:restaurantId/orders/:orderId/items/:itemIndex/status', requireRestaurantAccess as any, orderController.updateItemStatus);

// Table Session management
router.get('/:restaurantId/table-sessions/:sessionId', requireRestaurantAccess as any, orderController.getTableSession);
router.post('/:restaurantId/table-sessions/:sessionId/close', requireRestaurantAccess as any, orderController.closeTableSession);

export default router;
