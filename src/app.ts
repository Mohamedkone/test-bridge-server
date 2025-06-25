// src/app.ts
import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import 'reflect-metadata'; // Required for inversify
import { errorHandler } from './api/middleware/error.middleware';
import { requestLogger } from './utils/logger';
import { env } from './config/env';
import { apiLimiter } from './api/middleware/rate-limiter.middleware';
import { container, initializeContainer } from './config/container';

// Initialize Express application
const app: Application = express();

// Apply global middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
})); // Security headers
app.use(cors({
  origin: env.NODE_ENV === 'production' 
    ? ['https://yourdomain.com'] 
    : ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:5174', 'http://127.0.0.1:5501'],
  credentials: true
}));
app.use(express.json()); // Parse JSON request body
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Request logging
app.use(requestLogger);

// Apply rate limiting to all API routes
app.use('/api', apiLimiter);

// Initialize routes after container setup
const initializeRoutes = async () => {
  try {
    // Initialize container
    await initializeContainer();
    
    // Import routes after container is initialized
    const { Routes } = await import('./api/routes');
    const routes = container.get<InstanceType<typeof Routes>>('Routes');
    
    // Apply routes
    app.use('/api', routes.getRouter());
    
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
  } catch (error) {
    console.error('Failed to initialize routes:', error);
    process.exit(1);
  }
};

// Initialize routes
initializeRoutes();

export default app;
