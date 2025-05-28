// src/api/controllers/auth.controller.ts
import { Request, Response, NextFunction } from 'express';
import { injectable, inject } from 'inversify';
import { AuthService } from '../../services/auth/auth.service';
import { Auth0Service } from '../../services/auth/auth0.service';
import { Logger } from '../../utils/logger';
import { ValidationError, AuthenticationError } from '../../utils/errors';

@injectable()
export class AuthController {
  constructor(
    @inject('AuthService') private readonly authService: AuthService,
    @inject('Auth0Service') private readonly auth0Service: Auth0Service,
    @inject('Logger') private readonly logger: Logger
  ) {
    this.logger = logger.createChildLogger('AuthController');
  }

  /**
   * Login with Auth0 token
   */
  async login(req: Request, res: Response): Promise<void> {
    try {
      const { idToken } = req.body;
      
      if (!idToken) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'ID token is required'
          }
        });
        return;
      }

      const result = await this.authService.processAuth0Login(idToken);
      
      res.json({
        success: true,
        data: result
      });
    } catch (error: any) {
      this.logger.error('Login failed', { error });
      res.status(401).json({
        success: false,
        error: {
          code: 'AUTHENTICATION_FAILED',
          message: error.message || 'Authentication failed'
        }
      });
    }
  }

  /**
   * Exchange Auth0 code for tokens (Authorization Code flow)
   */
  async exchangeCode(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { code, redirectUri } = req.body;
      
      if (!code || !redirectUri) {
        throw new ValidationError('Code and redirect URI are required');
      }
      
      // Exchange code for tokens
      const tokens = await this.auth0Service.exchangeCodeForTokens(code, redirectUri);
      
      // Process Auth0 login with the ID token
      const authResult = await this.authService.processAuth0Login(tokens.id_token);
      
      res.json({
        success: true,
        data: {
          user: authResult.user,
          token: authResult.token,
          expiresIn: authResult.expiresIn,
          refreshToken: authResult.refreshToken,
          auth0: {
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            id_token: tokens.id_token,
            expires_in: tokens.expires_in
          }
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get user profile
   */
  async getProfile(req: Request, res: Response): Promise<void> {
    try {
      const token = req.headers.authorization?.split(' ')[1];
      
      if (!token) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'No token provided'
          }
        });
        return;
      }

      const user = await this.authService.verifyToken(token);
      
      res.json({
        success: true,
        data: user
      });
    } catch (error: any) {
      this.logger.error('Get profile failed', { error });
      res.status(401).json({
        success: false,
        error: {
          code: 'AUTHENTICATION_FAILED',
          message: error.message || 'Failed to get profile'
        }
      });
    }
  }

  /**
   * Logout user
   */
  async logout(req: Request, res: Response): Promise<void> {
    try {
      const token = req.headers.authorization?.split(' ')[1];
      
      if (!token) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'No token provided'
          }
        });
        return;
      }

      await this.authService.revokeToken(token);
      
      res.json({
        success: true,
        message: 'Logged out successfully'
      });
    } catch (error: any) {
      this.logger.error('Logout failed', { error });
      res.status(500).json({
        success: false,
        error: {
          code: 'LOGOUT_FAILED',
          message: error.message || 'Logout failed'
        }
      });
    }
  }

  /**
   * Revoke a specific session
   */
  async revokeSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sessionId } = req.params;
      
      if (!sessionId) {
        throw new ValidationError('Session ID is required');
      }
      
      // Ensure user can only revoke their own sessions
      const sessions = await this.authService.getUserSessions(req.user.id);
      const sessionBelongsToUser = sessions.some(s => s.id === sessionId);
      
      if (!sessionBelongsToUser) {
        throw new ValidationError('Session not found or does not belong to user');
      }
      
      // Revoke session
      const success = await this.authService.revokeSession(sessionId);
      
      if (success) {
        this.logger.info('Session revoked', { sessionId, userId: req.user.id });
      }
      
      res.json({
        success,
        message: success ? 'Session revoked successfully' : 'Failed to revoke session'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Validate a token (client-side validation)
   */
  async validateToken(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { token } = req.body;
      
      if (!token) {
        throw new ValidationError('Token is required');
      }
      
      // Validate token
      const validationResult = await this.authService.validateToken(token);
      
      res.json({
        success: true,
        data: {
          valid: validationResult.valid,
          userId: validationResult.userId,
          error: validationResult.error
        }
      });
    } catch (error) {
      next(error);
    }
  }
}