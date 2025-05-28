import { Request, Response, NextFunction } from 'express';
import { injectable, inject } from 'inversify';
import { Logger } from '../../utils/logger';
import { AuthorizationError } from '../../utils/errors';

@injectable()
export class AdminMiddleware {
  constructor(
    @inject('Logger') private readonly logger: Logger
  ) {
    this.logger = logger.createChildLogger('AdminMiddleware');
  }

  /**
   * Verify user has admin role
   */
  async verifyAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AuthorizationError('User not authenticated');
      }

      if (req.user.role !== 'admin') {
        throw new AuthorizationError('Admin privileges required');
      }

      next();
    } catch (error: any) {
      this.logger.error('Admin verification failed', { error });
      res.status(403).json({
        error: error.message || 'Admin access required'
      });
    }
  }
} 