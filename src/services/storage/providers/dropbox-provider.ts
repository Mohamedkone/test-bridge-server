// src/services/storage/providers/dropbox-provider.ts
import { Dropbox } from 'dropbox';
import { injectable, inject } from 'inversify';
import { BaseStorageProvider } from '../base-provider';
import { Logger } from '../../../utils/logger';
import { StorageOperationResult, SignedUrlOptions, FolderOptions, ListOptions, DeleteOptions, UploadOptions, FileMetadata, StorageStats, ProgressCallback } from '../types';
import { DropboxCredentials } from '../credentials';
import { StorageAuthError, StorageNotFoundError, StorageAccessError, StorageProviderError } from '../errors';
import { Readable } from 'stream';
import crypto from 'crypto';
import { EventEmitter } from 'events';

@injectable()
export class DropboxStorageProvider extends BaseStorageProvider {
  private dropbox?: Dropbox;
  private cursorsByPath: Map<string, string> = new Map();
  private webhookSecret?: string;
  private changeEmitter: EventEmitter = new EventEmitter();
  
  constructor(@inject('Logger') logger: Logger) {
    super(logger, 'dropbox');
  }

  async initialize(credentials: DropboxCredentials): Promise<StorageOperationResult> {
    try {
      this.dropbox = new Dropbox({
        accessToken: credentials.accessToken,
        clientId: credentials.appKey,
        clientSecret: credentials.appSecret
      });

      // Test the connection
      await this.dropbox.checkUser({});
      this.initialized = true;

      return { success: true };
    } catch (error: any) {
      this.logger.error('Failed to initialize Dropbox provider', { error });
      throw new StorageAuthError('dropbox', error);
    }
  }

  async testConnection(): Promise<StorageOperationResult> {
    try {
      this.validateInitialized();
      await this.dropbox!.checkUser({});
      return { success: true };
    } catch (error: any) {
      this.logger.error('Failed to test Dropbox connection', { error });
      return { success: false, message: error.message };
    }
  }

  async getSignedUrl(key: string, options: SignedUrlOptions): Promise<StorageOperationResult & { url?: string }> {
    try {
      this.validateInitialized();
      
      const response = await this.dropbox!.filesGetTemporaryLink({ path: key });
      
      return {
        success: true,
        url: response.result.link
      };
    } catch (error: any) {
      this.logger.error('Failed to get signed URL', { key, error });
      throw new StorageProviderError('dropbox', 'getSignedUrl', error);
    }
  }

  async createFolder(path: string, folderName: string, options?: FolderOptions): Promise<StorageOperationResult> {
    try {
      this.validateInitialized();
      
      const folderPath = `${path}/${folderName}`.replace(/^\/+/, '/');
      
      await this.dropbox!.filesCreateFolderV2({ path: folderPath });

      return {
        success: true,
        message: 'Folder created successfully',
        data: {
          key: folderPath,
          name: folderName,
          type: 'folder'
        }
      };
    } catch (error: any) {
      this.logger.error('Failed to create folder', { path, folderName, error });
      throw new StorageProviderError('dropbox', 'createFolder', error);
    }
  }

  async listFiles(path: string, options?: ListOptions): Promise<StorageOperationResult & { files?: FileMetadata[] }> {
    try {
      this.validateInitialized();
      
      const response = await this.dropbox!.filesListFolder({
        path: path || '',
        limit: options?.maxResults || 100,
        include_media_info: true,
        include_deleted: false
      });

      const files = response.result.entries.map(entry => {
        const isFile = entry['.tag'] === 'file';
        const isFolder = entry['.tag'] === 'folder';
        const isDeleted = entry['.tag'] === 'deleted';
        
        return {
          key: entry.path_display!,
          name: entry.name,
          size: isFile ? (entry as any).size || 0 : 0,
          lastModified: isFile ? new Date((entry as any).server_modified) : new Date(),
          contentType: isFile ? (entry as any).content_type || undefined : 'folder',
          isDirectory: isFolder,
          metadata: {
            id: isDeleted ? undefined : entry.id,
            pathLower: entry.path_lower,
            rev: isFile ? (entry as any).rev : undefined
          }
        };
      });

      return {
        success: true,
        files,
        data: {
          hasMore: response.result.has_more,
          cursor: response.result.cursor
        }
      };
    } catch (error: any) {
      this.logger.error('Failed to list files', { path, error });
      throw new StorageProviderError('dropbox', 'listFiles', error);
    }
  }

  async getFileMetadata(key: string): Promise<StorageOperationResult & { metadata?: FileMetadata }> {
    try {
      this.validateInitialized();
      
      const response = await this.dropbox!.filesGetMetadata({
        path: key,
        include_media_info: true
      });

      const entry = response.result;
      const isFile = entry['.tag'] === 'file';
      const isFolder = entry['.tag'] === 'folder';
      const isDeleted = entry['.tag'] === 'deleted';
      
      return {
        success: true,
        metadata: {
          key: entry.path_display!,
          name: entry.name,
          size: isFile ? (entry as any).size || 0 : 0,
          lastModified: isFile ? new Date((entry as any).server_modified) : new Date(),
          contentType: isFile ? (entry as any).content_type || undefined : 'folder',
          isDirectory: isFolder,
          metadata: {
            id: isDeleted ? undefined : entry.id,
            pathLower: entry.path_lower,
            rev: isFile ? (entry as any).rev : undefined
          }
        }
      };
    } catch (error: any) {
      this.logger.error('Failed to get file metadata', { key, error });
      throw new StorageProviderError('dropbox', 'getFileMetadata', error);
    }
  }

  async deleteFile(key: string, options?: DeleteOptions): Promise<StorageOperationResult> {
    try {
      this.validateInitialized();
      
      await this.dropbox!.filesDeleteV2({ path: key });

      return {
        success: true,
        message: 'File deleted successfully'
      };
    } catch (error: any) {
      this.logger.error('Failed to delete file', { key, error });
      throw new StorageProviderError('dropbox', 'deleteFile', error);
    }
  }

  async fileExists(key: string): Promise<StorageOperationResult & { exists?: boolean }> {
    try {
      this.validateInitialized();
      
      await this.dropbox!.filesGetMetadata({ path: key });

      return {
        success: true,
        exists: true
      };
    } catch (error: any) {
      if (error.status === 409) { // Path not found
        return {
          success: true,
          exists: false
        };
      }
      throw new StorageProviderError('dropbox', 'fileExists', error);
    }
  }

  async createMultipartUpload(key: string, options?: UploadOptions): Promise<StorageOperationResult & { uploadId?: string }> {
    try {
      this.validateInitialized();
      
      const response = await this.dropbox!.filesUploadSessionStart({
        contents: Buffer.alloc(0),
        close: false
      });

      return {
        success: true,
        uploadId: response.result.session_id
      };
    } catch (error: any) {
      this.logger.error('Failed to create multipart upload', { key, error });
      throw new StorageProviderError('dropbox', 'createMultipartUpload', error);
    }
  }

  async getSignedUrlForPart(key: string, uploadId: string, partNumber: number, contentLength: number): Promise<StorageOperationResult & { url?: string }> {
    try {
      this.validateInitialized();
      
      const response = await this.dropbox!.filesUploadSessionAppendV2({
        cursor: {
          session_id: uploadId,
          offset: (partNumber - 1) * contentLength
        },
        contents: Buffer.alloc(0),
        close: false
      });

      return {
        success: true,
        url: uploadId // Use the uploadId as the URL since Dropbox doesn't provide a direct URL
      };
    } catch (error: any) {
      this.logger.error('Failed to get signed URL for part', { key, uploadId, partNumber, error });
      throw new StorageProviderError('dropbox', 'getSignedUrlForPart', error);
    }
  }

  async completeMultipartUpload(key: string, uploadId: string, parts: any[]): Promise<StorageOperationResult> {
    try {
      this.validateInitialized();
      
      const commit = {
        path: key,
        mode: { '.tag': 'overwrite' } as any,
        autorename: false,
        mute: false
      };

      await this.dropbox!.filesUploadSessionFinish({
        cursor: {
          session_id: uploadId,
          offset: parts.reduce((sum, part) => sum + part.size, 0)
        },
        commit
      });

      return {
        success: true,
        message: 'Multipart upload completed successfully'
      };
    } catch (error: any) {
      this.logger.error('Failed to complete multipart upload', { key, uploadId, error });
      throw new StorageProviderError('dropbox', 'completeMultipartUpload', error);
    }
  }

  async abortMultipartUpload(key: string, uploadId: string): Promise<StorageOperationResult> {
    try {
      this.validateInitialized();
      
      // Dropbox doesn't have a direct abort method, so we'll just close the session
      await this.dropbox!.filesUploadSessionFinish({
        cursor: {
          session_id: uploadId,
          offset: 0
        },
        commit: {
          path: key,
          mode: { '.tag': 'overwrite' } as any,
          autorename: false,
          mute: false
        }
      });

      return {
        success: true,
        message: 'Multipart upload aborted successfully'
      };
    } catch (error: any) {
      this.logger.error('Failed to abort multipart upload', { key, uploadId, error });
      throw new StorageProviderError('dropbox', 'abortMultipartUpload', error);
    }
  }

  async getStorageStats(): Promise<StorageOperationResult & { stats?: StorageStats }> {
    try {
      this.validateInitialized();
      
      const response = await this.dropbox!.usersGetSpaceUsage();
      const usage = response.result;
      
      // Calculate total space based on allocation type
      let totalBytes = 0;
      if (usage.allocation['.tag'] === 'individual') {
        totalBytes = usage.allocation.allocated;
      } else if (usage.allocation['.tag'] === 'team') {
        totalBytes = usage.allocation.allocated;
      }
      
      const usedBytes = usage.used;
      const availableBytes = totalBytes - usedBytes;
      
      return {
        success: true,
        stats: {
          totalBytes,
          usedBytes,
          availableBytes,
          fileCount: 0, // Dropbox API doesn't provide this directly
          lastUpdated: new Date(),
          usageByType: {
            'folder': 0,
            'document': 0,
            'image': 0,
            'video': 0,
            'audio': 0,
            'other': usedBytes
          },
          costEstimate: 0 // Dropbox has a free tier with 2GB storage
        }
      };
    } catch (error: any) {
      this.logger.error('Failed to get storage stats', { error });
      throw new StorageProviderError('dropbox', 'getStorageStats', error);
    }
  }

  async getFileContent(key: string, range?: { start: number; end: number }): Promise<StorageOperationResult & { data?: Buffer }> {
    try {
      this.validateInitialized();
      
      let fileData;
      
      if (range) {
        // For range requests, need to handle this differently
        // First download the file and then slice the buffer
        fileData = await this.dropbox!.filesDownload({
          path: key
        });
        
        // Extract file content
        const fileContent = (fileData.result as any).fileBinary;
        
        // Convert to Buffer if not already
        const fullBuffer = Buffer.isBuffer(fileContent) 
          ? fileContent 
          : Buffer.from(fileContent);
        
        // Slice the buffer according to the range
        const rangeBuffer = fullBuffer.slice(range.start, range.end + 1);
        
        return {
          success: true,
          data: rangeBuffer
        };
      } else {
        // Download full file
        fileData = await this.dropbox!.filesDownload({
          path: key
        });
        
        // Extract file content
        const fileContent = (fileData.result as any).fileBinary;
        
        // Convert to Buffer if not already
        const buffer = Buffer.isBuffer(fileContent) 
          ? fileContent 
          : Buffer.from(fileContent);
        
        return {
          success: true,
          data: buffer
        };
      }
    } catch (error: any) {
      this.logger.error('Failed to get file content', { key, range, error });
      
      if (error.status === 409 && error.error && error.error['.tag'] === 'path' && error.error.path['.tag'] === 'not_found') {
        throw new StorageNotFoundError('dropbox', key);
      }
      
      throw new StorageProviderError('dropbox', 'getFileContent', error);
    }
  }

  /**
   * Register a webhook to receive file change notifications
   */
  async registerWebhook(callbackUrl: string, secret: string): Promise<StorageOperationResult> {
    try {
      this.validateInitialized();
      
      // Store webhook secret for verification
      this.webhookSecret = secret;
      
      // Register the webhook with Dropbox
      const response = await this.dropbox!.filesListFolderGetLatestCursor({
        path: '',
        recursive: true,
        include_media_info: true,
        include_deleted: true
      });
      
      // Store the cursor
      const cursor = response.result.cursor;
      this.cursorsByPath.set('/', cursor);
      
      this.logger.info('Registered Dropbox webhook', { callbackUrl });
      
      return {
        success: true,
        message: 'Dropbox webhook registered successfully',
        data: {
          cursor
        }
      };
    } catch (error: any) {
      this.logger.error('Failed to register Dropbox webhook', { callbackUrl, error });
      return {
        success: false,
        message: 'Failed to register Dropbox webhook',
        error: new StorageProviderError('dropbox', 'registerWebhook', error)
      };
    }
  }
  
  /**
   * Verify webhook signature from Dropbox
   */
  verifyWebhook(signature: string, body: string): boolean {
    if (!this.webhookSecret) {
      this.logger.warn('Webhook secret not set for verification');
      return false;
    }
    
    try {
      const hmac = crypto.createHmac('sha256', this.webhookSecret);
      hmac.update(body);
      const calculatedSignature = hmac.digest('hex');
      
      return crypto.timingSafeEqual(
        Buffer.from(calculatedSignature),
        Buffer.from(signature)
      );
    } catch (error) {
      this.logger.error('Failed to verify webhook signature', { error });
      return false;
    }
  }
  
  /**
   * Process webhook notification from Dropbox
   */
  async processWebhook(body: any): Promise<StorageOperationResult> {
    try {
      this.validateInitialized();
      
      if (!body.list_folder || !body.list_folder.accounts) {
        return {
          success: false,
          message: 'Invalid webhook payload'
        };
      }
      
      // Get the latest changes for each path we're tracking
      for (const [path, cursor] of this.cursorsByPath.entries()) {
        const changes = await this.dropbox!.filesListFolderContinue({
          cursor
        });
        
        if (changes.result.entries.length > 0) {
          // Update our cursor
          this.cursorsByPath.set(path, changes.result.cursor);
          
          // Process each change
          for (const entry of changes.result.entries) {
            const event = entry['.tag'] === 'deleted' ? 'file:deleted' : 'file:changed';
            
            this.changeEmitter.emit(event, {
              path: entry.path_display,
              type: entry['.tag'],
              fileId: 'id' in entry ? entry.id : undefined,
              name: entry.name
            });
          }
          
          this.logger.info('Processed Dropbox changes', {
            path,
            changeCount: changes.result.entries.length
          });
        }
      }
      
      return {
        success: true,
        message: 'Webhook processed successfully'
      };
    } catch (error: any) {
      this.logger.error('Failed to process webhook', { error });
      return {
        success: false,
        message: 'Failed to process webhook',
        error: new StorageProviderError('dropbox', 'processWebhook', error)
      };
    }
  }
  
  /**
   * Subscribe to file change events
   */
  onFileChange(event: 'file:changed' | 'file:deleted', callback: (fileInfo: any) => void): void {
    this.changeEmitter.on(event, callback);
  }

  /**
   * Upload a file to Dropbox with progress tracking
   */
  async uploadFile(
    path: string, 
    fileName: string, 
    content: Buffer | Readable, 
    options?: UploadOptions
  ): Promise<StorageOperationResult & { fileId?: string }> {
    try {
      this.validateInitialized();
      
      const filePath = `${path}/${fileName}`.replace(/^\/+/, '/');
      const contentType = options?.contentType || 'application/octet-stream';
      const totalSize = options?.contentLength || (Buffer.isBuffer(content) ? content.length : null);
      
      // Buffer small files
      if (Buffer.isBuffer(content) && content.length < 8 * 1024 * 1024) {
        const response = await this.dropbox!.filesUpload({
          path: filePath,
          contents: content,
          mode: { '.tag': 'overwrite' },
          autorename: true
        });
        
        return {
          success: true,
          message: 'File uploaded successfully',
          fileId: response.result.id,
          data: {
            id: response.result.id,
            name: response.result.name,
            path: response.result.path_display,
            size: response.result.size
          }
        };
      }
      
      // For larger files or streams, use session upload with progress tracking
      const response = await this.dropbox!.filesUploadSessionStart({
        close: false,
        contents: Buffer.isBuffer(content) ? content.slice(0, 1024 * 1024) : content
      });
      
      const sessionId = response.result.session_id;
      let uploadedBytes = Buffer.isBuffer(content) ? Math.min(content.length, 1024 * 1024) : 0;
      
      // Implement progress tracking
      if (totalSize && options?.onProgress) {
        options.onProgress({
          bytes: uploadedBytes,
          totalBytes: totalSize,
          percent: Math.round((uploadedBytes / totalSize) * 100)
        });
      }
      
      // Continue upload in chunks for Buffer content
      if (Buffer.isBuffer(content) && content.length > 1024 * 1024) {
        const chunkSize = 8 * 1024 * 1024; // 8MB chunks
        
        for (let offset = 1024 * 1024; offset < content.length; offset += chunkSize) {
          const chunk = content.slice(offset, offset + chunkSize);
          const isLastChunk = offset + chunkSize >= content.length;
          
          await this.dropbox!.filesUploadSessionAppendV2({
            cursor: {
              session_id: sessionId,
              offset: uploadedBytes
            },
            close: isLastChunk,
            contents: chunk
          });
          
          uploadedBytes += chunk.length;
          
          // Update progress
          if (options?.onProgress) {
            options.onProgress({
              bytes: uploadedBytes,
              totalBytes: totalSize!,
              percent: Math.round((uploadedBytes / totalSize!) * 100)
            });
          }
        }
      }
      
      // Finish the upload session
      const fileResult = await this.dropbox!.filesUploadSessionFinish({
        cursor: {
          session_id: sessionId,
          offset: uploadedBytes
        },
        commit: {
          path: filePath,
          mode: { '.tag': 'overwrite' },
          autorename: true
        }
      });
      
      // Final progress update
      if (totalSize && options?.onProgress) {
        options.onProgress({
          bytes: totalSize,
          totalBytes: totalSize,
          percent: 100
        });
      }
      
      return {
        success: true,
        message: 'File uploaded successfully',
        fileId: fileResult.result.id,
        data: {
          id: fileResult.result.id,
          name: fileResult.result.name,
          path: fileResult.result.path_display,
          size: fileResult.result.size
        }
      };
    } catch (error: any) {
      this.logger.error('Failed to upload file', { path, fileName, error });
      throw new StorageProviderError('dropbox', 'uploadFile', error);
    }
  }

  getCapabilities() {
    const capabilities = super.getCapabilities();
    return {
      ...capabilities,
      supportsRangeRequests: true,
      supportsFolderCreation: true,
      supportsMetadata: true,
      supportsProgressTracking: true,
      supportsDirectUpload: true,
      supportsWebhooks: true,
      supportsChangeNotifications: true
    };
  }
}