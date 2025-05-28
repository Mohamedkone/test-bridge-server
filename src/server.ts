// src/server.ts
import http from 'http';
import app from './app';
import { env } from './config/env';
import { initializeSocketIO } from './socket';
import { testDatabaseConnection } from './db/client';
import { connectToRedis } from './utils/redis';
import { Logger } from './utils/logger';
import { WebSocketService } from './services/websocket/websocket.service';
import { container } from './config/container';

// Create logger
const logger = new Logger('server');

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.IO
const io = initializeSocketIO(server);

// Initialize WebSocket
const webSocketService = container.get<WebSocketService>('WebSocketService');
webSocketService.initialize(server);

// Start the server
const startServer = async () => {
  try {
    // Test database connection
    logger.info('Testing database connection...');
    const dbConnected = await testDatabaseConnection();
    if (!dbConnected) {
      throw new Error('Database connection failed');
    }
    logger.info('Database connection successful');
    
    // Connect to Redis
    logger.info('Connecting to Redis...');
    const redisConnected = await connectToRedis();
    if (!redisConnected) {
      throw new Error('Redis connection failed');
    }
    logger.info('Redis connection successful');
    
    // Start HTTP server
    server.listen(env.PORT, () => {
      logger.info(`Server running in ${env.NODE_ENV} mode on port ${env.PORT}`);
      logger.info(`http://${env.HOST}:${env.PORT}`);
    });
    
  } catch (error:any) {
    logger.error('Failed to start server', { error: error.message });
    process.exit(1);
  }
};

// Handle server errors
server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    logger.error(`Port ${env.PORT} is already in use`);
  } else {
    logger.error('Server error', { error: error.message });
  }
  process.exit(1);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error: error.message, stack: error.stack });
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { reason });
  process.exit(1);
});

// Start the server
startServer();