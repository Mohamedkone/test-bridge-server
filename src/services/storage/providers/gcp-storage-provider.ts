// src/services/storage/providers/gcp-storage-provider.ts
import { Storage, Bucket, File, GetFilesResponse } from '@google-cloud/storage';
import { injectable, inject } from 'inversify';
import { BaseStorageProvider } from '../base-provider';
import { Logger } from '../../../utils/logger';
import { StorageOperationResult, SignedUrlOptions, FolderOptions, ListOptions, DeleteOptions, UploadOptions, FileMetadata, StorageStats } from '../types';
import { GcpStorageCredentials } from '../credentials';
import { StorageAuthError, StorageNotFoundError, StorageAccessError, StorageProviderError } from '../errors';

@injectable()
export class GcpStorageProvider extends BaseStorageProvider {
  private storage?: Storage;
  private bucket?: Bucket;
  private bucketName?: string;
  
  constructor(@inject('Logger') logger: Logger) {
    super(logger, 'gcp-storage');
  }
  
  /**
   * Initialize the Google Cloud Storage provider with credentials
   * @param credentials GCP storage credentials
   */
  async initialize(credentials: GcpStorageCredentials): Promise<StorageOperationResult> {
    try {
      this.logger.info('Initializing Google Cloud Storage provider');
      
      // Create Storage client
      const storageOptions: any = {
        projectId: credentials.projectId
      };
      
      // Use key file if provided
      if (credentials.keyFilename) {
        storageOptions.keyFilename = credentials.keyFilename;
      } 
      // Or use credentials directly
      else if (credentials.credentials) {
        storageOptions.credentials = credentials.credentials;
      }
      
      this.storage = new Storage(storageOptions);
      this.bucketName = credentials.bucket;
      this.bucket = this.storage.bucket(credentials.bucket);
      
      this.credentials = credentials;
      this.initialized = true;
      
      this.logger.info('Google Cloud Storage provider initialized');
      return {
        success: true,
        message: 'Google Cloud Storage provider initialized successfully'
      };
    } catch (error: any) {
      this.logger.error('Failed to initialize Google Cloud Storage provider', { error });
      return {
        success: false,
        message: 'Failed to initialize Google Cloud Storage provider',
        error: new StorageAuthError('Google Cloud Storage', error)
      };
    }
  }
  
  /**
   * Test the connection to Google Cloud Storage
   */
  async testConnection(): Promise<StorageOperationResult> {
    try {
      this.validateInitialized();
      
      // Try to get bucket metadata to verify connection
      await this.bucket!.getMetadata();
      
      return {
        success: true,
        message: 'Connection to Google Cloud Storage successful'
      };
    } catch (error: any) {
      this.logger.error('Failed to connect to Google Cloud Storage', { error });
      return {
        success: false,
        message: 'Failed to connect to Google Cloud Storage',
        error: new StorageAuthError('Google Cloud Storage', error)
      };
    }
  }
  
  /**
   * Generate a signed URL for direct client operations
   */
  async getSignedUrl(key: string, options: SignedUrlOptions): Promise<StorageOperationResult & { url?: string }> {
    try {
      this.validateInitialized();
      
      if (!this.bucketName) {
        throw new Error('Bucket name is not defined');
      }
      
      const signedUrlOptions: any = {
        version: 'v4',
        action: options.operation === 'read' ? 'read' : 'write',
        expires: Date.now() + ((options.expiresIn || 3600) * 1000)
      };
      
      // Only include contentType if it's defined
      if (options.contentType) {
        signedUrlOptions.contentType = options.contentType;
      }
      
      const [url] = await this.storage!.bucket(this.bucketName).file(key).getSignedUrl(signedUrlOptions);
      
      return {
        success: true,
        url
      };
    } catch (error: any) {
      this.logger.error('Failed to generate signed URL', { key, error });
      return {
        success: false,
        message: 'Failed to generate signed URL',
        error: new StorageProviderError('gcp-storage', 'getSignedUrl', error)
      };
    }
  }
  
  /**
   * Create a folder in Google Cloud Storage
   * Note: GCS doesn't have a concept of folders, but we can simulate them
   */
  async createFolder(path: string, folderName: string, options?: FolderOptions): Promise<StorageOperationResult> {
    try {
      this.validateInitialized();
      
      // Generate folder key (end with slash to simulate folder)
      const folderKey = this.generateStorageKey(path, folderName) + '/';
      
      // Create empty file
      const file = this.bucket!.file(folderKey);
      await file.save('', { contentType: 'application/x-directory' });
      
      // Set metadata if provided
      if (options?.metadata) {
        await file.setMetadata({ metadata: options.metadata });
      }
      
      return {
        success: true,
        message: 'Folder created successfully',
        data: {
          key: folderKey,
          name: folderName,
          isDirectory: true
        }
      };
    } catch (error: any) {
      this.logger.error('Failed to create folder', { path, folderName, error });
      return {
        success: false,
        message: 'Failed to create folder',
        error: new StorageProviderError('Google Cloud Storage', 'createFolder', error)
      };
    }
  }
  
  /**
   * List files in a directory
   */
  async listFiles(path: string, options?: ListOptions): Promise<StorageOperationResult & { files?: FileMetadata[] }> {
    try {
      this.validateInitialized();
      
      // Normalize path for GCS (ensure it ends with slash if not empty)
      let prefix = path;
      if (prefix && !prefix.endsWith('/')) {
        prefix += '/';
      }
      
      // Set up options for listing
      const listOptions: any = {
        prefix
      };
      
      if (options?.maxResults) {
        listOptions.maxResults = options.maxResults;
      }
      
      if (options?.pageToken) {
        listOptions.pageToken = options.pageToken;
      }
      
      // If not recursive, we need to implement "directory" listing ourselves
      const delimiter = options?.recursive ? undefined : '/';
      if (delimiter) {
        listOptions.delimiter = delimiter;
      }
      
      // Get files
      const [files, apiResponse] = await this.bucket!.getFiles(listOptions);
      
      // Convert to FileMetadata format
      const result: FileMetadata[] = [];
      
      // Add files
      for (const file of files) {
        // Skip the folder marker itself
        if (file.name === prefix) continue;
        
        // Skip directories (ending with /) when listing files
        if (!options?.recursive && file.name.endsWith('/')) continue;
        
        const [metadata] = await file.getMetadata();
        
        const fileMetadata: FileMetadata = {
          key: file.name,
          name: file.name.split('/').pop() || '',
          size: Number(metadata.size || 0), // Convert to number if it's a string
          lastModified: new Date(metadata.updated || Date.now()),
          contentType: metadata.contentType || undefined,
          etag: metadata.etag || undefined,
          metadata: this.convertMetadata(metadata.metadata),
          isDirectory: file.name.endsWith('/')
        };
        
        result.push(fileMetadata);
      }
      
      // Add "directories" (prefixes)
      if (apiResponse && ('prefixes' in apiResponse) && apiResponse.prefixes) {
        for (const dirPrefix of apiResponse.prefixes as string[]) {
          const name = dirPrefix.split('/').slice(-2)[0] || '';
          
          result.push({
            key: dirPrefix,
            name,
            size: 0,
            lastModified: new Date(),
            isDirectory: true
          });
        }
      }
      
      // Extract nextPageToken if available
      const nextPageToken = apiResponse && ('nextPageToken' in apiResponse) ? 
        (apiResponse.nextPageToken as string) : undefined;
      
      return {
        success: true,
        files: result,
        data: {
          nextPageToken
        }
      };
    } catch (error: any) {
      this.logger.error('Failed to list files', { path, error });
      return {
        success: false,
        message: 'Failed to list files',
        error: new StorageProviderError('Google Cloud Storage', 'listFiles', error)
      };
    }
  }
  
  /**
   * Get metadata for a file
   */
  async getFileMetadata(key: string): Promise<StorageOperationResult & { metadata?: FileMetadata }> {
    try {
      this.validateInitialized();
      
      const file = this.bucket!.file(key);
      
      try {
        // Get file metadata
        const [metadata] = await file.getMetadata();
        
        const result: FileMetadata = {
          key,
          name: key.split('/').pop() || '',
          size: Number(metadata.size || 0), // Convert to number if it's a string
          lastModified: new Date(metadata.updated || Date.now()),
          contentType: metadata.contentType || undefined,
          etag: metadata.etag || undefined,
          metadata: this.convertMetadata(metadata.metadata),
          isDirectory: key.endsWith('/')
        };
        
        return {
          success: true,
          metadata: result
        };
      } catch (error: any) {
        // Check for not found error
        if (error.code === 404) {
          throw new StorageNotFoundError(key, error);
        }
        throw error;
      }
    } catch (error: any) {
      this.logger.error('Failed to get file metadata', { key, error });
      
      if (error instanceof StorageNotFoundError) {
        return {
          success: false,
          message: error.message,
          error
        };
      }
      
      return {
        success: false,
        message: 'Failed to get file metadata',
        error: new StorageProviderError('Google Cloud Storage', 'getFileMetadata', error)
      };
    }
  }
  
  /**
   * Delete a file or folder
   */
  async deleteFile(key: string, options?: DeleteOptions): Promise<StorageOperationResult> {
    try {
      this.validateInitialized();
      
      const file = this.bucket!.file(key);
      
      // Check if it's a folder and recursive option is set
      if (key.endsWith('/') && options?.recursive) {
        // List all files with this prefix
        const [files] = await this.bucket!.getFiles({ prefix: key });
        
        // Delete all files
        for (const file of files) {
          await file.delete();
        }
        
        return {
          success: true,
          message: 'Folder and contents deleted successfully'
        };
      } else {
        // Delete single file
        await file.delete();
        
        return {
          success: true,
          message: key.endsWith('/') ? 'Folder deleted successfully' : 'File deleted successfully'
        };
      }
    } catch (error: any) {
      this.logger.error('Failed to delete file', { key, error });
      
      // Check for not found error
      if (error.code === 404) {
        return {
          success: false,
          message: `File not found: ${key}`,
          error: new StorageNotFoundError(key)
        };
      }
      
      return {
        success: false,
        message: 'Failed to delete file',
        error: new StorageProviderError('Google Cloud Storage', 'deleteFile', error)
      };
    }
  }
  
  /**
   * Check if a file exists
   */
  async fileExists(key: string): Promise<StorageOperationResult & { exists?: boolean }> {
    try {
      this.validateInitialized();
      
      const file = this.bucket!.file(key);
      const [exists] = await file.exists();
      
      return {
        success: true,
        exists
      };
    } catch (error: any) {
      this.logger.error('Failed to check if file exists', { key, error });
      return {
        success: false,
        message: 'Failed to check if file exists',
        error: new StorageProviderError('Google Cloud Storage', 'fileExists', error)
      };
    }
  }
  
  /**
   * Create a multipart upload session for large files
   * Note: GCS uses a different approach with resumable uploads
   */
  async createMultipartUpload(key: string, options?: UploadOptions): Promise<StorageOperationResult & { uploadId?: string }> {
    try {
      this.validateInitialized();
      
      const file = this.bucket!.file(key);
      
      // Create a resumable upload URI
      // Using a simplified approach since GCS API doesn't match our interface perfectly
      const [url] = await file.createResumableUpload({
        // Add any supported options here
        metadata: {
          contentType: options?.contentType || this.determineContentType(key),
          metadata: options?.metadata || undefined
        }
      });
      
      // Use the URL as the upload ID
      return {
        success: true,
        uploadId: url,
        message: 'Resumable upload URL created'
      };
    } catch (error: any) {
      this.logger.error('Failed to create multipart upload', { key, error });
      return {
        success: false,
        message: 'Failed to create multipart upload',
        error: new StorageProviderError('Google Cloud Storage', 'createMultipartUpload', error)
      };
    }
  }
  
  /**
   * GCS doesn't support separate part uploads in the same way as S3
   */
  async getSignedUrlForPart(key: string, uploadId: string, partNumber: number, contentLength: number): Promise<StorageOperationResult & { url?: string }> {
    // For GCS, the uploadId is already a resumable upload URL
    return {
      success: true,
      url: uploadId,
      message: 'Using resumable upload URL'
    };
  }
  
  /**
   * Complete a multipart upload
   */
  async completeMultipartUpload(key: string, uploadId: string, parts: any[]): Promise<StorageOperationResult> {
    // For GCS, the upload is completed when the last part is uploaded
    // No explicit completion step is needed
    return {
      success: true,
      message: 'Upload completed with final part'
    };
  }
  
  /**
   * Abort a multipart upload
   */
  async abortMultipartUpload(key: string, uploadId: string): Promise<StorageOperationResult> {
    try {
      this.validateInitialized();
      
      // Delete the file if it exists
      const file = this.bucket!.file(key);
      const [exists] = await file.exists();
      
      if (exists) {
        await file.delete();
      }
      
      return {
        success: true,
        message: 'Upload aborted'
      };
    } catch (error: any) {
      this.logger.error('Failed to abort upload', { key, error });
      return {
        success: false,
        message: 'Failed to abort upload',
        error: new StorageProviderError('Google Cloud Storage', 'abortMultipartUpload', error)
      };
    }
  }
  
  /**
   * Get storage usage statistics
   */
  async getStorageStats(): Promise<StorageOperationResult & { stats?: StorageStats }> {
    try {
      this.validateInitialized();
      
      // Initialize counters
      let totalSize = 0;
      let fileCount = 0;
      
      // Get all files
      const [files] = await this.bucket!.getFiles();
      
      // Calculate total size and count
      for (const file of files) {
        const [metadata] = await file.getMetadata();
        totalSize += Number(metadata.size || 0); // Convert to number explicitly
        fileCount++;
      }
      
      const stats: StorageStats = {
        totalBytes: 0, // We don't know the total capacity
        usedBytes: totalSize,
        availableBytes: 0, // Unknown
        fileCount,
        lastUpdated: new Date(),
        usageByType: {}, // We would need to scan all objects to calculate this
        costEstimate: (totalSize / (1024 * 1024 * 1024)) * 0.02 // GCP Cloud Storage standard cost ($0.02 per GB)
      };
      
      return {
        success: true,
        stats,
        message: 'Storage statistics retrieved successfully'
      };
    } catch (error: any) {
      this.logger.error('Failed to get storage statistics', { error });
      return {
        success: false,
        message: 'Failed to get storage statistics',
        error: new StorageProviderError('Google Cloud Storage', 'getStorageStats', error)
      };
    }
  }
  
  /**
   * Get provider capabilities
   */
  getCapabilities() {
    return {
      ...super.getCapabilities(),
      supportsMultipartUpload: false, // GCS uses resumable uploads instead
      supportsRangeRequests: true,
      supportsServerSideEncryption: true,
      supportsVersioning: true,
      supportsFolderCreation: true, // Via virtual folders
      supportsTags: false,
      supportsMetadata: true,
      maximumFileSize: 5 * 1024 * 1024 * 1024 * 1024, // 5TB
      maximumPartSize: 0, // Not applicable
      minimumPartSize: 0, // Not applicable
      maximumPartCount: 0 // Not applicable
    };
  }
  
  /**
   * Helper method to convert metadata to the expected format
   */
  private convertMetadata(metadata: Record<string, any> | undefined): Record<string, string> | undefined {
    if (!metadata) return undefined;
    
    const result: Record<string, string> = {};
    
    for (const [key, value] of Object.entries(metadata)) {
      if (value === null) continue;
      result[key] = String(value); // Convert any type to string
    }
    
    return result;
  }
  
  /**
   * Get file content with optional range support
   */
  async getFileContent(key: string, range?: { start: number; end: number }): Promise<StorageOperationResult & { data?: Buffer }> {
    try {
      this.validateInitialized();
      
      const file = this.bucket!.file(key);
      
      try {
        // Set up options for file download
        const options: any = {};
        
        // If range is specified, add it to options
        if (range) {
          options.start = range.start;
          options.end = range.end;
        }
        
        // Download the file content
        const [fileContent] = await file.download(options);
        
        // Return the buffer
        return {
          success: true,
          data: Buffer.from(fileContent)
        };
      } catch (error: any) {
        // Check if the error is because the file doesn't exist
        if (error.code === 404) {
          throw new StorageNotFoundError('Google Cloud Storage', key);
        }
        throw error;
      }
    } catch (error: any) {
      this.logger.error('Failed to get file content', { key, range, error });
      
      if (error instanceof StorageNotFoundError) {
        throw error;
      }
      
      throw new StorageProviderError('Google Cloud Storage', 'getFileContent', error);
    }
  }
}