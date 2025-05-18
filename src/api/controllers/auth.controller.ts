// src/api/controllers/auth.controller.ts
import { Request, Response, NextFunction } from 'express';
import { inject, injectable } from 'inversify';
import { AuthService } from '../../services/auth/auth.service';
import { Logger } from '../../utils/logger';
import { ValidationError, AuthenticationError } from '../../utils/errors';

@injectable()
export class AuthController {
  constructor(
    @inject('AuthService') private readonly authService: AuthService,
    @inject('Logger') private readonly logger: Logger
  ) {}

  /**
   * Login with Auth0 token
   */
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { idToken } = req.body;
      
      if (!idToken) {
        throw new ValidationError('ID token is required');
      }
      
      // Process Auth0 login
      const authResult = await this.authService.processAuth0Login(idToken);
      
      // Set cookie with the session ID if applicable
      if (authResult.success && authResult.user) {
        this.logger.info('User logged in successfully', { userId: authResult.user.id });
      }
      
      res.json({
        success: true,
        data: {
          user: authResult.user,
          token: authResult.token,
          expiresIn: authResult.expiresIn,
          refreshToken: authResult.refreshToken
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get current user profile
   */
  async getProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // User will be attached to request by auth middleware
      const userId = req.user?.id;
      
      if (!userId) {
        throw new AuthenticationError('User not authenticated');
      }
      
      // Fetch user's sessions
      const sessions = await this.authService.getUserSessions(userId);
      
      res.json({
        success: true,
        data: {
          user: req.user,
          sessions: sessions.map(s => ({
            id: s.id,
            createdAt: s.createdAt,
            lastActiveAt: s.lastActiveAt
          }))
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Logout - revoke the current token
   */
  async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Extract token from Authorization header
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new ValidationError('Invalid authorization header');
      }
      
      const token = authHeader.split(' ')[1];
      
      // Log the user ID
      const userId = req.user?.id;
      this.logger.info('Logout requested', { userId });
      
      // Revoke token
      await this.authService.revokeToken(token);
      
      // If session ID is provided in body (optional), also revoke the session
      if (req.body && req.body.sessionId) {
        await this.authService.revokeSession(req.body.sessionId);
        this.logger.info('Session revoked during logout', { 
          sessionId: req.body.sessionId, 
          userId 
        });
      }
      
      this.logger.info('User logged out successfully', { userId });
      
      res.json({
        success: true,
        message: 'Logged out successfully'
      });
    } catch (error:any) {
      this.logger.error('Logout failed', { 
        error: error.message, 
        userId: req.user?.id 
      });
      next(error);
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
}