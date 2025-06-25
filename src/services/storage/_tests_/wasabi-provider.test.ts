// src/services/storage/__tests__/wasabi-provider.test.ts
import { WasabiStorageProvider } from '../providers/wasabi-provider';
import { SignedUrlOptions, StorageOperationResult } from '../types';
import { Logger } from '../../../utils/logger';

// Mock S3Client and its methods
jest.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: jest.fn().mockImplementation(() => ({
      send: jest.fn().mockResolvedValue({
        Contents: [
          { Key: 'test-file.txt', Size: 1024, LastModified: new Date() }
        ],
        CommonPrefixes: [
          { Prefix: 'test-folder/' }
        ]
      })
    })),
    HeadObjectCommand: jest.fn(),
    ListObjectsV2Command: jest.fn(),
    PutObjectCommand: jest.fn(),
    DeleteObjectCommand: jest.fn(),
    CreateMultipartUploadCommand: jest.fn(),
    UploadPartCommand: jest.fn(),
    CompleteMultipartUploadCommand: jest.fn(),
    AbortMultipartUploadCommand: jest.fn(),
    GetObjectCommand: jest.fn()
  };
});

// Mock getSignedUrl function
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://mock-signed-url.example.com')
}));

describe('WasabiStorageProvider', () => {
  let provider: WasabiStorageProvider;
  let mockLogger: Logger;

  beforeEach(() => {
    // Create mock logger
    mockLogger = {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      createChildLogger: jest.fn().mockReturnValue({
        info: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        createChildLogger: jest.fn()
      })
    } as unknown as Logger;

    // Create provider with mock logger
    provider = new WasabiStorageProvider(mockLogger);
  });

  describe('initialize', () => {
    it('should initialize successfully with valid credentials', async () => {
      // Arrange
      const credentials = {
        accessKeyId: 'test-access-key',
        secretAccessKey: 'test-secret-key',
        region: 'us-east-1',
        endpoint: 'https://s3.wasabisys.com',
        bucket: 'test-bucket'
      };

      // Act
      const result = await provider.initialize(credentials);

      // Assert
      expect(result.success).toBe(true);
      expect(result.message).toContain('initialized successfully');
    });
  });

  describe('getSignedUrl', () => {
    it('should generate a signed URL for reading', async () => {
      // Arrange
      await provider.initialize({
        accessKeyId: 'test-access-key',
        secretAccessKey: 'test-secret-key',
        region: 'us-east-1',
        endpoint: 'https://s3.wasabisys.com',
        bucket: 'test-bucket'
      });

      const options: SignedUrlOptions = {
        operation: 'read',
        expiresIn: 3600
      };

      // Act
      const result = await provider.getSignedUrl('test-file.txt', options);

      // Assert
      expect(result.success).toBe(true);
      expect(result.url).toBe('https://mock-signed-url.example.com');
    });
  });

  describe('listFiles', () => {
    it('should list files in a directory', async () => {
      // Arrange
      await provider.initialize({
        accessKeyId: 'test-access-key',
        secretAccessKey: 'test-secret-key',
        region: 'us-east-1',
        endpoint: 'https://s3.wasabisys.com',
        bucket: 'test-bucket'
      });

      // Act
      const result = await provider.listFiles('test-folder');

      // Assert
      expect(result.success).toBe(true);
      expect(result.files).toBeDefined();
      expect(result.files?.length).toBeGreaterThan(0);
    });
  });

  // Add more tests for other methods...
});