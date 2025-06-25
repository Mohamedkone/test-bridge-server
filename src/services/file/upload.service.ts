// src/services/file/upload.service.ts
import { injectable, inject } from 'inversify';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../utils/logger';
import { StorageService } from '../storage/storage.service';
import { FileService, FileOperationResult } from './file.service';
import { FileRepository } from '../../repositories/file.repository';
import { NotFoundError, ValidationError } from '../../utils/errors';
import { WebSocketService } from '../websocket/websocket.service';

export interface MultipartUploadInfo {
  uploadId: string;
  fileId: string;
  fileName: string;
  storageKey: string;
  storageId: string;
  roomId: string;
  parentId: string | null;
  userId: string;
  totalSize: number;
  mimeType: string;
  partSize: number;
  totalParts: number;
  partsCompleted: number[];
  partsInfo: Array<{ partNumber: number; etag: string }>;
  status: 'initialized' | 'in_progress' | 'completed' | 'failed' | 'aborted';
  metadata?: any;
  startedAt: Date;
  updatedAt: Date;
}

@injectable()
export class UploadService {
  // In-memory storage for active uploads - in production, use Redis
  private activeUploads: Map<string, MultipartUploadInfo> = new Map();
  
  constructor(
    @inject('StorageService') private storageService: StorageService,
    @inject('FileService') private fileService: FileService,
    @inject('FileRepository') private fileRepository: FileRepository,
    @inject('WebSocketService') private wsService: WebSocketService,
    @inject('Logger') private logger: Logger
  ) {
    this.logger = logger.createChildLogger('UploadService');
  }
  
  /**
   * Initialize a multipart upload
   */
  async initializeMultipartUpload(params: {
    fileName: string;
    mimeType: string;
    totalSize: number;
    roomId: string;
    parentId: string | null;
    userId: string;
    storageId?: string;
    metadata?: any;
  }): Promise<FileOperationResult> {
    try {
      const { fileName, mimeType, totalSize, roomId, parentId, userId, storageId, metadata } = params;
      
      // Validate input
      if (!fileName || !roomId || !userId || totalSize <= 0) {
        throw new ValidationError('Missing required fields');
      }
      
      // Get storage account
      let storageAccount;
      
      if (storageId) {
        storageAccount = await this.storageService.getStorageAccount(storageId);
        if (!storageAccount) {
          throw new NotFoundError('Storage account', storageId);
        }
      } else {
        // Use default storage for the room
        storageAccount = await this.storageService.getDefaultStorageAccount(roomId);
        
        if (!storageAccount) {
          throw new ValidationError('No default storage account found for this room');
        }
      }
      
      // Get provider and capabilities
      const provider = await this.storageService.getStorageProvider(storageAccount.id);
      const capabilities = provider.getCapabilities();
      
      if (!capabilities.supportsMultipartUpload) {
        throw new ValidationError('Storage provider does not support multipart uploads');
      }
      
      // Generate file ID and storage key
      const fileId = uuidv4();
      const uploadId = uuidv4();
      const storageKey = `rooms/${roomId}/files/${fileId}/${fileName}`;
      
      // Calculate optimal part size and total number of parts
      const minimumPartSize = capabilities.minimumPartSize;
      const maximumPartSize = capabilities.maximumPartSize;
      const maximumPartCount = capabilities.maximumPartCount;
      
      // Start with minimum part size
      let partSize = minimumPartSize;
      
      // If total size is large, increase part size to stay within part count limit
      if (totalSize / partSize > maximumPartCount) {
        partSize = Math.ceil(totalSize / maximumPartCount);
      }
      
      // Ensure part size doesn't exceed maximum
      partSize = Math.min(partSize, maximumPartSize);
      
      // Calculate total parts
      const totalParts = Math.ceil(totalSize / partSize);
      
      // Initialize multipart upload in storage provider
      const uploadResult = await provider.createMultipartUpload(storageKey, {
        contentType: mimeType,
        metadata: { fileId, uploadId }
      });
      
      if (!uploadResult.success || !uploadResult.uploadId) {
        throw new Error(uploadResult.message || 'Failed to initialize multipart upload');
      }
      
      // Create upload info
      const uploadInfo: MultipartUploadInfo = {
        uploadId,
        fileId,
        fileName,
        storageKey,
        storageId: storageAccount.id,
        roomId,
        parentId,
        userId,
        totalSize,
        mimeType,
        partSize,
        totalParts,
        partsCompleted: [],
        partsInfo: [],
        status: 'initialized',
        metadata,
        startedAt: new Date(),
        updatedAt: new Date()
      };
      
      // Store upload info
      this.activeUploads.set(uploadId, uploadInfo);
      
      this.logger.info('Multipart upload initialized', { 
        uploadId, 
        fileId, 
        fileName, 
        totalSize, 
        totalParts 
      });
      
      return {
        success: true,
        message: 'Multipart upload initialized successfully',
        data: {
          uploadId,
          fileId,
          partSize,
          totalParts,
          providerUploadId: uploadResult.uploadId
        }
      };
    } catch (error: any) {
      this.logger.error('Error initializing multipart upload', { 
        fileName: params.fileName, 
        roomId: params.roomId, 
        error 
      });
      
      return {
        success: false,
        message: error.message || 'Failed to initialize multipart upload',
        error
      };
    }
  }
  
  /**
   * Get signed URL for uploading a part
   */
  async getUploadPartUrl(
    uploadId: string,
    partNumber: number,
    contentLength: number
  ): Promise<FileOperationResult> {
    try {
      // Get upload info
      const uploadInfo = this.activeUploads.get(uploadId);
      
      if (!uploadInfo) {
        throw new NotFoundError('Upload', uploadId);
      }
      
      if (uploadInfo.status !== 'initialized' && uploadInfo.status !== 'in_progress') {
        throw new ValidationError(`Upload is in ${uploadInfo.status} state`);
      }
      
      if (partNumber < 1 || partNumber > uploadInfo.totalParts) {
        throw new ValidationError(`Invalid part number. Must be between 1 and ${uploadInfo.totalParts}`);
      }
      
      // Get provider
      const provider = await this.storageService.getStorageProvider(uploadInfo.storageId);
      
      // Get signed URL
      const urlResult = await provider.getSignedUrlForPart(
        uploadInfo.storageKey,
        uploadInfo.uploadId,
        partNumber,
        contentLength
      );
      
      if (!urlResult.success || !urlResult.url) {
        throw new Error(urlResult.message || 'Failed to generate upload URL');
      }
      
      // Update upload status
      if (uploadInfo.status === 'initialized') {
        uploadInfo.status = 'in_progress';
      }
      
      uploadInfo.updatedAt = new Date();
      this.activeUploads.set(uploadId, uploadInfo);
      
      return {
        success: true,
        message: 'Upload URL generated successfully',
        data: {
          url: urlResult.url,
          partNumber,
          expiresIn: 3600 // Default expiry
        }
      };
    } catch (error: any) {
      this.logger.error('Error generating upload URL', { uploadId, partNumber, error });
      
      return {
        success: false,
        message: error.message || 'Failed to generate upload URL',
        error
      };
    }
  }
  
  /**
   * Complete upload part
   */
  async completePart(
    uploadId: string,
    partNumber: number,
    etag: string
  ): Promise<FileOperationResult> {
    try {
      // Get upload info
      const uploadInfo = this.activeUploads.get(uploadId);
      
      if (!uploadInfo) {
        throw new NotFoundError('Upload', uploadId);
      }
      
      if (uploadInfo.status !== 'in_progress') {
        throw new ValidationError(`Upload is in ${uploadInfo.status} state`);
      }
      
      if (partNumber < 1 || partNumber > uploadInfo.totalParts) {
        throw new ValidationError(`Invalid part number. Must be between 1 and ${uploadInfo.totalParts}`);
      }
      
      // Add part info
      uploadInfo.partsInfo.push({ partNumber, etag });
      uploadInfo.partsCompleted.push(partNumber);
      
      // Calculate progress
      const progress = (uploadInfo.partsCompleted.length / uploadInfo.totalParts) * 100;
      
      // Notify progress
      this.wsService.notifyFileTransferStatus(uploadInfo.roomId, {
        fileId: uploadInfo.fileId,
        type: 'upload',
        status: 'in_progress',
        progress,
        bytesTransferred: uploadInfo.partsCompleted.length * uploadInfo.partSize,
        totalBytes: uploadInfo.totalSize,
        userId: uploadInfo.userId
      });
      
      // Update upload info
      uploadInfo.updatedAt = new Date();
      this.activeUploads.set(uploadId, uploadInfo);
      
      return {
        success: true,
        message: 'Part completed successfully',
        data: {
          partNumber,
          progress
        }
      };
    } catch (error: any) {
      this.logger.error('Error completing upload part', { uploadId, partNumber, error });
      
      return {
        success: false,
        message: error.message || 'Failed to complete upload part',
        error
      };
    }
  }
  
  /**
   * Complete multipart upload
   */
  async completeMultipartUpload(uploadId: string): Promise<FileOperationResult> {
    try {
      // Get upload info
      const uploadInfo = this.activeUploads.get(uploadId);
      
      if (!uploadInfo) {
        throw new NotFoundError('Upload', uploadId);
      }
      
      if (uploadInfo.status !== 'in_progress') {
        throw new ValidationError(`Upload is in ${uploadInfo.status} state`);
      }
      
      if (uploadInfo.partsCompleted.length !== uploadInfo.totalParts) {
        throw new ValidationError('Not all parts have been uploaded');
      }
      
      // Get provider
      const provider = await this.storageService.getStorageProvider(uploadInfo.storageId);
      
      // Complete multipart upload
      const completeResult = await provider.completeMultipartUpload(
        uploadInfo.storageKey,
        uploadInfo.uploadId,
        uploadInfo.partsInfo
      );
      
      if (!completeResult.success) {
        throw new Error(completeResult.message || 'Failed to complete multipart upload');
      }
      
      // Create file record
      const fileResult = await this.fileService.uploadFile({
        name: uploadInfo.fileName,
        mimeType: uploadInfo.mimeType,
        size: uploadInfo.totalSize,
        roomId: uploadInfo.roomId,
        parentId: uploadInfo.parentId,
        userId: uploadInfo.userId,
        storageId: uploadInfo.storageId,
        storageKey: uploadInfo.storageKey,
        metadata: uploadInfo.metadata
      });
      
      if (!fileResult.success) {
        throw new Error(fileResult.message || 'Failed to create file record');
      }
      
      // Update upload status
      uploadInfo.status = 'completed';
      uploadInfo.updatedAt = new Date();
      this.activeUploads.set(uploadId, uploadInfo);
      
      // Notify completion
      this.wsService.notifyFileTransferStatus(uploadInfo.roomId, {
        fileId: uploadInfo.fileId,
        type: 'upload',
        status: 'completed',
        progress: 100,
        bytesTransferred: uploadInfo.totalSize,
        totalBytes: uploadInfo.totalSize,
        userId: uploadInfo.userId
      });
      
      return {
        success: true,
        message: 'Multipart upload completed successfully',
        data: fileResult.data
      };
    } catch (error: any) {
      this.logger.error('Error completing multipart upload', { uploadId, error });
      
      // Update upload status
      const uploadInfo = this.activeUploads.get(uploadId);
      if (uploadInfo) {
        uploadInfo.status = 'failed';
        uploadInfo.updatedAt = new Date();
        this.activeUploads.set(uploadId, uploadInfo);
        
        // Notify failure
        this.wsService.notifyFileTransferStatus(uploadInfo.roomId, {
          fileId: uploadInfo.fileId,
          type: 'upload',
          status: 'error',
          progress: 0,
          error: error.message,
          userId: uploadInfo.userId
        });
      }
      
      return {
        success: false,
        message: error.message || 'Failed to complete multipart upload',
        error
      };
    }
  }
  
  /**
   * Abort multipart upload
   */
  async abortMultipartUpload(uploadId: string): Promise<FileOperationResult> {
    try {
      // Get upload info
      const uploadInfo = this.activeUploads.get(uploadId);
      
      if (!uploadInfo) {
        throw new NotFoundError('Upload', uploadId);
      }
      
      if (uploadInfo.status === 'completed') {
        throw new ValidationError('Upload is already completed');
      }
      
      // Get provider
      const provider = await this.storageService.getStorageProvider(uploadInfo.storageId);
      
      // Abort upload
      const abortResult = await provider.abortMultipartUpload(
        uploadInfo.storageKey,
        uploadInfo.uploadId
      );
      
      if (!abortResult.success) {
        throw new Error(abortResult.message || 'Failed to abort multipart upload');
      }
      
      // Update upload status
      uploadInfo.status = 'aborted';
      uploadInfo.updatedAt = new Date();
      this.activeUploads.set(uploadId, uploadInfo);
      
      this.logger.info('Multipart upload aborted', { 
        uploadId, 
        fileId: uploadInfo.fileId, 
        fileName: uploadInfo.fileName 
      });
      
      // Clean up upload info
      setTimeout(() => {
        this.activeUploads.delete(uploadId);
      }, 3600000); // Keep record for 1 hour
      
      return {
        success: true,
        message: 'Upload aborted successfully'
      };
    } catch (error: any) {
      this.logger.error('Error aborting multipart upload', { uploadId, error });
      
      return {
        success: false,
        message: error.message || 'Failed to abort multipart upload',
        error
      };
    }
  }
  
  /**
   * Get upload status
   */
  async getUploadStatus(uploadId: string): Promise<FileOperationResult> {
    try {
      // Get upload info
      const uploadInfo = this.activeUploads.get(uploadId);
      
      if (!uploadInfo) {
        throw new NotFoundError('Upload', uploadId);
      }
      
      return {
        success: true,
        data: {
          uploadId: uploadInfo.uploadId,
          fileId: uploadInfo.fileId,
          fileName: uploadInfo.fileName,
          totalSize: uploadInfo.totalSize,
          totalParts: uploadInfo.totalParts,
          completedParts: uploadInfo.partsCompleted.length,
          status: uploadInfo.status,
          progress: (uploadInfo.partsCompleted.length / uploadInfo.totalParts) * 100,
          startedAt: uploadInfo.startedAt,
          updatedAt: uploadInfo.updatedAt
        }
      };
    } catch (error: any) {
      this.logger.error('Error getting upload status', { uploadId, error });
      
      return {
        success: false,
        message: error.message || 'Failed to get upload status',
        error
      };
    }
  }
}