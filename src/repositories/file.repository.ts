// src/repositories/file.repository.ts
import { files, fileVersions, fileShares, fileLogs, FILE_TYPES, ENCRYPTION_TYPES } from '../db/schema/files';
import { StorageAccount } from './storage-account.repository';
import { rooms } from '../db/schema/rooms';
import { roomMembers } from '../db/schema/room-members';
import { roomAccess } from '../db/schema/access';
import { eq, and, or, inArray, gte, lte, asc, desc, count } from 'drizzle-orm';
import { injectable } from 'inversify';
import { Logger } from '../utils/logger';
import { like } from 'drizzle-orm';

export { FILE_TYPES, ENCRYPTION_TYPES };

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

export interface RoomWithAccess {
  id: string;
  name: string;
  access: {
    id: string;
    userId: string;
    accessType: string;
  }[];
}

export interface FileWithRelations extends FileEntity {
  versions?: FileVersionEntity[];
  shares?: FileShareEntity[];
  logs?: FileLogEntity[];
  children?: FileEntity[];
  storage?: StorageAccount;
  room?: RoomWithAccess;
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

/**
 * File Repository
 */
@injectable()
export class FileRepository {
  private readonly logger: Logger;
  private readonly dbClient: any; // Assuming a dbClient is injected

  constructor(logger: Logger, dbClient: any) {
    this.logger = logger;
    this.dbClient = dbClient;
  }

  // File operations
  async findById(id: string): Promise<FileEntity | null> {
    const db = await this.dbClient.getInstance();
    return db.query.files.findFirst({
      where: eq(files.id, id)
    });
  }

  async findByIdWithRelations(id: string, relations?: string[]): Promise<FileWithRelations | null> {
    const db = await this.dbClient.getInstance();
    return db.query.files.findFirst({
      where: eq(files.id, id),
      columns: {
        id: true,
        name: true,
        originalName: true,
        mimeType: true,
        size: true,
        fileType: true,
        parentId: true,
        storageId: true,
        roomId: true,
        uploadedById: true,
        storageKey: true,
        encryption: true,
        encryptionKeyId: true,
        metadata: true,
        deleteAfter: true,
        isDeleted: true,
        createdAt: true,
        updatedAt: true
      },
      relations: relations as any
    });
  }

  async findByPath(roomId: string, path: string): Promise<FileEntity | null> {
    const db = await this.dbClient.getInstance();
    return db.query.files.findFirst({
      where: and(
        eq(files.roomId, roomId),
        eq(files.name, path)
      )
    });
  }

  async findByRoomId(roomId: string, options?: {
    parentId?: string | null;
    fileType?: typeof FILE_TYPES[number];
    includeDeleted?: boolean;
  }): Promise<FileEntity[]> {
    const db = await this.dbClient.getInstance();
    return db.query.files.findMany({
      where: and(
        eq(files.roomId, roomId),
        options?.parentId ? eq(files.parentId, options.parentId) : undefined,
        options?.fileType ? eq(files.fileType, options.fileType) : undefined,
        options?.includeDeleted === false ? eq(files.isDeleted, false) : undefined
      )
    });
  }

  async create(params: CreateFileParams): Promise<FileEntity> {
    const db = await this.dbClient.getInstance();
    return db.insert(files).values(params).returning({
      ...files,
      createdAt: true,
      updatedAt: true
    });
  }

  async update(id: string, params: UpdateFileParams): Promise<FileEntity> {
    const db = await this.dbClient.getInstance();
    return db.update(files).set(params).where(eq(files.id, id)).returning({
      ...files,
      updatedAt: true
    });
  }

  async softDelete(id: string): Promise<boolean> {
    const db = await this.dbClient.getInstance();
    const result = await db.update(files).set({
      isDeleted: true,
      updatedAt: new Date()
    }).where(eq(files.id, id)).returning({
      updatedAt: true
    });
    return result.length > 0;
  }

  async restore(id: string): Promise<boolean> {
    const db = await this.dbClient.getInstance();
    const result = await db.update(files).set({
      isDeleted: false,
      updatedAt: new Date()
    }).where(eq(files.id, id)).returning({
      updatedAt: true
    });
    return result.length > 0;
  }

  async hardDelete(id: string): Promise<boolean> {
    const db = await this.dbClient.getInstance();
    const result = await db.delete(files).where(eq(files.id, id)).returning({
      deletedAt: true
    });
    return result.length > 0;
  }

  // Version operations
  async findVersionsByFileId(fileId: string): Promise<FileVersionEntity[]> {
    const db = await this.dbClient.getInstance();
    return db.query.fileVersions.findMany({
      where: eq(fileVersions.fileId, fileId)
    });
  }

  async findVersionById(id: string): Promise<FileVersionEntity | null> {
    const db = await this.dbClient.getInstance();
    return db.query.fileVersions.findFirst({
      where: eq(fileVersions.id, id)
    });
  }

  async createVersion(params: CreateFileVersionParams): Promise<FileVersionEntity> {
    const db = await this.dbClient.getInstance();
    return db.insert(fileVersions).values(params).returning(fileVersions);
  }

  // Share operations
  async findShareById(id: string): Promise<FileShareEntity | null> {
    const db = await this.dbClient.getInstance();
    return db.query.fileShares.findFirst({
      where: eq(fileShares.id, id)
    });
  }

  async findShareByToken(token: string): Promise<FileShareEntity | null> {
    const db = await this.dbClient.getInstance();
    return db.query.fileShares.findFirst({
      where: eq(fileShares.accessToken, token)
    });
  }

  async findSharesByFileId(fileId: string): Promise<FileShareEntity[]> {
    const db = await this.dbClient.getInstance();
    return db.query.fileShares.findMany({
      where: eq(fileShares.fileId, fileId)
    });
  }

  async createShare(params: CreateFileShareParams): Promise<FileShareEntity> {
    const db = await this.dbClient.getInstance();
    return db.insert(fileShares).values(params).returning(fileShares);
  }

  async incrementShareDownloadCount(shareId: string): Promise<FileShareEntity> {
    const db = await this.dbClient.getInstance();
    // First get current download count
    const share = await db.query.fileShares.findFirst({
      where: eq(fileShares.id, shareId)
    });
    
    if (!share) {
      throw new Error(`Share with ID ${shareId} not found`);
    }
    
    // Then increment it
    return db.update(fileShares)
      .set({
        downloadCount: share.downloadCount + 1
      })
      .where(eq(fileShares.id, shareId))
      .returning(fileShares);
  }

  async deleteShare(id: string): Promise<boolean> {
    const db = await this.dbClient.getInstance();
    const result = await db.delete(fileShares).where(eq(fileShares.id, id)).returning({
      deletedAt: true
    });
    return result.length > 0;
  }

  // Log operations
  async createLog(params: CreateFileLogParams): Promise<FileLogEntity> {
    const db = await this.dbClient.getInstance();
    return db.insert(fileLogs).values(params).returning(fileLogs);
  }

  async findLogsByFileId(fileId: string): Promise<FileLogEntity[]> {
    const db = await this.dbClient.getInstance();
    return db.query.fileLogs.findMany({
      where: eq(fileLogs.fileId, fileId)
    });
  }

  /**
   * Check if a user has access to a file
   */
  async checkAccess(fileId: string, userId: string): Promise<boolean> {
    try {
      const db = await this.dbClient.getInstance();
      
      // First, get the file to check its room ID
      const file = await db.query.files.findFirst({
        where: eq(files.id, fileId),
        columns: {
          id: true,
          roomId: true
        }
      });
      
      if (!file) {
        return false;
      }
      
      // Check if user is a member of the room
      const roomMember = await db.query.roomMembers.findFirst({
        where: and(
          eq(roomMembers.roomId, file.roomId),
          eq(roomMembers.userId, userId)
        )
      });
      
      if (roomMember) {
        return true;
      }
      
      // Check if user created a share for this file
      const shareExists = await db.query.fileShares.findFirst({
        where: eq(fileShares.fileId, fileId)
      });
      
      return shareExists !== null;
    } catch (error) {
      this.logger.error('Error checking file access', { fileId, userId, error });
      return false;
    }
  }

  /**
   * Search files with advanced filtering
   */
  async searchFiles(
    roomId: string,
    options: {
      query?: string;
      fileTypes?: string[];
      mimeTypes?: string[];
      minSize?: number;
      maxSize?: number;
      createdBefore?: Date;
      createdAfter?: Date;
      updatedBefore?: Date;
      updatedAfter?: Date;
      tags?: string[];
      sort?: { field: string; direction: 'asc' | 'desc' };
      limit?: number;
      offset?: number;
    }
  ): Promise<FileEntity[]> {
    try {
      const db = await this.dbClient.getInstance();
      
      // Build the where conditions
      const conditions = [];
      
      // Start with room ID
      conditions.push(eq(files.roomId, roomId));
      
      // Files should not be deleted
      conditions.push(eq(files.isDeleted, false));
      
      // Add text search if query provided
      if (options.query) {
        conditions.push(
          or(
            like(files.name, `%${options.query}%`),
            like(files.originalName, `%${options.query}%`),
            // If metadata is stored as JSON, can use JSON_CONTAINS or similar
            // This implementation will depend on database type
            options.query.length >= 3 ? like(files.mimeType, `%${options.query}%`) : undefined
          )
        );
      }
      
      // Add file type filter
      if (options.fileTypes && options.fileTypes.length > 0) {
        // Cast string[] to valid file types - assuming options.fileTypes only contains valid values
        const validFileTypes = options.fileTypes.filter(type => 
          FILE_TYPES.includes(type as any)
        ) as typeof FILE_TYPES[number][];
        
        if (validFileTypes.length > 0) {
          conditions.push(inArray(files.fileType, validFileTypes));
        }
      }
      
      // Add mime type filter - for other properties we need to do similar handling
      if (options.mimeTypes && options.mimeTypes.length > 0) {
        // For mime types we use OR condition instead of inArray since mimeType can be null
        const mimeTypeConditions = options.mimeTypes.map(type => eq(files.mimeType, type));
        if (mimeTypeConditions.length > 0) {
          conditions.push(or(...mimeTypeConditions));
        }
      }
      
      // Add size filters
      if (options.minSize !== undefined) {
        conditions.push(gte(files.size, options.minSize));
      }
      
      if (options.maxSize !== undefined) {
        conditions.push(lte(files.size, options.maxSize));
      }
      
      // Add date filters
      if (options.createdAfter) {
        conditions.push(gte(files.createdAt, options.createdAfter));
      }
      
      if (options.createdBefore) {
        conditions.push(lte(files.createdAt, options.createdBefore));
      }
      
      if (options.updatedAfter) {
        conditions.push(gte(files.updatedAt, options.updatedAfter));
      }
      
      if (options.updatedBefore) {
        conditions.push(lte(files.updatedAt, options.updatedBefore));
      }
      
      // Tags filter (implementation depends on how tags are stored)
      // This is a placeholder and would need customization based on schema
      if (options.tags && options.tags.length > 0) {
        // Assuming tags are stored in metadata JSON field
        // This would need to be adjusted based on actual implementation
      }
      
      // Build query with sorting
      let query = db.select().from(files).where(and(...conditions));
      
      // Add sorting
      if (options.sort) {
        const { field, direction } = options.sort;
        if (field === 'name') {
          query = direction === 'asc' ? query.orderBy(asc(files.name)) : query.orderBy(desc(files.name));
        } else if (field === 'size') {
          query = direction === 'asc' ? query.orderBy(asc(files.size)) : query.orderBy(desc(files.size));
        } else if (field === 'createdAt') {
          query = direction === 'asc' ? query.orderBy(asc(files.createdAt)) : query.orderBy(desc(files.createdAt));
        } else if (field === 'updatedAt') {
          query = direction === 'asc' ? query.orderBy(asc(files.updatedAt)) : query.orderBy(desc(files.updatedAt));
        }
      } else {
        // Default sort by most recent
        query = query.orderBy(desc(files.updatedAt));
      }
      
      // Add pagination
      if (options.limit !== undefined) {
        query = query.limit(options.limit);
        
        if (options.offset !== undefined) {
          query = query.offset(options.offset);
        }
      }
      
      // Execute query
      return await query;
    } catch (error) {
      this.logger.error('Error searching files', { roomId, options, error });
      return [];
    }
  }

  /**
   * Count search results
   */
  async countSearchResults(
    roomId: string,
    options: {
      query?: string;
      fileTypes?: string[];
      mimeTypes?: string[];
      minSize?: number;
      maxSize?: number;
      createdBefore?: Date;
      createdAfter?: Date;
      updatedBefore?: Date;
      updatedAfter?: Date;
      tags?: string[];
    }
  ): Promise<number> {
    try {
      const db = await this.dbClient.getInstance();
      
      // Build the where conditions (same as in searchFiles)
      const conditions = [];
      
      // Start with room ID
      conditions.push(eq(files.roomId, roomId));
      
      // Files should not be deleted
      conditions.push(eq(files.isDeleted, false));
      
      // Add text search if query provided
      if (options.query) {
        conditions.push(
          or(
            like(files.name, `%${options.query}%`),
            like(files.originalName, `%${options.query}%`),
            options.query.length >= 3 ? like(files.mimeType, `%${options.query}%`) : undefined
          )
        );
      }
      
      // Add file type filter - same fix as in searchFiles
      if (options.fileTypes && options.fileTypes.length > 0) {
        const validFileTypes = options.fileTypes.filter(type => 
          FILE_TYPES.includes(type as any)
        ) as typeof FILE_TYPES[number][];
        
        if (validFileTypes.length > 0) {
          conditions.push(inArray(files.fileType, validFileTypes));
        }
      }
      
      // Add mime type filter
      if (options.mimeTypes && options.mimeTypes.length > 0) {
        const mimeTypeConditions = options.mimeTypes.map(type => eq(files.mimeType, type));
        if (mimeTypeConditions.length > 0) {
          conditions.push(or(...mimeTypeConditions));
        }
      }
      
      // Add size filters
      if (options.minSize !== undefined) {
        conditions.push(gte(files.size, options.minSize));
      }
      
      if (options.maxSize !== undefined) {
        conditions.push(lte(files.size, options.maxSize));
      }
      
      // Add date filters
      if (options.createdAfter) {
        conditions.push(gte(files.createdAt, options.createdAfter));
      }
      
      if (options.createdBefore) {
        conditions.push(lte(files.createdAt, options.createdBefore));
      }
      
      if (options.updatedAfter) {
        conditions.push(gte(files.updatedAt, options.updatedAfter));
      }
      
      if (options.updatedBefore) {
        conditions.push(lte(files.updatedAt, options.updatedBefore));
      }
      
      // Execute count query
      const result = await db.select({ count: count() }).from(files).where(and(...conditions));
      return result[0]?.count || 0;
    } catch (error) {
      this.logger.error('Error counting search results', { roomId, options, error });
      return 0;
    }
  }
}