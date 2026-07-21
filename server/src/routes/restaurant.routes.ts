import { Router } from 'express';
import { RestaurantController } from '../controllers/restaurant.controller';
import { requireAuth, requireRole, requireRestaurantAccess } from '../middleware/auth';

const router = Router({ mergeParams: true });
const restaurantController = new RestaurantController();

// Require auth and role at the router level (independent of route parameters)
router.use(requireAuth as any, requireRole('MANAGER', 'SUPER_ADMIN'));

// Apply requireRestaurantAccess individually to ensure route parameters are parsed before the check runs
router.get('/:restaurantId', requireRestaurantAccess as any, restaurantController.getRestaurantProfile);
router.patch('/:restaurantId', requireRestaurantAccess as any, restaurantController.editRestaurantProfile);

router.get('/:restaurantId/tables', requireRestaurantAccess as any, restaurantController.listTables);
router.post('/:restaurantId/tables', requireRestaurantAccess as any, restaurantController.createTable);
router.patch('/:restaurantId/tables/:tableId', requireRestaurantAccess as any, restaurantController.editTable);
router.delete('/:restaurantId/tables/:tableId', requireRestaurantAccess as any, restaurantController.deleteTable);
router.patch('/:restaurantId/tables/:tableId/activate', requireRestaurantAccess as any, restaurantController.activateTable);
router.patch('/:restaurantId/tables/:tableId/deactivate', requireRestaurantAccess as any, restaurantController.deactivateTable);
router.post('/:restaurantId/tables/:tableId/regenerate-qr', requireRestaurantAccess as any, restaurantController.regenerateTableQr);

// GET returns SVG + PNG details for the QR
router.get('/:restaurantId/tables/:tableId/qr', requireRestaurantAccess as any, restaurantController.getTableQr);

// Waiter Staff Management Endpoints (Manager-only)
router.post('/:restaurantId/staff', requireRestaurantAccess as any, restaurantController.createStaff);
router.get('/:restaurantId/staff', requireRestaurantAccess as any, restaurantController.listStaff);
router.patch('/:restaurantId/staff/:staffId', requireRestaurantAccess as any, restaurantController.updateStaff);
router.delete('/:restaurantId/staff/:staffId', requireRestaurantAccess as any, restaurantController.deleteStaff);

export default router;
