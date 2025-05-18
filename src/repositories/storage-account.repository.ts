// src/repositories/storage-account.repository.ts
import { StorageProviderType } from '../services/storage/types';

export interface StorageAccount {
  id: string;
  name: string;
  companyId: string;
  storageType: StorageProviderType;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface StorageCredential {
  storageId: string;
  credentials: string; // Encrypted credentials JSON
  expiresAt: Date | null; // Match schema, can be null
  updatedAt: Date;
}

export interface StorageAccountRepository {
  // Storage account methods
  findById(id: string): Promise<StorageAccount | null>;
  findByCompanyId(companyId: string): Promise<StorageAccount[]>;
  findDefaultForCompany(companyId: string): Promise<StorageAccount | null>;
  create(data: Omit<StorageAccount, 'id' | 'createdAt' | 'updatedAt'>): Promise<StorageAccount>;
  update(id: string, data: Partial<Omit<StorageAccount, 'id' | 'createdAt' | 'updatedAt'>>): Promise<StorageAccount>;
  delete(id: string): Promise<boolean>;
  setDefault(id: string, companyId: string): Promise<boolean>;
  
  // Credentials methods
  getCredentials(storageId: string): Promise<{credentials: any} | null>; // Return decrypted credentials
  saveCredentials(storageId: string, credentials: any): Promise<void>; // Changed return type
  deleteCredentials(storageId: string): Promise<boolean>;
}