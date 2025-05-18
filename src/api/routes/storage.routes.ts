// src/api/routes/storage.routes.ts
import { Router } from 'express';
import { container } from '../../config/container';
import { StorageController } from '../controllers/storage.controller';
import { AuthMiddleware } from '../middleware/auth.middleware';

const storageController = container.get<StorageController>(StorageController);
const authMiddleware = container.get<AuthMiddleware>(AuthMiddleware);

const router = Router();

// Public routes
router.get('/providers', storageController.getProviders.bind(storageController));


// Protected routes - require authentication
router.use(authMiddleware.authenticate);

// Storage account management
router.get('/company/:companyId', storageController.getCompanyStorageAccounts.bind(storageController));
router.get('/:id', storageController.getStorageAccount.bind(storageController));
router.post('/', storageController.createStorageAccount.bind(storageController));
router.patch('/:id', storageController.updateStorageAccount.bind(storageController));
router.delete('/:id', storageController.deleteStorageAccount.bind(storageController));

// Default storage management
router.post('/:id/default/:companyId', storageController.setDefaultStorageAccount.bind(storageController));

// Credentials management
router.patch('/:id/credentials', storageController.updateCredentials.bind(storageController));
router.post('/validate-credentials', storageController.validateCredentials.bind(storageController));

// Storage operations
router.post('/:id/test', storageController.testConnection.bind(storageController));
router.get('/:id/usage', storageController.getStorageUsage.bind(storageController));

export default router;