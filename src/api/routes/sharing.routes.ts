import { Router } from 'express';
import { injectable, inject } from 'inversify';
import { SharingController } from '../controllers/sharing.controller';
import { AuthMiddleware } from '../middleware/auth.middleware';

@injectable()
export class SharingRoutes {
  private router: Router;

  constructor(
    @inject('SharingController') private sharingController: SharingController,
    @inject('AuthMiddleware') private authMiddleware: AuthMiddleware
  ) {
    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Create a new share
    this.router.post('/', this.authMiddleware.verifyToken.bind(this.authMiddleware), this.sharingController.createShare.bind(this.sharingController));

    // Get share by ID
    this.router.get('/:id', this.authMiddleware.verifyToken.bind(this.authMiddleware), this.sharingController.getShareById.bind(this.sharingController));

    // Update share
    this.router.patch('/:id', this.authMiddleware.verifyToken.bind(this.authMiddleware), this.sharingController.updateShare.bind(this.sharingController));

    // Delete share
    this.router.delete('/:id', this.authMiddleware.verifyToken.bind(this.authMiddleware), this.sharingController.deleteShare.bind(this.sharingController));

    // Get file shares
    this.router.get('/file/:fileId', this.authMiddleware.verifyToken.bind(this.authMiddleware), this.sharingController.getFileShares.bind(this.sharingController));
  }

  public getRouter(): Router {
    return this.router;
  }
} 