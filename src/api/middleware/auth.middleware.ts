// src/api/middleware/auth.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { inject, injectable } from 'inversify';
import { AuthService } from '../../services/auth/auth.service';
import { UserRepository } from '../../repositories/user.repository';
import { Logger } from '../../utils/logger';
import { AuthenticationError, AuthorizationError } from '../../utils/errors';

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
  ) {}

  /**
   * Middleware to authenticate requests
   */
  authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new AuthenticationError('Missing or invalid authorization header');
      }
      
      const token = authHeader.split(' ')[1];
      
      // Validate token
      const validationResult = await this.authService.validateToken(token);
      
      if (!validationResult.valid) {
        throw new AuthenticationError(validationResult.error || 'Invalid token');
      }
      
      // Attach user to request
      if (validationResult.userId) {
        const user = await this.userRepository.findById(validationResult.userId);
        if (user) {
          req.user = user;
          
          // Log authentication success
          this.logger.debug('User authenticated successfully', { 
            userId: user.id, 
            path: req.path 
          });
        } else {
          throw new AuthenticationError('User not found');
        }
      }
      
      next();
    } catch (error:any) {
      this.logger.warn('Authentication failed', {
        error: error.message,
        path: req.path,
        ip: req.ip
      });
      
      if (error instanceof AuthenticationError) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: error.message
          }
        });
      } else {
        res.status(500).json({
          success: false,
          error: {
            code: 'SERVER_ERROR',
            message: 'An error occurred during authentication'
          }
        });
      }
    }
  };

  /**
   * Middleware to check for specific permissions
   */
  checkPermission = (resource: string, action: string) => {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const userId = req.user?.id;
        
        if (!userId) {
          throw new AuthenticationError('User not authenticated');
        }
        
        // Process resource string (e.g., "room:${req.params.roomId}")
        const processedResource = resource.replace(/\${([^}]+)}/g, (_, param) => {
          const parts = param.split('.');
          let value = req as IndexableObject;
          
          for (const part of parts) {
            if (!value || value[part] === undefined) {
              return '';
            }
            value = value[part];
          }
          
          return String(value);
        });
        
        // Check permission
        const hasPermission = await this.authService.hasPermission(userId, processedResource, action);
        
        if (!hasPermission) {
          throw new AuthorizationError(`You do not have permission to ${action} this ${resource.split(':')[0]}`);
        }
        
        // Log permission check success
        this.logger.debug('Permission check passed', {
          userId,
          resource: processedResource,
          action
        });
        
        next();
      } catch (error:any) {
        this.logger.warn('Permission check failed', {
          error: error.message,
          resource,
          action,
          path: req.path,
          userId: req.user?.id
        });
        
        if (error instanceof AuthenticationError) {
          res.status(401).json({
            success: false,
            error: {
              code: 'UNAUTHORIZED',
              message: error.message
            }
          });
        } else if (error instanceof AuthorizationError) {
          res.status(403).json({
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: error.message
            }
          });
        } else {
          res.status(500).json({
            success: false,
            error: {
              code: 'SERVER_ERROR',
              message: 'An error occurred during permission check'
            }
          });
        }
      }
    };
  };
}