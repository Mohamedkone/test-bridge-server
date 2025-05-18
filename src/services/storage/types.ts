// src/services/storage/types.ts

/**
 * Common response interface for all storage operations
 */
export interface StorageOperationResult {
  success: boolean;
  message?: string;
  data?: Record<string, any>;
  error?: Error;
}

/**
 * Options for generating signed URLs
 */
export interface SignedUrlOptions {
  operation: 'read' | 'write' | 'delete';
  expiresIn: number; // Seconds
  contentType?: string;
  metadata?: Record<string, string>;
  maxSizeBytes?: number;
  fileName?: string;
  contentDisposition?: string;
}

/**
 * Options for file uploads
 */
export interface UploadOptions {
  contentType?: string;
  contentDisposition?: string;
  metadata?: Record<string, string>;
  expiresAt?: Date;
  encryptionKey?: string;
  mimeType?: string;
  cacheControl?: string;
  tagging?: Record<string, string>;
}

/**
 * Options for folder creation
 */
export interface FolderOptions {
  metadata?: Record<string, string>;
  public?: boolean;
}

/**
 * Options for listing files
 */
export interface ListOptions {
  recursive?: boolean;
  maxResults?: number;
  prefix?: string;
  delimiter?: string;
  pageToken?: string;
  includeMetadata?: boolean;
  sortBy?: 'name' | 'size' | 'lastModified';
  sortDirection?: 'asc' | 'desc';
}

/**
 * Options for file deletion
 */
export interface DeleteOptions {
  recursive?: boolean;
  permanent?: boolean;
  versionId?: string;
}

/**
 * File metadata interface
 */
export interface FileMetadata {
  key: string;
  name: string;
  size: number;
  lastModified?: Date;
  contentType?: string;
  isDirectory?: boolean;
  metadata?: Record<string, string>;
  etag?: string;
  versionId?: string;
  checksum?: string;
  url?: string;
  permissions?: string[];
  owner?: string;
  tags?: Record<string, string>;
}

/**
 * Storage provider capabilities and limitations
 */
export interface StorageProviderCapabilities {
  supportsMultipartUpload: boolean;
  supportsRangeRequests: boolean;
  supportsServerSideEncryption: boolean;
  supportsVersioning: boolean;
  supportsFolderCreation: boolean;
  supportsTags: boolean;
  supportsMetadata: boolean;
  maximumFileSize: number; // bytes, 0 for unlimited
  maximumPartSize: number; // bytes, for multipart uploads
  minimumPartSize: number; // bytes, for multipart uploads
  maximumPartCount: number; // maximum number of parts in multipart upload
  validContentTypes?: string[]; // null/undefined for all
}

/**
 * Storage usage statistics
 */
export interface StorageStats {
  totalBytes: number;
  usedBytes: number;
  availableBytes: number;
  fileCount: number;
  lastUpdated: Date;
  usageByType?: Record<string, number>; // Bytes used by file type
  costEstimate?: number; // Estimated cost in USD
}

/**
 * Storage provider types
 */
export type StorageProviderType = 
  | 'vault'    // Internal storage
  | 's3'       // AWS S3
  | 'google_drive'
  | 'dropbox'
  | 'azure_blob'
  | 'gcp_storage';

/**
 * Interface for all storage provider operations
 */
export interface StorageProvider {
  /**
   * Initialize the storage provider with credentials
   * @param credentials Provider-specific credentials
   * @returns Operation result
   */
  initialize(credentials: any): Promise<StorageOperationResult>;
  
  /**
   * Test the connection to the storage provider
   * @returns Operation result indicating connection status
   */
  testConnection(): Promise<StorageOperationResult>;
  
  /**
   * Generate a signed URL for direct client operations
   * @param key Object key or path
   * @param options Options including operation type, expiry time, etc.
   * @returns Operation result with signed URL if successful
   */
  getSignedUrl(key: string, options: SignedUrlOptions): Promise<StorageOperationResult & { url?: string }>;
  
  /**
   * Create a folder in the storage
   * @param path Parent path
   * @param folderName Name of the new folder
   * @param options Additional options
   * @returns Operation result with folder metadata
   */
  createFolder(path: string, folderName: string, options?: FolderOptions): Promise<StorageOperationResult>;
  
  /**
   * List files in a directory
   * @param path Directory path
   * @param options Listing options (recursive, pagination, etc.)
   * @returns Operation result with file list
   */
  listFiles(path: string, options?: ListOptions): Promise<StorageOperationResult & { files?: FileMetadata[] }>;
  
  /**
   * Get metadata for a file
   * @param key Object key or path
   * @returns Operation result with file metadata
   */
  getFileMetadata(key: string): Promise<StorageOperationResult & { metadata?: FileMetadata }>;
  
  /**
   * Delete a file or folder
   * @param key Object key or path
   * @param options Deletion options
   * @returns Operation result
   */
  deleteFile(key: string, options?: DeleteOptions): Promise<StorageOperationResult>;
  
  /**
   * Check if a file exists
   * @param key Object key or path
   * @returns Operation result with existence flag
   */
  fileExists(key: string): Promise<StorageOperationResult & { exists?: boolean }>;
  
  /**
   * Create a multipart upload session for large files
   * @param key Object key or path
   * @param options Upload options
   * @returns Operation result with upload ID and part information
   */
  createMultipartUpload(key: string, options?: UploadOptions): Promise<StorageOperationResult & { uploadId?: string }>;
  
  /**
   * Get signed URL for uploading a specific part
   * @param key Object key or path
   * @param uploadId Multipart upload ID
   * @param partNumber Part number
   * @param contentLength Expected content length
   * @returns Operation result with signed URL for part upload
   */
  getSignedUrlForPart(key: string, uploadId: string, partNumber: number, contentLength: number): Promise<StorageOperationResult & { url?: string }>;
  
  /**
   * Complete a multipart upload
   * @param key Object key or path
   * @param uploadId Multipart upload ID
   * @param parts Information about uploaded parts
   * @returns Operation result
   */
  completeMultipartUpload(key: string, uploadId: string, parts: any[]): Promise<StorageOperationResult>;
  
  /**
   * Abort a multipart upload
   * @param key Object key or path
   * @param uploadId Multipart upload ID
   * @returns Operation result
   */
  abortMultipartUpload(key: string, uploadId: string): Promise<StorageOperationResult>;
  
  /**
   * Get provider capabilities and limitations
   * @returns Provider capabilities object
   */
  getCapabilities(): StorageProviderCapabilities;
  
  /**
   * Get storage usage statistics
   * @returns Operation result with storage statistics
   */
  getStorageStats(): Promise<StorageOperationResult & { stats?: StorageStats }>;
}

/**
 * Factory for creating storage provider instances
 */
export interface StorageProviderFactory {
  /**
   * Create a storage provider instance
   * @param type Storage provider type
   * @param credentials Provider-specific credentials
   * @returns StorageProvider instance or null if type is not supported
   */
  createProvider(type: StorageProviderType, credentials?: any): StorageProvider | null;
  
  /**
   * Get available provider types
   * @returns List of supported provider types
   */
  getAvailableProviders(): StorageProviderType[];
  
  /**
   * Register a new provider implementation
   * @param type Provider type
   * @param providerClass Provider implementation class
   */
  registerProvider(type: StorageProviderType, providerClass: new () => StorageProvider): void;
}