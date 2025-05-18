// src/socket/types.ts

import { Socket } from 'socket.io';

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
export interface FileUploadProgressEvent {
  fileId: string;
  uploadId: string;
  fileName: string;
  roomId: string;
  userId: string;
  bytesUploaded: number;
  totalBytes: number;
  percentage: number;
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
  fileUploadProgress(socket: Socket, data: FileUploadProgressEvent): void;
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