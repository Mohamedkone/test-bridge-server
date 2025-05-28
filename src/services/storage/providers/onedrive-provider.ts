// src/services/storage/providers/onedrive-provider.ts
import { injectable, inject } from 'inversify';
import { BaseStorageProvider } from '../base-provider';
import { Logger } from '../../../utils/logger';
import { StorageOperationResult, SignedUrlOptions, FolderOptions, ListOptions, DeleteOptions, UploadOptions, FileMetadata, StorageStats } from '../types';
import { OneDriveCredentials } from '../credentials';
import { StorageAuthError, StorageNotFoundError, StorageAccessError, StorageProviderError } from '../errors';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';
import { ClientSecretCredential } from '@azure/identity';

@injectable()
export class OneDriveStorageProvider extends BaseStorageProvider {
  private client?: Client;
  private driveId?: string;
  private rootFolderId?: string;
  
  constructor(@inject('Logger') logger: Logger) {
    super(logger, 'onedrive');
  }
  
  /**
   * Initialize the OneDrive provider with credentials
   */
  async initialize(credentials: OneDriveCredentials): Promise<StorageOperationResult> {
    try {
      this.logger.info('Initializing OneDrive provider');
      
      // Create Azure AD client credential
      const credential = new ClientSecretCredential(
        credentials.tenantId,
        credentials.clientId,
        credentials.clientSecret
      );
      
      // Create auth provider
      const authProvider = new TokenCredentialAuthenticationProvider(credential, {
        scopes: ['https://graph.microsoft.com/.default']
      });
      
      // Create Graph client
      this.client = Client.initWithMiddleware({
        authProvider
      });
      
      // Get default drive
      const drive = await this.client!.api('/me/drive').get();
      this.driveId = drive.id;
      this.rootFolderId = drive.root.id;
      
      this.credentials = credentials;
      this.initialized = true;
      
      this.logger.info('OneDrive provider initialized');
      return {
        success: true,
        message: 'OneDrive provider initialized successfully'
      };
    } catch (error: any) {
      this.logger.error('Failed to initialize OneDrive provider', { error });
      return {
        success: false,
        message: 'Failed to initialize OneDrive provider',
        error: new StorageAuthError('OneDrive', error)
      };
    }
  }
  
  /**
   * Test the connection to OneDrive
   */
  async testConnection(): Promise<StorageOperationResult> {
    try {
      this.validateInitialized();
      
      // Try to get drive info
      await this.client!.api('/me/drive').get();
      
      return {
        success: true,
        message: 'Successfully connected to OneDrive'
      };
    } catch (error: any) {
      this.logger.error('Failed to connect to OneDrive', { error });
      return {
        success: false,
        message: 'Failed to connect to OneDrive',
        error: new StorageProviderError('OneDrive', 'connection', error)
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
      supportsServerSideEncryption: false, // OneDrive handles encryption
      supportsVersioning: true,
      supportsFolderCreation: true,
      supportsTags: false,
      supportsMetadata: true,
      maximumFileSize: 100 * 1024 * 1024 * 1024, // 100GB
      maximumPartSize: 320 * 1024 * 1024, // 320MB
      minimumPartSize: 320 * 1024, // 320KB
      maximumPartCount: 1000
    };
  }
  
  /**
   * Get a signed URL for direct client operations
   */
  async getSignedUrl(key: string, options: SignedUrlOptions): Promise<StorageOperationResult & { url?: string }> {
    try {
      this.validateInitialized();
      
      const item = await this.client!.api(`/me/drive/items/${key}`).get();
      
      // Create a sharing link with appropriate permissions
      const permission = await this.client!.api(`/me/drive/items/${key}/createLink`).post({
        type: options.operation === 'read' ? 'view' : 'edit',
        scope: 'anonymous',
        expirationDateTime: new Date(Date.now() + (options.expiresIn * 1000)).toISOString()
      });
      
      return {
        success: true,
        url: permission.link.webUrl,
        message: 'Successfully generated signed URL'
      };
    } catch (error: any) {
      this.logger.error('Failed to generate signed URL', { key, error });
      return {
        success: false,
        message: 'Failed to generate signed URL',
        error: new StorageProviderError('OneDrive', 'signed-url', error)
      };
    }
  }

  /**
   * Create a folder in OneDrive
   */
  async createFolder(path: string, folderName: string, options?: FolderOptions): Promise<StorageOperationResult> {
    try {
      this.validateInitialized();
      
      const folder = await this.client!.api(`/me/drive/items/${path}/children`).post({
        name: folderName,
        folder: {},
        '@microsoft.graph.conflictBehavior': 'rename'
      });
      
      return {
        success: true,
        message: 'Folder created successfully',
        data: {
          id: folder.id,
          name: folder.name,
          path: folder.webUrl
        }
      };
    } catch (error: any) {
      this.logger.error('Failed to create folder', { path, folderName, error });
      return {
        success: false,
        message: 'Failed to create folder',
        error: new StorageProviderError('OneDrive', 'create-folder', error)
      };
    }
  }

  /**
   * List files in a directory
   */
  async listFiles(path: string, options?: ListOptions): Promise<StorageOperationResult & { files?: FileMetadata[] }> {
    try {
      this.validateInitialized();
      
      const query = this.client!.api(`/me/drive/items/${path}/children`)
        .select('id,name,size,lastModifiedDateTime,webUrl,folder,file')
        .top(options?.maxResults || 100);
      
      if (options?.pageToken) {
        query.skipToken(options.pageToken);
      }
      
      const response = await query.get();
      const files: FileMetadata[] = response.value.map((item: any) => ({
        key: item.id,
        name: item.name,
        size: item.size || 0,
        lastModified: new Date(item.lastModifiedDateTime),
        contentType: item.file?.mimeType,
        isDirectory: !!item.folder,
        url: item.webUrl,
        metadata: {
          id: item.id,
          webUrl: item.webUrl
        }
      }));
      
      return {
        success: true,
        files,
        data: {
          nextPageToken: response['@odata.nextLink']
        }
      };
    } catch (error: any) {
      this.logger.error('Failed to list files', { path, error });
      return {
        success: false,
        message: 'Failed to list files',
        error: new StorageProviderError('OneDrive', 'list-files', error)
      };
    }
  }

  /**
   * Get file metadata
   */
  async getFileMetadata(key: string): Promise<StorageOperationResult & { metadata?: FileMetadata }> {
    try {
      this.validateInitialized();
      
      const item = await this.client!.api(`/me/drive/items/${key}`)
        .select('id,name,size,lastModifiedDateTime,webUrl,folder,file')
        .get();
      
      const metadata: FileMetadata = {
        key: item.id,
        name: item.name,
        size: item.size || 0,
        lastModified: new Date(item.lastModifiedDateTime),
        contentType: item.file?.mimeType,
        isDirectory: !!item.folder,
        url: item.webUrl,
        metadata: {
          id: item.id,
          webUrl: item.webUrl
        }
      };
      
      return {
        success: true,
        metadata,
        message: 'Successfully retrieved file metadata'
      };
    } catch (error: any) {
      this.logger.error('Failed to get file metadata', { key, error });
      return {
        success: false,
        message: 'Failed to get file metadata',
        error: new StorageProviderError('OneDrive', 'get-metadata', error)
      };
    }
  }

  /**
   * Delete a file or folder
   */
  async deleteFile(key: string, options?: DeleteOptions): Promise<StorageOperationResult> {
    try {
      this.validateInitialized();
      
      await this.client!.api(`/me/drive/items/${key}`).delete();
      
      return {
        success: true,
        message: 'File deleted successfully'
      };
    } catch (error: any) {
      this.logger.error('Failed to delete file', { key, error });
      return {
        success: false,
        message: 'Failed to delete file',
        error: new StorageProviderError('OneDrive', 'delete', error)
      };
    }
  }

  /**
   * Check if a file exists
   */
  async fileExists(key: string): Promise<StorageOperationResult & { exists?: boolean }> {
    try {
      this.validateInitialized();
      
      await this.client!.api(`/me/drive/items/${key}`).get();
      
      return {
        success: true,
        exists: true
      };
    } catch (error: any) {
      if (error.statusCode === 404) {
        return {
          success: true,
          exists: false
        };
      }
      
      this.logger.error('Failed to check file existence', { key, error });
      return {
        success: false,
        message: 'Failed to check file existence',
        error: new StorageProviderError('OneDrive', 'exists', error)
      };
    }
  }

  /**
   * Get storage usage statistics
   */
  async getStorageStats(): Promise<StorageOperationResult & { stats?: StorageStats }> {
    try {
      this.validateInitialized();
      
      const drive = await this.client!.api('/me/drive').get();
      
      const stats: StorageStats = {
        totalBytes: drive.quota.total,
        usedBytes: drive.quota.used,
        availableBytes: drive.quota.remaining,
        fileCount: drive.quota.fileCount || 0,
        lastUpdated: new Date(),
        costEstimate: 0 // OneDrive doesn't provide cost information
      };
      
      return {
        success: true,
        stats,
        message: 'Successfully retrieved storage statistics'
      };
    } catch (error: any) {
      this.logger.error('Failed to get storage statistics', { error });
      return {
        success: false,
        message: 'Failed to get storage statistics',
        error: new StorageProviderError('OneDrive', 'stats', error)
      };
    }
  }

  /**
   * Create a multipart upload session for large files
   * Note: OneDrive uses a different approach with upload sessions
   */
  async createMultipartUpload(key: string, options?: UploadOptions): Promise<StorageOperationResult & { uploadId?: string }> {
    try {
      this.validateInitialized();
      
      // Create an upload session
      const response = await this.client!
        .api(`/me/drive/root:/${key}:/createUploadSession`)
        .post({
          item: {
            "@microsoft.graph.conflictBehavior": "replace",
            name: this.getFileNameFromKey(key)
          }
        });
      
      return {
        success: true,
        uploadId: response.uploadUrl,
        message: 'Upload session created successfully'
      };
    } catch (error: any) {
      this.logger.error('Failed to create upload session', { key, error });
      return {
        success: false,
        message: 'Failed to create upload session',
        error: new StorageProviderError('OneDrive', 'createMultipartUpload', error)
      };
    }
  }

  /**
   * Get signed URL for uploading a specific part
   * Note: OneDrive uses a different approach with upload sessions
   */
  async getSignedUrlForPart(key: string, uploadId: string, partNumber: number, contentLength: number): Promise<StorageOperationResult & { url?: string }> {
    // For OneDrive, the uploadId is already the upload URL
    return {
      success: true,
      url: uploadId,
      message: 'Using upload session URL'
    };
  }

  /**
   * Complete a multipart upload
   * Note: OneDrive uses a different approach with upload sessions
   */
  async completeMultipartUpload(key: string, uploadId: string, parts: any[]): Promise<StorageOperationResult> {
    // For OneDrive, the upload is completed when the last part is uploaded
    // No explicit completion step is needed
    return {
      success: true,
      message: 'Upload completed with final part'
    };
  }

  /**
   * Abort a multipart upload
   * Note: OneDrive uses a different approach with upload sessions
   */
  async abortMultipartUpload(key: string, uploadId: string): Promise<StorageOperationResult> {
    try {
      this.validateInitialized();
      
      // Delete the file if it exists
      const file = await this.client!
        .api(`/me/drive/root:/${key}`)
        .get();
      
      if (file) {
        await this.client!
          .api(`/me/drive/items/${file.id}`)
          .delete();
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
        error: new StorageProviderError('OneDrive', 'abortMultipartUpload', error)
      };
    }
  }

  /**
   * Get file content with optional range support
   */
  async getFileContent(key: string, range?: { start: number; end: number }): Promise<StorageOperationResult & { data?: Buffer }> {
    try {
      this.validateInitialized();
      
      let request = this.client!.api(`/me/drive/items/${key}/content`);
      
      // If range is specified, add range header
      if (range) {
        request = request.header('Range', `bytes=${range.start}-${range.end}`);
      }
      
      try {
        // Get the file content as an ArrayBuffer
        const response = await request.get();
        
        // Convert to Buffer
        if (response) {
          if (Buffer.isBuffer(response)) {
            return {
              success: true,
              data: response
            };
          } else if (response instanceof ArrayBuffer || response instanceof Uint8Array) {
            return {
              success: true,
              data: Buffer.from(response)
            };
          } else if (typeof response === 'string') {
            return {
              success: true,
              data: Buffer.from(response)
            };
          } else if (typeof response === 'object') {
            // Try to convert object to JSON string
            return {
              success: true,
              data: Buffer.from(JSON.stringify(response))
            };
          } else {
            throw new Error(`Unexpected response type: ${typeof response}`);
          }
        } else {
          throw new Error('Empty response received');
        }
      } catch (error: any) {
        // Handle 404 errors
        if (error.statusCode === 404) {
          throw new StorageNotFoundError(key, error);
        }
        throw error;
      }
    } catch (error: any) {
      this.logger.error('Failed to get file content', { key, range, error });
      
      if (error instanceof StorageNotFoundError) {
        throw error;
      }
      
      throw new StorageProviderError('OneDrive', 'getFileContent', error);
    }
  }
} 