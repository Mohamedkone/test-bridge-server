// src/api/routes/index.ts
import { Router } from 'express';
import { injectable, inject } from 'inversify';
import { AuthRoutes } from './auth.routes';
import { UserRoutes } from './user.routes';
import { FileRoutes } from './file.routes';
import { CompanyRoutes } from './company.routes';
import { StorageRoutes } from './storage.routes';
import { RoomRoutes } from './room.routes';
import { SharingRoutes } from './sharing.routes';
import { ActivityRoutes } from './activity.routes';
import { OAuthRoutes } from './oauth.routes';

@injectable()
export class Routes {
  private router: Router;

  constructor(
    @inject('AuthRoutes') private authRoutes: AuthRoutes,
    @inject('UserRoutes') private userRoutes: UserRoutes,
    @inject('FileRoutes') private fileRoutes: FileRoutes,
    @inject('CompanyRoutes') private companyRoutes: CompanyRoutes,
    @inject('StorageRoutes') private storageRoutes: StorageRoutes,
    @inject('RoomRoutes') private roomRoutes: RoomRoutes,
    @inject('SharingRoutes') private sharingRoutes: SharingRoutes,
    @inject('ActivityRoutes') private activityRoutes: ActivityRoutes,
    @inject('OAuthRoutes') private oauthRoutes: OAuthRoutes
  ) {
    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Health check endpoint needed by test.html
    this.router.get('/health', (req, res) => {
      res.json({
        status: 'up',
        version: process.env.npm_package_version || '1.0.0',
        timestamp: new Date().toISOString()
      });
    });

    // Mount all routes
    this.router.use('/auth', this.authRoutes.getRouter());
    this.router.use('/users', this.userRoutes.getRouter());
    this.router.use('/files', this.fileRoutes.getRouter());
    this.router.use('/companies', this.companyRoutes.getRouter());
    this.router.use('/storage', this.storageRoutes.getRouter());
    this.router.use('/rooms', this.roomRoutes.getRouter());
    this.router.use('/shares', this.sharingRoutes.getRouter());
    this.router.use('/activities', this.activityRoutes.getRouter());
    this.router.use('/oauth', this.oauthRoutes.getRouter());
  }

  public getRouter(): Router {
    return this.router;
  }
}