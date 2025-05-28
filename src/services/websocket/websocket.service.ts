import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { injectable, inject } from 'inversify';
import { Logger } from '../../utils/logger';
import { redisClient } from '../../utils/redis';
import { AuthService } from '../auth/auth.service';
import { WebSocketError } from './errors';
import { JwtService } from '../auth/jwt.service';

@injectable()
export class WebSocketService {
  private io: Server | null = null;
  private rooms: Map<string, Set<string>> = new Map(); // roomId -> Set of socketIds
  private userSockets: Map<string, Set<string>> = new Map(); // userId -> Set of socketIds
  private userRoles: Map<string, Set<string>> = new Map(); // userId -> Set of roles
  private roomSockets: Map<string, Set<string>> = new Map(); // roomId -> Set of socketIds

  constructor(
    @inject('AuthService') private authService: AuthService,
    @inject('Logger') private logger: Logger,
    @inject('JwtService') private jwtService: JwtService
  ) {
    this.logger = logger.createChildLogger('WebSocketService');
  }

  /**
   * Initialize the WebSocket server
   */
  initialize(server: any): void {
    try {
      // Create Socket.IO server
      this.io = new Server(server, {
        cors: {
          origin: process.env.CORS_ORIGIN || '*',
          methods: ['GET', 'POST'],
          credentials: true
        },
        adapter: createAdapter(redisClient, redisClient.duplicate())
      });

      // Authentication middleware
      this.io.use(async (socket, next) => {
        try {
          const token = socket.handshake.auth.token;
          if (!token) {
            throw new WebSocketError('Authentication token required');
          }

          const validationResult = await this.authService.validateToken(token);
          if (!validationResult.valid) {
            throw new WebSocketError('Invalid authentication token');
          }
          
          if (!validationResult.userId) {
            throw new WebSocketError('Invalid user ID in token');
          }

          // Attach user info to socket
          socket.data.userId = validationResult.userId;
          socket.data.roles = validationResult.roles || [];
          
          // Track the user's socket connection
          this.trackUserSocket(validationResult.userId, socket.id);
          
          // Track user roles for role-based broadcasts
          this.trackUserRoles(validationResult.userId, validationResult.roles || []);
          
          next();
        } catch (error: any) {
          next(new WebSocketError(error.message));
        }
      });

      // Connection handler
      this.io.on('connection', this.handleConnection.bind(this));

      this.logger.info('WebSocket server initialized');
    } catch (error: any) {
      this.logger.error('Failed to initialize WebSocket server', { error: error.message });
      throw new WebSocketError('Failed to initialize WebSocket server');
    }
  }

  /**
   * Handle new socket connection
   */
  private handleConnection(socket: Socket): void {
    this.logger.debug('New socket connection', { socketId: socket.id });

    // Authenticate user from token
    const token = socket.handshake.auth.token;
    if (!token) {
      this.logger.warn('Socket connection without token', { socketId: socket.id });
      socket.disconnect(true);
      return;
    }

    try {
      const payload = this.jwtService.verifyToken(token);
      const userId = payload.sub;

      // Store socket mapping
      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId)!.add(socket.id);

      // Attach user ID to socket
      (socket as any).userId = userId;

      this.logger.debug('Socket authenticated', { socketId: socket.id, userId });

      // Join room
      socket.on('join:room', (roomId: string) => this.handleJoinRoom(socket, roomId, userId));

      // Leave room
      socket.on('leave:room', (roomId: string) => this.handleLeaveRoom(socket, roomId, userId));

      // File upload progress
      socket.on('upload:progress', (data: { 
        fileId: string; 
        progress: number;
        bytesUploaded?: number;
        totalBytes?: number;
        speed?: number;
        status?: 'starting' | 'uploading' | 'paused' | 'completed' | 'error';
        error?: string;
      }) => {
        this.handleUploadProgress(socket, data);
      });

      // File download progress
      socket.on('download:progress', (data: { 
        fileId: string; 
        progress: number;
        bytesDownloaded?: number;
        totalBytes?: number;
        speed?: number;
        status?: 'starting' | 'downloading' | 'paused' | 'completed' | 'error';
        error?: string;
      }) => {
        this.handleDownloadProgress(socket, data);
      });

      // User presence status
      socket.on('presence:update', (status: 'online' | 'away' | 'busy' | 'offline') => {
        this.updateUserPresence(socket, status);
      });

      // Peer-to-peer signaling
      socket.on('p2p:signal', (data: { 
        target: string; 
        signal: any; 
        metadata?: any;
      }) => {
        this.relayP2PSignal(socket, data);
      });

      // Disconnect
      socket.on('disconnect', () => this.handleDisconnect(socket, userId));

    } catch (error: any) {
      this.logger.warn('Socket authentication failed', { 
        socketId: socket.id,
        error: error.message
      });
      socket.disconnect(true);
    }
  }

  /**
   * Track user socket connection
   */
  private trackUserSocket(userId: string, socketId: string): void {
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId)?.add(socketId);
  }
  
  /**
   * Track user roles for role-based broadcasts
   */
  private trackUserRoles(userId: string, roles: string[]): void {
    this.userRoles.set(userId, new Set(roles));
  }
  
  /**
   * Update user presence status
   */
  private updateUserPresence(socket: any, status: 'online' | 'away' | 'busy' | 'offline'): void {
    try {
      const userId = socket.data.userId;
      
      // Broadcast to rooms the user is in
      for (const [roomId, sockets] of this.rooms.entries()) {
        if (sockets.has(socket.id)) {
          this.io?.to(roomId).emit('presence:updated', {
            userId,
            status,
            timestamp: new Date().toISOString()
          });
        }
      }
      
      this.logger.info('User presence updated', { 
        userId, 
        status 
      });
    } catch (error: any) {
      this.logger.error('Failed to update user presence', { 
        socketId: socket.id,
        error: error.message 
      });
      socket.emit('error', { message: 'Failed to update presence status' });
    }
  }
  
  /**
   * Relay peer-to-peer signaling data
   */
  private relayP2PSignal(socket: any, data: { 
    target: string; 
    signal: any; 
    metadata?: any;
  }): void {
    try {
      const { target, signal, metadata } = data;
      const sourceUserId = socket.data.userId;
      
      // Find target user's sockets
      const targetSockets = this.userSockets.get(target);
      
      if (targetSockets && targetSockets.size > 0) {
        // Send to all sockets of the target user (they might be connected from multiple devices)
        for (const targetSocketId of targetSockets) {
          this.io?.to(targetSocketId).emit('p2p:signal', {
            source: sourceUserId,
            signal,
            metadata
          });
        }
        
        this.logger.info('P2P signal relayed', { 
          from: sourceUserId, 
          to: target 
        });
      } else {
        // Target user not connected
        socket.emit('p2p:error', {
          message: 'Target user not connected',
          target
        });
      }
    } catch (error: any) {
      this.logger.error('Failed to relay P2P signal', { 
        socketId: socket.id,
        error: error.message 
      });
      socket.emit('error', { message: 'Failed to relay P2P signal' });
    }
  }

  /**
   * Handle join room
   */
  private handleJoinRoom(socket: Socket, roomId: string, userId: string): void {
    try {
      // Leave any existing rooms
      this.leaveAllRooms(socket);

      // Join new room
      socket.join(roomId);
      
      // Track room membership
      if (!this.rooms.has(roomId)) {
        this.rooms.set(roomId, new Set());
      }
      this.rooms.get(roomId)?.add(socket.id);

      // Track room mapping
      if (!this.roomSockets.has(roomId)) {
        this.roomSockets.set(roomId, new Set());
      }
      this.roomSockets.get(roomId)?.add(socket.id);

      // Notify room of new participant
      this.io?.to(roomId).emit('room:user_joined', {
        userId,
        socketId: socket.id
      });

      this.logger.info('Client joined room', { 
        socketId: socket.id, 
        userId,
        roomId 
      });
    } catch (error: any) {
      this.logger.error('Failed to join room', { 
        socketId: socket.id,
        roomId,
        error: error.message 
      });
      socket.emit('error', { message: 'Failed to join room' });
    }
  }

  /**
   * Handle leave room
   */
  private handleLeaveRoom(socket: Socket, roomId: string, userId: string): void {
    try {
      socket.leave(roomId);
      
      // Update room tracking
      this.rooms.get(roomId)?.delete(socket.id);
      if (this.rooms.get(roomId)?.size === 0) {
        this.rooms.delete(roomId);
      }

      // Track room mapping
      if (this.roomSockets.has(roomId)) {
        this.roomSockets.get(roomId)?.delete(socket.id);
      }

      // Notify room of departure
      this.io?.to(roomId).emit('room:user_left', {
        userId,
        socketId: socket.id
      });

      this.logger.info('Client left room', { 
        socketId: socket.id, 
        userId,
        roomId 
      });
    } catch (error: any) {
      this.logger.error('Failed to leave room', { 
        socketId: socket.id,
        roomId,
        error: error.message 
      });
      socket.emit('error', { message: 'Failed to leave room' });
    }
  }

  /**
   * Leave all rooms
   */
  private leaveAllRooms(socket: any): void {
    for (const [roomId, sockets] of this.rooms.entries()) {
      if (sockets.has(socket.id)) {
        this.handleLeaveRoom(socket, roomId, socket.data.userId);
      }
    }
  }

  /**
   * Handle upload progress
   */
  private handleUploadProgress(socket: any, data: { 
    fileId: string; 
    progress: number;
    bytesUploaded?: number;
    totalBytes?: number;
    speed?: number;
    status?: 'starting' | 'uploading' | 'paused' | 'completed' | 'error';
    error?: string;
  }): void {
    try {
      const rooms = Array.from(socket.rooms);
      const roomId = rooms.length > 1 ? rooms[1] : null; // First room is socket's own room
      if (roomId && typeof roomId === 'string') {
        this.io?.to(roomId).emit('upload:progress', {
          fileId: data.fileId,
          progress: data.progress,
          bytesUploaded: data.bytesUploaded,
          totalBytes: data.totalBytes,
          speed: data.speed,
          status: data.status || 'uploading',
          error: data.error,
          userId: socket.data.userId,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error: any) {
      this.logger.error('Failed to handle upload progress', { 
        socketId: socket.id,
        error: error.message 
      });
    }
  }

  /**
   * Handle download progress
   */
  private handleDownloadProgress(socket: any, data: { 
    fileId: string; 
    progress: number;
    bytesDownloaded?: number;
    totalBytes?: number;
    speed?: number;
    status?: 'starting' | 'downloading' | 'paused' | 'completed' | 'error';
    error?: string;
  }): void {
    try {
      const rooms = Array.from(socket.rooms);
      const roomId = rooms.length > 1 ? rooms[1] : null; // First room is socket's own room
      if (roomId && typeof roomId === 'string') {
        this.io?.to(roomId).emit('download:progress', {
          fileId: data.fileId,
          progress: data.progress,
          bytesDownloaded: data.bytesDownloaded,
          totalBytes: data.totalBytes,
          speed: data.speed,
          status: data.status || 'downloading',
          error: data.error,
          userId: socket.data.userId,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error: any) {
      this.logger.error('Failed to handle download progress', { 
        socketId: socket.id,
        error: error.message 
      });
    }
  }

  /**
   * Notify file transfer status
   */
  notifyFileTransferStatus(roomId: string, data: {
    fileId: string;
    type: 'upload' | 'download';
    status: 'starting' | 'in_progress' | 'paused' | 'completed' | 'error';
    progress: number;
    bytesTransferred?: number;
    totalBytes?: number;
    speed?: number;
    error?: string;
    userId: string;
  }): void {
    try {
      const event = `${data.type}:status`;
      this.io?.to(roomId).emit(event, {
        ...data,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      this.logger.error('Failed to notify file transfer status', { 
        roomId,
        fileId: data.fileId,
        error: error.message 
      });
    }
  }

  /**
   * Handle socket disconnect
   */
  private handleDisconnect(socket: Socket, userId: string): void {
    try {
      // Leave all rooms
      this.leaveAllRooms(socket);
      
      // Remove from user sockets tracking
      const userSockets = this.userSockets.get(userId);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          this.userSockets.delete(userId);
        }
      }
      
      // Remove from all room mappings
      for (const [roomId, sockets] of this.roomSockets.entries()) {
        if (sockets.has(socket.id)) {
          sockets.delete(socket.id);
          // Notify room members
          if (this.io) {
            this.io.to(roomId).emit('room:user_disconnected', { userId });
          }
        }
      }
      
      this.logger.info('Client disconnected', { 
        socketId: socket.id, 
        userId 
      });
    } catch (error: any) {
      this.logger.error('Error handling disconnect', { 
        socketId: socket.id,
        userId,
        error: error.message 
      });
    }
  }

  /**
   * Get all participants in a room
   */
  getRoomParticipants(roomId: string): string[] {
    const participants: string[] = [];
    const sockets = this.rooms.get(roomId);
    
    for (const socketId of sockets || []) {
      const socket = this.io?.sockets.sockets.get(socketId);
      if (socket) {
        participants.push(socket.data.userId);
      }
    }
    
    return participants;
  }

  /**
   * Broadcast an event to all connected clients in a room
   */
  broadcastToRoom(roomId: string, event: string, data: any): void {
    this.io?.to(roomId).emit(event, data);
  }

  /**
   * Broadcast an event to all connected clients
   */
  broadcastToAll(event: string, data: any): void {
    this.io?.emit(event, data);
  }
  
  /**
   * Broadcast an event to a specific user (all their connected devices)
   */
  broadcastToUser(userId: string, event: string, data: any): void {
    const userSockets = this.userSockets.get(userId);
    if (userSockets) {
      for (const socketId of userSockets) {
        this.io?.to(socketId).emit(event, data);
      }
    }
  }
  
  /**
   * Broadcast an event to all users with a specific role
   */
  broadcastToRole(role: string, event: string, data: any): void {
    // Find all users with this role
    for (const [userId, roles] of this.userRoles.entries()) {
      if (roles.has(role)) {
        // Broadcast to this user
        this.broadcastToUser(userId, event, data);
      }
    }
  }

  /**
   * Broadcast to all connected clients
   */
  broadcast(event: string, data: any): void {
    if (!this.io) return;
    this.io.emit(event, data);
  }

  /**
   * Send to a specific user on a single socket
   * Alias for broadcastToUser for backward compatibility
   */
  sendToUser(userId: string, event: string, data: any): void {
    this.broadcastToUser(userId, event, data);
  }

  /**
   * Get the number of connected clients
   */
  getConnectionCount(): number {
    if (!this.io) return 0;
    return this.io.engine.clientsCount;
  }
} 