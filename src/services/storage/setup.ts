// src/services/storage/setup.ts
import { Container } from 'inversify';
import { Logger } from '../../utils/logger';
import { StorageProviderFactory, StorageProviderType } from './types';
import { StorageProviderFactoryImpl } from './factory';
import { WasabiStorageProvider } from './providers/wasabi-provider';
import { StorjStorageProvider } from './providers/storj-provider';
import { GoogleDriveStorageProvider } from './providers/google-drive-provider';
import { DropboxStorageProvider } from './providers/dropbox-provider';
import { AwsS3StorageProvider } from './providers/aws-s3-provider';
import { AzureBlobStorageProvider } from './providers/azure-blob-provider';
import { GcpStorageProvider } from './providers/gcp-storage-provider';
import { S3CompatibleStorageProvider } from './providers/s3-compatible-provider';
import { StorageService } from './storage.service';

/**
 * Register all storage-related services in the DI container
 * @param container Inversify container
 */
export function setupStorageModule(container: Container): void {
  // Register the storage provider factory
  container.bind<StorageProviderFactoryImpl>('StorageProviderFactory')
    .to(StorageProviderFactoryImpl)
    .inSingletonScope();
  
  // Register the storage service
  container.bind<StorageService>('StorageService')
    .to(StorageService)
    .inSingletonScope();
  
  // Register individual provider classes
  container.bind<WasabiStorageProvider>(WasabiStorageProvider).toSelf();
  container.bind<StorjStorageProvider>(StorjStorageProvider).toSelf();
  container.bind<GoogleDriveStorageProvider>(GoogleDriveStorageProvider).toSelf();
  container.bind<DropboxStorageProvider>(DropboxStorageProvider).toSelf();
  container.bind<AwsS3StorageProvider>(AwsS3StorageProvider).toSelf();
  container.bind<AzureBlobStorageProvider>(AzureBlobStorageProvider).toSelf();
  container.bind<GcpStorageProvider>(GcpStorageProvider).toSelf();
  container.bind<S3CompatibleStorageProvider>(S3CompatibleStorageProvider).toSelf();
  
  // Get the factory instance
  const factory = container.get<StorageProviderFactoryImpl>('StorageProviderFactory');
  
  // Register providers with the factory
  factory.registerProvider('wasabi' as StorageProviderType, WasabiStorageProvider as any);
  factory.registerProvider('storj' as StorageProviderType, StorjStorageProvider as any);
  factory.registerProvider('google-drive' as StorageProviderType, GoogleDriveStorageProvider as any);
  factory.registerProvider('dropbox' as StorageProviderType, DropboxStorageProvider as any);
  factory.registerProvider('aws-s3' as StorageProviderType, AwsS3StorageProvider as any);
  factory.registerProvider('azure-blob' as StorageProviderType, AzureBlobStorageProvider as any);
  factory.registerProvider('gcp-storage' as StorageProviderType, GcpStorageProvider as any);
  factory.registerProvider('s3-compatible' as StorageProviderType, S3CompatibleStorageProvider as any);
  
  // Log the registered providers
  const logger = container.get<Logger>('Logger');
  logger.info('Registered storage providers', { 
    providers: factory.getAvailableProviders() 
  });
}