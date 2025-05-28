// src/socket/index.ts
import { Server as HttpServer } from 'http';
import { Server, ServerOptions, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { redisClient } from '../utils/redis';
import { env } from '../config/env';
import { Logger } from '../utils/logger';
import { AuthService } from '../services/auth/auth.service';
import { container } from '../config/container';
import { SocketEvents, SocketUser } from './types';

let io: Server;
const logger = new Logger('socket');

/**
 * Authentication middleware for Socket.IO
 * @param socket Socket instance
 * @param next Middleware callback
 */
const socketAuthMiddleware = async (socket: Socket, next: (err?: Error) => void) => {
  try {
    const token = socket.handshake.auth.token || 
                  socket.handshake.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      logger.warn('Socket connection rejected: No token provided', { socketId: socket.id });
      return next(new Error('Authentication required'));
    }
    
    // Validate token
    const authService = container.get<AuthService>('AuthService');
    const validationResult = await authService.validateToken(token);
    
    if (!validationResult.valid) {
      logger.warn('Socket connection rejected: Invalid token', { 
        socketId: socket.id, 
        error: validationResult.error 
      });
      return next(new Error('Authentication failed: ' + validationResult.error));
    }
    
    // Store user data in socket
    if (validationResult.userId) {
      socket.data.user = { id: validationResult.userId } as SocketUser;
      logger.info('User authenticated on socket', { 
        socketId: socket.id, 
        userId: validationResult.userId
      });
    }
    
    next();
  } catch (error:any) {
    logger.error('Socket authentication error', { error: error.message });
    next(new Error('Authentication error'));
  }
};

/**
 * Initialize Socket.IO with Redis adapter
 * @param httpServer HTTP server instance
 * @returns Socket.IO server instance
 */
export const initializeSocketIO = (httpServer: HttpServer): Server => {
  const ioOptions: Partial<ServerOptions> = {
    cors: {
      origin: env.NODE_ENV === 'production' 
        ? ['https://yourdomain.com'] 
        : ['http://localhost:3000', 'http://localhost:5173'],
      methods: ['GET', 'POST'],
      credentials: true
    },
    transports: ['websocket', 'polling'],
    // Add connection throttling for security
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
    },
    pingTimeout: 20000,
    pingInterval: 25000
  };

  io = new Server(httpServer, ioOptions);
  
  // Apply authentication middleware
  io.use(socketAuthMiddleware);

  // When in production or development (not test), use Redis adapter
  if (env.NODE_ENV !== 'test') {
    setupRedisAdapter()
      .then(() => logger.info('Socket.IO Redis adapter configured'))
      .catch(err => logger.error('Failed to set up Socket.IO Redis adapter', { error: err.message }));
  }

  // Set up connection handler
  io.on('connection', (socket) => {
    const userId = socket.data?.user?.id;
    logger.info('Socket connected', { socketId: socket.id, userId });
    
    // Join user's private room for direct messages
    if (userId) {
      socket.join(`user:${userId}`);
    }
    
    // Handle room joining
    socket.on(SocketEvents.JOIN_ROOM, (roomId) => {
      // Validate room ID format
      if (!/^[a-f0-9-]{36}$/.test(roomId)) {
        socket.emit(SocketEvents.ERROR, { message: 'Invalid room ID format' });
        return;
      }
      
      socket.join(`room:${roomId}`);
      logger.info('User joined room', { userId, roomId, socketId: socket.id });
      
      // Notify room participants
      socket.to(`room:${roomId}`).emit(SocketEvents.USER_JOINED, { 
        userId, 
        roomId, 
        timestamp: new Date().toISOString() 
      });
    });
    
    // Handle room leaving
    socket.on(SocketEvents.LEAVE_ROOM, (roomId) => {
      socket.leave(`room:${roomId}`);
      logger.info('User left room', { userId, roomId, socketId: socket.id });
      
      // Notify room participants
      socket.to(`room:${roomId}`).emit(SocketEvents.USER_LEFT, { 
        userId, 
        roomId, 
        timestamp: new Date().toISOString() 
      });
    });
    
    // Handle disconnection
    socket.on('disconnect', (reason) => {
      logger.info('Socket disconnected', { socketId: socket.id, userId, reason });
    });
    
    // Handle errors
    socket.on('error', (error) => {
      logger.error('Socket error', { socketId: socket.id, userId, error });
    });
  });

  logger.info('Socket.IO initialized');
  return io;
};

/**
 * Set up Redis adapter for Socket.IO
 */
async function setupRedisAdapter(): Promise<void> {
  try {
    // Create Redis adapter for horizontal scaling
    const pubClient = redisClient;
    const subClient = redisClient.duplicate();

    // Connect the Redis clients if not already connected
    await Promise.all([
      pubClient.isOpen ? Promise.resolve() : pubClient.connect(),
      subClient.isOpen ? Promise.resolve() : subClient.connect()
    ]);
    
    // Create and set the Redis adapter
    io.adapter(createAdapter(pubClient, subClient, {
      key: `${env.REDIS_PREFIX}socket.io`
    }));
    
    // Handle Redis connection errors
    pubClient.on('error', (err:any) => {
      logger.error('Redis pub client error', { error: err.message });
    });
    
    subClient.on('error', (err:any) => {
      logger.error('Redis sub client error', { error: err.message });
    });
    
  } catch (error:any) {
    logger.error('Error setting up Redis adapter', { error: error.message });
    throw error;
  }
}

/**
 * Get the Socket.IO instance
 * @returns Socket.IO server instance
 */
export const getSocketIO = (): Server => {
  if (!io) {
    throw new Error('Socket.IO has not been initialized. Please call initializeSocketIO first.');
  }
  return io;
};

/**
 * Emit event to a specific room
 * @param roomId Room ID
 * @param event Event name
 * @param data Event data
 */
export const emitToRoom = (roomId: string, event: string, data: any): void => {
  if (!io) {
    logger.warn('Attempted to emit to room before Socket.IO initialization');
    return;
  }
  
  io.to(`room:${roomId}`).emit(event, data);
  logger.debug('Emitted event to room', { roomId, event });
};

/**
 * Emit event to a specific user
 * @param userId User ID
 * @param event Event name
 * @param data Event data
 */
export const emitToUser = (userId: string, event: string, data: any): void => {
  if (!io) {
    logger.warn('Attempted to emit to user before Socket.IO initialization');
    return;
  }
  
  io.to(`user:${userId}`).emit(event, data);
  logger.debug('Emitted event to user', { userId, event });
};