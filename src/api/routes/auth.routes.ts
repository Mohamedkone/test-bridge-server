// src/api/routes/auth.routes.ts
import { Router } from 'express';
import { container } from '../../config/container';
import { AuthController } from '../controllers/auth.controller';
import { AuthMiddleware } from '../middleware/auth.middleware';
import { authLimiter } from '../middleware/rate-limiter.middleware';

// Get instances from container
const authController = container.get<AuthController>(AuthController);
const authMiddleware = container.get<AuthMiddleware>(AuthMiddleware);

const router = Router();

// Public routes (with rate limiting for security)
router.post('/login', authLimiter, authController.login.bind(authController));

// Protected routes
router.get('/me', 
  authMiddleware.authenticate,
  authController.getProfile.bind(authController)
);

router.post('/logout', 
  authMiddleware.authenticate, 
  authController.logout.bind(authController)
);

router.delete('/sessions/:sessionId', 
  authMiddleware.authenticate, 
  authController.revokeSession.bind(authController)
);

export default router;