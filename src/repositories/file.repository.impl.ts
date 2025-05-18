// src/repositories/file.repository.impl.ts
import { injectable, inject } from 'inversify';
import { eq, and, isNull, desc, sql, SQL } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { DrizzleClient } from '../db/client';
import { 
  files, fileVersions, fileShares, fileLogs,
  FILE_TYPES, ENCRYPTION_TYPES
} from '../db/schema/files';
import { storageAccounts } from '../db/schema/storage';
import { 
  FileRepository, FileEntity, FileVersionEntity, FileShareEntity, FileLogEntity,
  FileWithRelations, CreateFileParams, UpdateFileParams, CreateFileVersionParams,
  CreateFileShareParams, CreateFileLogParams
} from './file.repository';
import { Logger } from '../utils/logger';
import { NotFoundError } from '../utils/errors';

@injectable()
export class FileRepositoryImpl implements FileRepository {
  constructor(
    @inject('DrizzleClient') private readonly db: DrizzleClient,
    @inject('Logger') private readonly logger: Logger
  ) {
    this.logger = logger.createChildLogger('FileRepository');
  }

  async findById(id: string): Promise<FileEntity | null> {
    try {
      const results = await this.db.select()
        .from(files)
        .where(eq(files.id, id))
        .limit(1);
      
      return results.length > 0 ? results[0] : null;
    } catch (error: any) {
      this.logger.error('Error finding file by ID', { id, error: error.message });
      throw error;
    }
  }

  async findByIdWithRelations(id: string, relations: string[] = []): Promise<FileWithRelations | null> {
    try {
      const fileResult = await this.findById(id);
      
      if (!fileResult) {
        return null;
      }
      
      const fileWithRelations: FileWithRelations = { ...fileResult };
      
      if (relations.includes('versions')) {
        fileWithRelations.versions = await this.findVersionsByFileId(id);
      }
      
      if (relations.includes('shares')) {
        fileWithRelations.shares = await this.findSharesByFileId(id);
      }
      
      if (relations.includes('logs')) {
        fileWithRelations.logs = await this.findLogsByFileId(id);
      }
      
      if (relations.includes('children')) {
        fileWithRelations.children = await this.findByRoomId(fileResult.roomId, {
          parentId: fileResult.id,
          includeDeleted: false
        });
      }
      
      if (relations.includes('storage') && fileResult.storageId) {
        const storageResults = await this.db.select()
          .from(storageAccounts)
          .where(eq(storageAccounts.id, fileResult.storageId))
          .limit(1);
          
        if (storageResults.length > 0) {
          fileWithRelations.storage = storageResults[0];
        }
      }
      
      return fileWithRelations;
    } catch (error: any) {
      this.logger.error('Error finding file with relations', { id, relations, error: error.message });
      throw error;
    }
  }

  async findByPath(roomId: string, path: string): Promise<FileEntity | null> {
    try {
      // Split path into segments
      const pathSegments = path.split('/').filter(segment => segment !== '');
      
      if (pathSegments.length === 0) {
        return null;
      }
      
      // Start from the root level of the room
      let currentParentId: string | null = null;
      let currentFile: FileEntity | null = null;
      
      // Traverse the path
      for (let i = 0; i < pathSegments.length; i++) {
        const segment = pathSegments[i];
        
        const results = await this.db.select()
          .from(files)
          .where(
            and(
              eq(files.roomId, roomId),
              eq(files.name, segment),
              eq(files.isDeleted, false),
              currentParentId === null 
                ? isNull(files.parentId) 
                : eq(files.parentId, currentParentId)
            )
          )
          .limit(1);
          
        if (results.length === 0) {
          return null; // Path segment not found
        }
        
        currentFile = results[0];
        currentParentId = currentFile.id;
        
        // If this is the last segment and it's a file, return it
        if (i === pathSegments.length - 1) {
          return currentFile;
        }
        
        // If this is not the last segment but it's not a folder, path is invalid
        if (currentFile.fileType !== 'folder') {
          return null;
        }
      }
      
      return currentFile;
    } catch (error: any) {
      this.logger.error('Error finding file by path', { roomId, path, error: error.message });
      throw error;
    }
  }

  async findByRoomId(roomId: string, options: {
    parentId?: string | null;
    fileType?: typeof FILE_TYPES[number];
    includeDeleted?: boolean;
  } = {}): Promise<FileEntity[]> {
    try {
      const { parentId, fileType, includeDeleted = false } = options;
      
      // Build conditions array
      const conditions: SQL<unknown>[] = [eq(files.roomId, roomId)];
      
      if (parentId !== undefined) {
        if (parentId === null) {
          conditions.push(isNull(files.parentId));
        } else {
          conditions.push(eq(files.parentId, parentId));
        }
      }
      
      if (fileType) {
        conditions.push(eq(files.fileType, fileType));
      }
      
      if (!includeDeleted) {
        conditions.push(eq(files.isDeleted, false));
      }
      
      // Combine all conditions with AND
      const query = this.db.select()
        .from(files)
        .where(and(...conditions))
        .orderBy(
          sql`CASE WHEN ${files.fileType} = 'folder' THEN 0 ELSE 1 END`,
          files.name
        );
      
      return await query;
    } catch (error: any) {
      this.logger.error('Error finding files by room ID', { 
        roomId, 
        options, 
        error: error.message 
      });
      throw error;
    }
  }

  async create(params: CreateFileParams): Promise<FileEntity> {
    try {
      const now = new Date();
      const fileId = uuidv4();

      const newFile: FileEntity = {
        id: fileId,
        name: params.name,
        originalName: params.originalName,
        mimeType: params.mimeType || null,
        size: params.size,
        fileType: params.fileType,
        parentId: params.parentId || null,
        storageId: params.storageId,
        roomId: params.roomId,
        uploadedById: params.uploadedById,
        storageKey: params.storageKey || null,
        encryption: params.encryption || 'none',
        encryptionKeyId: params.encryptionKeyId || null,
        metadata: params.metadata ? JSON.stringify(params.metadata) : null,
        deleteAfter: params.deleteAfter || null,
        isDeleted: false,
        createdAt: now,
        updatedAt: now
      };

      await this.db.insert(files).values(newFile);
      
      this.logger.info('File created', { 
        fileId,
        fileName: newFile.name,
        roomId: newFile.roomId,
        fileType: newFile.fileType
      });
      
      return newFile;
    } catch (error: any) {
      this.logger.error('Error creating file', {
        name: params.name,
        roomId: params.roomId,
        error: error.message
      });
      throw error;
    }
  }

  async update(id: string, params: UpdateFileParams): Promise<FileEntity> {
    try {
      const file = await this.findById(id);
      if (!file) {
        throw new NotFoundError('File', id);
      }

      const updateData: any = {
        ...params,
        updatedAt: new Date()
      };

      // Convert metadata to JSON string if provided
      if (params.metadata !== undefined) {
        updateData.metadata = params.metadata ? JSON.stringify(params.metadata) : null;
      }

      await this.db.update(files)
        .set(updateData)
        .where(eq(files.id, id));
      
      const updatedFile = await this.findById(id);
      if (!updatedFile) {
        throw new Error('Failed to retrieve updated file');
      }
      
      this.logger.info('File updated', { 
        fileId: id,
        updatedFields: Object.keys(params)
      });
      
      return updatedFile;
    } catch (error: any) {
      this.logger.error('Error updating file', { id, error: error.message });
      throw error;
    }
  }

  async softDelete(id: string): Promise<boolean> {
    try {
      const file = await this.findById(id);
      if (!file) {
        throw new NotFoundError('File', id);
      }

      await this.db.update(files)
        .set({ 
          isDeleted: true,
          updatedAt: new Date()
        })
        .where(eq(files.id, id));
      
      this.logger.info('File soft deleted', { fileId: id });
      
      return true;
    } catch (error: any) {
      this.logger.error('Error soft deleting file', { id, error: error.message });
      throw error;
    }
  }

  async restore(id: string): Promise<boolean> {
    try {
      const file = await this.findById(id);
      if (!file) {
        throw new NotFoundError('File', id);
      }

      await this.db.update(files)
        .set({ 
          isDeleted: false,
          updatedAt: new Date()
        })
        .where(eq(files.id, id));
      
      this.logger.info('File restored', { fileId: id });
      
      return true;
    } catch (error: any) {
      this.logger.error('Error restoring file', { id, error: error.message });
      throw error;
    }
  }

  async hardDelete(id: string): Promise<boolean> {
    try {
      // First get the file to check if it exists
      const file = await this.findById(id);
      if (!file) {
        throw new NotFoundError('File', id);
      }
      
      // Delete related records
      await this.db.delete(fileVersions)
        .where(eq(fileVersions.fileId, id));
        
      await this.db.delete(fileShares)
        .where(eq(fileShares.fileId, id));
        
      await this.db.delete(fileLogs)
        .where(eq(fileLogs.fileId, id));
      
      // Delete the file record
      const result = await this.db.delete(files)
        .where(eq(files.id, id));
      
      // Use type guard to check if rowsAffected exists and is a number
      const hasRowsAffected = 
        result && 
        typeof result === 'object' && 
        'rowsAffected' in result &&
        typeof result.rowsAffected === 'number';
      
      const success = hasRowsAffected ? (result.rowsAffected as number) > 0 : true;
      
      this.logger.info('File hard deleted', { fileId: id });
      
      return success;
    } catch (error: any) {
      this.logger.error('Error hard deleting file', { id, error: error.message });
      throw error;
    }
  }

  async findVersionsByFileId(fileId: string): Promise<FileVersionEntity[]> {
    try {
      return await this.db.select()
        .from(fileVersions)
        .where(eq(fileVersions.fileId, fileId))
        .orderBy(desc(fileVersions.versionNumber));
    } catch (error: any) {
      this.logger.error('Error finding file versions', { fileId, error: error.message });
      throw error;
    }
  }

  async findVersionById(id: string): Promise<FileVersionEntity | null> {
    try {
      const results = await this.db.select()
        .from(fileVersions)
        .where(eq(fileVersions.id, id))
        .limit(1);
      
      return results.length > 0 ? results[0] : null;
    } catch (error: any) {
      this.logger.error('Error finding file version by ID', { id, error: error.message });
      throw error;
    }
  }

  async createVersion(params: CreateFileVersionParams): Promise<FileVersionEntity> {
    try {
      // Get current max version number
      const versionResults = await this.db.select({ 
          maxVersion: sql<number>`MAX(${fileVersions.versionNumber})` 
        })
        .from(fileVersions)
        .where(eq(fileVersions.fileId, params.fileId))
        .limit(1);
        
      const currentMaxVersion = versionResults[0]?.maxVersion || 0;
      const newVersionNumber = currentMaxVersion + 1;
      
      const versionId = uuidv4();
      
      const newVersion: FileVersionEntity = {
        id: versionId,
        fileId: params.fileId,
        versionNumber: newVersionNumber,
        size: params.size,
        storageKey: params.storageKey,
        uploadedById: params.uploadedById,
        encryptionKeyId: params.encryptionKeyId || null,
        createdAt: new Date()
      };
      
      await this.db.insert(fileVersions).values(newVersion);
      
      // Update file size and storageKey
      await this.db.update(files)
        .set({ 
          size: params.size,
          storageKey: params.storageKey,
          updatedAt: new Date()
        })
        .where(eq(files.id, params.fileId));
      
      this.logger.info('File version created', { 
        fileId: params.fileId,
        versionId,
        versionNumber: newVersionNumber
      });
      
      return newVersion;
    } catch (error: any) {
      this.logger.error('Error creating file version', { 
        fileId: params.fileId, 
        error: error.message 
      });
      throw error;
    }
  }

  async findShareById(id: string): Promise<FileShareEntity | null> {
    try {
      const results = await this.db.select()
        .from(fileShares)
        .where(eq(fileShares.id, id))
        .limit(1);
      
      return results.length > 0 ? results[0] : null;
    } catch (error: any) {
      this.logger.error('Error finding file share by ID', { id, error: error.message });
      throw error;
    }
  }

  async findShareByToken(token: string): Promise<FileShareEntity | null> {
    try {
      const results = await this.db.select()
        .from(fileShares)
        .where(eq(fileShares.accessToken, token))
        .limit(1);
      
      return results.length > 0 ? results[0] : null;
    } catch (error: any) {
      this.logger.error('Error finding file share by token', { error: error.message });
      throw error;
    }
  }

  async findSharesByFileId(fileId: string): Promise<FileShareEntity[]> {
    try {
      return await this.db.select()
        .from(fileShares)
        .where(eq(fileShares.fileId, fileId))
        .orderBy(desc(fileShares.createdAt));
    } catch (error: any) {
      this.logger.error('Error finding file shares', { fileId, error: error.message });
      throw error;
    }
  }

  async createShare(params: CreateFileShareParams): Promise<FileShareEntity> {
    try {
      const shareId = uuidv4();
      const accessToken = uuidv4(); // Simple token generation
      
      const newShare: FileShareEntity = {
        id: shareId,
        fileId: params.fileId,
        createdById: params.createdById,
        accessToken,
        expiresAt: params.expiresAt || null,
        maxDownloads: params.maxDownloads || null,
        downloadCount: 0,
        createdAt: new Date()
      };
      
      await this.db.insert(fileShares).values(newShare);
      
      this.logger.info('File share created', { 
        fileId: params.fileId,
        shareId,
        expiresAt: params.expiresAt
      });
      
      return newShare;
    } catch (error: any) {
      this.logger.error('Error creating file share', { 
        fileId: params.fileId, 
        error: error.message 
      });
      throw error;
    }
  }

  async incrementShareDownloadCount(shareId: string): Promise<FileShareEntity> {
    try {
      const share = await this.findShareById(shareId);
      if (!share) {
        throw new NotFoundError('FileShare', shareId);
      }

      const updatedShare = {
        ...share,
        downloadCount: share.downloadCount + 1
      };

      await this.db.update(fileShares)
        .set({ downloadCount: updatedShare.downloadCount })
        .where(eq(fileShares.id, shareId));
      
      this.logger.debug('File share download count incremented', { 
        shareId, 
        downloadCount: updatedShare.downloadCount 
      });
      
      return updatedShare;
    } catch (error: any) {
      this.logger.error('Error incrementing share download count', { 
        shareId, 
        error: error.message 
      });
      throw error;
    }
  }

  async deleteShare(id: string): Promise<boolean> {
    try {
      const result = await this.db.delete(fileShares)
        .where(eq(fileShares.id, id));
      
      // Use type guard to check if rowsAffected exists and is a number
      const hasRowsAffected = 
        result && 
        typeof result === 'object' && 
        'rowsAffected' in result &&
        typeof result.rowsAffected === 'number';
      
      const success = hasRowsAffected ? (result.rowsAffected as number) > 0 : true;
      
      this.logger.info('File share deleted', { shareId: id });
      
      return success;
    } catch (error: any) {
      this.logger.error('Error deleting file share', { id, error: error.message });
      throw error;
    }
  }

  async createLog(params: CreateFileLogParams): Promise<FileLogEntity> {
    try {
      const logId = uuidv4();
      
      const newLog: FileLogEntity = {
        id: logId,
        fileId: params.fileId,
        userId: params.userId,
        action: params.action,
        metadata: params.metadata ? JSON.stringify(params.metadata) : null,
        createdAt: new Date()
      };
      
      await this.db.insert(fileLogs).values(newLog);
      
      this.logger.debug('File log created', { 
        fileId: params.fileId,
        action: params.action,
        userId: params.userId
      });
      
      return newLog;
    } catch (error: any) {
      this.logger.error('Error creating file log', { 
        fileId: params.fileId, 
        action: params.action,
        error: error.message 
      });
      throw error;
    }
  }

  async findLogsByFileId(fileId: string): Promise<FileLogEntity[]> {
    try {
      return await this.db.select()
        .from(fileLogs)
        .where(eq(fileLogs.fileId, fileId))
        .orderBy(desc(fileLogs.createdAt));
    } catch (error: any) {
      this.logger.error('Error finding file logs', { fileId, error: error.message });
      throw error;
    }
  }
}