// Complete implementation of src/services/storage/providers/s3-compatible-provider.ts

import { S3Client, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, DeleteObjectCommand, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { injectable, inject } from 'inversify';
import { BaseStorageProvider } from '../base-provider';
import { Logger } from '../../../utils/logger';
import { StorageOperationResult, SignedUrlOptions, FolderOptions, ListOptions, DeleteOptions, UploadOptions, FileMetadata, StorageStats } from '../types';
import { S3CompatibleCredentials } from '../credentials';
import { StorageAuthError, StorageNotFoundError, StorageAccessError, StorageProviderError } from '../errors';

@injectable()
export class S3CompatibleStorageProvider extends BaseStorageProvider {
  private s3Client?: S3Client;
  private bucketName?: string;
  private endpointUrl?: string;
  
  constructor(@inject('Logger') logger: Logger) {
    super(logger, 's3-compatible');
  }
  
  /**
   * Initialize the S3-compatible storage provider with credentials
   * @param credentials S3-compatible storage credentials
   */
  async initialize(credentials: S3CompatibleCredentials): Promise<StorageOperationResult> {
    try {
      this.logger.info('Initializing S3-compatible storage provider');
      
      this.endpointUrl = credentials.endpoint;
      
      this.s3Client = new S3Client({
        endpoint: credentials.endpoint,
        region: credentials.region || 'us-east-1', // Default region if not specified
        credentials: {
          accessKeyId: credentials.accessKeyId,
          secretAccessKey: credentials.secretAccessKey
        },
        forcePathStyle: credentials.forcePathStyle !== false // Default to true for most S3-compatible services
      });
      
      this.bucketName = credentials.bucket;
      this.credentials = credentials;
      this.initialized = true;
      
      this.logger.info('S3-compatible storage provider initialized');
      return {
        success: true,
        message: 'S3-compatible storage provider initialized successfully'
      };
    } catch (error: any) {
      this.logger.error('Failed to initialize S3-compatible storage provider', { error });
      return {
        success: false,
        message: 'Failed to initialize S3-compatible storage provider',
        error: new StorageAuthError('S3-compatible', error)
      };
    }
  }
  
  /**
   * Test the connection to the S3-compatible storage
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
        message: 'Connection to S3-compatible storage successful'
      };
    } catch (error: any) {
      this.logger.error('Failed to connect to S3-compatible storage', { error });
      return {
        success: false,
        message: 'Failed to connect to S3-compatible storage',
        error: new StorageAuthError('S3-compatible', error)
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
            ContentDisposition: options.contentDisposition,
            Metadata: options.metadata
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
        error: new StorageProviderError('S3-compatible', 'getSignedUrl', error)
      };
    }
  }
  
  /**
   * Create a folder in S3-compatible storage
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
        error: new StorageProviderError('S3-compatible', 'createFolder', error)
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
              lastModified: new Date()
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
            lastModified: item.LastModified,
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
        error: new StorageProviderError('S3-compatible', 'listFiles', error)
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
          lastModified: response.LastModified,
          contentType: response.ContentType,
          etag: response.ETag?.replace(/"/g, ''),
          metadata: response.Metadata,
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
        error: new StorageProviderError('S3-compatible', 'getFileMetadata', error)
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
        error: new StorageProviderError('S3-compatible', 'deleteFile', error)
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
        error: new StorageProviderError('S3-compatible', 'fileExists', error)
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
        error: new StorageProviderError('S3-compatible', 'createMultipartUpload', error)
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
        error: new StorageProviderError('S3-compatible', 'getSignedUrlForPart', error)
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
        error: new StorageProviderError('S3-compatible', 'completeMultipartUpload', error)
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
        error: new StorageProviderError('S3-compatible', 'abortMultipartUpload', error)
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
      
      // List objects
      const command = new ListObjectsV2Command({
        Bucket: this.bucketName
      });
      
      const response = await this.s3Client!.send(command);
      
      // Calculate total size and count
      if (response.Contents) {
        for (const item of response.Contents) {
          totalSize += item.Size || 0;
          fileCount++;
        }
      }
      
      // Note: This approach is limited and will only work for buckets with relatively few objects
      
      const stats: StorageStats = {
        totalBytes: 0, // Unknown total capacity
        usedBytes: totalSize,
        availableBytes: 0, // Unknown
        fileCount,
        lastUpdated: new Date()
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
        error: new StorageProviderError('S3-compatible', 'getStorageStats', error)
      };
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
      supportsServerSideEncryption: false, // Varies by provider
      supportsVersioning: false, // Varies by provider
      supportsFolderCreation: true,
      supportsTags: false, // Varies by provider
      supportsMetadata: true,
      maximumFileSize: 5 * 1024 * 1024 * 1024, // 5GB
      maximumPartSize: 5 * 1024 * 1024 * 1024, // 5GB
      minimumPartSize: 5 * 1024 * 1024, // 5MB
      maximumPartCount: 10000
    };
  }
}