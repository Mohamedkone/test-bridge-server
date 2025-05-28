// src/services/storage/factory.ts
import { injectable, inject } from 'inversify';
import { Logger } from '../../utils/logger';
import { StorageProviderFactory, StorageProviderType, StorageProvider, StorageCredentials } from './types';
import { GoogleDriveStorageProvider } from './providers/google-drive-provider';
import { DropboxStorageProvider } from './providers/dropbox-provider';
import { S3StorageProvider } from './providers/s3-provider';
import { WasabiStorageProvider } from './providers/wasabi-provider';
import { GcpStorageProvider } from './providers/gcp-storage-provider';
import { AzureBlobStorageProvider } from './providers/azure-blob-provider';

@injectable()
export class StorageProviderFactoryImpl implements StorageProviderFactory {
  private providers: Map<string, StorageProvider> = new Map();
  private availableTypes: StorageProviderType[] = [
    'google_drive', 'dropbox', 's3', 'vault', 'cloud', 'gcp_storage', 'azure_blob'
  ];

  constructor(
    @inject('Logger') private logger: Logger,
    @inject('GoogleDriveStorageProvider') private googleDriveProvider: GoogleDriveStorageProvider,
    @inject('DropboxStorageProvider') private dropboxProvider: DropboxStorageProvider,
    @inject('S3StorageProvider') private s3Provider: S3StorageProvider,
    @inject('WasabiStorageProvider') private wasabiProvider: WasabiStorageProvider,
    @inject('GcpStorageProvider') private gcpStorageProvider: GcpStorageProvider,
    @inject('AzureBlobStorageProvider') private azureBlobProvider: AzureBlobStorageProvider
  ) {
    this.logger = logger.createChildLogger('StorageProviderFactory');
  }

  /**
   * Create a storage provider instance
   * @param type Storage provider type
   * @param credentials Provider-specific credentials
   * @returns StorageProvider instance or null if type is not supported
   */
  createProvider(type: StorageProviderType, credentials?: StorageCredentials): StorageProvider | null {
    this.logger.debug(`Creating storage provider for type: ${type}`);
    
    let provider: StorageProvider | null = null;
    
    // Return provider from cache if it exists
    if (this.providers.has(type)) {
      return this.providers.get(type)!;
    }

    switch (type) {
      case 'google_drive':
        provider = this.googleDriveProvider;
        break;
      case 'dropbox':
        provider = this.dropboxProvider;
        break;
      case 's3':
        provider = this.s3Provider;
        break;
      case 'vault':
      case 'cloud':
        provider = this.wasabiProvider;
        break;
      case 'gcp_storage':
        provider = this.gcpStorageProvider;
        break;
      case 'azure_blob':
        provider = this.azureBlobProvider;
        break;
      default:
        this.logger.error(`Unknown storage provider type: ${type}`);
        return null;
    }

    // Initialize provider if credentials provided
    if (credentials && provider) {
      try {
        // Initialize provider asynchronously
        // Note: The caller will need to await the initialization
        provider.initialize(credentials);
      } catch (error) {
        this.logger.error(`Failed to initialize storage provider ${type}`, { error });
        return null;
      }
    }

    // Cache the provider
    this.providers.set(type, provider);
    
    return provider;
  }
  
  /**
   * Get available provider types
   * @returns List of supported provider types
   */
  getAvailableProviders(): StorageProviderType[] {
    // Return the predefined available types rather than keys from the map
    return this.availableTypes;
  }
  
  /**
   * Register a provider instance
   * @param type Provider type
   * @param provider Provider instance
   */
  registerProvider(type: StorageProviderType, provider: StorageProvider): void {
    this.providers.set(type, provider);
    this.logger.info(`Registered provider for type: ${type}`);
  }
}