// src/services/storage/storage.service.ts
import { injectable, inject } from 'inversify';
import { Logger } from '../../utils/logger';
import { StorageProviderFactory, StorageProvider, StorageProviderType, StorageOperationResult, StorageStats } from './types';
import { StorageError, StorageProviderError, StorageAuthError } from './errors';
import { StorageAccountRepository, StorageAccount } from '../../repositories/storage-account.repository';

@injectable()
export class StorageService {
  private providerInstances: Map<string, StorageProvider> = new Map();
  
  constructor(
    @inject('StorageProviderFactory') private providerFactory: StorageProviderFactory,
    @inject('StorageAccountRepository') private storageAccountRepository: StorageAccountRepository,
    @inject('Logger') private logger: Logger
  ) {
    this.logger = logger.createChildLogger('StorageService');
  }
  
  /**
   * Get available storage provider types
   */
  getProviderTypes(): StorageProviderType[] {
    return this.providerFactory.getAvailableProviders();
  }
  
  /**
   * Get a provider instance for a storage account
   * @param storageId Storage account ID
   */
  async getStorageProvider(storageId: string): Promise<StorageProvider> {
    // Check if provider is already instantiated
    if (this.providerInstances.has(storageId)) {
      return this.providerInstances.get(storageId)!;
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
    this.providerInstances.set(storageId, provider);
    
    return provider;
  }
  
  /**
   * Get storage account by ID
   */
  async getStorageAccount(storageId: string): Promise<StorageAccount | null> {
    return this.storageAccountRepository.findById(storageId);
  }
  
  /**
   * Get storage accounts for a company
   */
  async getCompanyStorageAccounts(companyId: string): Promise<StorageAccount[]> {
    return this.storageAccountRepository.findByCompanyId(companyId);
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
      this.providerInstances.set(storageAccount.id, tempProvider);
      
      return storageAccount;
    } catch (error: any) {
      this.logger.error('Failed to create storage account', {
        companyId: data.companyId,
        type: data.storageType,
        error: error.message
      });
      
      if (error instanceof StorageError) {
        throw error;
      }
      
      throw new StorageError(`Failed to create storage account: ${error.message}`);
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
      
      // Remove the provider instance from cache
      this.providerInstances.delete(id);
      
      // Delete the account
      return await this.storageAccountRepository.delete(id);
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
      this.providerInstances.delete(storageId);
      
      // Cache the new provider instance
      this.providerInstances.set(storageId, tempProvider);
      
      return true;
    } catch (error: any) {
      this.logger.error('Failed to update storage credentials', {
        storageId,
        error: error.message
      });
      
      if (error instanceof StorageError) {
        throw error;
      }
      
      throw new StorageError(`Failed to update storage credentials: ${error.message}`);
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
        message: error.message || 'Connection test failed',
        error
      };
    }
  }
  
  /**
   * Get storage usage statistics
   */
  async getStorageUsage(storageId: string): Promise<StorageOperationResult & { stats?: StorageStats }> {
    try {
      const provider = await this.getStorageProvider(storageId);
      return await provider.getStorageStats();
    } catch (error: any) {
      this.logger.error(`Failed to get storage statistics for account ${storageId}`, { error });
      return {
        success: false,
        message: error.message || 'Failed to get storage statistics',
        error
      };
    }
  }
}