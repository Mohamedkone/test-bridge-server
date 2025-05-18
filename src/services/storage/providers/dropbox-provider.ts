// src/services/storage/providers/dropbox-provider.ts
import { injectable, inject } from 'inversify';
import { BaseStorageProvider } from '../base-provider';
import { Logger } from '../../../utils/logger';
import { StorageOperationResult, SignedUrlOptions, FolderOptions, ListOptions, DeleteOptions, UploadOptions, FileMetadata, StorageStats } from '../types';
import { DropboxCredentials } from '../credentials';
import { StorageAuthError, StorageNotFoundError, StorageAccessError, StorageProviderError } from '../errors';
import axios from 'axios';

@injectable()
export class DropboxStorageProvider extends BaseStorageProvider {
  private accessToken?: string;
  private refreshToken?: string;
  private appKey?: string;
  private appSecret?: string;

  constructor(@inject('Logger') logger: Logger) {
    super(logger, 'dropbox');
  }

  /**
   * Initialize the Dropbox storage provider with credentials
   * @param credentials Dropbox credentials
   */
  async initialize(credentials: DropboxCredentials): Promise<StorageOperationResult> {
    try {
      this.logger.info('Initializing Dropbox storage provider');
      
      this.accessToken = credentials.accessToken;
      this.refreshToken = credentials.refreshToken;
      this.appKey = credentials.appKey;
      this.appSecret = credentials.appSecret;
      
      // If refresh token is provided, try to refresh access token
      if (this.refreshToken && this.appKey && this.appSecret) {
        const refreshResult = await this.refreshAccessToken();
        if (!refreshResult.success) {
          return refreshResult;
        }
      }
      
      // Test the connection
      const testResult = await this.testConnection();
      if (!testResult.success) {
        return testResult;
      }
      
      this.initialized = true;
      this.credentials = credentials;
      
      this.logger.info('Dropbox storage provider initialized');
      return {
        success: true,
        message: 'Dropbox storage provider initialized successfully'
      };
    } catch (error: any) {
      this.logger.error('Failed to initialize Dropbox storage provider', { error });
      return {
        success: false,
        message: 'Failed to initialize Dropbox storage provider',
        error: new StorageAuthError('Dropbox', error)
      };
    }
  }

  /**
   * Refresh the access token using refresh token
   */
  private async refreshAccessToken(): Promise<StorageOperationResult> {
    try {
      const params = new URLSearchParams();
      params.append('grant_type', 'refresh_token');
      params.append('refresh_token', this.refreshToken!);
      params.append('client_id', this.appKey!);
      params.append('client_secret', this.appSecret!);
      
      const response = await axios.post('https://api.dropboxapi.com/oauth2/token', params);
      
      this.accessToken = response.data.access_token;
      
      return {
        success: true,
        message: 'Access token refreshed successfully'
      };
    } catch (error: any) {
      this.logger.error('Failed to refresh access token', { error });
      return {
        success: false,
        message: 'Failed to refresh access token',
        error: new StorageAuthError('Dropbox', error)
      };
    }
  }

  /**
   * Test the connection to Dropbox
   */
  async testConnection(): Promise<StorageOperationResult> {
    try {
      // Try to get current account info to verify connection
      await axios.post('https://api.dropboxapi.com/2/users/get_current_account', null, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      return {
        success: true,
        message: 'Connection to Dropbox successful'
      };
    } catch (error: any) {
      // If token expired, try to refresh
      if (error.response && error.response.status === 401 && this.refreshToken) {
        const refreshResult = await this.refreshAccessToken();
        if (refreshResult.success) {
          // Retry the test
          return this.testConnection();
        }
      }
      
      this.logger.error('Failed to connect to Dropbox', { error });
      return {
        success: false,
        message: 'Failed to connect to Dropbox',
        error: new StorageAuthError('Dropbox', error)
      };
    }
  }

  /**
   * Generate a signed URL for direct client operations
   */
  async getSignedUrl(key: string, options: SignedUrlOptions): Promise<StorageOperationResult & { url?: string }> {
    try {
      this.validateInitialized();
      
      // Dropbox path should start with /
      const dropboxPath = this.toDropboxPath(key);
      
      // For read operations, generate a temporary link
      if (options.operation === 'read') {
        const response = await axios.post('https://api.dropboxapi.com/2/files/get_temporary_link', {
          path: dropboxPath
        }, {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          }
        });
        
        return {
          success: true,
          url: response.data.link,
          message: 'Temporary link generated successfully'
        };
      } 
      // For write operations, we'll need to use the upload API
      else if (options.operation === 'write') {
        // Dropbox doesn't support direct upload URLs, so we'll return an error
        return {
          success: false,
          message: 'Direct upload via signed URL not supported for Dropbox',
          error: new StorageProviderError('Dropbox', 'getSignedUrl')
        };
      }
      
      return {
        success: false,
        message: `Unsupported operation: ${options.operation}`,
        error: new StorageProviderError('Dropbox', 'getSignedUrl')
      };
    } catch (error: any) {
      this.logger.error('Failed to generate signed URL', { key, error });
      
      // Handle file not found error
      if (error.response && error.response.status === 409 && 
          error.response.data?.error?.['.tag'] === 'path' && 
          error.response.data?.error?.path?.['.tag'] === 'not_found') {
        return {
          success: false,
          message: `File not found: ${key}`,
          error: new StorageNotFoundError(key)
        };
      }
      
      return {
        success: false,
        message: 'Failed to generate signed URL',
        error: new StorageProviderError('Dropbox', 'getSignedUrl', error)
      };
    }
  }

  /**
   * Create a folder in Dropbox
   */
  async createFolder(path: string, folderName: string, options?: FolderOptions): Promise<StorageOperationResult> {
    try {
      this.validateInitialized();
      
      // Construct the full path
      const fullPath = path ? `${path}/${folderName}` : folderName;
      const dropboxPath = this.toDropboxPath(fullPath);
      
      // Create folder
      await axios.post('https://api.dropboxapi.com/2/files/create_folder_v2', {
        path: dropboxPath,
        autorename: false
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
          path: fullPath,
          name: folderName
        }
      };
    } catch (error: any) {
      this.logger.error('Failed to create folder', { path, folderName, error });
      
      // Handle conflict (already exists)
      if (error.response && error.response.status === 409 && 
          error.response.data?.error?.['.tag'] === 'path' && 
          error.response.data?.error?.path?.['.tag'] === 'conflict') {
        return {
          success: false,
          message: `Folder already exists: ${folderName}`,
          error
        };
      }
      
      return {
        success: false,
        message: 'Failed to create folder',
        error: new StorageProviderError('Dropbox', 'createFolder', error)
      };
    }
  }

  /**
   * List files in a Dropbox directory
   */
  async listFiles(path: string, options?: ListOptions): Promise<StorageOperationResult & { files?: FileMetadata[] }> {
    try {
      this.validateInitialized();
      
      const dropboxPath = this.toDropboxPath(path);
      
      // List files
      const response = await axios.post('https://api.dropboxapi.com/2/files/list_folder', {
        path: dropboxPath,
        recursive: options?.recursive || false,
        include_media_info: false,
        include_deleted: false,
        include_has_explicit_shared_members: false,
        limit: options?.maxResults || 1000
      }, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      // Map to FileMetadata
      const files: FileMetadata[] = response.data.entries.map((entry: any) => ({
        key: this.fromDropboxPath(entry.path_display),
        name: entry.name,
        size: entry['.tag'] === 'file' ? entry.size : 0,
        lastModified: entry['.tag'] === 'file' ? new Date(entry.server_modified) : new Date(),
        contentType: entry['.tag'] === 'file' ? this.determineContentType(entry.name) : 'folder',
        isDirectory: entry['.tag'] === 'folder',
        etag: entry.rev,
        metadata: {
          dropboxId: entry.id,
          rev: entry.rev
        }
      }));
      
      // Handle pagination with cursor
      const data: Record<string, any> = {};
      if (response.data.has_more) {
        data.cursor = response.data.cursor;
      }
      
      return {
        success: true,
        files,
        data
      };
    } catch (error: any) {
      this.logger.error('Failed to list files', { path, error });
      
      // Handle not found error
      if (error.response && error.response.status === 409 && 
          error.response.data?.error?.['.tag'] === 'path' && 
          error.response.data?.error?.path?.['.tag'] === 'not_found') {
        return {
          success: false,
          message: `Path not found: ${path}`,
          error: new StorageNotFoundError(path)
        };
      }
      
      return {
        success: false,
        message: 'Failed to list files',
        error: new StorageProviderError('Dropbox', 'listFiles', error)
      };
    }
  }

  /**
   * Get file metadata from Dropbox
   */
  async getFileMetadata(key: string): Promise<StorageOperationResult & { metadata?: FileMetadata }> {
    try {
      this.validateInitialized();
      
      const dropboxPath = this.toDropboxPath(key);
      
      // Get metadata
      const response = await axios.post('https://api.dropboxapi.com/2/files/get_metadata', {
        path: dropboxPath,
        include_media_info: false,
        include_deleted: false,
        include_has_explicit_shared_members: false
      }, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      const entry = response.data;
      
      // Map to FileMetadata
      const metadata: FileMetadata = {
        key: this.fromDropboxPath(entry.path_display),
        name: entry.name,
        size: entry['.tag'] === 'file' ? entry.size : 0,
        lastModified: entry['.tag'] === 'file' ? new Date(entry.server_modified) : new Date(),
        contentType: entry['.tag'] === 'file' ? this.determineContentType(entry.name) : 'folder',
        isDirectory: entry['.tag'] === 'folder',
        etag: entry.rev,
        metadata: {
          dropboxId: entry.id,
          rev: entry.rev
        }
      };
      
      return {
        success: true,
        metadata
      };
    } catch (error: any) {
      this.logger.error('Failed to get file metadata', { key, error });
      
      // Handle not found error
      if (error.response && error.response.status === 409 && 
          error.response.data?.error?.['.tag'] === 'path' && 
          error.response.data?.error?.path?.['.tag'] === 'not_found') {
        return {
          success: false,
          message: `File not found: ${key}`,
          error: new StorageNotFoundError(key)
        };
      }
      
      return {
        success: false,
        message: 'Failed to get file metadata',
        error: new StorageProviderError('Dropbox', 'getFileMetadata', error)
      };
    }
  }

  /**
   * Delete a file or folder from Dropbox
   */
  async deleteFile(key: string, options?: DeleteOptions): Promise<StorageOperationResult> {
    try {
      this.validateInitialized();
      
      const dropboxPath = this.toDropboxPath(key);
      
      // Delete file or folder
      await axios.post('https://api.dropboxapi.com/2/files/delete_v2', {
        path: dropboxPath
      }, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      return {
        success: true,
        message: 'File deleted successfully'
      };
    } catch (error: any) {
      this.logger.error('Failed to delete file', { key, error });
      
      // Handle not found error
      if (error.response && error.response.status === 409 && 
          error.response.data?.error?.['.tag'] === 'path' && 
          error.response.data?.error?.path?.['.tag'] === 'not_found') {
        return {
          success: false,
          message: `File not found: ${key}`,
          error: new StorageNotFoundError(key)
        };
      }
      
      return {
        success: false,
        message: 'Failed to delete file',
        error: new StorageProviderError('Dropbox', 'deleteFile', error)
      };
    }
  }

  /**
   * Check if a file exists in Dropbox
   */
  async fileExists(key: string): Promise<StorageOperationResult & { exists?: boolean }> {
    try {
      this.validateInitialized();
      
      const result = await this.getFileMetadata(key);
      
      return {
        success: true,
        exists: result.success
      };
    } catch (error: any) {
      this.logger.error('Failed to check if file exists', { key, error });
      return {
        success: false,
        message: 'Failed to check if file exists',
        error: new StorageProviderError('Dropbox', 'fileExists', error)
      };
    }
  }

  /**
   * Dropbox uses a session-based upload approach for large files
   */
  async createMultipartUpload(key: string, options?: UploadOptions): Promise<StorageOperationResult & { uploadId?: string }> {
    try {
      this.validateInitialized();
      
      const dropboxPath = this.toDropboxPath(key);
      
      // Start a session for upload
      const response = await axios.post('https://content.dropboxapi.com/2/files/upload_session/start', 
        Buffer.from(''), // Empty buffer to start session
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/octet-stream'
          }
        }
      );
      
      if (!response.data.session_id) {
        throw new Error('Failed to get upload session ID');
      }
      
      // Store session ID and path for later
      return {
        success: true,
        uploadId: JSON.stringify({
          sessionId: response.data.session_id,
          path: dropboxPath
        }),
        message: 'Upload session created successfully'
      };
    } catch (error: any) {
      this.logger.error('Failed to create upload session', { key, error });
      return {
        success: false,
        message: 'Failed to create upload session',
        error: new StorageProviderError('Dropbox', 'createMultipartUpload', error)
      };
    }
  }

  async getSignedUrlForPart(key: string, uploadId: string, partNumber: number, contentLength: number): Promise<StorageOperationResult & { url?: string }> {
    // Dropbox doesn't support pre-signed URLs for uploads
    // Instead, clients need to upload directly to the API
    return {
      success: false,
      message: 'Direct upload via signed URL not supported for Dropbox',
      error: new StorageProviderError('Dropbox', 'getSignedUrlForPart')
    };
  }

  async completeMultipartUpload(key: string, uploadId: string, parts: any[]): Promise<StorageOperationResult> {
    try {
      this.validateInitialized();
      
      // Parse the upload ID to get session ID and path
      const { sessionId, path } = JSON.parse(uploadId);
      
      // Calculate total size from parts
      const totalSize = parts.reduce((sum, part) => sum + part.size, 0);
      
      // Complete the session
      await axios.post('https://content.dropboxapi.com/2/files/upload_session/finish', 
        Buffer.from(''), // Empty buffer since we're just completing
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/octet-stream',
            'Dropbox-API-Arg': JSON.stringify({
              cursor: {
                session_id: sessionId,
                offset: totalSize
              },
              commit: {
                path,
                mode: 'overwrite',
                autorename: false,
                mute: false
              }
            })
          }
        }
      );
      
      return {
        success: true,
        message: 'Upload completed successfully'
      };
    } catch (error: any) {
      this.logger.error('Failed to complete upload', { key, error });
      return {
        success: false,
        message: 'Failed to complete upload',
        error: new StorageProviderError('Dropbox', 'completeMultipartUpload', error)
      };
    }
  }

  async abortMultipartUpload(key: string, uploadId: string): Promise<StorageOperationResult> {
    // Dropbox doesn't have an explicit way to abort a session
    // Sessions automatically expire if not used
    return {
      success: true,
      message: 'Upload session will expire automatically'
    };
  }

  /**
   * Get storage usage statistics for Dropbox
   */
  async getStorageStats(): Promise<StorageOperationResult & { stats?: StorageStats }> {
    try {
      this.validateInitialized();
      
      // Get space usage
      const response = await axios.post('https://api.dropboxapi.com/2/users/get_space_usage', null, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      const usage = response.data;
      
      // Get approximate file count
      const filesCountResp = await this.listFiles('', { maxResults: 1000 });
      let fileCount = filesCountResp.success && filesCountResp.files ? filesCountResp.files.length : 0;
      
      // If there are more than 1000 files, we can't get an exact count easily
      const hasMore = filesCountResp.data?.cursor ? true : false;
      if (hasMore) {
        fileCount = 1000; // This is an approximation
      }
      
      const stats: StorageStats = {
        totalBytes: usage.allocation.allocated,
        usedBytes: usage.used,
        availableBytes: usage.allocation.allocated - usage.used,
        fileCount,
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
        error: new StorageProviderError('Dropbox', 'getStorageStats', error)
      };
    }
  }

  /**
   * Helper to convert a storage key to a Dropbox path (must start with /)
   */
  private toDropboxPath(key: string): string {
    if (!key || key === '/') {
      return '';
    }
    return key.startsWith('/') ? key : `/${key}`;
  }

  /**
   * Helper to convert a Dropbox path to a storage key (remove leading /)
   */
  private fromDropboxPath(path: string): string {
    if (!path) {
      return '';
    }
    return path.startsWith('/') ? path.slice(1) : path;
  }

  /**
   * Get provider capabilities specific to Dropbox
   */
  getCapabilities() {
    return {
      ...super.getCapabilities(),
      supportsMultipartUpload: false, // Dropbox has a different upload mechanism
      supportsRangeRequests: true,
      supportsServerSideEncryption: false,
      supportsVersioning: true,
      supportsFolderCreation: true,
      supportsTags: false,
      supportsMetadata: false,
      maximumFileSize: 50 * 1024 * 1024 * 1024, // 50GB for Dropbox Business
      maximumPartSize: 150 * 1024 * 1024, // 150MB for Dropbox upload session
      minimumPartSize: 4 * 1024 * 1024, // 4MB recommended
      maximumPartCount: 10000
    };
  }
}