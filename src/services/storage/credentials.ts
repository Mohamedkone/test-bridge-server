// src/services/storage/credentials.ts

/**
 * Wasabi credentials
 */
export interface WasabiCredentials {
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
    endpoint: string;
    bucket: string;
  }
  
  /**
   * Storj credentials
   */
  export interface StorjCredentials {
    accessKey: string;
    secretKey: string;
    bucket: string;
    endpoint: string;
    satelliteURL?: string;
  }
  
  /**
   * AWS S3 credentials
   */
  export interface AwsS3Credentials {
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
    bucket: string;
    endpoint?: string; // Optional custom endpoint
  }
  
  /**
   * Google Drive credentials
   */
  export interface GoogleDriveCredentials {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
    accessToken?: string;
    expiryDate?: number;
  }
  
  /**
   * Dropbox credentials
   */
  export interface DropboxCredentials {
    accessToken: string;
    refreshToken?: string;
    appKey: string;
    appSecret: string;
  }
  
  /**
   * Azure Blob Storage credentials
   */
  export interface AzureBlobCredentials {
    accountName: string;
    accountKey: string;
    containerName: string;
    connectionString?: string;
  }
  
  /**
   * OneDrive credentials
   */
  export interface OneDriveCredentials {
    clientId: string;
    clientSecret: string;
    tenantId: string;
    refreshToken: string;
    accessToken?: string;
    expiryDate?: number;
  }
  
  /**
   * Google Cloud Storage credentials
   */
  export interface GcpStorageCredentials {
    projectId: string;
    keyFilename?: string;
    credentials?: {
      client_email: string;
      private_key: string;
    };
    bucket: string;
  }
  
  /**
   * Generic S3-compatible storage credentials
   */
  export interface S3CompatibleCredentials {
    accessKeyId: string;
    secretAccessKey: string;
    endpoint: string;
    bucket: string;
    region?: string;
    forcePathStyle?: boolean;
  }