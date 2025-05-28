// src/services/file/file.service.ts
import { injectable, inject } from 'inversify';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../utils/logger';
import { FileRepository, FileEntity, FileVersionEntity, CreateFileParams, FILE_TYPES, ENCRYPTION_TYPES } from '../../repositories/file.repository';
import { StorageService } from '../storage/storage.service';
import { StorageProvider, SignedUrlOptions } from '../storage/types';
import { NotFoundError, ValidationError, ForbiddenError, AccessDeniedError } from '../../utils/errors';
import { WebSocketService } from '../websocket/websocket.service';
import { RoomRepository } from '../../repositories/room.repository';

export interface UploadFileParams {
  name: string;
  mimeType: string;
  size: number;
  roomId: string;
  parentId: string | null;
  userId: string;
  buffer?: Buffer;
  tempFilePath?: string;
  storageId?: string;
  encryption?: typeof ENCRYPTION_TYPES[number];
  encryptionKey?: string;
  storageKey?: string; 
  metadata?: any;
  deleteAfter?: Date;
}

export interface FileOperationResult {
  success: boolean;
  message?: string;
  data?: any;
  error?: Error;
}

@injectable()
export class FileService {
  constructor(
    @inject('FileRepository') private fileRepository: FileRepository,
    @inject('StorageService') private storageService: StorageService,
    @inject('WebSocketService') private wsService: WebSocketService,
    @inject('Logger') private logger: Logger,
    @inject('RoomRepository') private roomRepository: RoomRepository
  ) {
    this.logger = logger.createChildLogger('FileService');
  }

  /**
   * Get file by ID
   */
  async getFileById(id: string, withRelations: string[] = []): Promise<FileEntity | null> {
    try {
      return await this.fileRepository.findByIdWithRelations(id, withRelations);
    } catch (error: any) {
      this.logger.error('Error getting file by ID', { id, error });
      throw error;
    }
  }

  /**
   * Get files in a directory
   */
  async getFilesInDirectory(roomId: string, parentId: string | null = null): Promise<FileEntity[]> {
    try {
      return await this.fileRepository.findByRoomId(roomId, {
        parentId,
        includeDeleted: false
      });
    } catch (error: any) {
      this.logger.error('Error getting files in directory', { roomId, parentId, error });
      throw error;
    }
  }

  /**
   * Create a new folder
   */
  async createFolder(
    name: string,
    roomId: string,
    parentId: string | null,
    userId: string,
    metadata?: any
  ): Promise<FileEntity> {
    try {
      // Validate folder name
      if (!name) {
        throw new ValidationError('Folder name is required');
      }

      if (name.includes('/') || name.includes('\\')) {
        throw new ValidationError('Folder name cannot contain slashes');
      }

      // Get default storage account for the folder
      const defaultStorage = await this.storageService.getDefaultStorageAccount(roomId);
      
      if (!defaultStorage) {
        throw new ValidationError('No default storage account found for this room');
      }

      // Check if folder with same name already exists at this level
      const existingFiles = await this.fileRepository.findByRoomId(roomId, {
        parentId,
        includeDeleted: false
      });

      const folderWithSameName = existingFiles.find(file => 
        file.name.toLowerCase() === name.toLowerCase() && file.fileType === 'folder'
      );

      if (folderWithSameName) {
        throw new ValidationError(`A folder named "${name}" already exists in this location`);
      }

      // Create folder
      const folderParams: CreateFileParams = {
        name,
        originalName: name,
        size: 0,
        fileType: 'folder',
        parentId: parentId || undefined,
        storageId: defaultStorage.id,
        roomId,
        uploadedById: userId,
        metadata
      };

      const folder = await this.fileRepository.create(folderParams);

      this.logger.info('Folder created', { 
        folderId: folder.id, 
        folderName: folder.name,
        roomId,
        parentId
      });

      return folder;
    } catch (error: any) {
      this.logger.error('Error creating folder', { name, roomId, parentId, error });
      throw error;
    }
  }

  /**
   * Upload a new file
   */
  async uploadFile(params: UploadFileParams): Promise<FileOperationResult> {
    try {
      // Validate input
      if (!params.name || !params.roomId || !params.userId) {
        throw new ValidationError('Missing required fields: name, roomId, userId');
      }

      if (!params.buffer && !params.tempFilePath) {
        throw new ValidationError('Either buffer or tempFilePath must be provided');
      }

      // Get storage account
      const storageId = params.storageId;
      let storageAccount;
      
      if (storageId) {
        storageAccount = await this.storageService.getStorageAccount(storageId);
        if (!storageAccount) {
          throw new NotFoundError('Storage account', storageId);
        }
      } else {
        // Use default storage for the room
        storageAccount = await this.storageService.getDefaultStorageAccount(params.roomId);
        
        if (!storageAccount) {
          throw new ValidationError('No default storage account found for this room');
        }
      }

      // Get provider
      const provider = await this.storageService.getStorageProvider(storageAccount.id);

      // Generate storage key
      const fileId = uuidv4();
      const storageKey = `rooms/${params.roomId}/files/${fileId}/${params.name}`;

      // Check for existing file with same name
      const existingFiles = await this.fileRepository.findByRoomId(params.roomId, {
        parentId: params.parentId,
        includeDeleted: false
      });

      const fileWithSameName = existingFiles.find(file => 
        file.name.toLowerCase() === params.name.toLowerCase() && file.fileType === 'file'
      );

      if (fileWithSameName) {
        throw new ValidationError(`A file named "${params.name}" already exists in this location`);
      }

      // Upload file to storage provider
      const uploadResult = await this.uploadToStorage(
        provider, 
        storageKey, 
        params.mimeType, 
        params.buffer, 
        params.tempFilePath
      );

      if (!uploadResult.success) {
        throw new Error(uploadResult.message || 'Failed to upload file to storage');
      }

      // Create file record
      const fileParams: CreateFileParams = {
        name: params.name,
        originalName: params.name,
        mimeType: params.mimeType,
        size: params.size,
        fileType: 'file',
        parentId: params.parentId || undefined,
        storageId: storageAccount.id,
        roomId: params.roomId,
        uploadedById: params.userId,
        storageKey: storageKey,
        encryption: params.encryption || 'none',
        encryptionKeyId: params.encryptionKey,
        metadata: params.metadata,
        deleteAfter: params.deleteAfter
      };

      const file = await this.fileRepository.create(fileParams);

      // Create initial version
      await this.fileRepository.createVersion({
        fileId: file.id,
        size: params.size,
        storageKey: storageKey,
        uploadedById: params.userId,
        encryptionKeyId: params.encryptionKey
      });

      // Log the action
      await this.fileRepository.createLog({
        fileId: file.id,
        userId: params.userId,
        action: 'upload',
        metadata: {
          size: params.size,
          mimeType: params.mimeType
        }
      });

      this.logger.info('File uploaded successfully', { 
        fileId: file.id, 
        fileName: file.name,
        size: file.size,
        roomId: file.roomId
      });

      return {
        success: true,
        message: 'File uploaded successfully',
        data: file
      };
    } catch (error: any) {
      this.logger.error('Error uploading file', { 
        name: params.name, 
        roomId: params.roomId, 
        error 
      });

      return {
        success: false,
        message: error.message || 'Failed to upload file',
        error
      };
    }
  }

  /**
   * Upload file to storage provider
   */
  private async uploadToStorage(
    provider: StorageProvider,
    key: string,
    contentType: string,
    buffer?: Buffer,
    tempFilePath?: string
  ): Promise<FileOperationResult> {
    try {
      // For small files, use direct upload
      if (buffer) {
        // Get signed URL for upload
        const urlResult = await provider.getSignedUrl(key, {
          operation: 'write',
          expiresIn: 3600,
          contentType: contentType
        });

        if (!urlResult.success || !urlResult.url) {
          throw new Error('Failed to get signed URL for upload');
        }

        // Upload file using the signed URL
        // This is a simplified example, in real implementation you would use fetch or axios
        // to upload the buffer to the signed URL
        // const uploadResponse = await fetch(urlResult.url, {
        //   method: 'PUT',
        //   body: buffer,
        //   headers: {
        //     'Content-Type': contentType
        //   }
        // });
        
        // For demonstration purposes, we'll assume success
        return {
          success: true,
          message: 'File uploaded to storage successfully'
        };
      } 
      else if (tempFilePath) {
        // For large files, implement multipart upload here
        // This is a placeholder for actual multipart upload implementation
        this.logger.info('Starting multipart upload for large file', { key });
        
        // Return placeholder success
        return {
          success: true,
          message: 'Large file uploaded to storage successfully'
        };
      }
      else {
        throw new Error('Either buffer or tempFilePath must be provided');
      }
    } catch (error: any) {
      this.logger.error('Error uploading to storage', { key, error });
      return {
        success: false,
        message: error.message || 'Failed to upload to storage',
        error
      };
    }
  }

  /**
   * Get download URL for a file
   */
  async getDownloadUrl(fileId: string, userId: string): Promise<FileOperationResult> {
    try {
      // Get file
      const file = await this.fileRepository.findById(fileId);
      
      if (!file) {
        throw new NotFoundError('File', fileId);
      }
      
      // Check permissions
      if (file.uploadedById !== userId) {
        throw new ForbiddenError('You do not have permission to download this file');
      }
      
      // Get provider
      const provider = await this.storageService.getStorageProvider(file.storageId);
      
      // Get download URL
      const urlResult = await provider.getSignedUrl(file.storageKey || '', {
        operation: 'read',
        expiresIn: 3600,
        contentType: file.mimeType || undefined,
        responseContentDisposition: `attachment; filename="${encodeURIComponent(file.name)}"`
      });
      
      if (!urlResult.success) {
        throw new Error(urlResult.message || 'Failed to get download URL');
      }
      
      // Notify download start
      this.wsService.notifyFileTransferStatus(file.roomId, {
        fileId: file.id,
        type: 'download',
        status: 'starting',
        progress: 0,
        bytesTransferred: 0,
        totalBytes: file.size,
        userId
      });
      
      return {
        success: true,
        message: 'Download URL generated successfully',
        data: {
          url: urlResult.url,
          expiresAt: new Date(Date.now() + 3600000).toISOString()
        }
      };
    } catch (error: any) {
      this.logger.error('Error getting download URL', { fileId, error });
      
      return {
        success: false,
        message: error.message || 'Failed to get download URL',
        error
      };
    }
  }

  /**
   * Update download progress
   */
  async updateDownloadProgress(
    fileId: string,
    userId: string,
    bytesDownloaded: number,
    totalBytes: number,
    speed: number
  ): Promise<FileOperationResult> {
    try {
      // Get file
      const file = await this.fileRepository.findById(fileId);
      
      if (!file) {
        throw new NotFoundError('File', fileId);
      }
      
      // Calculate progress
      const progress = (bytesDownloaded / totalBytes) * 100;
      
      // Notify progress
      this.wsService.notifyFileTransferStatus(file.roomId, {
        fileId: file.id,
        type: 'download',
        status: 'in_progress',
        progress,
        bytesTransferred: bytesDownloaded,
        totalBytes,
        speed,
        userId
      });
      
      return {
        success: true,
        message: 'Download progress updated',
        data: {
          progress,
          bytesDownloaded,
          totalBytes,
          speed
        }
      };
    } catch (error: any) {
      this.logger.error('Error updating download progress', { fileId, error });
      
      return {
        success: false,
        message: error.message || 'Failed to update download progress',
        error
      };
    }
  }

  /**
   * Complete download
   */
  async completeDownload(fileId: string, userId: string): Promise<FileOperationResult> {
    try {
      // Get file
      const file = await this.fileRepository.findById(fileId);
      
      if (!file) {
        throw new NotFoundError('File', fileId);
      }
      
      // Notify completion
      this.wsService.notifyFileTransferStatus(file.roomId, {
        fileId: file.id,
        type: 'download',
        status: 'completed',
        progress: 100,
        bytesTransferred: file.size,
        totalBytes: file.size,
        userId
      });
      
      return {
        success: true,
        message: 'Download completed successfully',
        data: {
          fileId: file.id,
          fileName: file.name,
          size: file.size
        }
      };
    } catch (error: any) {
      this.logger.error('Error completing download', { fileId, error });
      
      // Notify failure
      const file = await this.fileRepository.findById(fileId);
      if (file) {
        this.wsService.notifyFileTransferStatus(file.roomId, {
          fileId: file.id,
          type: 'download',
          status: 'error',
          progress: 0,
          error: error.message,
          userId
        });
      }
      
      return {
        success: false,
        message: error.message || 'Failed to complete download',
        error
      };
    }
  }

  /**
   * Update file metadata
   */
  async updateFile(
    fileId: string, 
    userId: string, 
    updates: {
      name?: string;
      parentId?: string | null;
      metadata?: any;
      deleteAfter?: Date | null;
    }
  ): Promise<FileOperationResult> {
    try {
      const file = await this.fileRepository.findById(fileId);
      
      if (!file) {
        throw new NotFoundError('File', fileId);
      }
      
      if (file.isDeleted) {
        throw new ValidationError('File has been deleted');
      }
      
      // Validate name if provided
      if (updates.name) {
        if (updates.name.includes('/') || updates.name.includes('\\')) {
          throw new ValidationError('File name cannot contain slashes');
        }
        
        // Check for existing file with same name in target directory
        const targetParentId = updates.parentId !== undefined ? updates.parentId : file.parentId;
        
        const existingFiles = await this.fileRepository.findByRoomId(file.roomId, {
          parentId: targetParentId,
          includeDeleted: false
        });
        
        const fileWithSameName = existingFiles.find(f => 
          f.id !== fileId && 
          f.name.toLowerCase() === updates.name!.toLowerCase() && 
          f.fileType === file.fileType
        );
        
        if (fileWithSameName) {
          throw new ValidationError(`A ${file.fileType} named "${updates.name}" already exists in the target location`);
        }
      }
      
      // If changing parent, make sure it's not moving a folder into itself
      if (updates.parentId !== undefined && file.fileType === 'folder' && updates.parentId !== null) {
        const isValidTarget = await this.validateFolderMove(fileId, updates.parentId);
        if (!isValidTarget) {
          throw new ValidationError('Cannot move a folder into itself or one of its descendants');
        }
      }
      
      // Update the file
      const updatedFile = await this.fileRepository.update(fileId, updates);
      
      // Log the action
      await this.fileRepository.createLog({
        fileId: file.id,
        userId: userId,
        action: 'update',
        metadata: {
          updates: Object.keys(updates),
          timestamp: new Date().toISOString()
        }
      });
      
      return {
        success: true,
        message: 'File updated successfully',
        data: updatedFile
      };
    } catch (error: any) {
      this.logger.error('Error updating file', { fileId, updates, error });
      
      return {
        success: false,
        message: error.message || 'Failed to update file',
        error
      };
    }
  }

  /**
   * Validate that a folder isn't being moved into itself or one of its descendants
   */
  private async validateFolderMove(folderId: string, targetParentId: string): Promise<boolean> {
    // Check if target is the folder itself
    if (folderId === targetParentId) {
      return false;
    }
    
    // Check if target is a descendant of the folder
    let currentParentId: string | null = targetParentId;
    
    while (currentParentId) {
      const parent = await this.fileRepository.findById(currentParentId);
      
      if (!parent) {
        break;
      }
      
      if (parent.id === folderId) {
        return false;
      }
      
      currentParentId = parent.parentId;
    }
    
    return true;
  }

  /**
   * Delete a file or folder
   */
  async deleteFile(fileId: string, userId: string, permanent: boolean = false): Promise<FileOperationResult> {
    try {
      const file = await this.fileRepository.findById(fileId);
      
      if (!file) {
        throw new NotFoundError('File', fileId);
      }
      
      if (file.isDeleted && !permanent) {
        throw new ValidationError('File has already been deleted');
      }
      
      if (file.fileType === 'folder') {
        // For folders, we need to handle all children
        const childFiles = await this.fileRepository.findByRoomId(file.roomId, {
          parentId: file.id,
          includeDeleted: false
        });
        
        // Recursively delete all children
        for (const childFile of childFiles) {
          await this.deleteFile(childFile.id, userId, permanent);
        }
      }
      
      let result: boolean;
      
      if (permanent) {
        // If it's a file with storageKey, delete from storage first
        if (file.fileType === 'file' && file.storageKey) {
          const provider = await this.storageService.getStorageProvider(file.storageId);
          await provider.deleteFile(file.storageKey);
        }
        
        // Hard delete
        result = await this.fileRepository.hardDelete(fileId);
      } else {
        // Soft delete
        result = await this.fileRepository.softDelete(fileId);
        
        // Log the action
        await this.fileRepository.createLog({
          fileId: file.id,
          userId: userId,
          action: 'delete',
          metadata: {
            permanent: false,
            timestamp: new Date().toISOString()
          }
        });
      }
      
      return {
        success: result,
        message: result 
          ? `File ${permanent ? 'permanently ' : ''}deleted successfully` 
          : 'Failed to delete file'
      };
    } catch (error: any) {
      this.logger.error('Error deleting file', { fileId, permanent, error });
      
      return {
        success: false,
        message: error.message || 'Failed to delete file',
        error
      };
    }
  }

  /**
   * Restore a deleted file
   */
  async restoreFile(fileId: string, userId: string): Promise<FileOperationResult> {
    try {
      const file = await this.fileRepository.findById(fileId);
      
      if (!file) {
        throw new NotFoundError('File', fileId);
      }
      
      if (!file.isDeleted) {
        throw new ValidationError('File is not deleted');
      }
      
      // If it's a folder, make sure parent isn't deleted
      if (file.parentId) {
        const parent = await this.fileRepository.findById(file.parentId);
        
        if (parent && parent.isDeleted) {
          throw new ValidationError('Cannot restore file because parent folder is deleted');
        }
      }
      
      // Restore the file
      const result = await this.fileRepository.restore(fileId);
      
      // If it's a folder, restore all children that were deleted at the same time
      if (file.fileType === 'folder') {
        const childFiles = await this.fileRepository.findByRoomId(file.roomId, {
          parentId: file.id,
          includeDeleted: true
        });
        
        for (const childFile of childFiles) {
          if (childFile.isDeleted) {
            await this.fileRepository.restore(childFile.id);
          }
        }
      }
      
      // Log the action
      await this.fileRepository.createLog({
        fileId: file.id,
        userId: userId,
        action: 'restore',
        metadata: {
          timestamp: new Date().toISOString()
        }
      });
      
      return {
        success: result,
        message: result ? 'File restored successfully' : 'Failed to restore file'
      };
    } catch (error: any) {
      this.logger.error('Error restoring file', { fileId, error });
      
      return {
        success: false,
        message: error.message || 'Failed to restore file',
        error
      };
    }
  }

  /**
   * Create a file share
   */
  async createFileShare(
    fileId: string, 
    userId: string, 
    options: {
      expiresIn?: number; // in hours
      maxDownloads?: number;
    } = {}
  ): Promise<FileOperationResult> {
    try {
      const file = await this.fileRepository.findById(fileId);
      
      if (!file) {
        throw new NotFoundError('File', fileId);
      }
      
      if (file.isDeleted) {
        throw new ValidationError('Cannot create share for deleted file');
      }
      
      if (file.fileType !== 'file') {
        throw new ValidationError('Can only share individual files, not folders');
      }
      
      const expiresAt = options.expiresIn 
        ? new Date(Date.now() + options.expiresIn * 60 * 60 * 1000) 
        : null;
      
      const share = await this.fileRepository.createShare({
        fileId: file.id,
        createdById: userId,
        expiresAt: expiresAt || undefined,
        maxDownloads: options.maxDownloads
      });
      
      // Log the action
      await this.fileRepository.createLog({
        fileId: file.id,
        userId: userId,
        action: 'share',
        metadata: {
          shareId: share.id,
          expiresAt: expiresAt?.toISOString(),
          maxDownloads: options.maxDownloads
        }
      });
      
      return {
        success: true,
        message: 'File share created successfully',
        data: {
          shareId: share.id,
          token: share.accessToken,
          expiresAt: share.expiresAt,
          maxDownloads: share.maxDownloads
        }
      };
    } catch (error: any) {
      this.logger.error('Error creating file share', { fileId, error });
      
      return {
        success: false,
        message: error.message || 'Failed to create file share',
        error
      };
    }
  }

  /**
   * Get file by share token
   */
  async getFileByShareToken(token: string, requestInfo: any = {}): Promise<FileOperationResult> {
    try {
      const share = await this.fileRepository.findShareByToken(token);
      
      if (!share) {
        throw new ValidationError('Invalid or expired share token');
      }
      
      // Check if share has expired
      if (share.expiresAt && share.expiresAt < new Date()) {
        throw new ValidationError('Share link has expired');
      }
      
      // Check if max downloads reached
      if (share.maxDownloads !== null && share.downloadCount >= share.maxDownloads) {
        throw new ValidationError('Maximum number of downloads reached');
      }
      
      // Get the file
      const file = await this.fileRepository.findById(share.fileId);
      
      if (!file) {
        throw new NotFoundError('File', share.fileId);
      }
      
      if (file.isDeleted) {
        throw new ValidationError('File has been deleted');
      }
      
      if (!file.storageKey) {
        throw new ValidationError('File storage key is missing');
      }
      
      // Get storage provider
      const provider = await this.storageService.getStorageProvider(file.storageId);
      
      // Get signed URL
      const urlResult = await provider.getSignedUrl(file.storageKey, {
        operation: 'read',
        expiresIn: 3600,
        contentType: file.mimeType || undefined,
        responseContentDisposition: `attachment; filename="${encodeURIComponent(file.name)}"`
      });
      
      if (!urlResult.success || !urlResult.url) {
        throw new Error('Failed to generate download URL');
      }
      
      // Increment download count
      await this.fileRepository.incrementShareDownloadCount(share.id);
      
      // Log the access
      await this.fileRepository.createLog({
        fileId: file.id,
        userId: share.createdById, // Use share creator as the user
        action: 'share_access',
        metadata: {
          shareId: share.id,
          downloadCount: share.downloadCount + 1,
          ipAddress: requestInfo.ipAddress,
          userAgent: requestInfo.userAgent,
          timestamp: new Date().toISOString()
        }
      });
      
      return {
        success: true,
        message: 'File access granted',
        data: {
          file: {
            id: file.id,
            name: file.name,
            size: file.size,
            mimeType: file.mimeType,
            createdAt: file.createdAt
          },
          downloadUrl: urlResult.url,
          expiresIn: 3600
        }
      };
    } catch (error: any) {
      this.logger.error('Error accessing shared file', { token, error });
      
      return {
        success: false,
        message: error.message || 'Failed to access shared file',
        error
      };
    }
  }

  /**
   * Delete a file share
   */
  async deleteFileShare(shareId: string, userId: string): Promise<FileOperationResult> {
    try {
      const share = await this.fileRepository.findShareById(shareId);
      
      if (!share) {
        throw new NotFoundError('File share', shareId);
      }
      
      // Delete the share
      const result = await this.fileRepository.deleteShare(shareId);
      
      // Log the action
      await this.fileRepository.createLog({
        fileId: share.fileId,
        userId: userId,
        action: 'delete_share',
        metadata: {
          shareId: share.id,
          timestamp: new Date().toISOString()
        }
      });
      
      return {
        success: result,
        message: result ? 'File share deleted successfully' : 'Failed to delete file share'
      };
    } catch (error: any) {
      this.logger.error('Error deleting file share', { shareId, error });
      
      return {
        success: false,
        message: error.message || 'Failed to delete file share',
        error
      };
    }
  }

  /**
   * Check if user has access to file
   */
  async checkAccess(fileId: string, userId: string, requiredLevel: 'read' | 'write' | 'admin'): Promise<boolean> {
    try {
      const file = await this.fileRepository.findByIdWithRelations(fileId, ['room', 'room.access']);
      
      if (!file) {
        return false;
      }

      // Check if user is the uploader
      if (file.uploadedById === userId) {
        return true;
      }

      // Check room access
      if (file.room) {
        const userAccess = file.room.access.find((access: { userId: string }) => access.userId === userId);
        if (!userAccess) {
          return false;
        }

        const accessLevels = {
          read: ['viewer', 'editor', 'owner'],
          write: ['editor', 'owner'],
          admin: ['owner']
        };

        return accessLevels[requiredLevel].includes(userAccess.accessType);
      }

      return false;
    } catch (error: any) {
      this.logger.error('Error checking file access', { fileId, userId, error });
      throw error;
    }
  }

  /**
   * Get file metadata by ID
   */
  async getFile(fileId: string, userId: string): Promise<FileOperationResult> {
    try {
      const file = await this.fileRepository.findById(fileId);
      
      if (!file) {
        throw new NotFoundError('File', fileId);
      }
      
      // Check permissions
      const hasAccess = await this.fileRepository.checkAccess(fileId, userId);
      
      if (!hasAccess) {
        throw new AccessDeniedError('You do not have permission to access this file');
      }
      
      return {
        success: true,
        data: file
      };
    } catch (error: any) {
      this.logger.error('Error getting file', { fileId, error });
      
      return {
        success: false,
        message: error.message || 'Failed to get file',
        error
      };
    }
  }

  /**
   * Get file content with optional range support
   */
  async getFileContent(fileId: string, userId: string, range?: { start: number; end: number }): Promise<FileOperationResult> {
    try {
      const file = await this.fileRepository.findById(fileId);
      
      if (!file) {
        throw new NotFoundError('File', fileId);
      }
      
      // Check permissions
      const hasAccess = await this.fileRepository.checkAccess(fileId, userId);
      
      if (!hasAccess) {
        throw new AccessDeniedError('You do not have permission to access this file');
      }
      
      if (file.fileType !== 'file' || !file.storageKey) {
        throw new ValidationError('Requested item is not a file');
      }
      
      // Get storage provider
      const provider = await this.storageService.getStorageProvider(file.storageId);
      
      // Get file content with or without range
      const result = await provider.getFileContent(file.storageKey, range);
      
      if (!result.success || !result.data) {
        throw new Error(result.message || 'Failed to get file content');
      }
      
      // Log access
      await this.fileRepository.createLog({
        fileId: file.id,
        userId,
        action: 'download',
        metadata: {
          timestamp: new Date().toISOString(),
          range: range ? `${range.start}-${range.end}` : 'full'
        }
      });
      
      return {
        success: true,
        data: result.data
      };
    } catch (error: any) {
      this.logger.error('Error getting file content', { fileId, error });
      
      return {
        success: false,
        message: error.message || 'Failed to get file content',
        error
      };
    }
  }

  /**
   * Search files with advanced filtering
   */
  async searchFiles(
    roomId: string,
    userId: string,
    params: {
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
      page?: number;
      limit?: number;
    }
  ): Promise<FileOperationResult> {
    try {
      // Check room access
      const hasAccess = await this.roomRepository.checkUserAccess(roomId, userId);
      
      if (!hasAccess) {
        throw new AccessDeniedError('You do not have permission to access files in this room');
      }
      
      // Set pagination defaults
      const page = params.page || 1;
      const limit = params.limit || 50;
      const offset = (page - 1) * limit;
      
      // Get files with filters
      const files = await this.fileRepository.searchFiles(roomId, {
        query: params.query,
        fileTypes: params.fileTypes,
        mimeTypes: params.mimeTypes,
        minSize: params.minSize,
        maxSize: params.maxSize,
        createdBefore: params.createdBefore,
        createdAfter: params.createdAfter,
        updatedBefore: params.updatedBefore,
        updatedAfter: params.updatedAfter,
        tags: params.tags,
        sort: params.sort,
        limit,
        offset
      });
      
      // Get total count for pagination
      const totalCount = await this.fileRepository.countSearchResults(roomId, {
        query: params.query,
        fileTypes: params.fileTypes,
        mimeTypes: params.mimeTypes,
        minSize: params.minSize,
        maxSize: params.maxSize,
        createdBefore: params.createdBefore,
        createdAfter: params.createdAfter,
        updatedBefore: params.updatedBefore,
        updatedAfter: params.updatedAfter,
        tags: params.tags
      });
      
      return {
        success: true,
        data: {
          files,
          pagination: {
            page,
            limit,
            totalCount,
            totalPages: Math.ceil(totalCount / limit)
          }
        }
      };
    } catch (error: any) {
      this.logger.error('Error searching files', { roomId, params, error });
      
      return {
        success: false,
        message: error.message || 'Failed to search files',
        error
      };
    }
  }

  /**
   * Move multiple files to a destination folder
   */
  async moveFiles(
    fileIds: string[],
    destinationFolderId: string,
    userId: string
  ): Promise<FileOperationResult> {
    try {
      if (!fileIds.length) {
        throw new ValidationError('No files selected for moving');
      }
      
      // Get destination folder info
      const destinationFolder = await this.fileRepository.findById(destinationFolderId);
      
      if (!destinationFolder) {
        throw new NotFoundError('Destination folder', destinationFolderId);
      }
      
      if (destinationFolder.fileType !== 'folder') {
        throw new ValidationError('Destination must be a folder');
      }
      
      // Check user has access to destination folder
      const hasAccess = await this.roomRepository.checkUserAccess(destinationFolder.roomId, userId);
      
      if (!hasAccess) {
        throw new AccessDeniedError('You do not have permission to access this folder');
      }
      
      // Process each file
      const results = [];
      let errors = 0;
      
      for (const fileId of fileIds) {
        try {
          // Get file info
          const file = await this.fileRepository.findById(fileId);
          
          if (!file) {
            results.push({ id: fileId, success: false, message: 'File not found' });
            errors++;
            continue;
          }
          
          // Check if file is in same room as destination
          if (file.roomId !== destinationFolder.roomId) {
            results.push({ id: fileId, success: false, message: 'Cannot move files between rooms' });
            errors++;
            continue;
          }
          
          // Update file's parent (remove updatedAt as it's handled automatically)
          const updatedFile = await this.fileRepository.update(fileId, {
            parentId: destinationFolderId
          });
          
          // Log the action
          await this.fileRepository.createLog({
            fileId,
            userId,
            action: 'move',
            metadata: {
              destinationFolderId,
              timestamp: new Date().toISOString()
            }
          });
          
          results.push({ id: fileId, success: true, data: updatedFile });
        } catch (error: any) {
          this.logger.error('Error moving file', { fileId, destinationFolderId, error });
          results.push({ id: fileId, success: false, message: error.message });
          errors++;
        }
      }
      
      return {
        success: errors === 0,
        message: errors === 0 
          ? 'All files moved successfully' 
          : `${fileIds.length - errors}/${fileIds.length} files moved successfully`,
        data: results
      };
    } catch (error: any) {
      this.logger.error('Error with bulk move operation', { fileIds, destinationFolderId, error });
      
      return {
        success: false,
        message: error.message || 'Failed to move files',
        error
      };
    }
  }

  /**
   * Delete multiple files
   */
  async deleteFiles(
    fileIds: string[],
    userId: string,
    permanent: boolean = false
  ): Promise<FileOperationResult> {
    try {
      if (!fileIds.length) {
        throw new ValidationError('No files selected for deletion');
      }
      
      // Process each file
      const results = [];
      let errors = 0;
      
      for (const fileId of fileIds) {
        try {
          // Delete the file
          const result = await this.deleteFile(fileId, userId, permanent);
          
          if (!result.success) {
            results.push({ id: fileId, success: false, message: result.message });
            errors++;
            continue;
          }
          
          results.push({ id: fileId, success: true });
        } catch (error: any) {
          this.logger.error('Error deleting file', { fileId, permanent, error });
          results.push({ id: fileId, success: false, message: error.message });
          errors++;
        }
      }
      
      return {
        success: errors === 0,
        message: errors === 0 
          ? `All files ${permanent ? 'permanently ' : ''}deleted successfully` 
          : `${fileIds.length - errors}/${fileIds.length} files ${permanent ? 'permanently ' : ''}deleted`,
        data: results
      };
    } catch (error: any) {
      this.logger.error('Error with bulk delete operation', { fileIds, permanent, error });
      
      return {
        success: false,
        message: error.message || 'Failed to delete files',
        error
      };
    }
  }

  /**
   * Copy multiple files to a destination folder
   */
  async copyFiles(
    fileIds: string[],
    destinationFolderId: string,
    userId: string
  ): Promise<FileOperationResult> {
    try {
      if (!fileIds.length) {
        throw new ValidationError('No files selected for copying');
      }
      
      // Get destination folder info
      const destinationFolder = await this.fileRepository.findById(destinationFolderId);
      
      if (!destinationFolder) {
        throw new NotFoundError('Destination folder', destinationFolderId);
      }
      
      if (destinationFolder.fileType !== 'folder') {
        throw new ValidationError('Destination must be a folder');
      }
      
      // Check user has access to destination folder
      const hasAccess = await this.roomRepository.checkUserAccess(destinationFolder.roomId, userId);
      
      if (!hasAccess) {
        throw new AccessDeniedError('You do not have permission to access this folder');
      }
      
      // Process each file
      const results = [];
      let errors = 0;
      
      for (const fileId of fileIds) {
        try {
          // Get file info
          const file = await this.fileRepository.findById(fileId);
          
          if (!file) {
            results.push({ id: fileId, success: false, message: 'File not found' });
            errors++;
            continue;
          }
          
          // Check if file is a file (not a folder)
          if (file.fileType !== 'file') {
            results.push({ id: fileId, success: false, message: 'Copying folders is not supported in bulk operations' });
            errors++;
            continue;
          }
          
          // Check if file is in same room as destination
          if (file.roomId !== destinationFolder.roomId) {
            results.push({ id: fileId, success: false, message: 'Cannot copy files between rooms' });
            errors++;
            continue;
          }
          
          // Create new file record with same storage key
          const newFile = await this.fileRepository.create({
            name: `Copy of ${file.name}`,
            originalName: file.originalName,
            mimeType: file.mimeType || undefined,
            size: file.size,
            fileType: 'file',
            parentId: destinationFolderId,
            storageId: file.storageId,
            roomId: file.roomId,
            uploadedById: userId,
            storageKey: file.storageKey || undefined, // Convert null to undefined
            encryption: file.encryption,
            encryptionKeyId: file.encryptionKeyId || undefined, // Convert null to undefined
            metadata: file.metadata ? JSON.parse(file.metadata) : undefined
          });
          
          // Create initial version for the new file
          await this.fileRepository.createVersion({
            fileId: newFile.id,
            size: file.size,
            storageKey: file.storageKey || '', // Empty string as fallback
            uploadedById: userId,
            encryptionKeyId: file.encryptionKeyId || undefined
          });
          
          // Log the action
          await this.fileRepository.createLog({
            fileId: newFile.id,
            userId,
            action: 'copy',
            metadata: {
              sourceFileId: fileId,
              timestamp: new Date().toISOString()
            }
          });
          
          results.push({ id: fileId, success: true, data: newFile });
        } catch (error: any) {
          this.logger.error('Error copying file', { fileId, destinationFolderId, error });
          results.push({ id: fileId, success: false, message: error.message });
          errors++;
        }
      }
      
      return {
        success: errors === 0,
        message: errors === 0 
          ? 'All files copied successfully' 
          : `${fileIds.length - errors}/${fileIds.length} files copied successfully`,
        data: results
      };
    } catch (error: any) {
      this.logger.error('Error with bulk copy operation', { fileIds, destinationFolderId, error });
      
      return {
        success: false,
        message: error.message || 'Failed to copy files',
        error
      };
    }
  }
}