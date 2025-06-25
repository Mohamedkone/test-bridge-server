// src/api/routes/oauth.routes.ts
import { Router } from 'express';
import { injectable, inject } from 'inversify';
import { OAuthController } from '../controllers/oauth.controller';
import { AuthMiddleware } from '../middleware/auth.middleware';

@injectable()
export class OAuthRoutes {
  private router: Router;

  constructor(
    @inject('OAuthController') private oauthController: OAuthController,
    @inject('AuthMiddleware') private authMiddleware: AuthMiddleware
  ) {
    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Start OAuth flow
    this.router.post('/:provider/authorize', this.authMiddleware.verifyToken.bind(this.authMiddleware), this.oauthController.authorize.bind(this.oauthController));
    
    // OAuth callback (no auth required - comes from third party)
    this.router.get('/callback', this.oauthController.callback.bind(this.oauthController));
    
    // Revoke tokens
    this.router.post('/:provider/revoke', this.authMiddleware.verifyToken.bind(this.authMiddleware), this.oauthController.revokeTokens.bind(this.oauthController));
    
    // Get available providers
    this.router.get('/providers', this.authMiddleware.verifyToken.bind(this.authMiddleware), this.oauthController.getProviders.bind(this.oauthController));
  }

  public getRouter(): Router {
    return this.router;
  }
} 