// src/repositories/file.repository.ts
import { files, fileVersions, fileShares, fileLogs, FILE_TYPES, ENCRYPTION_TYPES } from '../db/schema/files';
import { StorageAccount } from './storage-account.repository';

export interface FileEntity {
  id: string;
  name: string;
  originalName: string;
  mimeType: string | null;
  size: number;
  fileType: typeof FILE_TYPES[number];
  parentId: string | null;
  storageId: string;
  roomId: string;
  uploadedById: string;
  storageKey: string | null;
  encryption: typeof ENCRYPTION_TYPES[number];
  encryptionKeyId: string | null;
  metadata: string | null;
  deleteAfter: Date | null;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface FileVersionEntity {
  id: string;
  fileId: string;
  versionNumber: number;
  size: number;
  storageKey: string;
  uploadedById: string;
  encryptionKeyId: string | null;
  createdAt: Date;
}

export interface FileShareEntity {
  id: string;
  fileId: string;
  createdById: string;
  accessToken: string;
  expiresAt: Date | null;
  maxDownloads: number | null;
  downloadCount: number;
  createdAt: Date;
}

export interface FileLogEntity {
  id: string;
  fileId: string;
  userId: string;
  action: string;
  metadata: string | null;
  createdAt: Date;
}

export interface FileWithRelations extends FileEntity {
  versions?: FileVersionEntity[];
  shares?: FileShareEntity[];
  logs?: FileLogEntity[];
  children?: FileEntity[];
  storage?: StorageAccount;
}

export interface CreateFileParams {
  name: string;
  originalName: string;
  mimeType?: string;
  size: number;
  fileType: typeof FILE_TYPES[number];
  parentId?: string;
  storageId: string;
  roomId: string;
  uploadedById: string;
  storageKey?: string;
  encryption?: typeof ENCRYPTION_TYPES[number];
  encryptionKeyId?: string;
  metadata?: any;
  deleteAfter?: Date;
}

export interface UpdateFileParams {
  name?: string;
  parentId?: string | null;
  metadata?: any;
  deleteAfter?: Date | null;
  isDeleted?: boolean;
}

export interface CreateFileVersionParams {
  fileId: string;
  size: number;
  storageKey: string;
  uploadedById: string;
  encryptionKeyId?: string;
}

export interface CreateFileShareParams {
  fileId: string;
  createdById: string;
  expiresAt?: Date;
  maxDownloads?: number;
}

export interface CreateFileLogParams {
  fileId: string;
  userId: string;
  action: string;
  metadata?: any;
}

export interface FileRepository {
  // File operations
  findById(id: string): Promise<FileEntity | null>;
  findByIdWithRelations(id: string, relations?: string[]): Promise<FileWithRelations | null>;
  findByPath(roomId: string, path: string): Promise<FileEntity | null>;
  findByRoomId(roomId: string, options?: {
    parentId?: string | null;
    fileType?: typeof FILE_TYPES[number];
    includeDeleted?: boolean;
  }): Promise<FileEntity[]>;
  create(params: CreateFileParams): Promise<FileEntity>;
  update(id: string, params: UpdateFileParams): Promise<FileEntity>;
  softDelete(id: string): Promise<boolean>;
  restore(id: string): Promise<boolean>;
  hardDelete(id: string): Promise<boolean>;
  
  // Version operations
  findVersionsByFileId(fileId: string): Promise<FileVersionEntity[]>;
  findVersionById(id: string): Promise<FileVersionEntity | null>;
  createVersion(params: CreateFileVersionParams): Promise<FileVersionEntity>;
  
  // Share operations
  findShareById(id: string): Promise<FileShareEntity | null>;
  findShareByToken(token: string): Promise<FileShareEntity | null>;
  findSharesByFileId(fileId: string): Promise<FileShareEntity[]>;
  createShare(params: CreateFileShareParams): Promise<FileShareEntity>;
  incrementShareDownloadCount(shareId: string): Promise<FileShareEntity>;
  deleteShare(id: string): Promise<boolean>;
  
  // Log operations
  createLog(params: CreateFileLogParams): Promise<FileLogEntity>;
  findLogsByFileId(fileId: string): Promise<FileLogEntity[]>;
}