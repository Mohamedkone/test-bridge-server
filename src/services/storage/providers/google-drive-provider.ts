// src/services/storage/providers/google-drive-provider.ts
import { google } from 'googleapis';
import { injectable, inject } from 'inversify';
import { BaseStorageProvider } from '../base-provider';
import { Logger } from '../../../utils/logger';
import { StorageOperationResult, SignedUrlOptions, FolderOptions, ListOptions, DeleteOptions, UploadOptions, FileMetadata, StorageStats, ProgressCallback } from '../types';
import { GoogleDriveCredentials } from '../credentials';
import { StorageAuthError, StorageNotFoundError, StorageAccessError, StorageProviderError } from '../errors';
import { Readable } from 'stream';

@injectable()
export class GoogleDriveStorageProvider extends BaseStorageProvider {
  private drive?: any;
  private rootFolderId: string = 'root';
  
  constructor(@inject('Logger') logger: Logger) {
    super(logger, 'google-drive');
  }

  async initialize(credentials: GoogleDriveCredentials): Promise<StorageOperationResult> {
    try {
      const auth = new google.auth.OAuth2(
        credentials.clientId,
        credentials.clientSecret
      );

      auth.setCredentials({
        access_token: credentials.accessToken,
        refresh_token: credentials.refreshToken
      });

      this.drive = google.drive({ version: 'v3', auth });
      this.initialized = true;

      return { success: true };
    } catch (error: any) {
      this.logger.error('Failed to initialize Google Drive provider', { error });
      throw new StorageAuthError('google-drive', error);
    }
  }

  async testConnection(): Promise<StorageOperationResult> {
    try {
      this.validateInitialized();
      await this.drive.files.get({ fileId: this.rootFolderId });
      return { success: true };
    } catch (error: any) {
      this.logger.error('Failed to test Google Drive connection', { error });
      return { success: false, message: error.message };
    }
  }

  async getSignedUrl(key: string, options: SignedUrlOptions): Promise<StorageOperationResult & { url?: string }> {
    try {
      this.validateInitialized();
      const fileId = key; // In Google Drive, the key is the file ID

      const response = await this.drive.files.get({
        fileId,
        fields: 'webViewLink'
      });

      return {
        success: true,
        url: response.data.webViewLink
      };
    } catch (error: any) {
      this.logger.error('Failed to get signed URL', { key, error });
      throw new StorageProviderError('google-drive', 'getSignedUrl', error);
    }
  }

  async createFolder(path: string, folderName: string, options?: FolderOptions): Promise<StorageOperationResult> {
    try {
      this.validateInitialized();
      
      const parentId = path === '/' ? this.rootFolderId : path;
      
      const response = await this.drive.files.create({
        requestBody: {
          name: folderName,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [parentId]
        },
        fields: 'id'
      });

      return {
        success: true,
        message: 'Folder created successfully',
        data: {
          id: response.data.id,
          name: folderName,
          type: 'folder',
          path: `${path}/${folderName}`.replace(/^\/+/, '/')
        }
      };
    } catch (error: any) {
      this.logger.error('Failed to create folder', { path, folderName, error });
      throw new StorageProviderError('google-drive', 'createFolder', error);
    }
  }

  async listFiles(path: string, options?: ListOptions): Promise<StorageOperationResult & { files?: FileMetadata[] }> {
    try {
      this.validateInitialized();
      
      const folderId = path === '/' ? this.rootFolderId : path;
      
      const response = await this.drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: 'files(id, name, mimeType, size, modifiedTime, createdTime)',
        pageSize: options?.maxResults || 100,
        pageToken: options?.pageToken
      });

      const files = response.data.files.map((file: any) => ({
        key: file.id,
        name: file.name,
        size: file.size || 0,
        lastModified: new Date(file.modifiedTime),
        contentType: file.mimeType,
        isDirectory: file.mimeType === 'application/vnd.google-apps.folder',
        metadata: {
          created: new Date(file.createdTime).toISOString()
        }
      }));

      return {
        success: true,
        files,
        data: {
          nextPageToken: response.data.nextPageToken
        }
      };
    } catch (error: any) {
      this.logger.error('Failed to list files', { path, error });
      throw new StorageProviderError('google-drive', 'listFiles', error);
    }
  }

  async getFileMetadata(key: string): Promise<StorageOperationResult & { metadata?: FileMetadata }> {
    try {
      this.validateInitialized();
      
      const response = await this.drive.files.get({
        fileId: key,
        fields: 'id, name, mimeType, size, modifiedTime, createdTime, parents'
      });

      const file = response.data;
      
      return {
        success: true,
        metadata: {
          key: file.id,
          name: file.name,
          size: file.size || 0,
          lastModified: new Date(file.modifiedTime),
          contentType: file.mimeType,
          isDirectory: file.mimeType === 'application/vnd.google-apps.folder',
          metadata: {
            created: new Date(file.createdTime).toISOString(),
            parentId: file.parents?.[0]
          }
        }
      };
    } catch (error: any) {
      this.logger.error('Failed to get file metadata', { key, error });
      throw new StorageProviderError('google-drive', 'getFileMetadata', error);
    }
  }

  async deleteFile(key: string, options?: DeleteOptions): Promise<StorageOperationResult> {
    try {
      this.validateInitialized();
      
      await this.drive.files.delete({
        fileId: key
      });

      return {
        success: true,
        message: 'File deleted successfully'
      };
    } catch (error: any) {
      this.logger.error('Failed to delete file', { key, error });
      throw new StorageProviderError('google-drive', 'deleteFile', error);
    }
  }

  async fileExists(key: string): Promise<StorageOperationResult & { exists?: boolean }> {
    try {
      this.validateInitialized();
      
      await this.drive.files.get({
        fileId: key,
        fields: 'id'
      });

      return {
        success: true,
        exists: true
      };
    } catch (error: any) {
      if (error.code === 404) {
        return {
          success: true,
          exists: false
        };
      }
      throw new StorageProviderError('google-drive', 'fileExists', error);
    }
  }

  async createMultipartUpload(key: string, options?: UploadOptions): Promise<StorageOperationResult & { uploadId?: string }> {
    throw new StorageProviderError('google-drive', 'createMultipartUpload', {
      message: 'Multipart upload not supported by Google Drive'
    });
  }

  async getSignedUrlForPart(key: string, uploadId: string, partNumber: number, contentLength: number): Promise<StorageOperationResult & { url?: string }> {
    throw new StorageProviderError('google-drive', 'getSignedUrlForPart', {
      message: 'Multipart upload not supported by Google Drive'
    });
  }

  async completeMultipartUpload(key: string, uploadId: string, parts: any[]): Promise<StorageOperationResult> {
    throw new StorageProviderError('google-drive', 'completeMultipartUpload', {
      message: 'Multipart upload not supported by Google Drive'
    });
  }

  async abortMultipartUpload(key: string, uploadId: string): Promise<StorageOperationResult> {
    throw new StorageProviderError('google-drive', 'abortMultipartUpload', {
      message: 'Multipart upload not supported by Google Drive'
    });
  }

  async getStorageStats(): Promise<StorageOperationResult & { stats?: StorageStats }> {
    try {
      this.validateInitialized();
      
      const response = await this.drive.about.get({
        fields: 'storageQuota'
      });

      const quota = response.data.storageQuota;
      
      return {
        success: true,
        stats: {
          totalBytes: parseInt(quota.limit || '0', 10),
          usedBytes: parseInt(quota.usage || '0', 10),
          availableBytes: parseInt(quota.limit || '0', 10) - parseInt(quota.usage || '0', 10),
          fileCount: 0, // Google Drive API doesn't provide this directly
          lastUpdated: new Date(),
          usageByType: {
            'application/vnd.google-apps.folder': 0,
            'application/vnd.google-apps.document': 0,
            'application/vnd.google-apps.spreadsheet': 0,
            'application/vnd.google-apps.presentation': 0,
            'other': 0
          },
          costEstimate: 0 // Google Drive has a free tier with 15GB storage
        }
      };
    } catch (error: any) {
      this.logger.error('Failed to get storage stats', { error });
      throw new StorageProviderError('google-drive', 'getStorageStats', error);
    }
  }

  async getFileContent(key: string, range?: { start: number; end: number }): Promise<StorageOperationResult & { data?: Buffer }> {
    try {
      this.validateInitialized();
      
      const options: any = {
        fileId: key,
        alt: 'media'
      };
      
      // Add range header if range is specified
      if (range) {
        options.headers = {
          Range: `bytes=${range.start}-${range.end}`
        };
      }
      
      // Get file content
      const response = await this.drive.files.get(options, {
        responseType: 'arraybuffer'
      });
      
      // Convert to Buffer
      const buffer = Buffer.from(response.data);
      
      return {
        success: true,
        data: buffer
      };
    } catch (error: any) {
      this.logger.error('Failed to get file content', { key, range, error });
      
      if (error.code === 404) {
        throw new StorageNotFoundError('google-drive', key);
      }
      
      throw new StorageProviderError('google-drive', 'getFileContent', error);
    }
  }

  /**
   * Upload a file to Google Drive with progress tracking
   */
  async uploadFile(
    path: string, 
    fileName: string, 
    content: Buffer | Readable, 
    options?: UploadOptions & { onProgress?: ProgressCallback }
  ): Promise<StorageOperationResult & { fileId?: string }> {
    try {
      this.validateInitialized();
      
      const parentId = path === '/' ? this.rootFolderId : path;
      const contentType = options?.contentType || 'application/octet-stream';
      const totalSize = options?.contentLength || (Buffer.isBuffer(content) ? content.length : null);
      
      const metadata = {
        name: fileName,
        mimeType: contentType,
        parents: [parentId]
      };
      
      // Create a resumable upload session
      const response = await this.drive.files.create({
        requestBody: metadata,
        media: {
          mimeType: contentType,
          body: content
        },
        fields: 'id,name,size,mimeType,webViewLink',
        uploadType: 'resumable'
      });
      
      // Track progress and call the callback
      if (totalSize && options?.onProgress) {
        let uploadedBytes = 0;
        const progressInterval = setInterval(() => {
          if (response.statusCode === 200) {
            // Upload is complete
            options.onProgress?.({
              bytes: totalSize,
              totalBytes: totalSize,
              percent: 100
            });
            clearInterval(progressInterval);
          } else if (response.responseData) {
            // Get the uploaded bytes from the response
            const range = response.responseData.range;
            if (range) {
              const [, end] = range.split('-');
              uploadedBytes = parseInt(end, 10) + 1;
              options.onProgress?.({
                bytes: uploadedBytes,
                totalBytes: totalSize,
                percent: Math.round((uploadedBytes / totalSize) * 100)
              });
            }
          }
        }, 500);
      }

      return {
        success: true,
        message: 'File uploaded successfully',
        fileId: response.data.id,
        data: {
          id: response.data.id,
          name: fileName,
          size: response.data.size,
          contentType,
          webViewLink: response.data.webViewLink
        }
      };
    } catch (error: any) {
      this.logger.error('Failed to upload file', { path, fileName, error });
      throw new StorageProviderError('google-drive', 'uploadFile', error);
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
      supportsDirectUpload: true
    };
  }
}