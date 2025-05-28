// src/api/controllers/file.controller.ts
import { Request, Response, NextFunction } from 'express';
import { injectable, inject } from 'inversify';
import { FileService } from '../../services/file/file.service';
import { UploadService } from '../../services/file/upload.service';
import { Logger } from '../../utils/logger';
import { ValidationError } from '../../utils/errors';
import multer from 'multer';
import { RateLimiterMemory } from 'rate-limiter-flexible';

@injectable()
export class FileController {
  private upload: multer.Multer;
  private uploadRateLimiter: RateLimiterMemory;
  
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
    
    // Configure rate limiter for uploads
    this.uploadRateLimiter = new RateLimiterMemory({
      points: 10, // Number of uploads
      duration: 60, // Per minute
      blockDuration: 120 // Block for 2 minutes if exceeded
    });
  }
  
  /**
   * Throttle upload requests
   */
  private async throttleUpload(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id || req.ip;
      await this.uploadRateLimiter.consume(userId, 1);
      next();
    } catch (error: any) {
      const retryAfter = Math.floor(error.msBeforeNext / 1000) || 60;
      res.set('Retry-After', String(retryAfter));
      res.status(429).json({
        success: false,
        message: 'Too many upload requests, please try again later',
        retryAfter
      });
    }
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
    // Use throttling middleware
    await this.throttleUpload(req, res, (err) => {
      if (err) return next(err);
      
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
    });
  };
  
  /**
   * Initialize multipart upload
   */
  async initMultipartUpload(req: Request, res: Response, next: NextFunction): Promise<void> {
    // Use throttling middleware
    await this.throttleUpload(req, res, async (err) => {
      if (err) return next(err);
      
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
    });
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
  async getDownloadUrl(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      
      if (!id) {
        throw new ValidationError('File ID is required');
      }
      
      // Get user ID from auth middleware
      const userId = req.user.id;
      
      const result = await this.fileService.getDownloadUrl(id, userId);
      
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
  
  /**
   * Get file content with support for range requests
   */
  async getFileContent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      
      if (!id) {
        throw new ValidationError('File ID is required');
      }
      
      // Get user ID from auth middleware
      const userId = req.user.id;
      
      // Get file info
      const file = await this.fileService.getFile(id, userId);
      
      if (!file.success) {
        throw new Error(file.message || 'Failed to get file');
      }
      
      // Check for Range header
      const rangeHeader = req.headers.range;
      
      if (rangeHeader) {
        // Parse range header
        const fileSize = file.data.size;
        const parts = rangeHeader.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        
        // Validate range
        if (isNaN(start) || isNaN(end) || start >= fileSize || end >= fileSize || start > end) {
          res.status(416).send('Range Not Satisfiable');
          return;
        }
        
        const chunkSize = end - start + 1;
        
        // Get file content with range
        const result = await this.fileService.getFileContent(id, userId, { start, end });
        
        if (!result.success) {
          throw new Error(result.message || 'Failed to get file content');
        }
        
        // Set headers for partial content
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize,
          'Content-Type': file.data.mimeType,
          'Content-Disposition': `inline; filename="${file.data.name}"`
        });
        
        // Send partial content
        res.end(result.data);
      } else {
        // Get full file content
        const result = await this.fileService.getFileContent(id, userId);
        
        if (!result.success) {
          throw new Error(result.message || 'Failed to get file content');
        }
        
        // Set headers for full content
        res.writeHead(200, {
          'Content-Length': file.data.size,
          'Content-Type': file.data.mimeType,
          'Content-Disposition': `inline; filename="${file.data.name}"`,
          'Accept-Ranges': 'bytes'
        });
        
        // Send full content
        res.end(result.data);
      }
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Move multiple files to a destination folder
   */
  async moveFiles(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { fileIds, destinationFolderId } = req.body;
      
      if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
        throw new ValidationError('File IDs array is required');
      }
      
      if (!destinationFolderId) {
        throw new ValidationError('Destination folder ID is required');
      }
      
      // Get user ID from auth middleware
      const userId = req.user.id;
      
      const result = await this.fileService.moveFiles(fileIds, destinationFolderId, userId);
      
      res.status(result.success ? 200 : 207).json({
        success: result.success,
        message: result.message,
        data: result.data
      });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Delete multiple files
   */
  async deleteFiles(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { fileIds, permanent } = req.body;
      
      if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
        throw new ValidationError('File IDs array is required');
      }
      
      // Get user ID from auth middleware
      const userId = req.user.id;
      
      const result = await this.fileService.deleteFiles(fileIds, userId, permanent === true);
      
      res.status(result.success ? 200 : 207).json({
        success: result.success,
        message: result.message,
        data: result.data
      });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Copy multiple files to a destination folder
   */
  async copyFiles(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { fileIds, destinationFolderId } = req.body;
      
      if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
        throw new ValidationError('File IDs array is required');
      }
      
      if (!destinationFolderId) {
        throw new ValidationError('Destination folder ID is required');
      }
      
      // Get user ID from auth middleware
      const userId = req.user.id;
      
      const result = await this.fileService.copyFiles(fileIds, destinationFolderId, userId);
      
      res.status(result.success ? 200 : 207).json({
        success: result.success,
        message: result.message,
        data: result.data
      });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Search files with advanced filtering
   */
  async searchFiles(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { roomId } = req.params;
      const { 
        query,
        fileTypes,
        mimeTypes,
        minSize,
        maxSize,
        createdBefore,
        createdAfter,
        updatedBefore,
        updatedAfter,
        tags,
        sort,
        page,
        limit
      } = req.query;
      
      if (!roomId) {
        throw new ValidationError('Room ID is required');
      }
      
      // Get user ID from auth middleware
      const userId = req.user.id;
      
      // Process and convert parameters
      const searchParams: any = {
        query: query as string,
        page: page ? parseInt(page as string) : undefined,
        limit: limit ? parseInt(limit as string) : undefined,
      };
      
      // Convert array parameters
      if (fileTypes) {
        searchParams.fileTypes = Array.isArray(fileTypes) ? fileTypes : [fileTypes];
      }
      
      if (mimeTypes) {
        searchParams.mimeTypes = Array.isArray(mimeTypes) ? mimeTypes : [mimeTypes];
      }
      
      if (tags) {
        searchParams.tags = Array.isArray(tags) ? tags : [tags];
      }
      
      // Convert numeric parameters
      if (minSize) {
        searchParams.minSize = parseInt(minSize as string);
      }
      
      if (maxSize) {
        searchParams.maxSize = parseInt(maxSize as string);
      }
      
      // Convert date parameters
      if (createdBefore) {
        searchParams.createdBefore = new Date(createdBefore as string);
      }
      
      if (createdAfter) {
        searchParams.createdAfter = new Date(createdAfter as string);
      }
      
      if (updatedBefore) {
        searchParams.updatedBefore = new Date(updatedBefore as string);
      }
      
      if (updatedAfter) {
        searchParams.updatedAfter = new Date(updatedAfter as string);
      }
      
      // Process sort parameter
      if (sort) {
        const [field, direction] = (sort as string).split(':');
        searchParams.sort = {
          field,
          direction: direction === 'desc' ? 'desc' : 'asc'
        };
      }
      
      const result = await this.fileService.searchFiles(roomId as string, userId, searchParams);
      
      res.json({
        success: result.success,
        data: result.success ? result.data : undefined,
        message: !result.success ? result.message : undefined
      });
    } catch (error) {
      next(error);
    }
  }
}