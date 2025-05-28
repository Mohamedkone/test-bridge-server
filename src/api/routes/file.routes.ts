// src/api/routes/file.routes.ts
import { Router } from 'express';
import { injectable, inject } from 'inversify';
import { FileController } from '../controllers/file.controller';
import { AuthMiddleware } from '../middleware/auth.middleware';

@injectable()
export class FileRoutes {
  private router: Router;

  constructor(
    @inject('FileController') private fileController: FileController,
    @inject('AuthMiddleware') private authMiddleware: AuthMiddleware
  ) {
    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Public routes for file sharing
    this.router.get('/share/:token', this.fileController.getFileByShareToken.bind(this.fileController));

    // Protected routes - require authentication
    this.router.use(this.authMiddleware.verifyToken.bind(this.authMiddleware));

    // File management
    this.router.get('/room/:roomId', this.fileController.getFiles.bind(this.fileController));
    this.router.get('/room/:roomId/search', this.fileController.searchFiles.bind(this.fileController));
    this.router.get('/:id', this.fileController.getFile.bind(this.fileController));
    this.router.get('/:id/content', this.fileController.getFileContent.bind(this.fileController));
    this.router.post('/folder', this.fileController.createFolder.bind(this.fileController));
    this.router.post('/upload', this.fileController.uploadFile);
    this.router.patch('/:id', this.fileController.updateFile.bind(this.fileController));
    this.router.delete('/:id', this.fileController.deleteFile.bind(this.fileController));
    this.router.post('/:id/restore', this.fileController.restoreFile.bind(this.fileController));
    this.router.get('/:id/download', this.fileController.getDownloadUrl.bind(this.fileController));

    // Bulk operations
    this.router.post('/bulk/move', this.fileController.moveFiles.bind(this.fileController));
    this.router.post('/bulk/delete', this.fileController.deleteFiles.bind(this.fileController));
    this.router.post('/bulk/copy', this.fileController.copyFiles.bind(this.fileController));

    // File sharing
    this.router.post('/:id/share', this.fileController.createFileShare.bind(this.fileController));
    this.router.delete('/share/:id', this.fileController.deleteFileShare.bind(this.fileController));

    // Multipart upload
    this.router.post('/upload/multipart', this.fileController.initMultipartUpload.bind(this.fileController));
    this.router.get('/upload/multipart/:uploadId/part', this.fileController.getUploadPartUrl.bind(this.fileController));
    this.router.post('/upload/multipart/:uploadId/part', this.fileController.completeUploadPart.bind(this.fileController));
    this.router.post('/upload/multipart/:uploadId/complete', this.fileController.completeMultipartUpload.bind(this.fileController));
    this.router.post('/upload/multipart/:uploadId/abort', this.fileController.abortMultipartUpload.bind(this.fileController));
    this.router.get('/upload/multipart/:uploadId/status', this.fileController.getUploadStatus.bind(this.fileController));
  }

  public getRouter(): Router {
    return this.router;
  }
}