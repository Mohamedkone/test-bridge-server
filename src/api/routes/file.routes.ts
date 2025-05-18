// src/api/routes/file.routes.ts
import { Router } from 'express';
import { container } from '../../config/container';
import { FileController } from '../controllers/file.controller';
import { AuthMiddleware } from '../middleware/auth.middleware';

const fileController = container.get<FileController>(FileController);
const authMiddleware = container.get<AuthMiddleware>(AuthMiddleware);

const router = Router();

// Public routes for file sharing
router.get('/share/:token', fileController.getFileByShareToken.bind(fileController));

// Protected routes - require authentication
router.use(authMiddleware.authenticate);

// File management
router.get('/room/:roomId', fileController.getFiles.bind(fileController));
router.get('/:id', fileController.getFile.bind(fileController));
router.post('/folder', fileController.createFolder.bind(fileController));
router.post('/upload', fileController.uploadFile);
router.patch('/:id', fileController.updateFile.bind(fileController));
router.delete('/:id', fileController.deleteFile.bind(fileController));
router.post('/:id/restore', fileController.restoreFile.bind(fileController));
router.get('/:id/download', fileController.getFileDownloadUrl.bind(fileController));

// File sharing
router.post('/:id/share', fileController.createFileShare.bind(fileController));
router.delete('/share/:id', fileController.deleteFileShare.bind(fileController));

// Multipart upload
router.post('/upload/multipart', fileController.initMultipartUpload.bind(fileController));
router.get('/upload/multipart/:uploadId/part', fileController.getUploadPartUrl.bind(fileController));
router.post('/upload/multipart/:uploadId/part', fileController.completeUploadPart.bind(fileController));
router.post('/upload/multipart/:uploadId/complete', fileController.completeMultipartUpload.bind(fileController));
router.post('/upload/multipart/:uploadId/abort', fileController.abortMultipartUpload.bind(fileController));
router.get('/upload/multipart/:uploadId/status', fileController.getUploadStatus.bind(fileController));

export default router;