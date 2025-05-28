// src/services/storage/providers/wasabi-provider.ts
import { S3Client, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, DeleteObjectCommand, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { injectable, inject } from 'inversify';
import { BaseStorageProvider } from '../base-provider';
import { Logger } from '../../../utils/logger';
import { StorageOperationResult, SignedUrlOptions, FolderOptions, ListOptions, DeleteOptions, UploadOptions, FileMetadata, StorageStats } from '../types';
import { WasabiCredentials } from '../credentials';
import { StorageAuthError, StorageNotFoundError, StorageAccessError, StorageProviderError } from '../errors';

@injectable()
export class WasabiStorageProvider extends BaseStorageProvider {
  private s3Client?: S3Client;
  private bucketName?: string;
  
  constructor(@inject('Logger') logger: Logger) {
    super(logger, 'vault');
  }
  
  /**
   * Initialize the Wasabi storage provider with credentials
   * @param credentials Wasabi credentials
   */
  async initialize(credentials: WasabiCredentials): Promise<StorageOperationResult> {
    try {
      this.logger.info('Initializing Wasabi storage provider');
      
      this.s3Client = new S3Client({
        region: credentials.region,
        endpoint: credentials.endpoint,
        credentials: {
          accessKeyId: credentials.accessKeyId,
          secretAccessKey: credentials.secretAccessKey
        },
        forcePathStyle: true // Required for Wasabi
      });
      
      this.bucketName = credentials.bucket;
      this.credentials = credentials;
      this.initialized = true;
      
      this.logger.info('Wasabi storage provider initialized');
      return {
        success: true,
        message: 'Wasabi storage provider initialized successfully'
      };
    } catch (error: any) {
      this.logger.error('Failed to initialize Wasabi storage provider', { error });
      return {
        success: false,
        message: 'Failed to initialize Wasabi storage provider',
        error: new StorageAuthError('Wasabi', error)
      };
    }
  }
  
  /**
   * Test the connection to Wasabi
   */
  async testConnection(): Promise<StorageOperationResult> {
    try {
      this.validateInitialized();
      
      // Try to list objects with max 1 result to verify connection
      const command = new ListObjectsV2Command({
        Bucket: this.bucketName,
        MaxKeys: 1
      });
      
      await this.s3Client!.send(command);
      
      return {
        success: true,
        message: 'Connection to Wasabi storage successful'
      };
    } catch (error: any) {
      this.logger.error('Failed to connect to Wasabi storage', { error });
      return {
        success: false,
        message: 'Failed to connect to Wasabi storage',
        error: new StorageAuthError('Wasabi', error)
      };
    }
  }
  
  /**
   * Generate a signed URL for direct client operations
   */
  async getSignedUrl(key: string, options: SignedUrlOptions): Promise<StorageOperationResult & { url?: string }> {
    try {
      this.validateInitialized();
      
      let command;
      
      switch (options.operation) {
        case 'read':
          command = new GetObjectCommand({
            Bucket: this.bucketName,
            Key: key
          });
          break;
        case 'write':
          command = new PutObjectCommand({
            Bucket: this.bucketName,
            Key: key,
            ContentType: options.contentType || 'application/octet-stream',
            ContentDisposition: options.responseContentDisposition,
            Metadata: options.acl?.public ? { public: 'true' } : undefined
          });
          break;
        case 'delete':
          command = new DeleteObjectCommand({
            Bucket: this.bucketName,
            Key: key
          });
          break;
        default:
          throw new Error(`Unsupported operation: ${options.operation}`);
      }
      
      const url = await getSignedUrl(this.s3Client!, command, {
        expiresIn: options.expiresIn
      });
      
      return {
        success: true,
        url
      };
    } catch (error: any) {
      this.logger.error('Failed to generate signed URL', { key, operation: options.operation, error });
      return {
        success: false,
        message: `Failed to generate signed URL for ${options.operation} operation`,
        error: new StorageProviderError('Wasabi', 'getSignedUrl', error)
      };
    }
  }
  
  /**
   * Create a folder in Wasabi storage
   */
  async createFolder(path: string, folderName: string, options?: FolderOptions): Promise<StorageOperationResult> {
    try {
      this.validateInitialized();
      
      // Generate folder key (S3 uses empty objects with trailing slash as folders)
      const folderKey = this.generateStorageKey(path, folderName) + '/';
      
      // Create empty object with trailing slash to represent folder
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: folderKey,
        ContentLength: 0,
        Metadata: options?.metadata
      });
      
      await this.s3Client!.send(command);
      
      this.logger.debug('Created folder', { path, folderName, folderKey });
      
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
        error: new StorageProviderError('Wasabi', 'createFolder', error)
      };
    }
  }
  
  /**
   * List files in a directory
   */
  async listFiles(path: string, options?: ListOptions): Promise<StorageOperationResult & { files?: FileMetadata[] }> {
    try {
      this.validateInitialized();
      
      // Normalize path for S3 (ensure it ends with slash if not empty)
      let prefix = path;
      if (prefix && !prefix.endsWith('/')) {
        prefix += '/';
      }
      
      // Remove leading slash if present
      prefix = prefix.replace(/^\//, '');
      
      const command = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: prefix,
        Delimiter: options?.recursive ? undefined : '/',
        MaxKeys: options?.maxResults || 1000,
        ContinuationToken: options?.pageToken
      });
      
      const response = await this.s3Client!.send(command);
      
      // Process the results
      const files: FileMetadata[] = [];
      
      // Process folder (CommonPrefixes)
      if (response.CommonPrefixes) {
        for (const prefix of response.CommonPrefixes) {
          if (prefix.Prefix) {
            const folderName = prefix.Prefix.split('/').slice(-2)[0] || '';
            files.push({
              key: prefix.Prefix,
              name: folderName,
              size: 0,
              isDirectory: true,
              lastModified: new Date(),
              contentType: 'application/x-directory',
              metadata: {}
            });
          }
        }
      }
      
      // Process files (Contents)
      if (response.Contents) {
        for (const item of response.Contents) {
          // Skip the "folder" placeholder itself
          if (item.Key === prefix) continue;
          
          // Skip items that represent folders (end with /)
          if (item.Key!.endsWith('/')) continue;
          
          const fileName = item.Key!.split('/').pop() || '';
          files.push({
            key: item.Key!,
            name: fileName,
            size: item.Size || 0,
            lastModified: item.LastModified || new Date(),
            etag: item.ETag?.replace(/"/g, ''), // Remove quotes from ETag
            isDirectory: false
          });
        }
      }
      
      return {
        success: true,
        files,
        data: {
          continuationToken: response.NextContinuationToken
        }
      };
    } catch (error: any) {
      this.logger.error('Failed to list files', { path, error });
      return {
        success: false,
        message: 'Failed to list files',
        error: new StorageProviderError('Wasabi', 'listFiles', error)
      };
    }
  }
  
  /**
   * Get metadata for a file
   */
  async getFileMetadata(key: string): Promise<StorageOperationResult & { metadata?: FileMetadata }> {
    try {
      this.validateInitialized();
      
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key
      });
      
      try {
        const response = await this.s3Client!.send(command);
        
        const metadata: FileMetadata = {
          key,
          name: this.getFileNameFromKey(key),
          size: response.ContentLength || 0,
          lastModified: response.LastModified || new Date(),
          contentType: response.ContentType || undefined,
          etag: response.ETag?.replace(/"/g, ''),
          metadata: response.Metadata || {},
          isDirectory: key.endsWith('/')
        };
        
        return {
          success: true,
          metadata
        };
      } catch (error: any) {
        if (error.name === 'NotFound') {
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
        error: new StorageProviderError('Wasabi', 'getFileMetadata', error)
      };
    }
  }
  
  /**
   * Delete a file or folder
   */
  async deleteFile(key: string, options?: DeleteOptions): Promise<StorageOperationResult> {
    try {
      this.validateInitialized();
      
      // Check if the key is a folder (ends with /)
      const isFolder = key.endsWith('/');
      
      if (isFolder && options?.recursive) {
        // For recursive folder deletion, we need to list all objects and delete them
        const listResult = await this.listFiles(key, { recursive: true, maxResults: 1000 });
        
        if (!listResult.success) {
          throw new Error('Failed to list folder contents for deletion');
        }
        
        // If no files, just delete the folder marker
        if (!listResult.files || listResult.files.length === 0) {
          const command = new DeleteObjectCommand({
            Bucket: this.bucketName,
            Key: key
          });
          
          await this.s3Client!.send(command);
          return {
            success: true,
            message: 'Empty folder deleted successfully'
          };
        }
        
        // Delete all files in the folder
        for (const file of listResult.files) {
          const command = new DeleteObjectCommand({
            Bucket: this.bucketName,
            Key: file.key
          });
          
          await this.s3Client!.send(command);
        }
        
        // Finally delete the folder marker itself
        const command = new DeleteObjectCommand({
          Bucket: this.bucketName,
          Key: key
        });
        
        await this.s3Client!.send(command);
        
        return {
          success: true,
          message: 'Folder and contents deleted successfully'
        };
      } else {
        // Simple file or empty folder deletion
        const command = new DeleteObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          VersionId: options?.versionId
        });
        
        await this.s3Client!.send(command);
        
        return {
          success: true,
          message: `${isFolder ? 'Folder' : 'File'} deleted successfully`
        };
      }
    } catch (error: any) {
      this.logger.error('Failed to delete file', { key, error });
      return {
        success: false,
        message: 'Failed to delete file',
        error: new StorageProviderError('Wasabi', 'deleteFile', error)
      };
    }
  }
  
  /**
   * Check if a file exists
   */
  async fileExists(key: string): Promise<StorageOperationResult & { exists?: boolean }> {
    try {
      this.validateInitialized();
      
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key
      });
      
      try {
        await this.s3Client!.send(command);
        return {
          success: true,
          exists: true
        };
      } catch (error: any) {
        if (error.name === 'NotFound') {
          return {
            success: true,
            exists: false
          };
        }
        throw error;
      }
    } catch (error: any) {
      this.logger.error('Failed to check if file exists', { key, error });
      return {
        success: false,
        message: 'Failed to check if file exists',
        error: new StorageProviderError('Wasabi', 'fileExists', error)
      };
    }
  }
  
  /**
   * Create a multipart upload session for large files
   */
  async createMultipartUpload(key: string, options?: UploadOptions): Promise<StorageOperationResult & { uploadId?: string }> {
    try {
      this.validateInitialized();
      
      const command = new CreateMultipartUploadCommand({
        Bucket: this.bucketName,
        Key: key,
        ContentType: options?.contentType || this.determineContentType(key),
        ContentDisposition: options?.contentDisposition,
        Metadata: options?.metadata,
        CacheControl: options?.cacheControl
      });
      
      const response = await this.s3Client!.send(command);
      
      if (!response.UploadId) {
        throw new Error('Failed to obtain upload ID');
      }
      
      return {
        success: true,
        uploadId: response.UploadId,
        message: 'Multipart upload created successfully'
      };
    } catch (error: any) {
      this.logger.error('Failed to create multipart upload', { key, error });
      return {
        success: false,
        message: 'Failed to create multipart upload',
        error: new StorageProviderError('Wasabi', 'createMultipartUpload', error)
      };
    }
  }
  
  /**
   * Get signed URL for uploading a specific part
   */
  async getSignedUrlForPart(key: string, uploadId: string, partNumber: number, contentLength: number): Promise<StorageOperationResult & { url?: string }> {
    try {
      this.validateInitialized();
      
      const command = new UploadPartCommand({
        Bucket: this.bucketName,
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
        ContentLength: contentLength
      });
      
      const url = await getSignedUrl(this.s3Client!, command, {
        expiresIn: 3600 // 1 hour expiry for part uploads
      });
      
      return {
        success: true,
        url,
        message: `Signed URL generated for part ${partNumber}`
      };
    } catch (error: any) {
      this.logger.error('Failed to generate signed URL for part', { key, uploadId, partNumber, error });
      return {
        success: false,
        message: 'Failed to generate signed URL for part',
        error: new StorageProviderError('Wasabi', 'getSignedUrlForPart', error)
      };
    }
  }
  
  /**
   * Complete a multipart upload
   */
  async completeMultipartUpload(key: string, uploadId: string, parts: any[]): Promise<StorageOperationResult> {
    try {
      this.validateInitialized();
      
      const command = new CompleteMultipartUploadCommand({
        Bucket: this.bucketName,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: parts.map(part => ({
            PartNumber: part.PartNumber,
            ETag: part.ETag
          }))
        }
      });
      
      const response = await this.s3Client!.send(command);
      
      return {
        success: true,
        message: 'Multipart upload completed successfully',
        data: {
          location: response.Location,
          etag: response.ETag
        }
      };
    } catch (error: any) {
      this.logger.error('Failed to complete multipart upload', { key, uploadId, error });
      return {
        success: false,
        message: 'Failed to complete multipart upload',
        error: new StorageProviderError('Wasabi', 'completeMultipartUpload', error)
      };
    }
  }
  
  /**
   * Abort a multipart upload
   */
  async abortMultipartUpload(key: string, uploadId: string): Promise<StorageOperationResult> {
    try {
      this.validateInitialized();
      
      const command = new AbortMultipartUploadCommand({
        Bucket: this.bucketName,
        Key: key,
        UploadId: uploadId
      });
      
      await this.s3Client!.send(command);
      
      return {
        success: true,
        message: 'Multipart upload aborted successfully'
      };
    } catch (error: any) {
      this.logger.error('Failed to abort multipart upload', { key, uploadId, error });
      return {
        success: false,
        message: 'Failed to abort multipart upload',
        error: new StorageProviderError('Wasabi', 'abortMultipartUpload', error)
      };
    }
  }
  
  /**
   * Get storage usage statistics
   */
  async getStorageStats(): Promise<StorageOperationResult & { stats?: StorageStats }> {
    try {
      this.validateInitialized();
      
      // Wasabi doesn't have a direct way to get storage stats through the API
      // We'll implement a basic version by listing objects and calculating size
      
      const command = new ListObjectsV2Command({
        Bucket: this.bucketName
      });
      
      const response = await this.s3Client!.send(command);
      
      let totalSize = 0;
      let fileCount = 0;
      
      if (response.Contents) {
        for (const item of response.Contents) {
          totalSize += item.Size || 0;
          fileCount++;
        }
      }
      
      // Note: This approach is limited and will only work for buckets with relatively few objects
      // For production, consider using a more scalable approach or Wasabi billing API if available
      
      const stats: StorageStats = {
        totalBytes: 0, // TODO: Implement actual storage quota check
        usedBytes: totalSize,
        availableBytes: 0, // TODO: Implement actual storage quota check
        fileCount: fileCount,
        lastUpdated: new Date(),
        usageByType: {},
        costEstimate: 0 // TODO: Implement actual cost calculation
      };
      
      return {
        success: true,
        stats,
        message: 'Storage statistics calculated (limited accuracy)'
      };
    } catch (error: any) {
      this.logger.error('Failed to get storage statistics', { error });
      return {
        success: false,
        message: 'Failed to get storage statistics',
        error: new StorageProviderError('Wasabi', 'getStorageStats', error)
      };
    }
  }
  
  /**
   * Get file content with optional range support
   */
  async getFileContent(key: string, range?: { start: number; end: number }): Promise<StorageOperationResult & { data?: Buffer }> {
    try {
      this.validateInitialized();
      
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        ...(range && { Range: `bytes=${range.start}-${range.end}` })
      });
      
      try {
        const response = await this.s3Client!.send(command);
        
        // Convert the readable stream to a buffer
        const chunks: Buffer[] = [];
        
        // Use the ReadableStream from the response Body
        const stream = response.Body as any;
        
        if (!stream) {
          throw new Error('No response body received from S3');
        }
        
        // If the stream is a Node.js readable stream
        if (typeof stream.on === 'function') {
          return new Promise((resolve, reject) => {
            stream.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
            stream.on('error', (err: Error) => reject(err));
            stream.on('end', () => {
              resolve({
                success: true,
                data: Buffer.concat(chunks)
              });
            });
          });
        } 
        // If it's a Web API ReadableStream
        else if (typeof stream.getReader === 'function') {
          const reader = stream.getReader();
          const chunks: Uint8Array[] = [];
          
          let result;
          while (!(result = await reader.read()).done) {
            chunks.push(result.value);
          }
          
          return {
            success: true,
            data: Buffer.concat(chunks.map(chunk => Buffer.from(chunk)))
          };
        }
        // If it's already a buffer or byte array
        else if (stream instanceof Uint8Array || Buffer.isBuffer(stream)) {
          return {
            success: true,
            data: Buffer.from(stream)
          };
        }
        // Last fallback - try to convert to buffer directly
        else {
          this.logger.warn('Unexpected response body type, attempting conversion', { 
            type: typeof stream, 
            isBuffer: Buffer.isBuffer(stream)
          });
          
          return {
            success: true,
            data: Buffer.from(stream)
          };
        }
      } catch (error: any) {
        if (error.name === 'NoSuchKey') {
          throw new StorageNotFoundError('Wasabi', key);
        }
        throw error;
      }
    } catch (error: any) {
      this.logger.error('Failed to get file content', { key, range, error });
      
      if (error instanceof StorageNotFoundError) {
        throw error;
      }
      
      throw new StorageProviderError('Wasabi', 'getFileContent', error);
    }
  }
  
  /**
   * Get provider capabilities
   */
  getCapabilities() {
    return {
      ...super.getCapabilities(),
      supportsMultipartUpload: true,
      supportsRangeRequests: true,
      supportsServerSideEncryption: true,
      supportsVersioning: true,
      supportsFolderCreation: true,
      supportsTags: true,
      supportsMetadata: true,
      maximumFileSize: 5 * 1024 * 1024 * 1024 * 1024, // 5TB
      maximumPartSize: 5 * 1024 * 1024 * 1024, // 5GB
      minimumPartSize: 5 * 1024 * 1024, // 5MB
      maximumPartCount: 10000
    };
  }
}