// src/socket/index.ts
import { Server as HttpServer } from 'http';
import { Server, ServerOptions } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { redisClient } from '../utils/redis';
import { env } from '../config/env';

let io: Server;

export const initializeSocketIO = (httpServer: HttpServer): Server => {
  const ioOptions: Partial<ServerOptions> = {
    cors: {
      origin: env.NODE_ENV === 'production' 
        ? ['https://yourdomain.com'] 
        : ['http://localhost:3000', 'http://localhost:5173'],
      methods: ['GET', 'POST'],
      credentials: true
    },
    transports: ['websocket', 'polling']
  };

  io = new Server(httpServer, ioOptions);

  // When in production or development (not test), use Redis adapter
  if (env.NODE_ENV !== 'test') {
    try {
      // Create Redis adapter for horizontal scaling
      const pubClient = redisClient;
      const subClient = redisClient.duplicate();
  
      // Connect the Redis clients if not already connected
      Promise.all([
        pubClient.isOpen ? Promise.resolve() : pubClient.connect(),
        subClient.isOpen ? Promise.resolve() : subClient.connect()
      ]).then(() => {
        io.adapter(createAdapter(pubClient, subClient));
        console.log('Socket.IO Redis adapter configured');
      }).catch(err => {
        console.error('Failed to set up Socket.IO Redis adapter:', err);
      });
    } catch (error) {
      console.error('Error setting up Redis adapter:', error);
    }
  }

  // Set up basic connection listener
  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);
    
    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });

  console.log('Socket.IO initialized');
  return io;
};

export const getSocketIO = (): Server => {
  if (!io) {
    throw new Error('Socket.IO has not been initialized. Please call initializeSocketIO first.');
  }
  return io;
};