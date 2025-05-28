// src/api/routes/auth.routes.ts
import { Router } from 'express';
import { injectable, inject } from 'inversify';
import { AuthController } from '../controllers/auth.controller';
import { AuthMiddleware } from '../middleware/auth.middleware';
import { body } from 'express-validator';
import { validate } from '../middleware/validation.middleware';

@injectable()
export class AuthRoutes {
  private router: Router;

  constructor(
    @inject('AuthController') private authController: AuthController,
    @inject('AuthMiddleware') private authMiddleware: AuthMiddleware
  ) {
    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Auth routes
    this.router.post('/login', this.authController.login.bind(this.authController));
    this.router.post('/logout', this.authController.logout.bind(this.authController));
    this.router.get('/me', this.authController.getProfile.bind(this.authController));

    // Auth0 login route
    this.router.post(
      '/auth0/login',
      [
        body('idToken').notEmpty().withMessage('Auth0 ID token is required'),
        validate
      ],
      this.authController.login.bind(this.authController)
    );

    // Auth0 token exchange (for Authorization Code flow)
    this.router.post(
      '/auth0/exchange-code',
      [
        body('code').notEmpty().withMessage('Authorization code is required'),
        body('redirectUri').notEmpty().withMessage('Redirect URI is required'),
        validate
      ],
      this.authController.exchangeCode.bind(this.authController)
    );

    // Get user profile
    this.router.get(
      '/profile',
      this.authMiddleware.verifyToken.bind(this.authMiddleware),
      this.authController.getProfile.bind(this.authController)
    );

    // Revoke a specific session
    this.router.delete(
      '/sessions/:sessionId',
      this.authMiddleware.verifyToken.bind(this.authMiddleware),
      this.authController.revokeSession.bind(this.authController)
    );

    // Validate a token (for client-side validation)
    this.router.post(
      '/validate-token',
      [
        body('token').notEmpty().withMessage('Token is required'),
        validate
      ],
      this.authController.validateToken.bind(this.authController)
    );
  }

  public getRouter(): Router {
    return this.router;
  }
}