// src/repositories/__tests__/storage-account.repository.test.ts
import { StorageAccountRepositoryImpl } from '../storage-account.repository.impl';
import { Logger } from '../../utils/logger';
import { StorageProviderType } from '../../services/storage/types';

// Mock DrizzleClient
const mockDb = {
  select: jest.fn().mockReturnThis(),
  from: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  values: jest.fn().mockResolvedValue({ rowsAffected: 1 }),
  update: jest.fn().mockReturnThis(),
  set: jest.fn().mockResolvedValue({ rowsAffected: 1 }),
  delete: jest.fn().mockResolvedValue({ rowsAffected: 1 })
};

// Mock encryption utils
jest.mock('../../utils/encryption', () => ({
  encryptData: jest.fn().mockImplementation(async (data) => `encrypted:${data}`),
  decryptData: jest.fn().mockImplementation(async (data) => data.replace('encrypted:', ''))
}));

describe('StorageAccountRepository', () => {
  let repository: StorageAccountRepositoryImpl;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

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
    } as unknown as jest.Mocked<Logger>;

    // Create repository with mock db and logger
    repository = new StorageAccountRepositoryImpl(mockDb as any, mockLogger);
  });

  describe('findById', () => {
    it('should return a storage account when found', async () => {
      // Arrange
      const mockStorageAccount = {
        id: 'test-id',
        name: 'Test Storage',
        companyId: 'company-id',
        storageType: 'wasabi' as StorageProviderType,
        isDefault: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockDb.select.mockReturnThis();
      mockDb.from.mockReturnThis();
      mockDb.where.mockReturnThis();
      mockDb.limit.mockResolvedValue([mockStorageAccount]);

      // Act
      const result = await repository.findById('test-id');

      // Assert
      expect(result).toEqual(mockStorageAccount);
      expect(mockDb.select).toHaveBeenCalled();
      expect(mockDb.from).toHaveBeenCalled();
      expect(mockDb.where).toHaveBeenCalled();
      expect(mockDb.limit).toHaveBeenCalledWith(1);
    });

    it('should return null when storage account not found', async () => {
      // Arrange
      mockDb.select.mockReturnThis();
      mockDb.from.mockReturnThis();
      mockDb.where.mockReturnThis();
      mockDb.limit.mockResolvedValue([]);

      // Act
      const result = await repository.findById('non-existent-id');

      // Assert
      expect(result).toBeNull();
    });
  });

  // Add more test cases for the other methods...
});