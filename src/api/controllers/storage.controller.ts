// src/api/controllers/storage.controller.ts
import { Request, Response, NextFunction } from 'express';
import { injectable, inject } from 'inversify';
import { StorageService } from '../../services/storage/storage.service';
import { Logger } from '../../utils/logger';
import { ValidationError } from '../../utils/errors';
import { StorageProviderType } from '../../services/storage/types';

@injectable()
export class StorageController {
  constructor(
    @inject('StorageService') private storageService: StorageService,
    @inject('Logger') private logger: Logger
  ) {
    this.logger = logger.createChildLogger('StorageController');
  }

  /**
   * Get all storage accounts for a company
   */
  async getStorageAccounts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { companyId } = req.params;
      
      if (!companyId) {
        throw new ValidationError('Company ID is required');
      }
      
      const accounts = await this.storageService.getStorageAccounts(companyId);
      
      res.json({
        success: true,
        data: accounts
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get a specific storage account
   */
  async getStorageAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      
      if (!id) {
        throw new ValidationError('Storage account ID is required');
      }
      
      const account = await this.storageService.getStorageAccount(id);
      
      if (!account) {
        res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Storage account not found'
          }
        });
        return;
      }
      
      res.json({
        success: true,
        data: account
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create a new storage account
   */
  async createStorageAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { name, companyId, storageType, isDefault, credentials } = req.body;
      
      if (!name || !companyId || !storageType || !credentials) {
        throw new ValidationError('Name, company ID, storage type, and credentials are required');
      }
      
      const account = await this.storageService.createStorageAccount({
        name,
        companyId,
        storageType,
        isDefault,
        credentials
      });
      
      res.status(201).json({
        success: true,
        data: account
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update a storage account
   */
  async updateStorageAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { name, isDefault } = req.body;
      
      if (!id) {
        throw new ValidationError('Storage account ID is required');
      }
      
      const account = await this.storageService.updateStorageAccount(id, {
        name,
        isDefault
      });
      
      res.json({
        success: true,
        data: account
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete a storage account
   */
  async deleteStorageAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      
      if (!id) {
        throw new ValidationError('Storage account ID is required');
      }
      
      const success = await this.storageService.deleteStorageAccount(id);
      
      res.json({
        success,
        message: success ? 'Storage account deleted successfully' : 'Failed to delete storage account'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update storage account credentials
   */
  async updateCredentials(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { credentials } = req.body;
      
      if (!id || !credentials) {
        throw new ValidationError('Storage account ID and credentials are required');
      }
      
      const success = await this.storageService.updateCredentials(id, credentials);
      
      res.json({
        success,
        message: success ? 'Credentials updated successfully' : 'Failed to update credentials'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Set a storage account as the default for a company
   */
  async setDefaultStorageAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id, companyId } = req.params;
      
      if (!id || !companyId) {
        throw new ValidationError('Storage account ID and company ID are required');
      }
      
      const result = await this.storageService.setDefaultStorageAccount(id, companyId);
      
      res.json({
        success: result,
        message: result ? 'Default storage account set successfully' : 'Failed to set default storage account'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get available storage provider types
   */
  async getProviderTypes(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const providers = this.storageService.getAvailableProviders().map(type => ({
        type,
        displayName: this.getProviderDisplayName(type)
      }));
      
      res.json({
        success: true,
        data: providers
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Helper to get display name for provider type
   */
  private getProviderDisplayName(type: string): string {
    const displayNames: Record<string, string> = {
      'vault': 'Internal Storage (Wasabi)',
      'cloud': 'Storj Decentralized Cloud Storage',
      's3': 'Amazon S3',
      'google_drive': 'Google Drive',
      'dropbox': 'Dropbox',
      'azure_blob': 'Microsoft Azure Blob Storage',
      'gcp_storage': 'Google Cloud Storage'
    };

    return displayNames[type] || type;
  }

  /**
   * Test connection to a storage account
   */
  async testConnection(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      
      if (!id) {
        throw new ValidationError('Storage account ID is required');
      }
      
      const result = await this.storageService.testConnection(id);
      
      res.json({
        success: result.success,
        message: result.message
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get storage usage statistics
   */
  async getStorageUsage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      
      if (!id) {
        throw new ValidationError('Storage account ID is required');
      }
      
      const stats = await this.storageService.getStorageStats(id, false);
      
      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      next(error);
    }
  }

  // Add new methods to expose storage stats and quota management
  async getStorageStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      
      // Check if user has access to the storage account
      const storage = await this.storageService.getStorageAccount(id);
      if (!storage || storage.companyId !== req.user.companyId) {
        res.status(403).json({ error: 'Access denied to storage account' });
        return;
      }
      
      // Get storage stats with optional force refresh
      const forceRefresh = req.query.refresh === 'true';
      const stats = await this.storageService.getStorageStats(id, forceRefresh);
      
      res.json(stats);
    } catch (error: any) {
      this.logger.error('Failed to get storage stats', { error: error.message });
      res.status(500).json({ error: 'Failed to get storage stats' });
    }
  }

  async getAllStorageAccountsWithUsage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.user.companyId;
      const accounts = await this.storageService.getStorageAccountsWithUsage(companyId);
      
      res.json(accounts);
    } catch (error: any) {
      this.logger.error('Failed to get storage accounts with usage', { error: error.message });
      res.status(500).json({ error: 'Failed to get storage accounts with usage' });
    }
  }

  async uploadWithProgress(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { path = '/' } = req.query;
      
      // Check if user has access to the storage account
      const storage = await this.storageService.getStorageAccount(id);
      if (!storage || storage.companyId !== req.user.companyId) {
        res.status(403).json({ error: 'Access denied to storage account' });
        return;
      }
      
      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
      }
      
      // Track upload progress
      let lastProgress = 0;
      const progressCallback = (progress: any) => {
        // Only send progress updates when there's significant change (every 5%)
        if (progress.percent - lastProgress >= 5) {
          lastProgress = progress.percent;
          // If this were a WebSocket connection, we could send progress updates
          // this.webSocketService.sendToUser(req.user.id, 'upload:progress', {
          //   storageId: id,
          //   fileName: req.file!.originalname,
          //   progress
          // });
        }
      };
      
      // Upload the file with progress tracking
      const fileMetadata = await this.storageService.uploadFile(
        id,
        path as string,
        req.file.originalname,
        req.file.buffer,
        {
          contentType: req.file.mimetype,
          onProgress: progressCallback
        }
      );
      
      res.status(201).json(fileMetadata);
    } catch (error: any) {
      this.logger.error('Failed to upload file', { error: error.message });
      
      if (error.name === 'StorageQuotaExceededError') {
        res.status(413).json({ error: 'Storage quota exceeded' });
        return;
      }
      
      res.status(500).json({ error: 'Failed to upload file' });
    }
  }
}