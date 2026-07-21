import { Router } from 'express';
import { MenuController } from '../controllers/menu.controller';
import { requireAuth, requireRole, requireRestaurantAccess } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import {
  createCategorySchema,
  updateCategorySchema,
  createMenuItemSchema,
  updateMenuItemSchema,
} from '../validators/menu.validator';

const router = Router({ mergeParams: true });
const menuController = new MenuController();

// Require both authentication and platform MANAGER or SUPER_ADMIN role at the router level
router.use(requireAuth as any, requireRole('MANAGER', 'SUPER_ADMIN'));

// Categories
router.get('/:restaurantId/categories', requireRestaurantAccess as any, menuController.listCategories);
router.post(
  '/:restaurantId/categories',
  requireRestaurantAccess as any,
  validateBody(createCategorySchema),
  menuController.createCategory
);
router.patch(
  '/:restaurantId/categories/:categoryId',
  requireRestaurantAccess as any,
  validateBody(updateCategorySchema),
  menuController.editCategory
);
router.delete('/:restaurantId/categories/:categoryId', requireRestaurantAccess as any, menuController.deleteCategory);
router.patch('/:restaurantId/categories-reorder', requireRestaurantAccess as any, menuController.reorderCategories);

// Menu Items
router.get('/:restaurantId/menu-items', requireRestaurantAccess as any, menuController.listMenuItems);
router.post(
  '/:restaurantId/menu-items',
  requireRestaurantAccess as any,
  validateBody(createMenuItemSchema),
  menuController.createMenuItem
);
router.patch(
  '/:restaurantId/menu-items/:itemId',
  requireRestaurantAccess as any,
  validateBody(updateMenuItemSchema),
  menuController.editMenuItem
);
router.delete('/:restaurantId/menu-items/:itemId', requireRestaurantAccess as any, menuController.deleteMenuItem);
router.patch('/:restaurantId/menu-items/:itemId/availability', requireRestaurantAccess as any, menuController.toggleAvailability);
router.patch('/:restaurantId/menu-items-bulk-availability', requireRestaurantAccess as any, menuController.bulkAvailability);
router.patch('/:restaurantId/menu-items-reorder', requireRestaurantAccess as any, menuController.reorderMenuItems);

// Uploads
router.post('/:restaurantId/uploads/signature', requireRestaurantAccess as any, menuController.getUploadSignature);

export default router;
