// src/repositories/storage-account.repository.impl.ts
import { injectable, inject } from 'inversify';
import { eq, and, SQL, sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { DrizzleClient } from '../db/client';
import { storageAccounts, storageCredentials } from '../db/schema';
import { StorageAccountRepository, StorageAccount } from './storage-account.repository';
import { Logger } from '../utils/logger';
import { NotFoundError } from '../utils/errors';
import { StorageError } from '../services/storage/errors';
import { encryptData, decryptData } from '../utils/encryption';
import { StorageProviderType } from '../services/storage/types';

interface DeleteResult {
    rowsAffected?: number;
}

@injectable()
export class StorageAccountRepositoryImpl implements StorageAccountRepository {
  constructor(
    @inject('DrizzleClient') private readonly db: DrizzleClient,
    @inject('Logger') private readonly logger: Logger
  ) {
    this.logger = logger.createChildLogger('StorageAccountRepository');
  }

  async findById(id: string): Promise<StorageAccount | null> {
    try {
      const results = await this.db.select()
        .from(storageAccounts)
        .where(eq(storageAccounts.id, id))
        .limit(1);
      
      if (results.length === 0) return null;
      
      // Map to StorageAccount type
      return {
        id: results[0].id,
        name: results[0].name,
        companyId: results[0].companyId,
        storageType: results[0].storageType as StorageProviderType,
        isDefault: results[0].isDefault,
        createdAt: results[0].createdAt,
        updatedAt: results[0].updatedAt
      };
    } catch (error: any) {
      this.logger.error('Error finding storage account by ID', { id, error: error.message });
      throw error;
    }
  }

  async findByCompanyId(companyId: string): Promise<StorageAccount[]> {
    try {
      const results = await this.db.select()
        .from(storageAccounts)
        .where(eq(storageAccounts.companyId, companyId));
      
      // Map to StorageAccount type
      return results.map(result => ({
        id: result.id,
        name: result.name,
        companyId: result.companyId,
        storageType: result.storageType as StorageProviderType,
        isDefault: result.isDefault,
        createdAt: result.createdAt,
        updatedAt: result.updatedAt
      }));
    } catch (error: any) {
      this.logger.error('Error finding storage accounts by company ID', { companyId, error: error.message });
      throw error;
    }
  }

  async findDefaultForCompany(companyId: string): Promise<StorageAccount | null> {
    try {
      const results = await this.db.select()
        .from(storageAccounts)
        .where(
          and(
            eq(storageAccounts.companyId, companyId),
            eq(storageAccounts.isDefault, true)
          )
        )
        .limit(1);
      
      if (results.length === 0) return null;
      
      // Map to StorageAccount type
      return {
        id: results[0].id,
        name: results[0].name,
        companyId: results[0].companyId,
        storageType: results[0].storageType as StorageProviderType,
        isDefault: results[0].isDefault,
        createdAt: results[0].createdAt,
        updatedAt: results[0].updatedAt
      };
    } catch (error: any) {
      this.logger.error('Error finding default storage account', { companyId, error: error.message });
      throw error;
    }
  }

  async create(data: Omit<StorageAccount, 'id' | 'createdAt' | 'updatedAt'>): Promise<StorageAccount> {
    try {
      const now = new Date();
      const storageId = uuidv4();

      const newStorageAccount = {
        id: storageId,
        name: data.name,
        companyId: data.companyId,
        storageType: data.storageType,
        isDefault: data.isDefault,
        createdAt: now,
        updatedAt: now
      };

      // If setting as default, unset any existing default
      if (data.isDefault) {
        await this.db.update(storageAccounts)
          .set({ isDefault: false })
          .where(
            and(
              eq(storageAccounts.companyId, data.companyId),
              eq(storageAccounts.isDefault, true)
            )
          );
      }

      await this.db.insert(storageAccounts).values({
        id: storageId,
        name: data.name,
        companyId: data.companyId,
        storageType: data.storageType,
        isDefault: data.isDefault,
        createdAt: now,
        updatedAt: now
      });
      
      this.logger.info('Storage account created', { 
        storageId: newStorageAccount.id,
        companyId: newStorageAccount.companyId,
        type: newStorageAccount.storageType
      });
      
      return newStorageAccount;
    } catch (error: any) {
      this.logger.error('Error creating storage account', { 
        name: data.name, 
        companyId: data.companyId,
        error: error.message 
      });
      throw error;
    }
  }

  async update(id: string, data: Partial<Omit<StorageAccount, 'id' | 'createdAt' | 'updatedAt'>>): Promise<StorageAccount> {
    try {
      const storageAccount = await this.findById(id);
      if (!storageAccount) {
        throw new NotFoundError('Storage account', id);
      }

      const updateData: any = { ...data, updatedAt: new Date() };

      // If setting as default, unset any existing default
      if (data.isDefault && storageAccount.companyId) {
        await this.db.update(storageAccounts)
          .set({ isDefault: false })
          .where(
            and(
              eq(storageAccounts.companyId, storageAccount.companyId),
              eq(storageAccounts.isDefault, true),
              sql`${storageAccounts.id} <> ${id}` // Using SQL template for comparison
            )
          );
      }

      await this.db.update(storageAccounts)
        .set(updateData)
        .where(eq(storageAccounts.id, id));
      
      const updatedAccount = await this.findById(id);
      if (!updatedAccount) {
        throw new Error('Failed to retrieve updated storage account');
      }
      
      this.logger.info('Storage account updated', { 
        storageId: id,
        updatedFields: Object.keys(data)
      });
      
      return updatedAccount;
    } catch (error: any) {
      this.logger.error('Error updating storage account', { id, error: error.message });
      throw error;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      // First delete the credentials
      await this.deleteCredentials(id);
      
      // Then delete the storage account
      const result = await this.db.delete(storageAccounts)
        .where(eq(storageAccounts.id, id)) as DeleteResult;
      
      // If rowsAffected is undefined, default to true (assume success)
      const success = result.rowsAffected !== undefined ? result.rowsAffected > 0 : true;
      
      if (success) {
        this.logger.info('Storage account deleted', { storageId: id });
      } else {
        this.logger.warn('Storage account not found for deletion', { storageId: id });
      }
      
      return success;
    } catch (error: any) {
      this.logger.error('Error deleting storage account', { id, error: error.message });
      throw error;
    }
  }

  async setDefault(id: string, companyId: string): Promise<boolean> {
    try {
      // Make sure the storage account exists
      const storageAccount = await this.findById(id);
      if (!storageAccount) {
        throw new NotFoundError('Storage account', id);
      }

      // Ensure the storage account belongs to the company
      if (storageAccount.companyId !== companyId) {
        throw new StorageError(`Storage account ${id} does not belong to company ${companyId}`);
      }

      // Unset any existing default
      await this.db.update(storageAccounts)
        .set({ isDefault: false })
        .where(
          and(
            eq(storageAccounts.companyId, companyId),
            eq(storageAccounts.isDefault, true)
          )
        );

      // Set the new default
      await this.db.update(storageAccounts)
        .set({ isDefault: true, updatedAt: new Date() })
        .where(eq(storageAccounts.id, id));

      this.logger.info('Set default storage account', { storageId: id, companyId });
      
      return true;
    } catch (error: any) {
      this.logger.error('Error setting default storage account', { id, companyId, error: error.message });
      throw error;
    }
  }

  async getCredentials(storageId: string): Promise<{credentials: any} | null> {
    try {
      const results = await this.db.select()
        .from(storageCredentials)
        .where(eq(storageCredentials.storageId, storageId))
        .limit(1);
      
      if (results.length === 0) {
        return null;
      }

      const encryptedCredential = results[0];
      
      // Decrypt the credentials
      try {
        const decryptedString = await decryptData(encryptedCredential.credentials);
        const credentials = JSON.parse(decryptedString);
        return { credentials };
      } catch (error: any) {
        this.logger.error('Error decrypting storage credentials', { 
          storageId, 
          error: error.message 
        });
        throw new StorageError('Failed to decrypt storage credentials');
      }
    } catch (error: any) {
      if (error instanceof StorageError) {
        throw error;
      }
      this.logger.error('Error retrieving storage credentials', { storageId, error: error.message });
      throw error;
    }
  }

  async saveCredentials(storageId: string, credentials: any): Promise<void> {
    try {
      // Make sure the storage account exists
      const storageAccount = await this.findById(storageId);
      if (!storageAccount) {
        throw new NotFoundError('Storage account', storageId);
      }

      // Encrypt the credentials
      const encryptedCredentials = await encryptData(JSON.stringify(credentials));
      
      const now = new Date();
      
      // Check if credentials already exist
      const existingCredentials = await this.db.select()
        .from(storageCredentials)
        .where(eq(storageCredentials.storageId, storageId))
        .limit(1);
      
      if (existingCredentials.length > 0) {
        // Update existing credentials
        await this.db.update(storageCredentials)
          .set({ 
            credentials: encryptedCredentials,
            updatedAt: now
          })
          .where(eq(storageCredentials.storageId, storageId));
      } else {
        // Create new credentials
        await this.db.insert(storageCredentials)
          .values({
            storageId,
            credentials: encryptedCredentials,
            updatedAt: now
          });
      }
      
      this.logger.info('Storage credentials saved', { storageId });
    } catch (error: any) {
      this.logger.error('Error saving storage credentials', { storageId, error: error.message });
      throw error;
    }
  }

  async deleteCredentials(storageId: string): Promise<boolean> {
    try {
      const result = await this.db.delete(storageCredentials)
        .where(eq(storageCredentials.storageId, storageId));
      
      // Use a type guard to check if rowsAffected exists and is a number
      const hasRowsAffected = 
        result && 
        typeof result === 'object' && 
        'rowsAffected' in result &&
        typeof result.rowsAffected === 'number';
      
      const success = hasRowsAffected ? (result.rowsAffected as number) > 0 : true;
      
      if (success) {
        this.logger.info('Storage credentials deleted', { storageId });
      } else {
        this.logger.warn('Storage credentials not found for deletion', { storageId });
      }
      
      return success;
    } catch (error: any) {
      this.logger.error('Error deleting storage credentials', { storageId, error: error.message });
      throw error;
    }
  }
}