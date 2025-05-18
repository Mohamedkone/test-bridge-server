// src/services/storage/__tests__/factory.test.ts
import { StorageProviderFactoryImpl } from '../factory';
import { StorageProvider, StorageProviderType } from '../types';
import { Logger } from '../../../utils/logger';

describe('StorageProviderFactory', () => {
  let factory: StorageProviderFactoryImpl;
  let mockLogger: Logger;
  
  // Mock provider class
  class MockProvider implements StorageProvider {
    initialize = jest.fn().mockResolvedValue({ success: true });
    testConnection = jest.fn().mockResolvedValue({ success: true });
    getSignedUrl = jest.fn().mockResolvedValue({ success: true, url: 'https://example.com/signed' });
    createFolder = jest.fn().mockResolvedValue({ success: true });
    listFiles = jest.fn().mockResolvedValue({ success: true, files: [] });
    getFileMetadata = jest.fn().mockResolvedValue({ success: true, metadata: {} });
    deleteFile = jest.fn().mockResolvedValue({ success: true });
    fileExists = jest.fn().mockResolvedValue({ success: true, exists: true });
    createMultipartUpload = jest.fn().mockResolvedValue({ success: true, uploadId: 'test-id' });
    getSignedUrlForPart = jest.fn().mockResolvedValue({ success: true, url: 'https://example.com/part' });
    completeMultipartUpload = jest.fn().mockResolvedValue({ success: true });
    abortMultipartUpload = jest.fn().mockResolvedValue({ success: true });
    getCapabilities = jest.fn().mockReturnValue({
      supportsMultipartUpload: true,
      supportsRangeRequests: true,
      supportsServerSideEncryption: false,
      supportsVersioning: false,
      supportsFolderCreation: true,
      supportsTags: false,
      supportsMetadata: true,
      maximumFileSize: 5 * 1024 * 1024 * 1024,
      maximumPartSize: 100 * 1024 * 1024,
      minimumPartSize: 5 * 1024 * 1024,
      maximumPartCount: 10000
    });
    getStorageStats = jest.fn().mockResolvedValue({ 
      success: true, 
      stats: {
        totalBytes: 1000000,
        usedBytes: 500000,
        availableBytes: 500000,
        fileCount: 10,
        lastUpdated: new Date()
      }
    });
  }
  
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
        error: jest.fn()
      })
    } as unknown as Logger;
    
    // Create factory with mock logger
    factory = new StorageProviderFactoryImpl(mockLogger);
  });
  
  describe('registerProvider', () => {
    it('should register a provider successfully', () => {
      // Act
      factory.registerProvider('test-provider' as StorageProviderType, MockProvider as any);
      const providers = factory.getAvailableProviders();
      
      // Assert
      expect(providers).toContain('test-provider');
      expect(mockLogger.createChildLogger).toHaveBeenCalledWith('StorageProviderFactory');
    });
    
    it('should allow registering multiple providers', () => {
      // Act
      factory.registerProvider('provider1' as StorageProviderType, MockProvider as any);
      factory.registerProvider('provider2' as StorageProviderType, MockProvider as any);
      const providers = factory.getAvailableProviders();
      
      // Assert
      expect(providers).toContain('provider1');
      expect(providers).toContain('provider2');
      expect(providers.length).toBe(2);
    });
  });
  
  describe('createProvider', () => {
    it('should create a provider instance for registered type', () => {
      // Arrange
      factory.registerProvider('test-provider' as StorageProviderType, MockProvider as any);
      
      // Act
      const provider = factory.createProvider('test-provider' as StorageProviderType);
      
      // Assert
      expect(provider).toBeInstanceOf(MockProvider);
    });
    
    it('should return null for unregistered provider type', () => {
      // Act
      const provider = factory.createProvider('unregistered' as StorageProviderType);
      
      // Assert
      expect(provider).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('No provider registered'));
    });
    
    it('should initialize provider if credentials are provided', async () => {
      // Arrange
      factory.registerProvider('test-provider' as StorageProviderType, MockProvider as any);
      const credentials = { key: 'value' };
      
      // Act
      const provider = factory.createProvider('test-provider' as StorageProviderType, credentials);
      
      // Assert
      expect(provider).toBeInstanceOf(MockProvider);
      // Check if initialize was called (we need to wait for the promise to resolve)
      await new Promise(process.nextTick);
      expect((provider as MockProvider).initialize).toHaveBeenCalledWith(credentials);
    });
    
    it('should handle errors when creating provider', () => {
      // Arrange
      class BrokenProvider {
        constructor() {
          throw new Error('Failed to construct');
        }
      }
      
      factory.registerProvider('broken' as StorageProviderType, BrokenProvider as any);
      
      // Act
      const provider = factory.createProvider('broken' as StorageProviderType);
      
      // Assert
      expect(provider).toBeNull();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error creating provider'),
        expect.objectContaining({ error: expect.any(Error) })
      );
    });
  });
  
  describe('getAvailableProviders', () => {
    it('should return empty array when no providers registered', () => {
      // Act
      const providers = factory.getAvailableProviders();
      
      // Assert
      expect(providers).toEqual([]);
    });
    
    it('should return all registered provider types', () => {
      // Arrange
      factory.registerProvider('type1' as StorageProviderType, MockProvider as any);
      factory.registerProvider('type2' as StorageProviderType, MockProvider as any);
      factory.registerProvider('type3' as StorageProviderType, MockProvider as any);
      
      // Act
      const providers = factory.getAvailableProviders();
      
      // Assert
      expect(providers).toEqual(['type1', 'type2', 'type3']);
    });
  });
});