// src/api/middleware/auth.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { injectable, inject } from 'inversify';
import { AuthService } from '../../services/auth/auth.service';
import { UserRepository } from '../../repositories/user.repository';
import { Logger } from '../../utils/logger';
import { AuthenticationError, AuthorizationError, ValidationError } from '../../utils/errors';

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

interface IndexableObject {
  [key: string]: any;
}

@injectable()
export class AuthMiddleware {
  constructor(
    @inject('AuthService') private readonly authService: AuthService,
    @inject('UserRepository') private readonly userRepository: UserRepository,
    @inject('Logger') private readonly logger: Logger
  ) {
    this.logger = logger.createChildLogger('AuthMiddleware');
  }

  /**
   * Verify JWT token
   */
  async verifyToken(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const token = req.headers.authorization?.split(' ')[1];
      if (!token) {
        throw new ValidationError('Token is required');
      }

      const user = await this.authService.verifyToken(token);
      if (!user) {
        throw new ValidationError('Invalid token');
      }

      req.user = user;
      next();
    } catch (error: any) {
      this.logger.error('Token verification failed', { error });
      res.status(401).json({
        error: error.message || 'Authentication failed'
      });
    }
  }

  /**
   * Check if user has required role
   */
  hasRole(role: string) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        if (!req.user) {
          throw new ValidationError('User not authenticated');
        }

        if (req.user.role !== role) {
          throw new ValidationError('Insufficient permissions');
        }

        next();
      } catch (error: any) {
        this.logger.error('Role check failed', { error });
        res.status(403).json({
          error: error.message || 'Access denied'
        });
      }
    };
  }

  /**
   * Check if user has required permission
   */
  hasPermission(resource: string, action: string) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        if (!req.user) {
          throw new ValidationError('User not authenticated');
        }

        const hasPermission = await this.authService.hasPermission(
          req.user.id,
          resource,
          action
        );

        if (!hasPermission) {
          throw new ValidationError('Insufficient permissions');
        }

        next();
      } catch (error: any) {
        this.logger.error('Permission check failed', { error });
        res.status(403).json({
          error: error.message || 'Access denied'
        });
      }
    };
  }
}