import { Router } from 'express';
import { AdminController } from '../controllers/admin.controller';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();
const adminController = new AdminController();

// Require both auth + platform role SUPER_ADMIN
router.use(requireAuth as any, requireRole('SUPER_ADMIN'));

router.post('/restaurants', adminController.createRestaurant);
router.get('/restaurants', adminController.listRestaurants);
router.get('/restaurants/:id', adminController.getRestaurant);
router.patch('/restaurants/:id', adminController.editRestaurant);
router.patch('/restaurants/:id/suspend', adminController.suspendRestaurant);
router.patch('/restaurants/:id/activate', adminController.activateRestaurant);
router.post('/restaurants/:id/managers', adminController.assignManager);

export default router;
