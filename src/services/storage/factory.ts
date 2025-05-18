// src/services/storage/factory.ts
import { injectable, inject } from 'inversify';
import { Logger } from '../../utils/logger';
import { StorageProvider, StorageProviderFactory, StorageProviderType } from './types';

@injectable()
export class StorageProviderFactoryImpl implements StorageProviderFactory {
  private providers: Map<StorageProviderType, new () => StorageProvider> = new Map();
  
  constructor(@inject('Logger') private logger: Logger) {
    this.logger = logger.createChildLogger('StorageProviderFactory');
  }
  
  /**
   * Create a storage provider instance
   * @param type Storage provider type
   * @param credentials Provider-specific credentials
   * @returns StorageProvider instance or null if type is not supported
   */
  createProvider(type: StorageProviderType, credentials?: any): StorageProvider | null {
    const ProviderClass = this.providers.get(type);
    
    if (!ProviderClass) {
      this.logger.warn(`No provider registered for type: ${type}`);
      return null;
    }
    
    try {
      const provider = new ProviderClass();
      
      // Initialize provider if credentials are provided
      if (credentials) {
        provider.initialize(credentials).catch(error => {
          this.logger.error(`Failed to initialize ${type} provider`, { error });
        });
      }
      
      return provider;
    } catch (error) {
      this.logger.error(`Error creating provider of type ${type}`, { error });
      return null;
    }
  }
  
  /**
   * Get available provider types
   * @returns List of supported provider types
   */
  getAvailableProviders(): StorageProviderType[] {
    return Array.from(this.providers.keys());
  }
  
  /**
   * Register a new provider implementation
   * @param type Provider type
   * @param providerClass Provider implementation class
   */
  registerProvider(type: StorageProviderType, providerClass: new () => StorageProvider): void {
    this.providers.set(type, providerClass);
    this.logger.info(`Registered provider for type: ${type}`);
  }
}