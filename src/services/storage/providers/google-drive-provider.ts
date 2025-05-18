// src/services/storage/providers/google-drive-provider.ts
import { injectable, inject } from 'inversify';
import { BaseStorageProvider } from '../base-provider';
import { Logger } from '../../../utils/logger';
import { StorageOperationResult, SignedUrlOptions, FolderOptions, ListOptions, DeleteOptions, UploadOptions, FileMetadata, StorageStats } from '../types';
import { GoogleDriveCredentials } from '../credentials';
import { StorageAuthError, StorageNotFoundError, StorageAccessError, StorageProviderError } from '../errors';
import axios from 'axios';

@injectable()
export class GoogleDriveStorageProvider extends BaseStorageProvider {
  private accessToken?: string;
  private refreshToken?: string;
  private clientId?: string;
  private clientSecret?: string;
  private expiryDate?: number;
  private rootFolderId?: string;

  constructor(@inject('Logger') logger: Logger) {
    super(logger, 'google-drive');
  }

  /**
   * Initialize the Google Drive storage provider with credentials
   * @param credentials Google Drive credentials
   */
  async initialize(credentials: GoogleDriveCredentials): Promise<StorageOperationResult> {
    try {
      this.logger.info('Initializing Google Drive storage provider');
      
      this.refreshToken = credentials.refreshToken;
      this.clientId = credentials.clientId;
      this.clientSecret = credentials.clientSecret;
      this.accessToken = credentials.accessToken;
      this.expiryDate = credentials.expiryDate;
      
      // If no access token or token expired, refresh it
      if (!this.accessToken || !this.expiryDate || this.expiryDate < Date.now()) {
        const tokenResult = await this.refreshAccessToken();
        if (!tokenResult.success) {
          return tokenResult;
        }
      }
      
      // Test the connection by listing files
      const testResult = await this.testConnection();
      if (!testResult.success) {
        return testResult;
      }
      
      this.initialized = true;
      this.credentials = credentials;
      
      this.logger.info('Google Drive storage provider initialized');
      return {
        success: true,
        message: 'Google Drive storage provider initialized successfully'
      };
    } catch (error: any) {
      this.logger.error('Failed to initialize Google Drive storage provider', { error });
      return {
        success: false,
        message: 'Failed to initialize Google Drive storage provider',
        error: new StorageAuthError('Google Drive', error)
      };
    }
  }

  /**
   * Refresh the access token using refresh token
   */
  private async refreshAccessToken(): Promise<StorageOperationResult> {
    try {
      const response = await axios.post('https://oauth2.googleapis.com/token', {
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: this.refreshToken,
        grant_type: 'refresh_token'
      });
      
      this.accessToken = response.data.access_token;
      this.expiryDate = Date.now() + (response.data.expires_in * 1000);
      
      return {
        success: true,
        message: 'Access token refreshed successfully'
      };
    } catch (error: any) {
      this.logger.error('Failed to refresh access token', { error });
      return {
        success: false,
        message: 'Failed to refresh access token',
        error: new StorageAuthError('Google Drive', error)
      };
    }
  }

  /**
   * Test the connection to Google Drive
   */
  async testConnection(): Promise<StorageOperationResult> {
    try {
      // Try to list files with max 1 result to verify connection
      const response = await axios.get('https://www.googleapis.com/drive/v3/files', {
        params: {
          pageSize: 1
        },
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      });
      
      // Set the root folder ID if not already set
      if (!this.rootFolderId) {
        this.rootFolderId = 'root'; // Google Drive's root folder ID
      }
      
      return {
        success: true,
        message: 'Connection to Google Drive successful'
      };
    } catch (error: any) {
      // If token expired, try to refresh
      if (error.response && error.response.status === 401) {
        const refreshResult = await this.refreshAccessToken();
        if (refreshResult.success) {
          // Retry the test
          return this.testConnection();
        }
      }
      
      this.logger.error('Failed to connect to Google Drive', { error });
      return {
        success: false,
        message: 'Failed to connect to Google Drive',
        error: new StorageAuthError('Google Drive', error)
      };
    }
  }

  /**
   * Generate a signed URL for direct client operations
   * Note: Google Drive uses different approach with access tokens
   */
  async getSignedUrl(key: string, options: SignedUrlOptions): Promise<StorageOperationResult & { url?: string }> {
    try {
      this.validateInitialized();
      
      // For Google Drive, we need to get the file ID from the key
      const fileId = await this.getFileIdFromPath(key);
      
      if (!fileId) {
        return {
          success: false,
          message: `File not found: ${key}`,
          error: new StorageNotFoundError(key)
        };
      }
      
      let url = '';
      
      // For read operations, generate a download URL
      if (options.operation === 'read') {
        url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&access_token=${this.accessToken}`;
      } 
      // For write operations, we can't generate a direct upload URL, need to use the API
      else if (options.operation === 'write') {
        return {
          success: false,
          message: 'Direct upload via signed URL not supported for Google Drive',
          error: new StorageProviderError('Google Drive', 'getSignedUrl')
        };
      }
      
      return {
        success: true,
        url,
        message: 'URL generated successfully'
      };
    } catch (error: any) {
      this.logger.error('Failed to generate signed URL', { key, error });
      return {
        success: false,
        message: 'Failed to generate signed URL',
        error: new StorageProviderError('Google Drive', 'getSignedUrl', error)
      };
    }
  }

  /**
   * Create a folder in Google Drive
   */
  async createFolder(path: string, folderName: string, options?: FolderOptions): Promise<StorageOperationResult> {
    try {
      this.validateInitialized();
      
      // Get parent folder ID
      const parentId = await this.getFileIdFromPath(path) || 'root';
      
      // Create folder
      const response = await axios.post('https://www.googleapis.com/drive/v3/files', {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId]
      }, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      return {
        success: true,
        message: 'Folder created successfully',
        data: {
          id: response.data.id,
          name: folderName,
          path: path ? `${path}/${folderName}` : folderName
        }
      };
    } catch (error: any) {
      this.logger.error('Failed to create folder', { path, folderName, error });
      return {
        success: false,
        message: 'Failed to create folder',
        error: new StorageProviderError('Google Drive', 'createFolder', error)
      };
    }
  }

  /**
   * List files in a Google Drive directory
   */
  async listFiles(path: string, options?: ListOptions): Promise<StorageOperationResult & { files?: FileMetadata[] }> {
    try {
      this.validateInitialized();
      
      // Get folder ID from path
      const folderId = await this.getFileIdFromPath(path) || 'root';
      
      // Query parameters
      const params: any = {
        q: `'${folderId}' in parents and trashed = false`,
        fields: 'files(id, name, mimeType, size, modifiedTime, parents, md5Checksum)'
      };
      
      if (options?.maxResults) {
        params.pageSize = options.maxResults;
      }
      
      if (options?.pageToken) {
        params.pageToken = options.pageToken;
      }
      
      // List files
      const response = await axios.get('https://www.googleapis.com/drive/v3/files', {
        params,
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      });
      
      // Convert to FileMetadata array
      const files: FileMetadata[] = response.data.files.map((file: any) => ({
        key: `${path}/${file.name}`.replace(/^\/+/, ''),
        name: file.name,
        size: parseInt(file.size || '0', 10),
        lastModified: new Date(file.modifiedTime),
        contentType: file.mimeType,
        isDirectory: file.mimeType === 'application/vnd.google-apps.folder',
        etag: file.md5Checksum,
        metadata: {
          googleDriveId: file.id
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
      return {
        success: false,
        message: 'Failed to list files',
        error: new StorageProviderError('Google Drive', 'listFiles', error)
      };
    }
  }

  /**
   * Get file metadata from Google Drive
   */
  async getFileMetadata(key: string): Promise<StorageOperationResult & { metadata?: FileMetadata }> {
    try {
      this.validateInitialized();
      
      // Get file ID from path
      const fileId = await this.getFileIdFromPath(key);
      
      if (!fileId) {
        return {
          success: false,
          message: `File not found: ${key}`,
          error: new StorageNotFoundError(key)
        };
      }
      
      // Get file metadata
      const response = await axios.get(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
        params: {
          fields: 'id, name, mimeType, size, modifiedTime, parents, md5Checksum'
        },
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      });
      
      const file = response.data;
      
      const metadata: FileMetadata = {
        key,
        name: file.name,
        size: parseInt(file.size || '0', 10),
        lastModified: new Date(file.modifiedTime),
        contentType: file.mimeType,
        isDirectory: file.mimeType === 'application/vnd.google-apps.folder',
        etag: file.md5Checksum,
        metadata: {
          googleDriveId: file.id
        }
      };
      
      return {
        success: true,
        metadata
      };
    } catch (error: any) {
      this.logger.error('Failed to get file metadata', { key, error });
      
      // Handle 404 errors
      if (error.response && error.response.status === 404) {
        return {
          success: false,
          message: `File not found: ${key}`,
          error: new StorageNotFoundError(key)
        };
      }
      
      return {
        success: false,
        message: 'Failed to get file metadata',
        error: new StorageProviderError('Google Drive', 'getFileMetadata', error)
      };
    }
  }

  /**
   * Delete a file or folder from Google Drive
   */
  async deleteFile(key: string, options?: DeleteOptions): Promise<StorageOperationResult> {
    try {
      this.validateInitialized();
      
      // Get file ID from path
      const fileId = await this.getFileIdFromPath(key);
      
      if (!fileId) {
        return {
          success: false,
          message: `File not found: ${key}`,
          error: new StorageNotFoundError(key)
        };
      }
      
      // Check if it's a folder and has recursive option
      const fileMetadata = await this.getFileMetadata(key);
      if (fileMetadata.success && fileMetadata.metadata?.isDirectory && options?.recursive) {
        // List all files in the folder
        const listResult = await this.listFiles(key);
        
        // Delete each file/folder recursively
        if (listResult.success && listResult.files) {
          for (const file of listResult.files) {
            await this.deleteFile(`${key}/${file.name}`, options);
          }
        }
      }
      
      // Delete file or empty folder
      await axios.delete(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      });
      
      return {
        success: true,
        message: 'File deleted successfully'
      };
    } catch (error: any) {
      this.logger.error('Failed to delete file', { key, error });
      return {
        success: false,
        message: 'Failed to delete file',
        error: new StorageProviderError('Google Drive', 'deleteFile', error)
      };
    }
  }

  /**
   * Check if a file exists in Google Drive
   */
  async fileExists(key: string): Promise<StorageOperationResult & { exists?: boolean }> {
    try {
      this.validateInitialized();
      
      // Get file ID from path
      const fileId = await this.getFileIdFromPath(key);
      
      return {
        success: true,
        exists: !!fileId
      };
    } catch (error: any) {
      this.logger.error('Failed to check if file exists', { key, error });
      return {
        success: false,
        message: 'Failed to check if file exists',
        error: new StorageProviderError('Google Drive', 'fileExists', error)
      };
    }
  }

  /**
   * Helper method to get a Google Drive file ID from a path
   */
  private async getFileIdFromPath(path: string): Promise<string | null> {
    if (!path || path === '/') {
      return 'root';
    }
    
    // Split path into components
    const components = path.split('/').filter(Boolean);
    
    // Start from root
    let parentId = 'root';
    
    // Navigate through each path component
    for (const component of components) {
      // Search for the file/folder in the current parent
      const response = await axios.get('https://www.googleapis.com/drive/v3/files', {
        params: {
          q: `name = '${component}' and '${parentId}' in parents and trashed = false`,
          fields: 'files(id)'
        },
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      });
      
      // If no files found, return null
      if (!response.data.files || response.data.files.length === 0) {
        return null;
      }
      
      // Update parentId for next iteration
      parentId = response.data.files[0].id;
    }
    
    return parentId;
  }

  // Implement other required methods with Google Drive-specific logic
  async createMultipartUpload(key: string, options?: UploadOptions): Promise<StorageOperationResult & { uploadId?: string }> {
    // Google Drive doesn't have a direct equivalent to multipart uploads
    // We'll need to use resumable uploads instead
    try {
      this.validateInitialized();
      
      // Parse path to get parent directory and file name
      const lastSlashIndex = key.lastIndexOf('/');
      const parentPath = lastSlashIndex >= 0 ? key.substring(0, lastSlashIndex) : '';
      const fileName = lastSlashIndex >= 0 ? key.substring(lastSlashIndex + 1) : key;
      
      // Get parent folder ID
      const parentId = await this.getFileIdFromPath(parentPath) || 'root';
      
      // Create a resumable upload session
      const response = await axios.post('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
        name: fileName,
        parents: [parentId],
        mimeType: options?.contentType || this.determineContentType(fileName)
      }, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      // Get the upload URL from the Location header
      const uploadUrl = response.headers.location;
      
      if (!uploadUrl) {
        throw new Error('Failed to get resumable upload URL');
      }
      
      // Use the upload URL as the upload ID
      return {
        success: true,
        uploadId: uploadUrl,
        message: 'Resumable upload session created'
      };
    } catch (error: any) {
      this.logger.error('Failed to create resumable upload', { key, error });
      return {
        success: false,
        message: 'Failed to create resumable upload',
        error: new StorageProviderError('Google Drive', 'createMultipartUpload', error)
      };
    }
  }

  async getSignedUrlForPart(key: string, uploadId: string, partNumber: number, contentLength: number): Promise<StorageOperationResult & { url?: string }> {
    // Google Drive uses a different approach - we already have the upload URL in uploadId
    return {
      success: true,
      url: uploadId,
      message: 'Using resumable upload URL'
    };
  }

  async completeMultipartUpload(key: string, uploadId: string, parts: any[]): Promise<StorageOperationResult> {
    // For Google Drive, the upload is completed when the last part is uploaded
    // There's no separate completion step
    return {
      success: true,
      message: 'Upload is completed with the last part upload'
    };
  }

  async abortMultipartUpload(key: string, uploadId: string): Promise<StorageOperationResult> {
    // For Google Drive, to abort a resumable upload, we simply stop using the upload URL
    // No explicit abort needed
    return {
      success: true,
      message: 'Resumable upload aborted'
    };
  }

  /**
   * Get storage usage statistics for Google Drive
   */
  async getStorageStats(): Promise<StorageOperationResult & { stats?: StorageStats }> {
    try {
      this.validateInitialized();
      
      // Get storage usage
      const response = await axios.get('https://www.googleapis.com/drive/v3/about', {
        params: {
          fields: 'storageQuota'
        },
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      });
      
      const quota = response.data.storageQuota;
      
      // Get file count by listing all files
      const fileCountResponse = await axios.get('https://www.googleapis.com/drive/v3/files', {
        params: {
          q: 'trashed = false',
          fields: 'files(id)'
        },
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      });
      
      const stats: StorageStats = {
        totalBytes: parseInt(quota.limit || '0', 10),
        usedBytes: parseInt(quota.usage || '0', 10),
        availableBytes: parseInt(quota.limit || '0', 10) - parseInt(quota.usage || '0', 10),
        fileCount: fileCountResponse.data.files.length,
        lastUpdated: new Date()
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
        error: new StorageProviderError('Google Drive', 'getStorageStats', error)
      };
    }
  }

  /**
   * Get provider capabilities specific to Google Drive
   */
  getCapabilities() {
    return {
      ...super.getCapabilities(),
      supportsMultipartUpload: false, // Google Drive uses resumable uploads instead
      supportsRangeRequests: true,
      supportsServerSideEncryption: false,
      supportsVersioning: true,
      supportsFolderCreation: true,
      supportsTags: false,
      supportsMetadata: true,
      maximumFileSize: 5 * 1024 * 1024 * 1024, // 5TB for Google Drive
      maximumPartSize: 0, // Not applicable
      minimumPartSize: 0, // Not applicable
      maximumPartCount: 0 // Not applicable
    };
  }
}