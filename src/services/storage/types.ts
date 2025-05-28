// src/services/storage/types.ts
import { BaseStorageProvider } from './base-provider';

/**
 * Common response interface for all storage operations
 */
export interface StorageOperationResult {
  success: boolean;
  message?: string;
  data?: Record<string, any>;
  error?: any;
}

/**
 * Progress information for uploads and downloads
 */
export interface ProgressInfo {
  bytes: number;       // Current bytes processed
  totalBytes: number;  // Total bytes to process
  percent: number;     // Progress percentage (0-100)
}

/**
 * Callback for progress updates
 */
export type ProgressCallback = (progress: ProgressInfo) => void;

/**
 * Options for generating signed URLs
 */
export interface SignedUrlOptions {
  operation: 'read' | 'write' | 'delete';
  expiresIn?: number;
  contentType?: string;
  responseContentDisposition?: string;
  acl?: {
    public?: boolean;
    [key: string]: any;
  };
}

/**
 * Options for file uploads
 */
export interface UploadOptions {
  contentType?: string;
  metadata?: Record<string, string>;
  contentDisposition?: string;
  cacheControl?: string;
  contentLength?: number;
  onProgress?: ProgressCallback;
}

/**
 * Options for folder creation
 */
export interface FolderOptions {
  metadata?: Record<string, string>;
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
}

/**
 * Options for file deletion
 */
export interface DeleteOptions {
  recursive?: boolean;
  versionId?: string;
}

/**
 * File metadata interface
 */
export interface FileMetadata {
  key: string;
  name: string;
  size: number;
  lastModified: Date;
  contentType?: string;
  isDirectory: boolean;
  metadata?: Record<string, any>;
  etag?: string;
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
  maximumFileSize: number;
  maximumPartSize: number;
  minimumPartSize: number;
  maximumPartCount: number;
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
  usageByType: Record<string, number>;
  costEstimate: number;
}

/**
 * Available storage provider types
 */
export type StorageProviderType = 'google_drive' | 'dropbox' | 's3' | 'vault' | 'gcp_storage' | 'azure_blob' | 'cloud';

export interface StorageCredentials {
  type: string;
  [key: string]: any;
}

export interface GoogleDriveCredentials extends StorageCredentials {
  type: 'google_drive';
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  accessToken?: string;
  expiryDate?: string;
}

export interface DropboxCredentials extends StorageCredentials {
  type: 'dropbox';
  accessToken: string;
  appKey: string;
  appSecret: string;
}

export interface S3Credentials extends StorageCredentials {
  type: 's3';
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  bucket: string;
  endpoint?: string;
}

export type StorageProvider = BaseStorageProvider;

export interface StorageProviderFactory {
  createProvider(type: StorageProviderType, credentials?: StorageCredentials): StorageProvider | null;
}