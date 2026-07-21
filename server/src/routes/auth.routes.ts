import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { validateBody } from '../middleware/validate';
import { loginSchema, changePasswordSchema } from '../validators/auth.validator';
import { requireAuth } from '../middleware/auth';

const router = Router();
const authController = new AuthController();

router.post('/login', validateBody(loginSchema), authController.login);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);
router.get('/me', requireAuth, authController.me);
router.post('/change-password', requireAuth, validateBody(changePasswordSchema), authController.changePassword);

export default router;
