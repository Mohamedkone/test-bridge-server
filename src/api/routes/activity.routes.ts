import { Router } from 'express';
import { injectable, inject } from 'inversify';
import { ActivityController } from '../controllers/activity.controller';
import { AuthMiddleware } from '../middleware/auth.middleware';
import { AdminMiddleware } from '../middleware/admin.middleware';

@injectable()
export class ActivityRoutes {
  private router: Router;

  constructor(
    @inject('ActivityController') private activityController: ActivityController,
    @inject('AuthMiddleware') private authMiddleware: AuthMiddleware,
    @inject('AdminMiddleware') private adminMiddleware: AdminMiddleware
  ) {
    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // User activity routes
    this.router.get('/user', this.authMiddleware.verifyToken.bind(this.authMiddleware), this.activityController.getUserActivities.bind(this.activityController));
    
    // File activity routes
    this.router.get('/file/:fileId', this.authMiddleware.verifyToken.bind(this.authMiddleware), this.activityController.getFileActivities.bind(this.activityController));
    
    // Room activity routes
    this.router.get('/room/:roomId', this.authMiddleware.verifyToken.bind(this.authMiddleware), this.activityController.getRoomActivities.bind(this.activityController));
    
    // Company activity routes (admin only)
    this.router.get('/company/:companyId', 
      this.authMiddleware.verifyToken.bind(this.authMiddleware),
      this.adminMiddleware.verifyAdmin.bind(this.adminMiddleware),
      this.activityController.getCompanyActivities.bind(this.activityController)
    );
    
    // Export activity logs (admin only)
    this.router.post('/export',
      this.authMiddleware.verifyToken.bind(this.authMiddleware),
      this.adminMiddleware.verifyAdmin.bind(this.adminMiddleware),
      this.activityController.exportActivityLogs.bind(this.activityController)
    );
    
    // Activity notification subscription
    this.router.post('/subscribe', this.authMiddleware.verifyToken.bind(this.authMiddleware), this.activityController.subscribeToActivities.bind(this.activityController));
    this.router.post('/unsubscribe', this.authMiddleware.verifyToken.bind(this.authMiddleware), this.activityController.unsubscribeFromActivities.bind(this.activityController));
  }

  public getRouter(): Router {
    return this.router;
  }
} 