// src/services/storage/storage.service.ts
import { injectable, inject, multiInject } from 'inversify';
import { Logger } from '../../utils/logger';
import { StorageProviderFactory, StorageProvider, StorageProviderType, StorageOperationResult, StorageStats } from './types';
import { StorageError, StorageProviderError, StorageAuthError, StorageQuotaExceededError } from './errors';
import { StorageAccountRepository, StorageAccount } from '../../repositories/storage-account.repository';
import { BaseStorageProvider } from './base-provider';
import { GoogleDriveStorageProvider } from './providers/google-drive-provider';
import { DropboxStorageProvider } from './providers/dropbox-provider';
import { S3StorageProvider } from './providers/s3-provider';
import { 
  StorageCredentials,
  SignedUrlOptions,
  FolderOptions,
  ListOptions,
  DeleteOptions,
  UploadOptions,
  FileMetadata,
  StorageProviderCapabilities,
  ProgressCallback,
  ProgressInfo
} from './types';
import { Readable } from 'stream';

@injectable()
export class StorageService {
  private providers: Map<string, BaseStorageProvider> = new Map();
  private activeProvider?: BaseStorageProvider;
  private storageStats: Map<string, { stats: StorageStats, lastUpdated: Date }> = new Map();
  // Update stats every 15 minutes
  private statsRefreshInterval = 15 * 60 * 1000;
  private quotaThresholdPercent = 90; // Alert when storage is 90% full
  
  constructor(
    @inject('StorageProviderFactory') private providerFactory: StorageProviderFactory,
    @inject('StorageAccountRepository') private storageAccountRepository: StorageAccountRepository,
    @inject('Logger') private logger: Logger,
    @multiInject('GoogleDriveStorageProvider') googleDriveProvider: GoogleDriveStorageProvider,
    @multiInject('DropboxStorageProvider') dropboxProvider: DropboxStorageProvider,
    @multiInject('S3StorageProvider') s3Provider: S3StorageProvider
  ) {
    this.logger = logger.createChildLogger('StorageService');
    
    // Register providers
    this.providers.set('google_drive', googleDriveProvider);
    this.providers.set('dropbox', dropboxProvider);
    this.providers.set('s3', s3Provider);
  }
  
  /**
   * Initialize the service and set up periodic stats refresh
   */
  async initialize(): Promise<void> {
    // Set up periodic storage stats refresh
    setInterval(() => this.refreshAllStorageStats(), this.statsRefreshInterval);
    
    // Initial refresh of storage stats
    this.refreshAllStorageStats();
  }
  
  /**
   * Refresh storage stats for all connected storage accounts
   */
  private async refreshAllStorageStats(): Promise<void> {
    try {
      // Use findByCompanyId with a special value to get all accounts
      const accounts = await this.storageAccountRepository.findByCompanyId('*');
      
      for (const account of accounts) {
        try {
          // Skip accounts that were recently updated
          const cachedStats = this.storageStats.get(account.id);
          if (cachedStats && (Date.now() - cachedStats.lastUpdated.getTime() < this.statsRefreshInterval)) {
            continue;
          }
          
          const provider = await this.getStorageProvider(account.id);
          const result = await provider.getStorageStats();
          
          if (result.success && result.stats) {
            this.storageStats.set(account.id, {
              stats: result.stats,
              lastUpdated: new Date()
            });
            
            // Check if storage is nearing quota limits
            this.checkQuotaThresholds(account.id, result.stats);
          }
        } catch (error) {
          this.logger.error(`Failed to refresh stats for storage account ${account.id}`, { error });
        }
      }
    } catch (error) {
      this.logger.error('Failed to refresh storage stats', { error });
    }
  }
  
  /**
   * Check if storage is approaching quota limits
   */
  private checkQuotaThresholds(accountId: string, stats: StorageStats): void {
    if (!stats.totalBytes || !stats.usedBytes) {
      return;
    }
    
    const usedPercent = (stats.usedBytes / stats.totalBytes) * 100;
    
    if (usedPercent >= this.quotaThresholdPercent) {
      this.logger.warn(`Storage quota threshold exceeded for account ${accountId}`, {
        usedBytes: stats.usedBytes,
        totalBytes: stats.totalBytes,
        usedPercent,
        threshold: this.quotaThresholdPercent
      });
      
      // TODO: Emit event or send notification
    }
  }
  
  /**
   * Get storage stats with optional refresh
   */
  async getStorageStats(storageId: string, forceRefresh = false): Promise<StorageStats> {
    // Check if we have cached stats and they're fresh enough
    const cachedStats = this.storageStats.get(storageId);
    if (!forceRefresh && cachedStats && (Date.now() - cachedStats.lastUpdated.getTime() < this.statsRefreshInterval)) {
      return cachedStats.stats;
    }
    
    // Get fresh stats
    const provider = await this.getStorageProvider(storageId);
    const result = await provider.getStorageStats();
    
    if (!result.success || !result.stats) {
      throw new StorageError(`Failed to get storage stats for account ${storageId}`);
    }
    
    // Cache the stats
    this.storageStats.set(storageId, {
      stats: result.stats,
      lastUpdated: new Date()
    });
    
    // Check quota thresholds
    this.checkQuotaThresholds(storageId, result.stats);
    
    return result.stats;
  }
  
  /**
   * Get all storage accounts with usage information
   */
  async getStorageAccountsWithUsage(companyId: string): Promise<(StorageAccount & { usage?: StorageStats })[]> {
    const accounts = await this.getStorageAccounts(companyId);
    
    // Enhance each account with usage information
    const accountsWithUsage = await Promise.all(accounts.map(async (account) => {
      try {
        const stats = await this.getStorageStats(account.id, false);
        return {
          ...account,
          usage: stats
        };
      } catch (error) {
        this.logger.error(`Failed to get storage stats for account ${account.id}`, { error });
        return account;
      }
    }));
    
    return accountsWithUsage;
  }
  
  /**
   * Check if an operation would exceed storage quota
   */
  async checkStorageQuota(storageId: string, sizeBytes: number): Promise<boolean> {
    try {
      const stats = await this.getStorageStats(storageId);
      
      if (!stats.totalBytes) {
        // If total bytes is not defined, assume unlimited
        return true;
      }
      
      // Check if adding the new file would exceed quota
      const projectedUsage = stats.usedBytes + sizeBytes;
      
      if (projectedUsage > stats.totalBytes) {
        this.logger.warn(`Storage quota would be exceeded for account ${storageId}`, {
          currentUsage: stats.usedBytes,
          requestedSize: sizeBytes,
          projectedUsage,
          totalQuota: stats.totalBytes
        });
        
        // Return false if operation would exceed quota
        return false;
      }
      
      return true;
    } catch (error) {
      this.logger.error(`Failed to check storage quota for account ${storageId}`, { error });
      // Default to allowing the operation if we can't check quota
      return true;
    }
  }
  
  /**
   * Upload file with quota check and progress tracking
   */
  async uploadFile(
    storageId: string,
    path: string,
    fileName: string,
    content: Buffer | Readable,
    options?: UploadOptions & { onProgress?: ProgressCallback }
  ): Promise<FileMetadata> {
    const provider = await this.getStorageProvider(storageId);
    
    // Check if the provider supports direct uploads
    if ('uploadFile' in provider) {
      // Check content size if it's a buffer
      if (Buffer.isBuffer(content)) {
        // Check if upload would exceed quota
        const hasQuota = await this.checkStorageQuota(storageId, content.length);
        
        if (!hasQuota) {
          throw new StorageQuotaExceededError(storageId);
        }
      }
      
      // Use provider's upload method with progress tracking
      const result = await (provider as any).uploadFile(path, fileName, content, options);
      
      if (!result.success) {
        throw new StorageError(`Failed to upload file: ${result.message}`);
      }
      
      // Update storage stats after successful upload
      setTimeout(() => this.refreshAllStorageStats(), 1000);
      
      return {
        key: result.fileId || result.data?.id,
        name: fileName,
        size: Buffer.isBuffer(content) ? content.length : (result.data?.size || 0),
        lastModified: new Date(),
        contentType: options?.contentType || 'application/octet-stream',
        isDirectory: false,
        metadata: result.data
      };
    } else {
      // Fall back to generic upload approach
      throw new StorageError(`Direct upload not supported for provider ${provider.providerName}`);
    }
  }
  
  /**
   * Get all storage accounts for a company
   */
  async getStorageAccounts(companyId: string): Promise<StorageAccount[]> {
    return this.storageAccountRepository.findByCompanyId(companyId);
  }
  
  /**
   * Get a specific storage account
   */
  async getStorageAccount(id: string): Promise<StorageAccount | null> {
    return this.storageAccountRepository.findById(id);
  }
  
  /**
   * Get available storage provider types
   */
  getAvailableProviders(): string[] {
    return Array.from(this.providers.keys());
  }
  
  /**
   * Get a provider instance for a storage account
   * @param storageId Storage account ID
   */
  async getStorageProvider(storageId: string): Promise<StorageProvider> {
    // Check if provider is already instantiated
    if (this.providers.has(storageId)) {
      return this.providers.get(storageId)!;
    }
    
    // Fetch storage account from database
    const storageAccount = await this.storageAccountRepository.findById(storageId);
    
    if (!storageAccount) {
      throw new StorageError(`Storage account not found: ${storageId}`);
    }
    
    // Fetch credentials from secure storage
    const credentialData = await this.storageAccountRepository.getCredentials(storageId);
    
    if (!credentialData) {
      throw new StorageError(`Credentials not found for storage account: ${storageId}`);
    }
    
    const credentials = credentialData.credentials;
    
    // Create provider instance
    const provider = this.providerFactory.createProvider(storageAccount.storageType, credentials);
    
    if (!provider) {
      throw new StorageProviderError(
        storageAccount.storageType,
        'initialization',
        { message: `Provider type not supported: ${storageAccount.storageType}` }
      );
    }
    
    // Initialize provider if not already initialized
    try {
      const initResult = await provider.initialize(credentials);
      
      if (!initResult.success) {
        throw new StorageAuthError(
          storageAccount.storageType,
          { message: initResult.message || 'Failed to initialize storage provider' }
        );
      }
    } catch (error: any) {
      this.logger.error(`Failed to initialize storage provider for account ${storageId}`, { error });
      throw new StorageProviderError(
        storageAccount.storageType,
        'initialization',
        error
      );
    }
    
    // Cache the provider instance
    this.providers.set(storageId, provider);
    
    return provider;
  }
  
  /**
   * Get default storage account for a company
   */
  async getDefaultStorageAccount(companyId: string): Promise<StorageAccount | null> {
    return this.storageAccountRepository.findDefaultForCompany(companyId);
  }
  
  /**
   * Set default storage account for a company
   */
  async setDefaultStorageAccount(storageId: string, companyId: string): Promise<boolean> {
    return this.storageAccountRepository.setDefault(storageId, companyId);
  }
  
  /**
   * Create a new storage account
   */
  async createStorageAccount(data: {
    name: string;
    companyId: string;
    storageType: StorageProviderType;
    isDefault?: boolean;
    credentials: any;
  }): Promise<StorageAccount> {
    try {
      this.logger.info('Creating storage account', { companyId: data.companyId, type: data.storageType });
      
      // Create a provider instance to validate the credentials
      const tempProvider = this.providerFactory.createProvider(data.storageType);
      
      if (!tempProvider) {
        throw new StorageProviderError(data.storageType, 'initialization', {
          message: `Provider type not supported: ${data.storageType}`
        });
      }
      
      // Initialize the provider to validate credentials
      const initResult = await tempProvider.initialize(data.credentials);
      
      if (!initResult.success) {
        throw new StorageAuthError(data.storageType, {
          message: initResult.message || 'Failed to initialize storage provider'
        });
      }
      
      // Test the connection
      const testResult = await tempProvider.testConnection();
      
      if (!testResult.success) {
        throw new StorageProviderError(data.storageType, 'connection', {
          message: testResult.message || 'Failed to connect to storage provider'
        });
      }
      
      // Create the storage account in the database
      const storageAccount = await this.storageAccountRepository.create({
        name: data.name,
        companyId: data.companyId,
        storageType: data.storageType,
        isDefault: data.isDefault || false
      });
      
      // Save the credentials securely
      await this.storageAccountRepository.saveCredentials(storageAccount.id, data.credentials);
      
      // Cache the provider instance
      this.providers.set(storageAccount.id, tempProvider);
      
      return storageAccount;
    } catch (error: any) {
      this.logger.error('Failed to create storage account', {
        companyId: data.companyId,
        type: data.storageType,
        error: error.message
      });
      throw error;
    }
  }
  
  /**
   * Update storage account
   */
  async updateStorageAccount(id: string, data: {
    name?: string;
    isDefault?: boolean;
  }): Promise<StorageAccount> {
    try {
      // Get the existing account to make sure it exists
      const existingAccount = await this.storageAccountRepository.findById(id);
      
      if (!existingAccount) {
        throw new StorageError(`Storage account not found: ${id}`);
      }
      
      // Update the account
      const updatedAccount = await this.storageAccountRepository.update(id, {
        name: data.name,
        isDefault: data.isDefault,
        companyId: existingAccount.companyId // Required for setting default
      });
      
      return updatedAccount;
    } catch (error: any) {
      this.logger.error('Failed to update storage account', {
        storageId: id,
        error: error.message
      });
      
      if (error instanceof StorageError) {
        throw error;
      }
      
      throw new StorageError(`Failed to update storage account: ${error.message}`);
    }
  }
  
  /**
   * Delete storage account
   */
  async deleteStorageAccount(id: string): Promise<boolean> {
    try {
      // Get the account to make sure it exists
      const account = await this.storageAccountRepository.findById(id);
      
      if (!account) {
        throw new StorageError(`Storage account not found: ${id}`);
      }
      
      // Delete the account
      const success = await this.storageAccountRepository.delete(id);
      
      if (success) {
        // Remove from provider cache
        this.providers.delete(id);
      }
      
      return success;
    } catch (error: any) {
      this.logger.error('Failed to delete storage account', {
        storageId: id,
        error: error.message
      });
      
      if (error instanceof StorageError) {
        throw error;
      }
      
      throw new StorageError(`Failed to delete storage account: ${error.message}`);
    }
  }
  
  /**
   * Update credentials for a storage account
   */
  async updateCredentials(storageId: string, credentials: any): Promise<boolean> {
    try {
      // Get the account to make sure it exists
      const account = await this.storageAccountRepository.findById(storageId);
      
      if (!account) {
        throw new StorageError(`Storage account not found: ${storageId}`);
      }
      
      // Create a provider instance to validate the credentials
      const tempProvider = this.providerFactory.createProvider(account.storageType);
      
      if (!tempProvider) {
        throw new StorageProviderError(account.storageType, 'initialization', {
          message: `Provider type not supported: ${account.storageType}`
        });
      }
      
      // Initialize the provider to validate credentials
      const initResult = await tempProvider.initialize(credentials);
      
      if (!initResult.success) {
        throw new StorageAuthError(account.storageType, {
          message: initResult.message || 'Failed to initialize storage provider'
        });
      }
      
      // Test the connection
      const testResult = await tempProvider.testConnection();
      
      if (!testResult.success) {
        throw new StorageProviderError(account.storageType, 'connection', {
          message: testResult.message || 'Failed to connect to storage provider'
        });
      }
      
      // Save the credentials securely
      await this.storageAccountRepository.saveCredentials(storageId, credentials);
      
      // Remove the existing provider instance from cache
      this.providers.delete(storageId);
      
      // Cache the new provider instance
      this.providers.set(storageId, tempProvider);
      
      return true;
    } catch (error: any) {
      this.logger.error('Failed to update credentials', {
        storageId,
        error: error.message
      });
      
      if (error instanceof StorageError) {
        throw error;
      }
      
      throw new StorageError(`Failed to update credentials: ${error.message}`);
    }
  }
  
  /**
   * Validate credentials for a storage provider type
   */
  async validateCredentials(storageType: StorageProviderType, credentials: any): Promise<boolean> {
    try {
      // Create a provider instance to validate the credentials
      const tempProvider = this.providerFactory.createProvider(storageType);
      
      if (!tempProvider) {
        throw new StorageProviderError(storageType, 'initialization', {
          message: `Provider type not supported: ${storageType}`
        });
      }
      
      // Initialize the provider to validate credentials
      const initResult = await tempProvider.initialize(credentials);
      
      if (!initResult.success) {
        return false;
      }
      
      // Test the connection
      const testResult = await tempProvider.testConnection();
      
      return testResult.success;
    } catch (error: any) {
      this.logger.error('Failed to validate storage credentials', {
        storageType,
        error: error.message
      });
      
      return false;
    }
  }
  
  /**
   * Test the connection to a storage account
   */
  async testConnection(storageId: string): Promise<StorageOperationResult> {
    try {
      const provider = await this.getStorageProvider(storageId);
      return await provider.testConnection();
    } catch (error: any) {
      this.logger.error(`Connection test failed for storage account ${storageId}`, { error });
      return {
        success: false,
        message: error.message || 'Connection test failed'
      };
    }
  }
  
  async initializeProvider(type: string, credentials: StorageCredentials): Promise<void> {
    const provider = this.providers.get(type);
    if (!provider) {
      throw new StorageProviderError(type, 'initialize', new Error(`Provider ${type} not found`));
    }

    try {
      await provider.initialize(credentials);
      this.activeProvider = provider;
    } catch (error: any) {
      throw new StorageAuthError(type, error);
    }
  }

  async testActiveProviderConnection(): Promise<boolean> {
    if (!this.activeProvider) {
      throw new StorageProviderError('storage', 'testConnection', new Error('No active provider'));
    }

    const result = await this.activeProvider.testConnection();
    return result.success;
  }

  async getSignedUrl(key: string, options: SignedUrlOptions): Promise<string> {
    if (!this.activeProvider) {
      throw new StorageProviderError('storage', 'getSignedUrl', new Error('No active provider'));
    }

    const result = await this.activeProvider.getSignedUrl(key, options);
    if (!result.success || !result.url) {
      throw new StorageProviderError('storage', 'getSignedUrl', new Error(result.message || 'Failed to get signed URL'));
    }

    return result.url;
  }

  async createFolder(path: string, folderName: string, options?: FolderOptions): Promise<void> {
    if (!this.activeProvider) {
      throw new StorageProviderError('storage', 'createFolder', new Error('No active provider'));
    }

    const result = await this.activeProvider.createFolder(path, folderName, options);
    if (!result.success) {
      throw new StorageProviderError('storage', 'createFolder', new Error(result.message || 'Failed to create folder'));
    }
  }

  async listFiles(path: string, options?: ListOptions): Promise<FileMetadata[]> {
    if (!this.activeProvider) {
      throw new StorageProviderError('storage', 'listFiles', new Error('No active provider'));
    }

    const result = await this.activeProvider.listFiles(path, options);
    if (!result.success || !result.files) {
      throw new StorageProviderError('storage', 'listFiles', new Error(result.message || 'Failed to list files'));
    }

    return result.files;
  }

  async getFileMetadata(key: string): Promise<FileMetadata> {
    if (!this.activeProvider) {
      throw new StorageProviderError('storage', 'getFileMetadata', new Error('No active provider'));
    }

    const result = await this.activeProvider.getFileMetadata(key);
    if (!result.success || !result.metadata) {
      throw new StorageProviderError('storage', 'getFileMetadata', new Error(result.message || 'Failed to get file metadata'));
    }

    return result.metadata;
  }

  async deleteFile(key: string, options?: DeleteOptions): Promise<void> {
    if (!this.activeProvider) {
      throw new StorageProviderError('storage', 'deleteFile', new Error('No active provider'));
    }

    const result = await this.activeProvider.deleteFile(key, options);
    if (!result.success) {
      throw new StorageProviderError('storage', 'deleteFile', new Error(result.message || 'Failed to delete file'));
    }
  }

  async fileExists(key: string): Promise<boolean> {
    if (!this.activeProvider) {
      throw new StorageProviderError('storage', 'fileExists', new Error('No active provider'));
    }

    const result = await this.activeProvider.fileExists(key);
    if (!result.success) {
      throw new StorageProviderError('storage', 'fileExists', new Error(result.message || 'Failed to check file existence'));
    }

    return result.exists || false;
  }

  async createMultipartUpload(key: string, options?: UploadOptions): Promise<string> {
    if (!this.activeProvider) {
      throw new StorageProviderError('storage', 'createMultipartUpload', new Error('No active provider'));
    }

    const result = await this.activeProvider.createMultipartUpload(key, options);
    if (!result.success || !result.uploadId) {
      throw new StorageProviderError('storage', 'createMultipartUpload', new Error(result.message || 'Failed to create multipart upload'));
    }

    return result.uploadId;
  }

  async getSignedUrlForPart(key: string, uploadId: string, partNumber: number, contentLength: number): Promise<string> {
    if (!this.activeProvider) {
      throw new StorageProviderError('storage', 'getSignedUrlForPart', new Error('No active provider'));
    }

    const result = await this.activeProvider.getSignedUrlForPart(key, uploadId, partNumber, contentLength);
    if (!result.success || !result.url) {
      throw new StorageProviderError('storage', 'getSignedUrlForPart', new Error(result.message || 'Failed to get signed URL for part'));
    }

    return result.url;
  }

  async completeMultipartUpload(key: string, uploadId: string, parts: any[]): Promise<void> {
    if (!this.activeProvider) {
      throw new StorageProviderError('storage', 'completeMultipartUpload', new Error('No active provider'));
    }

    const result = await this.activeProvider.completeMultipartUpload(key, uploadId, parts);
    if (!result.success) {
      throw new StorageProviderError('storage', 'completeMultipartUpload', new Error(result.message || 'Failed to complete multipart upload'));
    }
  }

  async abortMultipartUpload(key: string, uploadId: string): Promise<void> {
    if (!this.activeProvider) {
      throw new StorageProviderError('storage', 'abortMultipartUpload', new Error('No active provider'));
    }

    const result = await this.activeProvider.abortMultipartUpload(key, uploadId);
    if (!result.success) {
      throw new StorageProviderError('storage', 'abortMultipartUpload', new Error(result.message || 'Failed to abort multipart upload'));
    }
  }

  getActiveProvider(): string | undefined {
    return this.activeProvider ? this.activeProvider.providerName : undefined;
  }

  getProviderCapabilities(): StorageProviderCapabilities {
    if (!this.activeProvider) {
      throw new StorageProviderError('storage', 'getProviderCapabilities', new Error('No active provider'));
    }

    return this.activeProvider.getCapabilities();
  }
}