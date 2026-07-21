import { Router } from 'express';
import { WaiterCallController } from '../controllers/waiterCall.controller';
import { requireAuth, requireRestaurantAccess } from '../middleware/auth';

const router = Router({ mergeParams: true });
const waiterCallController = new WaiterCallController();

// STAFF/MANAGER Endpoints (Require Auth + requireRestaurantAccess)
router.get(
  '/:restaurantId/waiter-calls',
  requireAuth as any,
  requireRestaurantAccess as any,
  waiterCallController.listWaiterCalls
);
router.patch(
  '/:restaurantId/waiter-calls/:callId/acknowledge',
  requireAuth as any,
  requireRestaurantAccess as any,
  waiterCallController.acknowledgeWaiterCall
);
router.patch(
  '/:restaurantId/waiter-calls/:callId/resolve',
  requireAuth as any,
  requireRestaurantAccess as any,
  waiterCallController.resolveWaiterCall
);

export default router;
