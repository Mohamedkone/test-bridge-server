// src/app.ts
import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import 'reflect-metadata'; // Required for inversify
import routes from './api/routes';
import { errorHandler } from './api/middleware/error.middleware';
import { requestLogger } from './utils/logger';
import { env } from './config/env';
import { apiLimiter } from './api/middleware/rate-limiter.middleware';

// Initialize Express application
const app: Application = express();

// Apply global middleware
app.use(helmet()); // Security headers
app.use(cors({
  origin: env.NODE_ENV === 'production' 
    ? ['https://yourdomain.com'] 
    : ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:5500'],
  credentials: true
}));
app.use(express.json()); // Parse JSON request body
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies

// Request logging
app.use(requestLogger);

// Apply rate limiting to all API routes
app.use('/api', apiLimiter);

// API routes
app.use('/api', routes);

// 404 Handler - must be after all routes
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route '${req.path}' not found`
    }
  });
});

// Error handling middleware (must be last)
app.use(errorHandler);

export default app;