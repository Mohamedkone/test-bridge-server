import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command, HeadObjectCommand, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { injectable, inject } from 'inversify';
import { BaseStorageProvider } from '../base-provider';
import { Logger } from '../../../utils/logger';
import { StorageOperationResult, SignedUrlOptions, FolderOptions, ListOptions, DeleteOptions, UploadOptions, FileMetadata, StorageStats } from '../types';
import { AwsS3Credentials } from '../credentials';
import { StorageAuthError, StorageNotFoundError, StorageAccessError, StorageProviderError } from '../errors';

@injectable()
export class S3StorageProvider extends BaseStorageProvider {
  private s3Client?: S3Client;
  private bucket: string;
  
  constructor(@inject('Logger') logger: Logger) {
    super(logger, 's3');
    this.bucket = '';
  }

  async initialize(credentials: AwsS3Credentials): Promise<StorageOperationResult> {
    try {
      this.bucket = credentials.bucket;
      
      this.s3Client = new S3Client({
        region: credentials.region,
        endpoint: credentials.endpoint,
        credentials: {
          accessKeyId: credentials.accessKeyId,
          secretAccessKey: credentials.secretAccessKey
        },
        forcePathStyle: true // Required for S3-compatible services
      });

      // Test the connection
      await this.s3Client.send(new ListObjectsV2Command({
        Bucket: this.bucket,
        MaxKeys: 1
      }));

      this.initialized = true;
      return { success: true };
    } catch (error: any) {
      this.logger.error('Failed to initialize S3 provider', { error });
      throw new StorageAuthError('s3', error);
    }
  }

  async testConnection(): Promise<StorageOperationResult> {
    try {
      this.validateInitialized();
      await this.s3Client!.send(new ListObjectsV2Command({
        Bucket: this.bucket,
        MaxKeys: 1
      }));
      return { success: true };
    } catch (error: any) {
      this.logger.error('Failed to test S3 connection', { error });
      return { success: false, message: error.message };
    }
  }

  async getSignedUrl(key: string, options: SignedUrlOptions): Promise<StorageOperationResult & { url?: string }> {
    try {
      this.validateInitialized();
      
      const command = options.operation === 'read' 
        ? new GetObjectCommand({ Bucket: this.bucket, Key: key })
        : new PutObjectCommand({ Bucket: this.bucket, Key: key });

      const url = await getSignedUrl(this.s3Client!, command, {
        expiresIn: options.expiresIn || 3600
      });

      return {
        success: true,
        url
      };
    } catch (error: any) {
      this.logger.error('Failed to get signed URL', { key, error });
      throw new StorageProviderError('s3', 'getSignedUrl', error);
    }
  }

  async createFolder(path: string, folderName: string, options?: FolderOptions): Promise<StorageOperationResult> {
    try {
      this.validateInitialized();
      
      const folderKey = `${path}/${folderName}/`.replace(/^\/+/, '');
      
      await this.s3Client!.send(new PutObjectCommand({
        Bucket: this.bucket,
        Key: folderKey,
        Body: ''
      }));

      return {
        success: true,
        message: 'Folder created successfully',
        data: {
          key: folderKey,
          name: folderName,
          type: 'folder'
        }
      };
    } catch (error: any) {
      this.logger.error('Failed to create folder', { path, folderName, error });
      throw new StorageProviderError('s3', 'createFolder', error);
    }
  }

  async listFiles(path: string, options?: ListOptions): Promise<StorageOperationResult & { files?: FileMetadata[] }> {
    try {
      this.validateInitialized();
      
      const prefix = path ? `${path}/` : '';
      
      const response = await this.s3Client!.send(new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
        Delimiter: options?.recursive ? undefined : '/',
        MaxKeys: options?.maxResults || 1000
      }));

      const files: FileMetadata[] = [];

      // Add folders (common prefixes)
      if (response.CommonPrefixes) {
        files.push(...response.CommonPrefixes.map(prefix => {
          // Extract the folder name from the prefix path
          const prefixPath = prefix.Prefix || '';
          const folderName = prefixPath.split('/').filter(p => p).pop() || '';
          
          return {
            key: prefixPath,
            name: folderName,
            size: 0,
            lastModified: new Date(),
            contentType: 'folder',
            isDirectory: true,
            metadata: {}
          };
        }));
      }

      // Add files
      if (response.Contents) {
        files.push(...response.Contents
          .filter(item => item.Key !== prefix) // Skip the prefix itself
          .map(item => ({
            key: item.Key!,
            name: item.Key!.slice(prefix.length),
            size: item.Size || 0,
            lastModified: item.LastModified || new Date(),
            contentType: this.determineContentType(item.Key!),
            isDirectory: false,
            metadata: {
              etag: item.ETag,
              storageClass: item.StorageClass
            }
          })));
      }

      return {
        success: true,
        files,
        data: {
          hasMore: response.IsTruncated,
          nextContinuationToken: response.NextContinuationToken
        }
      };
    } catch (error: any) {
      this.logger.error('Failed to list files', { path, error });
      throw new StorageProviderError('s3', 'listFiles', error);
    }
  }

  async getFileMetadata(key: string): Promise<StorageOperationResult & { metadata?: FileMetadata }> {
    try {
      this.validateInitialized();
      
      const response = await this.s3Client!.send(new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key
      }));

      return {
        success: true,
        metadata: {
          key,
          name: key.split('/').pop() || key,
          size: response.ContentLength || 0,
          lastModified: response.LastModified || new Date(),
          contentType: response.ContentType || this.determineContentType(key),
          isDirectory: false,
          metadata: {
            etag: response.ETag,
            storageClass: response.StorageClass
          }
        }
      };
    } catch (error: any) {
      if (error.name === 'NotFound') {
        throw new StorageNotFoundError(key);
      }
      this.logger.error('Failed to get file metadata', { key, error });
      throw new StorageProviderError('s3', 'getFileMetadata', error);
    }
  }

  async deleteFile(key: string, options?: DeleteOptions): Promise<StorageOperationResult> {
    try {
      this.validateInitialized();
      
      await this.s3Client!.send(new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key
      }));

      return {
        success: true,
        message: 'File deleted successfully'
      };
    } catch (error: any) {
      this.logger.error('Failed to delete file', { key, error });
      throw new StorageProviderError('s3', 'deleteFile', error);
    }
  }

  async fileExists(key: string): Promise<StorageOperationResult & { exists?: boolean }> {
    try {
      this.validateInitialized();
      
      await this.s3Client!.send(new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key
      }));

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
      throw new StorageProviderError('s3', 'fileExists', error);
    }
  }

  async createMultipartUpload(key: string, options?: UploadOptions): Promise<StorageOperationResult & { uploadId?: string }> {
    try {
      this.validateInitialized();
      
      const response = await this.s3Client!.send(new CreateMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: options?.contentType
      }));

      return {
        success: true,
        uploadId: response.UploadId
      };
    } catch (error: any) {
      this.logger.error('Failed to create multipart upload', { key, error });
      throw new StorageProviderError('s3', 'createMultipartUpload', error);
    }
  }

  async getSignedUrlForPart(key: string, uploadId: string, partNumber: number, contentLength: number): Promise<StorageOperationResult & { url?: string }> {
    try {
      this.validateInitialized();
      
      const command = new UploadPartCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
        ContentLength: contentLength
      });

      const url = await getSignedUrl(this.s3Client!, command, {
        expiresIn: 3600
      });

      return {
        success: true,
        url
      };
    } catch (error: any) {
      this.logger.error('Failed to get signed URL for part', { key, uploadId, partNumber, error });
      throw new StorageProviderError('s3', 'getSignedUrlForPart', error);
    }
  }

  async completeMultipartUpload(key: string, uploadId: string, parts: any[]): Promise<StorageOperationResult> {
    try {
      this.validateInitialized();
      
      await this.s3Client!.send(new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: parts.map((part, index) => ({
            ETag: part.etag,
            PartNumber: index + 1
          }))
        }
      }));

      return {
        success: true,
        message: 'Multipart upload completed successfully'
      };
    } catch (error: any) {
      this.logger.error('Failed to complete multipart upload', { key, uploadId, error });
      throw new StorageProviderError('s3', 'completeMultipartUpload', error);
    }
  }

  async abortMultipartUpload(key: string, uploadId: string): Promise<StorageOperationResult> {
    try {
      this.validateInitialized();
      
      await this.s3Client!.send(new AbortMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId
      }));

      return {
        success: true,
        message: 'Multipart upload aborted successfully'
      };
    } catch (error: any) {
      this.logger.error('Failed to abort multipart upload', { key, uploadId, error });
      throw new StorageProviderError('s3', 'abortMultipartUpload', error);
    }
  }

  async getStorageStats(): Promise<StorageOperationResult & { stats?: StorageStats }> {
    try {
      this.validateInitialized();
      
      // Get bucket size and object count
      let totalSize = 0;
      let fileCount = 0;
      let continuationToken: string | undefined;

      do {
        const response = await this.s3Client!.send(new ListObjectsV2Command({
          Bucket: this.bucket,
          ContinuationToken: continuationToken
        }));

        if (response.Contents) {
          totalSize += response.Contents.reduce((sum, item) => sum + (item.Size || 0), 0);
          fileCount += response.Contents.length;
        }

        continuationToken = response.NextContinuationToken;
      } while (continuationToken);

      return {
        success: true,
        stats: {
          totalBytes: 0, // S3 doesn't provide total bucket size
          usedBytes: totalSize,
          availableBytes: 0, // S3 doesn't provide available space
          fileCount,
          lastUpdated: new Date(),
          usageByType: {
            'file': totalSize
          },
          costEstimate: 0 // Cost depends on storage class and region
        }
      };
    } catch (error: any) {
      this.logger.error('Failed to get storage stats', { error });
      throw new StorageProviderError('s3', 'getStorageStats', error);
    }
  }

  protected determineContentType(key: string): string {
    const ext = key.split('.').pop()?.toLowerCase();
    const contentTypes: Record<string, string> = {
      'txt': 'text/plain',
      'html': 'text/html',
      'css': 'text/css',
      'js': 'application/javascript',
      'json': 'application/json',
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'gif': 'image/gif',
      'svg': 'image/svg+xml',
      'pdf': 'application/pdf',
      'zip': 'application/zip',
      'doc': 'application/msword',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'xls': 'application/vnd.ms-excel',
      'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'ppt': 'application/vnd.ms-powerpoint',
      'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    };
    return contentTypes[ext || ''] || 'application/octet-stream';
  }

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
      maximumFileSize: 5 * 1024 * 1024 * 1024, // 5GB
      maximumPartSize: 5 * 1024 * 1024 * 1024, // 5GB
      minimumPartSize: 5 * 1024 * 1024, // 5MB
      maximumPartCount: 10000
    };
  }

  /**
   * Get file content with optional range support
   */
  async getFileContent(key: string, range?: { start: number; end: number }): Promise<StorageOperationResult & { data?: Buffer }> {
    try {
      this.validateInitialized();
      
      // Build command options
      const commandOptions: any = {
        Bucket: this.bucket,
        Key: key
      };
      
      // Add range if specified
      if (range) {
        commandOptions.Range = `bytes=${range.start}-${range.end}`;
      }
      
      const command = new GetObjectCommand(commandOptions);
      const response = await this.s3Client!.send(command);
      
      // Convert stream to buffer
      const chunks: Uint8Array[] = [];
      if (response.Body) {
        for await (const chunk of response.Body as any) {
          chunks.push(chunk);
        }
      } else {
        throw new Error('Empty response body');
      }
      
      const buffer = Buffer.concat(chunks);
      
      return {
        success: true,
        data: buffer
      };
    } catch (error: any) {
      this.logger.error('Error getting file content', { key, range, error });
      
      return {
        success: false,
        message: `Failed to get file content: ${error.message}`
      };
    }
  }
} 