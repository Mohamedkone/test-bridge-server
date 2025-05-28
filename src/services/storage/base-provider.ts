// src/services/storage/base-provider.ts
import { injectable, inject } from 'inversify';
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
@injectable()
export abstract class BaseStorageProvider implements StorageProvider {
  protected initialized: boolean = false;
  protected credentials: any;
  public readonly providerName: string;
  
  constructor(
    @inject('Logger') protected logger: Logger,
    providerName: string
  ) {
    this.providerName = providerName;
    this.logger = logger.createChildLogger(this.constructor.name);
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
  abstract getFileContent(key: string, range?: { start: number; end: number }): Promise<StorageOperationResult & { data?: Buffer }>;
  
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
      supportsMultipartUpload: false,
      supportsRangeRequests: false,
      supportsServerSideEncryption: false,
      supportsVersioning: false,
      supportsFolderCreation: false,
      supportsTags: false,
      supportsMetadata: false,
      maximumFileSize: 0,
      maximumPartSize: 0,
      minimumPartSize: 0,
      maximumPartCount: 0
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
   * Retry operation with exponential backoff
   */
  protected async withRetry<T>(
    operation: () => Promise<T>,
    options: { maxRetries?: number; baseDelayMs?: number } = {}
  ): Promise<T> {
    const maxRetries = options.maxRetries || 3;
    const baseDelayMs = options.baseDelayMs || 500;
    
    for (let retries = 0; retries <= maxRetries; retries++) {
      try {
        return await operation();
      } catch (error: any) {
        if (retries === maxRetries) {
          throw error;
        }
        
        const delayMs = baseDelayMs * Math.pow(2, retries - 1);
        
        this.logger.debug(`Retrying operation after ${delayMs}ms (attempt ${retries} of ${maxRetries})`, {
          error: error.message
        });
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
    
    // This should never happen, but TypeScript needs a return
    throw new Error('Unexpected retry failure');
  }
}