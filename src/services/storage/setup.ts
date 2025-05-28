// src/services/storage/setup.ts
import { Container } from 'inversify';
import { StorageService } from './storage.service';
import { GoogleDriveStorageProvider } from './providers/google-drive-provider';
import { DropboxStorageProvider } from './providers/dropbox-provider';
import { S3StorageProvider } from './providers/s3-provider';
import { WasabiStorageProvider } from './providers/wasabi-provider';
import { GcpStorageProvider } from './providers/gcp-storage-provider';
import { AzureBlobStorageProvider } from './providers/azure-blob-provider';
import { StorageProviderFactoryImpl } from './factory';
import { Logger } from '../../utils/logger';

export function setupStorageModule(container: Container) {
  // Register storage providers
  container.bind<GoogleDriveStorageProvider>('GoogleDriveStorageProvider').to(GoogleDriveStorageProvider);
  container.bind<DropboxStorageProvider>('DropboxStorageProvider').to(DropboxStorageProvider);
  container.bind<S3StorageProvider>('S3StorageProvider').to(S3StorageProvider);
  container.bind<WasabiStorageProvider>('WasabiStorageProvider').to(WasabiStorageProvider);
  container.bind<GcpStorageProvider>('GcpStorageProvider').to(GcpStorageProvider);
  container.bind<AzureBlobStorageProvider>('AzureBlobStorageProvider').to(AzureBlobStorageProvider);

  // Register factory
  container.bind<StorageProviderFactoryImpl>('StorageProviderFactory').to(StorageProviderFactoryImpl);

  // Register storage service
  container.bind<StorageService>('StorageService').to(StorageService);

  // Register logger if not already registered
  if (!container.isBound('Logger')) {
    container.bind<Logger>('Logger').to(Logger);
  }
}