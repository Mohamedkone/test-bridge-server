// src/api/routes/storage.routes.ts
import { Router } from 'express';
import { injectable, inject } from 'inversify';
import { StorageController } from '../controllers/storage.controller';
import { AuthMiddleware } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import multer from 'multer';
import { Request, Response, NextFunction } from 'express';

// Configure multer for memory storage (files as buffers)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
  }
});

@injectable()
export class StorageRoutes {
  private router: Router;

  constructor(
    @inject('StorageController') private storageController: StorageController,
    @inject('AuthMiddleware') private authMiddleware: AuthMiddleware
  ) {
    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Helper function to wrap controller methods as express handlers
    const wrap = (fn: Function) => (req: Request, res: Response, next: NextFunction) => {
      fn.call(this.storageController, req, res, next)
        .catch(next);
    };

    // Get available storage providers
    this.router.get('/providers', wrap(this.storageController.getProviderTypes));

    // Get storage accounts for a company
    this.router.get('/company/:companyId', wrap(this.storageController.getStorageAccounts));

    // Get a specific storage account
    this.router.get('/:id', wrap(this.storageController.getStorageAccount));

    // Protected routes - require authentication
    this.router.use(this.authMiddleware.verifyToken.bind(this.authMiddleware));

    // Create a new storage account
    this.router.post('/', wrap(this.storageController.createStorageAccount));

    // Update a storage account
    this.router.put('/:id', wrap(this.storageController.updateStorageAccount));

    // Delete a storage account
    this.router.delete('/:id', wrap(this.storageController.deleteStorageAccount));

    // Update storage account credentials
    this.router.put('/:id/credentials', wrap(this.storageController.updateCredentials));

    // Set default storage account for a company
    this.router.put('/:id/default/:companyId', wrap(this.storageController.setDefaultStorageAccount));

    // Test storage account connection
    this.router.post('/:id/test', wrap(this.storageController.testConnection));

    // Get storage account stats
    this.router.get('/:id/stats', wrap(this.storageController.getStorageStats));

    // Get all storage accounts with usage information
    this.router.get('/usage/company', wrap(this.storageController.getAllStorageAccountsWithUsage));

    // Upload file with progress tracking
    this.router.post('/:id/upload', upload.single('file'), wrap(this.storageController.uploadWithProgress));
  }

  public getRouter(): Router {
    return this.router;
  }
}