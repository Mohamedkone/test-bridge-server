// src/socket/types.ts

import { Server as SocketIOServer, Socket as SocketIOSocket } from 'socket.io';
import { Server as HttpServer } from 'http';

/**
 * Socket.IO event names
 */
export enum SocketEvents {
  // Connection events
  CONNECT = 'connect',
  DISCONNECT = 'disconnect',
  ERROR = 'error',
  
  // Room events
  JOIN_ROOM = 'join-room',
  LEAVE_ROOM = 'leave-room',
  USER_JOINED = 'user-joined',
  USER_LEFT = 'user-left',
  
  // File transfer events
  FILE_UPLOAD_STARTED = 'file-upload-started',
  FILE_UPLOAD_PROGRESS = 'file-upload-progress',
  FILE_UPLOAD_COMPLETED = 'file-upload-completed',
  FILE_UPLOAD_FAILED = 'file-upload-failed',
  FILE_DOWNLOAD_STARTED = 'file-download-started',
  FILE_DOWNLOAD_PROGRESS = 'file-download-progress',
  FILE_DOWNLOAD_COMPLETED = 'file-download-completed',
  FILE_DOWNLOAD_FAILED = 'file-download-failed',
  
  // Room activity events
  ROOM_ACTIVITY = 'room-activity',
  USER_TYPING = 'user-typing',
  USER_ACTIVITY = 'user-activity',
  
  // Chat events
  CHAT_MESSAGE = 'chat-message',
  CHAT_HISTORY = 'chat-history',
  
  // System events
  SYSTEM_MESSAGE = 'system-message',
  SERVER_STATUS = 'server-status'
}

/**
 * User data stored in socket
 */
export interface SocketUser {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
}

/**
 * Socket.IO extended Socket interface with user data
 */
export interface Socket extends SocketIOSocket {
  data: {
    user?: SocketUser;
  };
}

/**
 * Room joined event data
 */
export interface RoomJoinedEvent {
  roomId: string;
  userId: string;
  userName: string;
  joinedAt: Date;
}

/**
 * Room left event data
 */
export interface RoomLeftEvent {
  roomId: string;
  userId: string;
  reason?: string;
}

/**
 * File upload event data
 */
export interface FileUploadEvent {
  fileId: string;
  fileName: string;
  roomId: string;
  userId: string;
  size: number;
  uploadedAt: Date;
}

/**
 * File upload progress event data
 */
export interface FileUploadProgressEventData {
  fileId: string;
  uploadId: string;
  fileName: string;
  roomId: string;
  bytesUploaded: number;
  totalBytes: number;
  percentage: number;
  uploadSpeed: number;
  estimatedTimeRemaining: number;
}

/**
 * File deleted event data
 */
export interface FileDeletedEvent {
  fileId: string;
  fileName: string;
  roomId: string;
  userId: string;
  deletedAt: Date;
}

/**
 * Room status event data
 */
export interface RoomStatusEvent {
  roomId: string;
  status: 'locked' | 'unlocked' | 'closed';
  updatedBy: string;
  updatedAt: Date;
}

/**
 * Error event data
 */
export interface ErrorEvent {
  code: string;
  message: string;
  details?: any;
}

/**
 * WebSocket event handler interface
 */
export interface SocketEventHandler {
  handleConnection(socket: Socket): void;
  handleDisconnection(socket: Socket): void;
  registerEventHandlers(socket: Socket): void;
}

/**
 * Room handler interface
 */
export interface RoomSocketHandler extends SocketEventHandler {
  joinRoom(socket: Socket, data: { roomId: string, userId: string }): void;
  leaveRoom(socket: Socket, data: { roomId: string, userId: string }): void;
  lockRoom(socket: Socket, data: { roomId: string, userId: string }): void;
  unlockRoom(socket: Socket, data: { roomId: string, userId: string }): void;
  closeRoom(socket: Socket, data: { roomId: string, userId: string }): void;
  sendMessage(socket: Socket, data: { roomId: string, message: string, userId: string }): void;
}

/**
 * File transfer handler interface
 */
export interface FileTransferSocketHandler extends SocketEventHandler {
  fileUploadStarted(socket: Socket, data: { roomId: string, fileName: string, fileId: string, size: number }): void;
  fileUploadProgress(socket: Socket, data: FileUploadProgressEventData): void;
  fileUploadCompleted(socket: Socket, data: { roomId: string, fileId: string, uploadId: string }): void;
  fileUploadFailed(socket: Socket, data: { roomId: string, fileId: string, error: string }): void;
  fileDeleted(socket: Socket, data: { roomId: string, fileId: string }): void;
}

/**
 * Socket authentication interface
 */
export interface SocketAuthService {
  authenticateConnection(socket: Socket): Promise<boolean>;
  authorizeRoomAccess(socket: Socket, roomId: string, userId: string): Promise<boolean>;
  getUserFromSocket(socket: Socket): Promise<any | null>;
}

/**
 * Socket state manager interface
 */
export interface SocketStateManager {
  addUserToRoom(roomId: string, userId: string, socketId: string): Promise<void>;
  removeUserFromRoom(roomId: string, userId: string, socketId: string): Promise<void>;
  getRoomUsers(roomId: string): Promise<string[]>;
  getUserRooms(userId: string): Promise<string[]>;
  isUserInRoom(roomId: string, userId: string): Promise<boolean>;
  getRoomState(roomId: string): Promise<RoomState>;
  updateRoomState(roomId: string, state: Partial<RoomState>): Promise<void>;
  clearRoomState(roomId: string): Promise<void>;
}

/**
 * Room state interface for socket management
 */
export interface RoomState {
  id: string;
  name?: string;
  users: string[];
  locked: boolean;
  adminId: string;
  activeTransfers: {
    [fileId: string]: {
      fileName: string;
      userId: string;
      progress: number;
      startedAt: Date;
    }
  };
  lastActivity: Date;
}

/**
 * File upload complete event data
 */
export interface FileUploadCompletedEventData {
  fileId: string;
  uploadId: string;
  fileName: string;
  roomId: string;
  totalBytes: number;
  downloadUrl?: string;
  fileType: string;
  contentHash: string;
  uploadedBy: string;
  uploadedAt: string;
}

/**
 * User activity in room event data
 */
export interface UserRoomActivityEventData {
  userId: string;
  roomId: string;
  activityType: 'joined' | 'left' | 'typing' | 'upload' | 'download' | 'other';
  timestamp: string;
  meta?: Record<string, any>;
}

/**
 * Room status data
 */
export interface RoomStatusData {
  roomId: string;
  activeUsers: SocketUser[];
  activeUploads: number;
  activeDownloads: number;
  lastActivity: string;
}

/**
 * Room message data
 */
export interface RoomMessageData {
  id: string;
  roomId: string;
  userId: string;
  userName: string;
  content: string;
  timestamp: string;
  type: 'text' | 'system' | 'file';
  fileId?: string;
}

/**
 * Socket IO server initialization function
 */
export type SocketInitializer = (httpServer: HttpServer) => SocketIOServer;

/**
 * Socket middleware function
 */
export type SocketMiddleware = (socket: Socket, next: (err?: Error) => void) => void | Promise<void>;