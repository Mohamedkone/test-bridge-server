// src/services/storage/base-provider.ts
import { Logger } from '../../utils/logger';
import { 
  StorageProvider, 
  StorageOperationResult, 
  SignedUrlOptions, 
  FolderOptions, 
  ListOptions, 
  DeleteOptions, 
  UploadOptions, 
  FileMetadata,
  StorageProviderCapabilities,
  StorageStats
} from './types';
import { StorageError } from './errors';

/**
 * Abstract base implementation with common functionality
 */
export abstract class BaseStorageProvider implements StorageProvider {
  protected credentials: any;
  protected initialized: boolean = false;
  protected logger: Logger;
  protected providerName: string;
  
  constructor(logger: Logger, providerName: string) {
    this.logger = logger.createChildLogger(this.constructor.name);
    this.providerName = providerName;
  }
  
  abstract initialize(credentials: any): Promise<StorageOperationResult>;
  abstract testConnection(): Promise<StorageOperationResult>;
  abstract getSignedUrl(key: string, options: SignedUrlOptions): Promise<StorageOperationResult & { url?: string }>;
  abstract createFolder(path: string, folderName: string, options?: FolderOptions): Promise<StorageOperationResult>;
  abstract listFiles(path: string, options?: ListOptions): Promise<StorageOperationResult & { files?: FileMetadata[] }>;
  abstract getFileMetadata(key: string): Promise<StorageOperationResult & { metadata?: FileMetadata }>;
  abstract deleteFile(key: string, options?: DeleteOptions): Promise<StorageOperationResult>;
  abstract fileExists(key: string): Promise<StorageOperationResult & { exists?: boolean }>;
  abstract createMultipartUpload(key: string, options?: UploadOptions): Promise<StorageOperationResult & { uploadId?: string }>;
  abstract getSignedUrlForPart(key: string, uploadId: string, partNumber: number, contentLength: number): Promise<StorageOperationResult & { url?: string }>;
  abstract completeMultipartUpload(key: string, uploadId: string, parts: any[]): Promise<StorageOperationResult>;
  abstract abortMultipartUpload(key: string, uploadId: string): Promise<StorageOperationResult>;
  abstract getStorageStats(): Promise<StorageOperationResult & { stats?: StorageStats }>;
  
  /**
   * Validates that the provider is initialized
   * @throws Error if not initialized
   */
  protected validateInitialized(): void {
    if (!this.initialized) {
      throw new StorageError(`Storage provider ${this.providerName} not initialized`);
    }
  }
  
  /**
   * Returns default capabilities that can be overridden by specific providers
   */
  getCapabilities(): StorageProviderCapabilities {
    return {
      supportsMultipartUpload: true,
      supportsRangeRequests: true,
      supportsServerSideEncryption: false,
      supportsVersioning: false,
      supportsFolderCreation: true,
      supportsTags: false,
      supportsMetadata: true,
      maximumFileSize: 5 * 1024 * 1024 * 1024, // 5GB default
      maximumPartSize: 100 * 1024 * 1024, // 100MB default
      minimumPartSize: 5 * 1024 * 1024, // 5MB default
      maximumPartCount: 10000 // AWS S3 default
    };
  }
  
  /**
   * Utility method to generate a standardized storage key
   * @param path Base path
   * @param fileName File name
   * @returns Standardized storage key
   */
  protected generateStorageKey(path: string, fileName: string): string {
    // Standardize path format
    let normalizedPath = path.replace(/^\/+/, '').replace(/\/+$/, '');
    if (normalizedPath && !normalizedPath.endsWith('/')) {
      normalizedPath += '/';
    }
    
    return normalizedPath + fileName;
  }
  
  /**
   * Extract file name from a storage key
   * @param key Storage key
   * @returns File name
   */
  protected getFileNameFromKey(key: string): string {
    return key.split('/').pop() || key;
  }
  
  /**
   * Determine MIME type from file name
   * @param fileName File name
   * @returns Content type string
   */
  protected determineContentType(fileName: string): string {
    const extension = fileName.split('.').pop()?.toLowerCase();
    
    const mimeTypes: Record<string, string> = {
      'txt': 'text/plain',
      'html': 'text/html',
      'css': 'text/css',
      'js': 'application/javascript',
      'json': 'application/json',
      'pdf': 'application/pdf',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'svg': 'image/svg+xml',
      'mp3': 'audio/mpeg',
      'mp4': 'video/mp4',
      'zip': 'application/zip',
      'doc': 'application/msword',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'xls': 'application/vnd.ms-excel',
      'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'ppt': 'application/vnd.ms-powerpoint',
      'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    };
    
    return extension && mimeTypes[extension] 
      ? mimeTypes[extension] 
      : 'application/octet-stream';
  }
  
  /**
   * Utility method to retry operations with exponential backoff
   * @param operation Function to retry
   * @param maxRetries Maximum number of retries
   * @param baseDelayMs Base delay in milliseconds
   * @returns Result from the operation
   */
  protected async retryOperation<T>(
    operation: () => Promise<T>, 
    maxRetries: number = 3, 
    baseDelayMs: number = 1000
  ): Promise<T> {
    let retries = 0;
    
    while (true) {
      try {
        return await operation();
      } catch (error:any) {
        retries++;
        
        // Check if we've reached max retries
        if (retries >= maxRetries) {
          this.logger.warn(`Operation failed after ${retries} retries`, { error });
          throw error;
        }
        
        // Calculate backoff delay
        const delayMs = baseDelayMs * Math.pow(2, retries - 1);
        
        this.logger.debug(`Retrying operation after ${delayMs}ms (attempt ${retries} of ${maxRetries})`, {
          error: error.message
        });
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }
}