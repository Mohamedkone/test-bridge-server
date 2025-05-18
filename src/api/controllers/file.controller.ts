// src/api/controllers/file.controller.ts
import { Request, Response, NextFunction } from 'express';
import { injectable, inject } from 'inversify';
import { FileService } from '../../services/file/file.service';
import { UploadService } from '../../services/file/upload.service';
import { Logger } from '../../utils/logger';
import { ValidationError } from '../../utils/errors';
import multer from 'multer';

@injectable()
export class FileController {
  private upload: multer.Multer;
  
  constructor(
    @inject('FileService') private fileService: FileService,
    @inject('UploadService') private uploadService: UploadService,
    @inject('Logger') private logger: Logger
  ) {
    this.logger = logger.createChildLogger('FileController');
    
    // Configure multer for file uploads
    const storage = multer.memoryStorage();
    this.upload = multer({
      storage,
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB limit for regular uploads
      }
    });
  }
  
  /**
   * Get files in a directory
   */
  async getFiles(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { roomId } = req.params;
      const { parentId } = req.query;
      
      if (!roomId) {
        throw new ValidationError('Room ID is required');
      }
      
      const files = await this.fileService.getFilesInDirectory(
        roomId, 
        parentId ? String(parentId) : null
      );
      
      res.json({
        success: true,
        data: files
      });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Get file details
   */
  async getFile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { relations } = req.query;
      
      if (!id) {
        throw new ValidationError('File ID is required');
      }
      
      // Parse relations if provided
      const relationsList = relations 
        ? String(relations).split(',')
        : [];
      
      const file = await this.fileService.getFileById(id, relationsList);
      
      if (!file) {
        throw new ValidationError(`File not found: ${id}`);
      }
      
      res.json({
        success: true,
        data: file
      });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Create a folder
   */
  async createFolder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { name, roomId, parentId, metadata } = req.body;
      
      if (!name || !roomId) {
        throw new ValidationError('Name and room ID are required');
      }
      
      // Get user ID from auth middleware
      const userId = req.user.id;
      
      const folder = await this.fileService.createFolder(
        name,
        roomId,
        parentId || null,
        userId,
        metadata
      );
      
      res.status(201).json({
        success: true,
        message: 'Folder created successfully',
        data: folder
      });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Upload a file (small files)
   */
  uploadFile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Use multer middleware for file upload
    this.upload.single('file')(req, res, async (err) => {
      if (err) {
        return next(err);
      }
      
      try {
        if (!req.file) {
          throw new ValidationError('No file uploaded');
        }
        
        const { roomId, parentId, metadata } = req.body;
        
        if (!roomId) {
          throw new ValidationError('Room ID is required');
        }
        
        // Get user ID from auth middleware
        const userId = req.user.id;
        
        const result = await this.fileService.uploadFile({
          name: req.file.originalname,
          mimeType: req.file.mimetype,
          size: req.file.size,
          buffer: req.file.buffer,
          roomId,
          parentId: parentId || null,
          userId,
          metadata: metadata ? JSON.parse(metadata) : undefined
        });
        
        if (!result.success) {
          throw new Error(result.message || 'Failed to upload file');
        }
        
        res.status(201).json({
          success: true,
          message: 'File uploaded successfully',
          data: result.data
        });
      } catch (error) {
        next(error);
      }
    });
  };
  
  /**
   * Initialize multipart upload
   */
  async initMultipartUpload(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { fileName, mimeType, totalSize, roomId, parentId, metadata } = req.body;
      
      if (!fileName || !mimeType || !totalSize || !roomId) {
        throw new ValidationError('Missing required fields');
      }
      
      // Get user ID from auth middleware
      const userId = req.user.id;
      
      const result = await this.uploadService.initializeMultipartUpload({
        fileName,
        mimeType,
        totalSize: Number(totalSize),
        roomId,
        parentId: parentId || null,
        userId,
        metadata: metadata ? JSON.parse(metadata) : undefined
      });
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to initialize upload');
      }
      
      res.status(201).json({
        success: true,
        message: 'Multipart upload initialized',
        data: result.data
      });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Get upload part URL
   */
  async getUploadPartUrl(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { uploadId } = req.params;
      const { partNumber, contentLength } = req.query;
      
      if (!uploadId || !partNumber || !contentLength) {
        throw new ValidationError('Upload ID, part number, and content length are required');
      }
      
      const result = await this.uploadService.getUploadPartUrl(
        uploadId,
        Number(partNumber),
        Number(contentLength)
      );
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to get upload URL');
      }
      
      res.json({
        success: true,
        data: result.data
      });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Complete upload part
   */
  async completeUploadPart(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { uploadId } = req.params;
      const { partNumber, etag } = req.body;
      
      if (!uploadId || !partNumber || !etag) {
        throw new ValidationError('Upload ID, part number, and ETag are required');
      }
      
      const result = await this.uploadService.completePart(
        uploadId,
        Number(partNumber),
        etag
      );
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to complete part');
      }
      
      res.json({
        success: true,
        data: result.data
      });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Complete multipart upload
   */
  async completeMultipartUpload(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { uploadId } = req.params;
      
      if (!uploadId) {
        throw new ValidationError('Upload ID is required');
      }
      
      const result = await this.uploadService.completeMultipartUpload(uploadId);
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to complete upload');
      }
      
      res.json({
        success: true,
        message: 'File uploaded successfully',
        data: result.data
      });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Abort multipart upload
   */
  async abortMultipartUpload(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { uploadId } = req.params;
      
      if (!uploadId) {
        throw new ValidationError('Upload ID is required');
      }
      
      const result = await this.uploadService.abortMultipartUpload(uploadId);
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to abort upload');
      }
      
      res.json({
        success: true,
        message: 'Upload aborted successfully'
      });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Get upload status
   */
  async getUploadStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { uploadId } = req.params;
      
      if (!uploadId) {
        throw new ValidationError('Upload ID is required');
      }
      
      const result = await this.uploadService.getUploadStatus(uploadId);
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to get upload status');
      }
      
      res.json({
        success: true,
        data: result.data
      });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Get file download URL
   */
  async getFileDownloadUrl(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      
      if (!id) {
        throw new ValidationError('File ID is required');
      }
      
      // Get user ID from auth middleware
      const userId = req.user.id;
      
      const result = await this.fileService.getFileDownloadUrl(id, userId);
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to generate download URL');
      }
      
      res.json({
        success: true,
        data: result.data
      });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Update file
   */
  async updateFile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { name, parentId, metadata, deleteAfter } = req.body;
      
      if (!id) {
        throw new ValidationError('File ID is required');
      }
      
      // Get user ID from auth middleware
      const userId = req.user.id;
      
      const result = await this.fileService.updateFile(id, userId, {
        name,
        parentId: parentId === undefined ? undefined : (parentId || null),
        metadata: metadata ? JSON.parse(metadata) : undefined,
        deleteAfter: deleteAfter ? new Date(deleteAfter) : null
      });
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to update file');
      }
      
      res.json({
        success: true,
        message: 'File updated successfully',
        data: result.data
      });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Delete file
   */
  async deleteFile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { permanent } = req.query;
      
      if (!id) {
        throw new ValidationError('File ID is required');
      }
      
      // Get user ID from auth middleware
      const userId = req.user.id;
      
      const result = await this.fileService.deleteFile(
        id, 
        userId, 
        permanent === 'true'
      );
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to delete file');
      }
      
      res.json({
        success: true,
        message: result.message || 'File deleted successfully'
      });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Restore file
   */
  async restoreFile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      
      if (!id) {
        throw new ValidationError('File ID is required');
      }
      
      // Get user ID from auth middleware
      const userId = req.user.id;
      
      const result = await this.fileService.restoreFile(id, userId);
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to restore file');
      }
      
      res.json({
        success: true,
        message: 'File restored successfully'
      });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Create file share
   */
  async createFileShare(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { expiresIn, maxDownloads } = req.body;
      
      if (!id) {
        throw new ValidationError('File ID is required');
      }
      
      // Get user ID from auth middleware
      const userId = req.user.id;
      
      const result = await this.fileService.createFileShare(id, userId, {
        expiresIn: expiresIn ? Number(expiresIn) : undefined,
        maxDownloads: maxDownloads ? Number(maxDownloads) : undefined
      });
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to create file share');
      }
      
      res.status(201).json({
        success: true,
        message: 'File share created successfully',
        data: result.data
      });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Delete file share
   */
  async deleteFileShare(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      
      if (!id) {
        throw new ValidationError('Share ID is required');
      }
      
      // Get user ID from auth middleware
      const userId = req.user.id;
      
      const result = await this.fileService.deleteFileShare(id, userId);
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to delete file share');
      }
      
      res.json({
        success: true,
        message: 'File share deleted successfully'
      });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Get file by share token (public endpoint)
   */
  async getFileByShareToken(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { token } = req.params;
      
      if (!token) {
        throw new ValidationError('Share token is required');
      }
      
      // Collect request info for logging
      const requestInfo = {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      };
      
      const result = await this.fileService.getFileByShareToken(token, requestInfo);
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to access shared file');
      }
      
      res.json({
        success: true,
        data: result.data
      });
    } catch (error) {
      next(error);
    }
  }
}