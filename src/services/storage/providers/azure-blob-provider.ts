// src/services/storage/providers/azure-blob-provider.ts
import { BlobServiceClient, ContainerClient, StorageSharedKeyCredential, BlobClient, BlobSASPermissions } from '@azure/storage-blob';
import { injectable, inject } from 'inversify';
import { BaseStorageProvider } from '../base-provider';
import { Logger } from '../../../utils/logger';
import { StorageOperationResult, SignedUrlOptions, FolderOptions, ListOptions, DeleteOptions, UploadOptions, FileMetadata, StorageStats } from '../types';
import { AzureBlobCredentials } from '../credentials';
import { StorageAuthError, StorageNotFoundError, StorageAccessError, StorageProviderError } from '../errors';

@injectable()
export class AzureBlobStorageProvider extends BaseStorageProvider {
  private blobServiceClient?: BlobServiceClient;
  private containerClient?: ContainerClient;
  private containerName?: string;
  
  constructor(@inject('Logger') logger: Logger) {
    super(logger, 'azure-blob');
  }
  
  /**
   * Initialize the Azure Blob Storage provider with credentials
   * @param credentials Azure Blob Storage credentials
   */
  async initialize(credentials: AzureBlobCredentials): Promise<StorageOperationResult> {
    try {
      this.logger.info('Initializing Azure Blob Storage provider');
      
      // Create a BlobServiceClient
      let blobServiceClient: BlobServiceClient;
      
      if (credentials.connectionString) {
        // Create from connection string if provided
        blobServiceClient = BlobServiceClient.fromConnectionString(credentials.connectionString);
      } else {
        // Create from account name and key
        const sharedKeyCredential = new StorageSharedKeyCredential(
          credentials.accountName, 
          credentials.accountKey
        );
        
        blobServiceClient = new BlobServiceClient(
          `https://${credentials.accountName}.blob.core.windows.net`,
          sharedKeyCredential
        );
      }
      
      this.blobServiceClient = blobServiceClient;
      this.containerName = credentials.containerName;
      this.containerClient = blobServiceClient.getContainerClient(credentials.containerName);
      
      // Make sure the container exists
      await this.containerClient.createIfNotExists();
      
      this.credentials = credentials;
      this.initialized = true;
      
      this.logger.info('Azure Blob Storage provider initialized');
      return {
        success: true,
        message: 'Azure Blob Storage provider initialized successfully'
      };
    } catch (error: any) {
      this.logger.error('Failed to initialize Azure Blob Storage provider', { error });
      return {
        success: false,
        message: 'Failed to initialize Azure Blob Storage provider',
        error: new StorageAuthError('Azure Blob Storage', error)
      };
    }
  }
  
  /**
   * Test the connection to Azure Blob Storage
   */
  async testConnection(): Promise<StorageOperationResult> {
    try {
      this.validateInitialized();
      
      // Try to get properties to verify connection
      await this.containerClient!.getProperties();
      
      return {
        success: true,
        message: 'Connection to Azure Blob Storage successful'
      };
    } catch (error: any) {
      this.logger.error('Failed to connect to Azure Blob Storage', { error });
      return {
        success: false,
        message: 'Failed to connect to Azure Blob Storage',
        error: new StorageAuthError('Azure Blob Storage', error)
      };
    }
  }
  
  /**
   * Generate a signed URL for direct client operations
   */
  async getSignedUrl(key: string, options: SignedUrlOptions): Promise<StorageOperationResult & { url?: string }> {
    try {
      this.validateInitialized();
      
      const blobClient = this.containerClient!.getBlobClient(key);
      
      // Create start and expiry time
      const startsOn = new Date();
      const expiresOn = new Date(Date.now() + (options.expiresIn || 3600) * 1000);
      
      let url: string;
      
      if (options.operation === 'read') {
        // Generate SAS URL for reading
        const permissions = new BlobSASPermissions();
        permissions.read = true;
        
        const sasOptions = {
          permissions,
          startsOn,
          expiresOn
        };
        
        url = await blobClient.generateSasUrl(sasOptions);
      } else if (options.operation === 'write') {
        // Generate SAS URL for writing
        const permissions = new BlobSASPermissions();
        permissions.write = true;
        permissions.create = true;
        
        const sasOptions = {
          permissions,
          startsOn,
          expiresOn,
          contentType: options.contentType
        };
        
        url = await blobClient.generateSasUrl(sasOptions);
      } else {
        throw new Error(`Unsupported operation: ${options.operation}`);
      }
      
      return {
        success: true,
        url,
        message: `URL generated successfully for ${options.operation} operation`
      };
    } catch (error: any) {
      this.logger.error('Failed to generate signed URL', { key, operation: options.operation, error });
      return {
        success: false,
        message: `Failed to generate signed URL for ${options.operation} operation`,
        error: new StorageProviderError('Azure Blob Storage', 'getSignedUrl', error)
      };
    }
  }
  
  /**
   * Create a folder in Azure Blob Storage
   * Note: Azure Blob Storage doesn't have a concept of folders,
   * but we can simulate them with empty blobs ending in "/"
   */
  async createFolder(path: string, folderName: string, options?: FolderOptions): Promise<StorageOperationResult> {
    try {
      this.validateInitialized();
      
      // Generate folder key (end with slash to simulate folder)
      const folderKey = this.generateStorageKey(path, folderName) + '/';
      
      // Create empty blob
      const blockBlobClient = this.containerClient!.getBlockBlobClient(folderKey);
      await blockBlobClient.upload('', 0);
      
      // Add metadata if provided
      if (options?.metadata) {
        await blockBlobClient.setMetadata(options.metadata);
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
        error: new StorageProviderError('Azure Blob Storage', 'createFolder', error)
      };
    }
  }
  
  /**
   * List files in a directory
   */
  async listFiles(path: string, options?: ListOptions): Promise<StorageOperationResult & { files?: FileMetadata[] }> {
    try {
      this.validateInitialized();
      
      // Normalize path for Azure (ensure it ends with slash if not empty)
      let prefix = path;
      if (prefix && !prefix.endsWith('/')) {
        prefix += '/';
      }
      
      const files: FileMetadata[] = [];
      
      // If recursive is false, use delimiter to simulate folder structure
      const delimiter = options?.recursive ? undefined : '/';
      
      // List blobs with the specified prefix
      const listOptions = {
        prefix,
        includeMetadata: true
      };
      
      // If using delimiter, get both "directories" and files
      if (delimiter) {
        // First get "directories" (common prefixes)
        for await (const item of this.containerClient!.listBlobsByHierarchy(delimiter, listOptions)) {
          if (item.kind === 'prefix') {
            // This is a "directory"
            const folderName = item.name.substr(prefix.length).split('/')[0];
            
            files.push({
              key: item.name,
              name: folderName,
              size: 0,
              isDirectory: true,
              lastModified: new Date()
            });
          } else {
            // This is a file
            // Skip the folder marker itself
            if (item.name === prefix) continue;
            
            const fileName = item.name.split('/').pop() || '';
            
            files.push({
              key: item.name,
              name: fileName,
              size: item.properties.contentLength || 0,
              lastModified: item.properties.lastModified,
              contentType: item.properties.contentType,
              etag: item.properties.etag?.replace(/"/g, ''),
              metadata: item.metadata,
              isDirectory: false
            });
          }
        }
      } else {
        // Recursive listing - just get all blobs
        for await (const item of this.containerClient!.listBlobsFlat(listOptions)) {
          // Skip the folder marker itself
          if (item.name === prefix) continue;
          
          // Check if it's a folder marker (ends with /)
          const isFolder = item.name.endsWith('/');
          const name = isFolder 
            ? item.name.slice(prefix.length, -1).split('/').pop() || '' 
            : item.name.split('/').pop() || '';
          
          files.push({
            key: item.name,
            name,
            size: item.properties.contentLength || 0,
            lastModified: item.properties.lastModified,
            contentType: item.properties.contentType,
            etag: item.properties.etag?.replace(/"/g, ''),
            metadata: item.metadata,
            isDirectory: isFolder
          });
        }
      }
      
      return {
        success: true,
        files
      };
    } catch (error: any) {
      this.logger.error('Failed to list files', { path, error });
      return {
        success: false,
        message: 'Failed to list files',
        error: new StorageProviderError('Azure Blob Storage', 'listFiles', error)
      };
    }
  }
  
  /**
   * Get metadata for a file
   */
  async getFileMetadata(key: string): Promise<StorageOperationResult & { metadata?: FileMetadata }> {
    try {
      this.validateInitialized();
      
      const blobClient = this.containerClient!.getBlobClient(key);
      
      try {
        // Get blob properties
        const properties = await blobClient.getProperties();
        
        const metadata: FileMetadata = {
          key,
          name: this.getFileNameFromKey(key),
          size: properties.contentLength || 0,
          lastModified: properties.lastModified || new Date(),
          contentType: properties.contentType,
          etag: properties.etag?.replace(/"/g, ''),
          metadata: properties.metadata,
          isDirectory: key.endsWith('/')
        };
        
        return {
          success: true,
          metadata
        };
      } catch (error: any) {
        // Check if it's a not found error
        if (error.statusCode === 404) {
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
        error: new StorageProviderError('Azure Blob Storage', 'getFileMetadata', error)
      };
    }
  }
  
  /**
   * Delete a file or folder
   */
  async deleteFile(key: string, options?: DeleteOptions): Promise<StorageOperationResult> {
    try {
      this.validateInitialized();
      
      // Check if key ends with slash (folder)
      const isFolder = key.endsWith('/');
      
      if (isFolder && options?.recursive) {
        // List all blobs with this prefix and delete them
        const listResult = await this.listFiles(key, { recursive: true });
        
        if (!listResult.success) {
          throw new Error('Failed to list folder contents for deletion');
        }
        
        // Delete all files in the folder
        if (listResult.files && listResult.files.length > 0) {
          for (const file of listResult.files) {
            const blobClient = this.containerClient!.getBlobClient(file.key);
            await blobClient.delete();
          }
        }
        
        // Delete the folder marker itself
        const blobClient = this.containerClient!.getBlobClient(key);
        await blobClient.delete();
        
        return {
          success: true,
          message: 'Folder and contents deleted successfully'
        };
      } else {
        // Just delete the blob
        const blobClient = this.containerClient!.getBlobClient(key);
        await blobClient.delete();
        
        return {
          success: true,
          message: `${isFolder ? 'Folder' : 'File'} deleted successfully`
        };
      }
    } catch (error: any) {
      this.logger.error('Failed to delete file', { key, error });
      
      // Check if it's a not found error
      if (error.statusCode === 404) {
        return {
          success: false,
          message: `File not found: ${key}`,
          error: new StorageNotFoundError(key)
        };
      }
      
      return {
        success: false,
        message: 'Failed to delete file',
        error: new StorageProviderError('Azure Blob Storage', 'deleteFile', error)
      };
    }
  }
  
  /**
   * Check if a file exists
   */
  async fileExists(key: string): Promise<StorageOperationResult & { exists?: boolean }> {
    try {
      this.validateInitialized();
      
      const blobClient = this.containerClient!.getBlobClient(key);
      const exists = await blobClient.exists();
      
      return {
        success: true,
        exists
      };
    } catch (error: any) {
      this.logger.error('Failed to check if file exists', { key, error });
      return {
        success: false,
        message: 'Failed to check if file exists',
        error: new StorageProviderError('Azure Blob Storage', 'fileExists', error)
      };
    }
  }
  
  /**
   * Create a multipart upload session for large files
   * Note: Azure uses a different approach with block blobs
   */
  async createMultipartUpload(key: string, options?: UploadOptions): Promise<StorageOperationResult & { uploadId?: string }> {
    try {
      this.validateInitialized();
      
      // Azure doesn't have the concept of "creating" a multipart upload
      // We'll just generate a unique ID for tracking
      const uploadId = Math.random().toString(36).substring(2, 15);
      
      // Store the key and options for later
      const uploadInfo = {
        key,
        uploadId,
        options
      };
      
      return {
        success: true,
        uploadId,
        message: 'Block blob upload session initialized',
        data: {
          uploadInfo
        }
      };
    } catch (error: any) {
      this.logger.error('Failed to create multipart upload', { key, error });
      return {
        success: false,
        message: 'Failed to create multipart upload',
        error: new StorageProviderError('Azure Blob Storage', 'createMultipartUpload', error)
      };
    }
  }
  
  /**
   * Get signed URL for uploading a specific part
   */
  async getSignedUrlForPart(key: string, uploadId: string, partNumber: number, contentLength: number): Promise<StorageOperationResult & { url?: string }> {
    try {
      this.validateInitialized();
      
      const blobClient = this.containerClient!.getBlobClient(key);
      const blockBlobClient = blobClient.getBlockBlobClient();
      
      // In Azure, we use block IDs that are base64 encoded strings
      const blockId = Buffer.from(`${uploadId}_${partNumber}`.padStart(64, '0')).toString('base64');
      
      // Generate SAS token with write permission
      const permissions = new BlobSASPermissions();
      permissions.write = true;
      
      const sasOptions = {
        permissions,
        startsOn: new Date(),
        expiresOn: new Date(Date.now() + 3600 * 1000) // 1 hour
      };
      
      const url = await blockBlobClient.generateSasUrl(sasOptions);
      
      // Return upload URL and block ID
      return {
        success: true,
        url,
        data: {
          blockId,
          partNumber
        },
        message: `URL generated for block ${partNumber}`
      };
    } catch (error: any) {
      this.logger.error('Failed to generate signed URL for part', { key, uploadId, partNumber, error });
      return {
        success: false,
        message: 'Failed to generate signed URL for part',
        error: new StorageProviderError('Azure Blob Storage', 'getSignedUrlForPart', error)
      };
    }
  }
  
  /**
   * Complete a multipart upload
   */
  async completeMultipartUpload(key: string, uploadId: string, parts: any[]): Promise<StorageOperationResult> {
    try {
      this.validateInitialized();
      
      const blobClient = this.containerClient!.getBlobClient(key);
      const blockBlobClient = blobClient.getBlockBlobClient();
      
      // Sort parts by part number
      parts.sort((a, b) => a.PartNumber - b.PartNumber);
      
      // Extract block IDs
      const blockIds = parts.map(part => part.blockId || Buffer.from(`${uploadId}_${part.PartNumber}`.padStart(64, '0')).toString('base64'));
      
      // Commit the blocks
      await blockBlobClient.commitBlockList(blockIds);
      
      return {
        success: true,
        message: 'Block blob upload completed successfully'
      };
    } catch (error: any) {
      this.logger.error('Failed to complete multipart upload', { key, uploadId, error });
      return {
        success: false,
        message: 'Failed to complete multipart upload',
        error: new StorageProviderError('Azure Blob Storage', 'completeMultipartUpload', error)
      };
    }
  }
  
  /**
   * Abort a multipart upload
   */
  async abortMultipartUpload(key: string, uploadId: string): Promise<StorageOperationResult> {
    // Azure doesn't have a concept of aborting an upload
    // Uncommitted blocks will eventually be garbage collected
    return {
      success: true,
      message: 'Upload aborted (uncommitted blocks will expire automatically)'
    };
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
      
      // Iterate through all blobs
      for await (const item of this.containerClient!.listBlobsFlat()) {
        totalSize += item.properties.contentLength || 0;
        fileCount++;
      }
      
      const stats: StorageStats = {
        totalBytes: 0, // We don't know the total capacity
        usedBytes: totalSize,
        availableBytes: 0, // Unknown
        fileCount,
        lastUpdated: new Date(),
        usageByType: {}, // We would need to scan all objects to calculate this
        costEstimate: (totalSize / (1024 * 1024 * 1024)) * 0.018 // Azure Blob Storage LRS cost ($0.018 per GB)
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
        error: new StorageProviderError('Azure Blob Storage', 'getStorageStats', error)
      };
    }
  }
  
  /**
   * Get file content with optional range support
   */
  async getFileContent(key: string, range?: { start: number; end: number }): Promise<StorageOperationResult & { data?: Buffer }> {
    try {
      this.validateInitialized();
      
      const blobClient = this.containerClient!.getBlobClient(key);
      
      try {
        // Download options with optional range
        const downloadOptions = range ? {
          rangeStart: range.start,
          rangeEnd: range.end
        } : undefined;
        
        // Download the blob
        const downloadResponse = await blobClient.download(
          range ? range.start : 0,
          range ? (range.end - range.start + 1) : undefined
        );
        
        if (!downloadResponse.readableStreamBody) {
          throw new Error('No readable stream in response');
        }
        
        // Convert stream to buffer
        const chunks: Buffer[] = [];
        const stream = downloadResponse.readableStreamBody;
        
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
      } catch (error: any) {
        // Check if the error is because the blob doesn't exist
        if (error.statusCode === 404) {
          throw new StorageNotFoundError('Azure Blob Storage', key);
        }
        throw error;
      }
    } catch (error: any) {
      this.logger.error('Failed to get file content', { key, range, error });
      
      if (error instanceof StorageNotFoundError) {
        throw error;
      }
      
      throw new StorageProviderError('Azure Blob Storage', 'getFileContent', error);
    }
  }
  
  /**
   * Get provider capabilities
   */
  getCapabilities() {
    return {
      ...super.getCapabilities(),
      supportsMultipartUpload: true, // Via block blobs
      supportsRangeRequests: true,
      supportsServerSideEncryption: true,
      supportsVersioning: false, // Basic Azure Blob Storage doesn't support versioning
      supportsFolderCreation: true, // Via virtual folders
      supportsTags: true,
      supportsMetadata: true,
      maximumFileSize: 5 * 1024 * 1024 * 1024 * 1024, // 5TB for Azure blocks
      maximumPartSize: 4000 * 1024 * 1024, // 4000MB (Azure has a 50,000 block limit)
      minimumPartSize: 1 * 1024 * 1024, // 1MB
      maximumPartCount: 50000 // Azure block limit
    };
  }
}