// src/api/routes/index.ts
import { Router } from 'express';
import authRoutes from './auth.routes';
import storageRoutes from './storage.routes';
import fileRoutes from './file.routes';

const router = Router();

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
router.use('/auth', authRoutes);
router.use('/storage', storageRoutes);
router.use('/files', fileRoutes);

export default router;