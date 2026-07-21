import { Router } from 'express';
import { PublicController } from '../controllers/public.controller';

const router = Router();
const publicController = new PublicController();

router.get('/restaurants/:restaurantSlug/tables/:tableToken', publicController.resolveTable);
router.get('/restaurants/:restaurantSlug/tables/:tableToken/menu', publicController.getMenu);

export default router;
