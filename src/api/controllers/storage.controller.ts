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
   * List available storage providers
   */
  async getProviders(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const providers = this.storageService.getProviderTypes();
      
      res.json({
        success: true,
        data: providers.map(type => ({
          type,
          name: this.getProviderDisplayName(type)
        }))
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * List company storage accounts
   */
  async getCompanyStorageAccounts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { companyId } = req.params;
      
      if (!companyId) {
        throw new ValidationError('Company ID is required');
      }
      
      const accounts = await this.storageService.getCompanyStorageAccounts(companyId);
      
      res.json({
        success: true,
        data: accounts
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get storage account details
   */
  async getStorageAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      
      if (!id) {
        throw new ValidationError('Storage account ID is required');
      }
      
      const account = await this.storageService.getStorageAccount(id);
      
      if (!account) {
        throw new ValidationError(`Storage account not found: ${id}`);
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
        throw new ValidationError('Missing required fields: name, companyId, storageType, credentials');
      }
      
      // Validate storageType
      const availableProviders = this.storageService.getProviderTypes();
      if (!availableProviders.includes(storageType as StorageProviderType)) {
        throw new ValidationError(`Invalid storage provider type: ${storageType}. Available types: ${availableProviders.join(', ')}`);
      }
      
      const account = await this.storageService.createStorageAccount({
        name,
        companyId,
        storageType: storageType as StorageProviderType,
        isDefault: isDefault === true,
        credentials
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
   * Update a storage account
   */
  async updateStorageAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { name, isDefault } = req.body;
      
      if (!id) {
        throw new ValidationError('Storage account ID is required');
      }
      
      // Make sure at least one field is provided
      if (name === undefined && isDefault === undefined) {
        throw new ValidationError('At least one field to update is required');
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
      
      const result = await this.storageService.deleteStorageAccount(id);
      
      res.json({
        success: result,
        message: result ? 'Storage account deleted successfully' : 'Failed to delete storage account'
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
   * Update credentials for a storage account
   */
  async updateCredentials(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { credentials } = req.body;
      
      if (!id) {
        throw new ValidationError('Storage account ID is required');
      }
      
      if (!credentials) {
        throw new ValidationError('Credentials are required');
      }
      
      const result = await this.storageService.updateCredentials(id, credentials);
      
      res.json({
        success: result,
        message: result ? 'Credentials updated successfully' : 'Failed to update credentials'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Validate credentials for a storage provider type
   */
  async validateCredentials(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { storageType, credentials } = req.body;
      
      if (!storageType || !credentials) {
        throw new ValidationError('Storage type and credentials are required');
      }
      
      const result = await this.storageService.validateCredentials(
        storageType as StorageProviderType, 
        credentials
      );
      
      res.json({
        success: true,
        data: {
          valid: result
        }
      });
    } catch (error) {
      next(error);
    }
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
      
      const result = await this.storageService.getStorageUsage(id);
      
      if (!result.success || !result.stats) {
        throw new Error(result.message || 'Failed to get storage statistics');
      }
      
      res.json({
        success: true,
        data: result.stats
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
      'wasabi': 'Wasabi Cloud Storage',
      'storj': 'Storj Decentralized Cloud Storage',
      'aws-s3': 'Amazon S3',
      'google-drive': 'Google Drive',
      'dropbox': 'Dropbox',
      'azure-blob': 'Microsoft Azure Blob Storage',
      'onedrive': 'Microsoft OneDrive',
      'gcp-storage': 'Google Cloud Storage',
      's3-compatible': 'S3-Compatible Storage'
    };

    return displayNames[type] || type;
  }
}