import { Router } from 'express';
import { RestaurantController } from '../controllers/restaurant.controller';
import { requireAuth, requireRole, requireRestaurantAccess } from '../middleware/auth';

const router = Router({ mergeParams: true });
const restaurantController = new RestaurantController();

// Require auth at the router level
router.use(requireAuth as any);

// Profile routes (Staff can view, Managers/Super Admins can edit)
router.get('/:restaurantId', requireRestaurantAccess as any, restaurantController.getRestaurantProfile);
router.patch('/:restaurantId', requireRestaurantAccess as any, requireRole('MANAGER', 'SUPER_ADMIN') as any, restaurantController.editRestaurantProfile);

// Tables routes (Manager/Super Admin only)
router.get('/:restaurantId/tables', requireRestaurantAccess as any, requireRole('MANAGER', 'SUPER_ADMIN') as any, restaurantController.listTables);
router.post('/:restaurantId/tables', requireRestaurantAccess as any, requireRole('MANAGER', 'SUPER_ADMIN') as any, restaurantController.createTable);
router.patch('/:restaurantId/tables/:tableId', requireRestaurantAccess as any, requireRole('MANAGER', 'SUPER_ADMIN') as any, restaurantController.editTable);
router.delete('/:restaurantId/tables/:tableId', requireRestaurantAccess as any, requireRole('MANAGER', 'SUPER_ADMIN') as any, restaurantController.deleteTable);
router.patch('/:restaurantId/tables/:tableId/activate', requireRestaurantAccess as any, requireRole('MANAGER', 'SUPER_ADMIN') as any, restaurantController.activateTable);
router.patch('/:restaurantId/tables/:tableId/deactivate', requireRestaurantAccess as any, requireRole('MANAGER', 'SUPER_ADMIN') as any, restaurantController.deactivateTable);
router.post('/:restaurantId/tables/:tableId/regenerate-qr', requireRestaurantAccess as any, requireRole('MANAGER', 'SUPER_ADMIN') as any, restaurantController.regenerateTableQr);

// GET returns SVG + PNG details for the QR
router.get('/:restaurantId/tables/:tableId/qr', requireRestaurantAccess as any, requireRole('MANAGER', 'SUPER_ADMIN') as any, restaurantController.getTableQr);

// Waiter Staff Management Endpoints (Manager-only)
router.post('/:restaurantId/staff', requireRestaurantAccess as any, requireRole('MANAGER', 'SUPER_ADMIN') as any, restaurantController.createStaff);
router.get('/:restaurantId/staff', requireRestaurantAccess as any, requireRole('MANAGER', 'SUPER_ADMIN') as any, restaurantController.listStaff);
router.patch('/:restaurantId/staff/:staffId', requireRestaurantAccess as any, requireRole('MANAGER', 'SUPER_ADMIN') as any, restaurantController.updateStaff);
router.delete('/:restaurantId/staff/:staffId', requireRestaurantAccess as any, requireRole('MANAGER', 'SUPER_ADMIN') as any, restaurantController.deleteStaff);

export default router;
