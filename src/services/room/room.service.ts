// src/services/room/room.service.ts
import { injectable, inject } from 'inversify';
import { Logger } from '../../utils/logger';
import { DrizzleClient } from '../../db/drizzle.client';
import { rooms } from '../../db/schema/rooms';
import { roomAccess } from '../../db/schema/access';
import { eq, and, or, sql } from 'drizzle-orm';
import { ValidationError, ForbiddenError } from '../../utils/errors';
import { v4 as uuidv4 } from 'uuid';
import { WebSocketService } from '../websocket/websocket.service';
import { ActivityService, CreateActivityDto } from '../activity/activity.service';

export interface CreateRoomDto {
  name: string;
  companyId: string;
  createdById: string;
  roomType: 'vault' | 'p2p';
  accessLevel?: 'private' | 'company' | 'guests';
  userLimit?: number;
  fileSizeLimit?: number;
  fileExpiryDays?: number;
}

export interface UpdateRoomDto {
  name?: string;
  accessLevel?: 'private' | 'company' | 'guests';
  userLimit?: number;
  fileSizeLimit?: number;
  fileExpiryDays?: number;
  isLocked?: boolean;
  isActive?: boolean;
}

export interface RoomMemberDto {
  userId: string;
  accessType: 'owner' | 'editor' | 'viewer';
  invitedById?: string;
}

export interface EphemeralFileDto {
  id: string;
  name: string;
  size: number;
  contentType: string;
  ownerId: string;
  expiresAt: Date;
  url?: string;
}

export interface RoomParticipantStatus {
  userId: string;
  socketId: string;
  status: 'active' | 'idle' | 'offline';
  lastActive: Date;
  transferInProgress?: {
    fileId: string;
    type: 'upload' | 'download';
    progress: number;
  };
}

@injectable()
export class RoomService {
  private ephemeralFiles: Map<string, Map<string, EphemeralFileDto>> = new Map(); // roomId -> Map of fileId -> file
  private participantStatus: Map<string, Map<string, RoomParticipantStatus>> = new Map(); // roomId -> Map of userId -> status

  constructor(
    @inject('DrizzleClient') private db: DrizzleClient,
    @inject('Logger') private logger: Logger,
    @inject('WebSocketService') private wsService: WebSocketService,
    @inject('ActivityService') private activityService: ActivityService
  ) {
    this.logger = logger.createChildLogger('RoomService');
    this.setupEphemeralFileCleanup();
  }

  /**
   * Create a new room
   */
  async createRoom(data: CreateRoomDto) {
    try {
      const db = this.db.getInstance();
      const roomId = uuidv4();

      // Create room
      await db.insert(rooms).values({
        id: roomId,
        name: data.name,
        companyId: data.companyId,
        createdById: data.createdById,
        roomType: data.roomType,
        accessLevel: data.accessLevel || 'private',
        userLimit: data.userLimit || 10,
        fileSizeLimit: data.fileSizeLimit || 5 * 1024 * 1024 * 1024, // 5GB
        fileExpiryDays: data.fileExpiryDays || 7
      });

      // Add creator as owner
      await db.insert(roomAccess).values({
        id: uuidv4(),
        roomId,
        userId: data.createdById,
        accessType: 'owner',
        invitedById: null
      });

      const [room] = await db
        .select()
        .from(rooms)
        .where(eq(rooms.id, roomId));

      // Initialize ephemeral file storage for this room
      this.ephemeralFiles.set(roomId, new Map());
      
      // Initialize participant status tracking for this room
      this.participantStatus.set(roomId, new Map());

      this.logger.info('Room created', { roomId, createdBy: data.createdById });
      
      // Create activity record
      await this.activityService.createActivity({
        type: 'create_folder',
        userId: data.createdById,
        roomId,
        metadata: { roomName: data.name, roomType: data.roomType }
      });
      
      return room;
    } catch (error: any) {
      this.logger.error('Failed to create room', { error: error.message });
      throw error;
    }
  }

  /**
   * Get room by ID
   */
  async getRoomById(id: string) {
    try {
      const db = this.db.getInstance();
      const [room] = await db
        .select()
        .from(rooms)
        .where(eq(rooms.id, id));

      if (!room) {
        throw new ValidationError('Room not found');
      }

      return room;
    } catch (error: any) {
      this.logger.error('Failed to get room', { roomId: id, error: error.message });
      throw error;
    }
  }

  /**
   * Lock a room - prevents participants from sharing or modifying content
   * Only room owners can lock a room
   */
  async lockRoom(roomId: string, userId: string): Promise<any> {
    try {
      return this.toggleRoomLock(roomId, userId, true);
    } catch (error) {
      this.logger.error('Failed to lock room', { roomId, userId, error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Unlock a room - allows participants to share and modify content
   * Only room owners can unlock a room
   */
  async unlockRoom(roomId: string, userId: string): Promise<any> {
    try {
      return this.toggleRoomLock(roomId, userId, false);
    } catch (error) {
      this.logger.error('Failed to unlock room', { roomId, userId, error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Toggle room lock status
   */
  async toggleRoomLock(roomId: string, userId: string, lock: boolean): Promise<any> {
    try {
      const db = this.db.getInstance();

      // Check if user has admin access (owner or editor)
      const [access] = await db
        .select()
        .from(roomAccess)
        .where(
          and(
            eq(roomAccess.roomId, roomId),
            eq(roomAccess.userId, userId),
            eq(roomAccess.accessType, 'owner')
          )
        );

      if (!access) {
        throw new ForbiddenError('Only room owners can lock or unlock rooms');
      }

      // Get the room to check current status
      const [room] = await db
        .select()
        .from(rooms)
        .where(eq(rooms.id, roomId));
      
      if (!room) {
        throw new ValidationError('Room not found');
      }
      
      // If room status already matches request, return room
      if (room.isLocked === lock) {
        return room;
      }
      
      // Update room lock status
      await db
        .update(rooms)
        .set({ 
          isLocked: lock,
          updatedAt: new Date()
        })
        .where(eq(rooms.id, roomId));

      const [updatedRoom] = await db
        .select()
        .from(rooms)
        .where(eq(rooms.id, roomId));

      // Get current active participants
      const participants = this.participantStatus.get(roomId) || new Map();
      const participantList = Array.from(participants.values())
        .filter(p => p.status !== 'offline');
        
      // Additional actions when locking a room
      if (lock) {
        // Cancel any in-progress transfers for non-admin users
        for (const participant of participantList) {
          // Skip the user who locked the room (likely the owner)
          if (participant.userId === userId) continue;
          
          // Check if user is not an admin
          const isAdmin = await this.isUserRoomAdmin(roomId, participant.userId);
          if (!isAdmin && participant.transferInProgress) {
            // Clear the transfer status
            participant.transferInProgress = undefined;
            
            // Notify user that their transfer was canceled
            this.wsService.sendToUser(participant.userId, 'room:transfer_canceled', {
              roomId,
              reason: 'Room was locked by owner'
            });
          }
        }
      }

      // Notify room members about lock status change
      this.wsService.broadcastToRoom(roomId, 'room:lock_changed', {
        roomId,
        isLocked: lock,
        lockedBy: userId,
        message: lock 
          ? 'Room has been locked by the owner. Some operations may be restricted.' 
          : 'Room has been unlocked by the owner. All operations are now available.'
      });

      // Create activity record
      await this.activityService.createActivity({
        type: lock ? 'admin_action' : 'admin_action',
        userId,
        roomId,
        metadata: { 
          action: lock ? 'lock_room' : 'unlock_room',
          roomName: room.name
        }
      });

      this.logger.info(`Room ${lock ? 'locked' : 'unlocked'}`, { roomId, userId });
      return updatedRoom;
    } catch (error: any) {
      this.logger.error(`Failed to ${lock ? 'lock' : 'unlock'} room`, { roomId, error: error.message });
      throw error;
    }
  }

  /**
   * Check room lock status
   */
  async checkRoomLockStatus(roomId: string): Promise<boolean> {
    try {
      const db = this.db.getInstance();
      
      const [room] = await db
        .select({ isLocked: rooms.isLocked })
        .from(rooms)
        .where(eq(rooms.id, roomId));
      
      if (!room) {
        throw new ValidationError('Room not found');
      }
      
      return room.isLocked;
    } catch (error: any) {
      this.logger.error('Failed to check room lock status', { roomId, error: error.message });
      throw error;
    }
  }

  /**
   * Update room
   */
  async updateRoom(id: string, data: UpdateRoomDto, userId: string) {
    try {
      const db = this.db.getInstance();

      // Check if user has admin access
      const [access] = await db
        .select()
        .from(roomAccess)
        .where(
          and(
            eq(roomAccess.roomId, id),
            eq(roomAccess.userId, userId),
            or(
              eq(roomAccess.accessType, 'owner'),
              eq(roomAccess.accessType, 'editor')
            )
          )
        );

      if (!access) {
        throw new ForbiddenError('Insufficient permissions to update room');
      }
      
      // Only allow owner to lock/unlock a room
      if (data.isLocked !== undefined && access.accessType !== 'owner') {
        throw new ForbiddenError('Only room owners can lock or unlock rooms');
      }
      
      // Get current room state before update
      const [currentRoom] = await db
        .select()
        .from(rooms)
        .where(eq(rooms.id, id));

      // Update room
      await db
        .update(rooms)
        .set({
          ...data,
          updatedAt: new Date()
        })
        .where(eq(rooms.id, id));

      const [room] = await db
        .select()
        .from(rooms)
        .where(eq(rooms.id, id));

      // Notify room members of update
      this.wsService.broadcastToRoom(id, 'room:updated', {
        roomId: id,
        updates: data
      });
      
      // If lock status changed, log specific activity
      if (data.isLocked !== undefined && data.isLocked !== currentRoom.isLocked) {
        await this.activityService.createActivity({
          type: 'admin_action',
          userId,
          roomId: id,
          metadata: { 
            action: data.isLocked ? 'lock_room' : 'unlock_room',
            roomName: room.name
          }
        });
      } else {
        // Log general update activity
        await this.activityService.createActivity({
          type: 'admin_action',
          userId,
          roomId: id,
          metadata: { 
            action: 'update_room',
            roomName: room.name,
            changes: Object.keys(data)
          }
        });
      }

      this.logger.info('Room updated', { roomId: id, updatedBy: userId });
      return room;
    } catch (error: any) {
      this.logger.error('Failed to update room', { roomId: id, error: error.message });
      throw error;
    }
  }

  /**
   * Delete room
   */
  async deleteRoom(id: string, userId: string) {
    try {
      const db = this.db.getInstance();

      // Check if user is owner
      const [access] = await db
        .select()
        .from(roomAccess)
        .where(
          and(
            eq(roomAccess.roomId, id),
            eq(roomAccess.userId, userId),
            eq(roomAccess.accessType, 'owner')
          )
        );

      if (!access) {
        throw new ForbiddenError('Only room owner can delete the room');
      }

      // Delete room
      await db.delete(rooms).where(eq(rooms.id, id));

      // Notify room members
      this.wsService.broadcastToRoom(id, 'room:deleted', { roomId: id });

      this.logger.info('Room deleted', { roomId: id, deletedBy: userId });
    } catch (error: any) {
      this.logger.error('Failed to delete room', { roomId: id, error: error.message });
      throw error;
    }
  }

  /**
   * Add member to room
   */
  async addMember(roomId: string, data: RoomMemberDto, addedBy: string) {
    try {
      const db = this.db.getInstance();

      // Check if adder has admin access
      const [adderAccess] = await db
        .select()
        .from(roomAccess)
        .where(
          and(
            eq(roomAccess.roomId, roomId),
            eq(roomAccess.userId, addedBy),
            or(
              eq(roomAccess.accessType, 'owner'),
              eq(roomAccess.accessType, 'editor')
            )
          )
        );

      if (!adderAccess) {
        throw new ForbiddenError('Insufficient permissions to add members');
      }

      // Add member
      await db.insert(roomAccess).values({
        id: uuidv4(),
        roomId,
        userId: data.userId,
        accessType: data.accessType,
        invitedById: addedBy
      });

      // Notify room members
      this.wsService.broadcastToRoom(roomId, 'room:member_added', {
        roomId,
        userId: data.userId,
        accessType: data.accessType
      });

      this.logger.info('Member added to room', {
        roomId,
        userId: data.userId,
        addedBy
      });
    } catch (error: any) {
      this.logger.error('Failed to add member', {
        roomId,
        userId: data.userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Remove member from room
   */
  async removeMember(roomId: string, userId: string, removedBy: string) {
    try {
      const db = this.db.getInstance();

      // Check if remover has admin access
      const [removerAccess] = await db
        .select()
        .from(roomAccess)
        .where(
          and(
            eq(roomAccess.roomId, roomId),
            eq(roomAccess.userId, removedBy),
            or(
              eq(roomAccess.accessType, 'owner'),
              eq(roomAccess.accessType, 'editor')
            )
          )
        );

      if (!removerAccess) {
        throw new ForbiddenError('Insufficient permissions to remove members');
      }

      // Check if trying to remove owner
      const [memberAccess] = await db
        .select()
        .from(roomAccess)
        .where(
          and(
            eq(roomAccess.roomId, roomId),
            eq(roomAccess.userId, userId)
          )
        );

      if (memberAccess?.accessType === 'owner') {
        throw new ForbiddenError('Cannot remove room owner');
      }

      // Remove member
      await db
        .delete(roomAccess)
        .where(
          and(
            eq(roomAccess.roomId, roomId),
            eq(roomAccess.userId, userId)
          )
        );

      // Notify room members
      this.wsService.broadcastToRoom(roomId, 'room:member_removed', {
        roomId,
        userId
      });

      this.logger.info('Member removed from room', {
        roomId,
        userId,
        removedBy
      });
    } catch (error: any) {
      this.logger.error('Failed to remove member', {
        roomId,
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get room members
   */
  async getRoomMembers(roomId: string) {
    try {
      const db = this.db.getInstance();
      const members = await db
        .select()
        .from(roomAccess)
        .where(eq(roomAccess.roomId, roomId));

      return members;
    } catch (error: any) {
      this.logger.error('Failed to get room members', {
        roomId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Check if user has sufficient access to a room
   */
  async checkAccess(roomId: string, userId: string, requiredLevel: 'read' | 'write' | 'admin') {
    try {
      const db = this.db.getInstance();
      
      // Get room status to check if it's locked
      const [roomData] = await db
        .select({ isLocked: rooms.isLocked })
        .from(rooms)
        .where(eq(rooms.id, roomId));
        
      if (!roomData) {
        throw new ValidationError('Room not found');
      }
      
      // Get user's access level
      const [access] = await db
        .select()
        .from(roomAccess)
        .where(
          and(
            eq(roomAccess.roomId, roomId),
            eq(roomAccess.userId, userId)
          )
        );

      if (!access) {
        throw new ForbiddenError('You do not have access to this room');
      }

      const accessLevels = {
        read: ['viewer', 'editor', 'owner'],
        write: ['editor', 'owner'],
        admin: ['owner']
      };

      const hasRequiredAccess = accessLevels[requiredLevel].includes(access.accessType);
      
      // If room is locked and action requires write access, only owner can write
      if (roomData.isLocked && requiredLevel === 'write' && access.accessType !== 'owner') {
        throw new ForbiddenError('Room is locked. Only the owner can perform this action');
      }
      
      if (!hasRequiredAccess) {
        throw new ForbiddenError(`You need ${requiredLevel} access to perform this action`);
      }
      
      return true;
    } catch (error: any) {
      this.logger.error('Failed to check room access', {
        roomId,
        userId,
        requiredLevel,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Register an ephemeral file in a room
   */
  async registerEphemeralFile(roomId: string, file: Omit<EphemeralFileDto, 'expiresAt'>, userId: string): Promise<EphemeralFileDto> {
    try {
      const db = this.db.getInstance();

      // Check if room exists and user has access
      await this.checkAccess(roomId, userId, 'write');

      // Calculate expiration based on room settings
      const [room] = await db
        .select({ fileExpiryDays: rooms.fileExpiryDays })
        .from(rooms)
        .where(eq(rooms.id, roomId));

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + room.fileExpiryDays);

      // Create ephemeral file record
      const ephemeralFile: EphemeralFileDto = {
        ...file,
        expiresAt
      };

      // Initialize room's ephemeral files if not already
      if (!this.ephemeralFiles.has(roomId)) {
        this.ephemeralFiles.set(roomId, new Map());
      }

      // Store file
      this.ephemeralFiles.get(roomId)!.set(file.id, ephemeralFile);

      // Notify room members
      this.wsService.broadcastToRoom(roomId, 'room:ephemeral_file_added', {
        roomId,
        file: ephemeralFile
      });

      // Log activity
      await this.activityService.createActivity({
        type: 'upload',
        userId,
        roomId,
        metadata: {
          fileName: file.name,
          fileSize: file.size,
          fileType: file.contentType,
          ephemeral: true
        }
      });

      // Schedule automatic cleanup
      setTimeout(() => {
        this.removeExpiredEphemeralFile(roomId, file.id);
      }, expiresAt.getTime() - Date.now());

      this.logger.info('Ephemeral file registered', {
        roomId,
        fileId: file.id,
        userId,
        expiresAt
      });

      return ephemeralFile;
    } catch (error: any) {
      this.logger.error('Failed to register ephemeral file', {
        roomId,
        fileId: file.id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Extend the expiration of an ephemeral file
   */
  async extendEphemeralFileExpiration(roomId: string, fileId: string, userId: string, additionalMinutes: number = 60): Promise<EphemeralFileDto | null> {
    try {
      // Check if room and file exist
      if (!this.ephemeralFiles.has(roomId) || !this.ephemeralFiles.get(roomId)!.has(fileId)) {
        throw new ValidationError('Ephemeral file not found');
      }

      // Check if user has access
      await this.checkAccess(roomId, userId, 'write');

      // Get the file
      const file = this.ephemeralFiles.get(roomId)!.get(fileId)!;
      
      // Only allow extension if owner or admin
      if (file.ownerId !== userId) {
        const isAdmin = await this.isUserRoomAdmin(roomId, userId);
        if (!isAdmin) {
          throw new ForbiddenError('Only file owner or room admin can extend expiration');
        }
      }

      // Calculate new expiration (add minutes)
      const newExpiresAt = new Date(file.expiresAt.getTime() + additionalMinutes * 60 * 1000);
      
      // Update file
      const updatedFile = {
        ...file,
        expiresAt: newExpiresAt
      };
      
      // Save updated file
      this.ephemeralFiles.get(roomId)!.set(fileId, updatedFile);
      
      // Notify room members
      this.wsService.broadcastToRoom(roomId, 'room:ephemeral_file_updated', {
        roomId,
        fileId,
        expiresAt: newExpiresAt
      });
      
      this.logger.info('Ephemeral file expiration extended', {
        roomId,
        fileId,
        userId,
        newExpiresAt
      });
      
      return updatedFile;
    } catch (error: any) {
      this.logger.error('Failed to extend ephemeral file expiration', {
        roomId,
        fileId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Automatically remove an expired ephemeral file
   */
  private async removeExpiredEphemeralFile(roomId: string, fileId: string): Promise<void> {
    try {
      if (!this.ephemeralFiles.has(roomId) || !this.ephemeralFiles.get(roomId)!.has(fileId)) {
        return; // Already removed
      }
      
      const file = this.ephemeralFiles.get(roomId)!.get(fileId)!;
      
      // Remove file
      this.ephemeralFiles.get(roomId)!.delete(fileId);
      
      // Notify room members
      this.wsService.broadcastToRoom(roomId, 'room:ephemeral_file_expired', {
        roomId,
        fileId,
        fileName: file.name
      });
      
      this.logger.info('Ephemeral file expired and removed', {
        roomId,
        fileId,
        fileName: file.name
      });
      
      // Log activity
      await this.activityService.createActivity({
        type: 'system_event',
        userId: file.ownerId,
        roomId,
        metadata: {
          action: 'ephemeral_file_expired',
          fileName: file.name,
          fileId
        }
      });
    } catch (error: any) {
      this.logger.error('Error removing expired ephemeral file', {
        roomId,
        fileId,
        error: error.message
      });
    }
  }

  /**
   * Get room participants
   */
  async getRoomParticipants(roomId: string, userId: string): Promise<RoomParticipantStatus[]> {
    try {
      // Check room access
      await this.checkAccess(roomId, userId, 'read');
      
      // Get participants
      const roomParticipants = this.participantStatus.get(roomId);
      if (!roomParticipants) {
        return [];
      }
      
      return Array.from(roomParticipants.values()).filter(p => p.status !== 'offline');
    } catch (error: any) {
      this.logger.error('Failed to get room participants', { 
        roomId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Get ephemeral files for a room
   */
  async getEphemeralFiles(roomId: string, userId: string): Promise<EphemeralFileDto[]> {
    try {
      // Check if user has access to room
      await this.checkAccess(roomId, userId, 'read');
      
      // Get ephemeral files
      if (!this.ephemeralFiles.has(roomId)) {
        return [];
      }
      
      return Array.from(this.ephemeralFiles.get(roomId)!.values());
    } catch (error: any) {
      this.logger.error('Failed to get ephemeral files', {
        roomId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Check if user is room admin (owner or editor)
   */
  private async isUserRoomAdmin(roomId: string, userId: string): Promise<boolean> {
    try {
      const db = this.db.getInstance();
      
      const [access] = await db
        .select()
        .from(roomAccess)
        .where(
          and(
            eq(roomAccess.roomId, roomId),
            eq(roomAccess.userId, userId),
            or(
              eq(roomAccess.accessType, 'owner'),
              eq(roomAccess.accessType, 'editor')
            )
          )
        );
        
      return !!access;
    } catch (error) {
      return false;
    }
  }

  /**
   * Update participant status
   */
  async updateParticipantStatus(
    roomId: string, 
    userId: string, 
    socketId: string, 
    status: 'active' | 'idle' | 'offline',
    transferInfo?: {
      fileId: string;
      type: 'upload' | 'download';
      progress: number;
    }
  ): Promise<void> {
    try {
      // Check if user has access to room
      await this.checkAccess(roomId, userId, 'read');

      // Initialize room's participant status if not already
      if (!this.participantStatus.has(roomId)) {
        this.participantStatus.set(roomId, new Map());
      }

      // Get or create participant status
      const existingStatus = this.participantStatus.get(roomId)!.get(userId);
      const updatedStatus: RoomParticipantStatus = {
        userId,
        socketId,
        status,
        lastActive: new Date(),
        transferInProgress: transferInfo || existingStatus?.transferInProgress
      };

      // Store updated status
      this.participantStatus.get(roomId)!.set(userId, updatedStatus);

      // Log activity for join/leave events
      if (!existingStatus || existingStatus.status !== status) {
        if (status === 'active' && existingStatus?.status !== 'active') {
          await this.activityService.createActivity({
            type: 'join_room',
            userId,
            roomId
          });
        } else if (status === 'offline' && existingStatus?.status !== 'offline') {
          await this.activityService.createActivity({
            type: 'leave_room',
            userId,
            roomId
          });
        }
      }

      // Broadcast updated participant list to room
      this.broadcastParticipantStatus(roomId);

      this.logger.debug('Participant status updated', {
        roomId,
        userId,
        status,
        hasTransfer: !!transferInfo
      });
    } catch (error: any) {
      this.logger.error('Failed to update participant status', {
        roomId,
        userId,
        error: error.message
      });
      // Don't throw; this shouldn't interrupt user experience
    }
  }

  /**
   * Get current activity summary for a room
   */
  async getRoomActivitySummary(roomId: string, userId: string): Promise<{
    activeUsers: number;
    idleUsers: number;
    totalMembers: number;
    activeTransfers: number;
    lastActivity?: Date;
  }> {
    try {
      // Check if user has access to room
      await this.checkAccess(roomId, userId, 'read');
      
      // Get participants
      const participants = await this.getRoomParticipants(roomId, userId);
      
      // Get room members count
      const db = this.db.getInstance();
      const members = await db
        .select()
        .from(roomAccess)
        .where(eq(roomAccess.roomId, roomId));
        
      // Get latest activity
      const [latestActivity] = await this.activityService.getRoomActivities(roomId, userId);
      
      // Count active, idle users and transfers
      const activeUsers = participants.filter(p => p.status === 'active').length;
      const idleUsers = participants.filter(p => p.status === 'idle').length;
      const activeTransfers = participants.filter(p => p.transferInProgress).length;
      
      return {
        activeUsers,
        idleUsers,
        totalMembers: members.length,
        activeTransfers,
        lastActivity: latestActivity?.createdAt
      };
    } catch (error: any) {
      this.logger.error('Failed to get room activity summary', {
        roomId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Broadcast participant status to all room members
   */
  private broadcastParticipantStatus(roomId: string): void {
    try {
      const participants = this.participantStatus.get(roomId);
      if (!participants) {
        return;
      }
      
      const activeParticipants = Array.from(participants.values())
        .filter(p => p.status !== 'offline');
      
      this.wsService.broadcastToRoom(roomId, 'room:participants', {
        roomId,
        participants: activeParticipants
      });
    } catch (error: any) {
      this.logger.error('Failed to broadcast participant status', { 
        roomId, 
        error: error.message 
      });
    }
  }
  
  /**
   * Set up periodic cleanup of expired ephemeral files
   */
  private setupEphemeralFileCleanup(): void {
    // Run cleanup every hour
    setInterval(() => {
      try {
        const now = new Date();
        
        // Check all rooms
        for (const [roomId, files] of this.ephemeralFiles.entries()) {
          // Find expired files
          const expiredFiles: string[] = [];
          for (const [fileId, file] of files.entries()) {
            if (file.expiresAt < now) {
              expiredFiles.push(fileId);
            }
          }
          
          // Remove expired files
          for (const fileId of expiredFiles) {
            files.delete(fileId);
            
            // Notify room
            this.wsService.broadcastToRoom(roomId, 'room:file_expired', {
              roomId,
              fileId
            });
            
            this.logger.info('Ephemeral file expired and removed', { 
              roomId, 
              fileId 
            });
          }
        }
      } catch (error: any) {
        this.logger.error('Error cleaning up ephemeral files', { 
          error: error.message 
        });
      }
    }, 60 * 60 * 1000); // 1 hour
  }

  /**
   * Remove an ephemeral file from a room
   */
  async removeEphemeralFile(roomId: string, fileId: string, userId: string): Promise<boolean> {
    try {
      // Check if room and file exist
      if (!this.ephemeralFiles.has(roomId) || !this.ephemeralFiles.get(roomId)!.has(fileId)) {
        return false;
      }

      // Check if user has access to room
      await this.checkAccess(roomId, userId, 'read');

      // Get the file to check if owner or admin
      const file = this.ephemeralFiles.get(roomId)!.get(fileId)!;
      
      // Only allow removal if owner or admin
      if (file.ownerId !== userId) {
        const isAdmin = await this.isUserRoomAdmin(roomId, userId);
        if (!isAdmin) {
          throw new ForbiddenError('Only file owner or room admin can remove ephemeral files');
        }
      }

      // Remove file
      this.ephemeralFiles.get(roomId)!.delete(fileId);
      
      // Notify room members
      this.wsService.broadcastToRoom(roomId, 'room:ephemeral_file_removed', {
        roomId,
        fileId,
        removedBy: userId
      });
      
      // Log activity
      await this.activityService.createActivity({
        type: 'delete',
        userId,
        roomId,
        metadata: {
          action: 'remove_ephemeral_file',
          fileId,
          fileName: file.name
        }
      });
      
      this.logger.info('Ephemeral file removed', {
        roomId,
        fileId,
        userId
      });
      
      return true;
    } catch (error: any) {
      this.logger.error('Failed to remove ephemeral file', {
        roomId,
        fileId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Join a room, creating a member record if needed and tracking participant status
   */
  async joinRoom(roomId: string, userId: string, password?: string): Promise<any> {
    try {
      const db = this.db.getInstance();
      
      // Get room
      const [room] = await db
        .select()
        .from(rooms)
        .where(eq(rooms.id, roomId));
        
      if (!room) {
        throw new ValidationError('Room not found');
      }
      
      // Check if room is active
      if (!room.isActive) {
        throw new ValidationError('Room is not active');
      }
      
      // Check if user is already a member
      const [existingAccess] = await db
        .select()
        .from(roomAccess)
        .where(
          and(
            eq(roomAccess.roomId, roomId),
            eq(roomAccess.userId, userId)
          )
        );
        
      // If not a member and room is not public, add as viewer
      if (!existingAccess && room.accessLevel !== 'private') {
        await db.insert(roomAccess).values({
          id: uuidv4(),
          roomId,
          userId,
          accessType: 'viewer',
          invitedById: null
        });
      } else if (!existingAccess) {
        throw new ForbiddenError('You do not have access to this room');
      }
      
      // Update participant status to active
      await this.updateParticipantStatus(
        roomId,
        userId,
        uuidv4(), // Socket ID placeholder - would be real socket ID in production
        'active'
      );
      
      // Create activity record
      await this.activityService.createActivity({
        type: 'join_room',
        userId,
        roomId
      });
      
      // Return room data with additional info
      return {
        ...room,
        isLocked: await this.checkRoomLockStatus(roomId),
        isAdmin: await this.isUserRoomAdmin(roomId, userId),
        accessType: existingAccess ? existingAccess.accessType : 'viewer'
      };
    } catch (error: any) {
      this.logger.error('Failed to join room', { roomId, userId, error: error.message });
      throw error;
    }
  }

  /**
   * Upload a file to a room
   */
  async uploadFileToRoom(roomId: string, userId: string, file: { 
    filename: string, 
    contentType: string, 
    size: number, 
    buffer: Buffer 
  }): Promise<{ fileId: string, filename: string, transferId: string }> {
    try {
      // Check if user has access to room
      await this.checkAccess(roomId, userId, 'write');
      
      // Check if room is locked
      const isLocked = await this.checkRoomLockStatus(roomId);
      if (isLocked) {
        // Check if user is admin (can bypass lock)
        const isAdmin = await this.isUserRoomAdmin(roomId, userId);
        if (!isAdmin) {
          throw new ForbiddenError('Room is locked. File uploads are not allowed');
        }
      }
      
      // Generate IDs
      const fileId = uuidv4();
      const transferId = uuidv4();
      
      // In a real implementation, we would:
      // 1. Store the file in a storage provider
      // 2. Create a database record for the file
      // 3. Track the transfer progress
      
      // For this test implementation, we'll simulate a successful upload
      this.logger.info('File uploaded to room', {
        roomId,
        userId,
        fileId,
        filename: file.filename,
        size: file.size
      });
      
      // Create activity record
      await this.activityService.createActivity({
        type: 'upload',
        userId,
        roomId,
        metadata: {
          fileId,
          fileName: file.filename,
          fileSize: file.size,
          contentType: file.contentType
        }
      });
      
      // Notify room participants
      this.wsService.broadcastToRoom(roomId, 'room:file_uploaded', {
        roomId,
        fileId,
        filename: file.filename,
        size: file.size,
        contentType: file.contentType,
        uploadedBy: userId
      });
      
      return {
        fileId,
        filename: file.filename,
        transferId
      };
    } catch (error: any) {
      this.logger.error('Failed to upload file to room', { 
        roomId, 
        userId, 
        filename: file.filename,
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Cancel a file transfer in progress
   */
  async cancelFileTransfer(roomId: string, transferId: string, userId: string): Promise<void> {
    try {
      // Check if user has access to room
      await this.checkAccess(roomId, userId, 'read');
      
      // In a real implementation, we would:
      // 1. Find the transfer by ID
      // 2. Check if user has permission to cancel (owner or admin)
      // 3. Cancel the transfer operation
      // 4. Clean up any temporary files
      
      this.logger.info('File transfer cancelled', {
        roomId,
        transferId,
        userId
      });
      
      // Create activity record
      await this.activityService.createActivity({
        type: 'system_event',
        userId,
        roomId,
        metadata: {
          action: 'cancel_transfer',
          transferId
        }
      });
      
      // Clear any in-progress transfer status for this user
      const participants = this.participantStatus.get(roomId);
      if (participants) {
        const participant = participants.get(userId);
        if (participant && participant.transferInProgress) {
          participant.transferInProgress = undefined;
          participants.set(userId, participant);
        }
        
        // Broadcast updated status
        this.broadcastParticipantStatus(roomId);
      }
      
      // Notify room participants
      this.wsService.broadcastToRoom(roomId, 'room:transfer_cancelled', {
        roomId,
        transferId,
        cancelledBy: userId
      });
    } catch (error: any) {
      this.logger.error('Failed to cancel file transfer', { 
        roomId, 
        transferId,
        userId,
        error: error.message 
      });
      throw error;
    }
  }
} 