// src/api/controllers/room.controller.ts
import { injectable, inject } from 'inversify';
import { Request, Response } from 'express';
import { RoomService, CreateRoomDto, UpdateRoomDto, RoomMemberDto, EphemeralFileDto } from '../../services/room/room.service';
import { Logger } from '../../utils/logger';
import { ValidationError, ForbiddenError } from '../../utils/errors';
import multer from 'multer';

// Configure multer for memory storage (files as buffers)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
  }
});

@injectable()
export class RoomController {
  constructor(
    @inject('RoomService') private roomService: RoomService,
    @inject('Logger') private logger: Logger
  ) {
    this.logger = logger.createChildLogger('RoomController');
  }

  /**
   * Create a new room
   */
  async createRoom(req: Request, res: Response) {
    try {
      const data: CreateRoomDto = {
        ...req.body,
        createdById: req.user.id
      };

      const room = await this.roomService.createRoom(data);
      res.status(201).json(room);
    } catch (error: any) {
      this.logger.error('Failed to create room', { error: error.message });
      if (error instanceof ValidationError) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  }

  /**
   * Get room by ID
   */
  async getRoomById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const room = await this.roomService.getRoomById(id);
      res.json(room);
    } catch (error: any) {
      this.logger.error('Failed to get room', { error: error.message });
      if (error instanceof ValidationError) {
        res.status(404).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  }

  /**
   * Update room
   */
  async updateRoom(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const data: UpdateRoomDto = req.body;
      const room = await this.roomService.updateRoom(id, data, req.user.id);
      res.json(room);
    } catch (error: any) {
      this.logger.error('Failed to update room', { error: error.message });
      if (error instanceof ValidationError) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  }

  /**
   * Delete room
   */
  async deleteRoom(req: Request, res: Response) {
    try {
      const { id } = req.params;
      await this.roomService.deleteRoom(id, req.user.id);
      res.status(204).send();
    } catch (error: any) {
      this.logger.error('Failed to delete room', { error: error.message });
      if (error instanceof ValidationError) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  }

  /**
   * Add member to room
   */
  async addMember(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const data: RoomMemberDto = req.body;
      await this.roomService.addMember(id, data, req.user.id);
      res.status(204).send();
    } catch (error: any) {
      this.logger.error('Failed to add member', { error: error.message });
      if (error instanceof ValidationError) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  }

  /**
   * Remove member from room
   */
  async removeMember(req: Request, res: Response) {
    try {
      const { id, userId } = req.params;
      await this.roomService.removeMember(id, userId, req.user.id);
      res.status(204).send();
    } catch (error: any) {
      this.logger.error('Failed to remove member', { error: error.message });
      if (error instanceof ValidationError) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  }

  /**
   * Get room members
   */
  async getRoomMembers(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const members = await this.roomService.getRoomMembers(id);
      res.json(members);
    } catch (error: any) {
      this.logger.error('Failed to get room members', { error: error.message });
      if (error instanceof ValidationError) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  }

  /**
   * Register an ephemeral file in a P2P room
   */
  async registerEphemeralFile(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const fileData: Omit<EphemeralFileDto, 'expiresAt'> = {
        ...req.body,
        ownerId: req.user.id
      };

      const file = await this.roomService.registerEphemeralFile(id, fileData, req.user.id);
      res.status(201).json(file);
    } catch (error: any) {
      this.logger.error('Failed to register ephemeral file', { error: error.message });
      if (error instanceof ValidationError) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  }

  /**
   * Get all ephemeral files in a P2P room
   */
  async getEphemeralFiles(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const files = await this.roomService.getEphemeralFiles(id, req.user.id);
      res.json(files);
    } catch (error: any) {
      this.logger.error('Failed to get ephemeral files', { error: error.message });
      if (error instanceof ValidationError) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  }

  /**
   * Remove an ephemeral file from a P2P room
   */
  async removeEphemeralFile(req: Request, res: Response) {
    try {
      const { id, fileId } = req.params;
      const success = await this.roomService.removeEphemeralFile(id, fileId, req.user.id);
      res.status(success ? 204 : 404).send();
    } catch (error: any) {
      this.logger.error('Failed to remove ephemeral file', { error: error.message });
      if (error instanceof ValidationError) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  }

  /**
   * Update participant status in a room
   */
  async updateParticipantStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { socketId, status, transferInfo } = req.body;

      await this.roomService.updateParticipantStatus(
        id,
        req.user.id,
        socketId,
        status,
        transferInfo
      );
      
      res.status(204).send();
    } catch (error: any) {
      this.logger.error('Failed to update participant status', { error: error.message });
      if (error instanceof ValidationError) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  }

  /**
   * Get active participants in a room
   */
  async getRoomParticipants(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const participants = await this.roomService.getRoomParticipants(id, req.user.id);
      res.json(participants);
    } catch (error: any) {
      this.logger.error('Failed to get room participants', { error: error.message });
      if (error instanceof ValidationError) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  }

  /**
   * Lock a room - prevents users from sharing new content
   * Only room owners can perform this action
   */
  async lockRoom(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const room = await this.roomService.lockRoom(id, req.user.id);
      res.json(room);
    } catch (error: any) {
      this.logger.error('Failed to lock room', { error: error.message });
      if (error instanceof ValidationError) {
        res.status(400).json({ error: error.message });
      } else if (error instanceof ForbiddenError) {
        res.status(403).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  }

  /**
   * Unlock a room - allows users to share content
   * Only room owners can perform this action
   */
  async unlockRoom(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const room = await this.roomService.unlockRoom(id, req.user.id);
      res.json(room);
    } catch (error: any) {
      this.logger.error('Failed to unlock room', { error: error.message });
      if (error instanceof ValidationError) {
        res.status(400).json({ error: error.message });
      } else if (error instanceof ForbiddenError) {
        res.status(403).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  }

  /**
   * Join a room - adds current user to the room and returns room data
   */
  async joinRoom(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { password } = req.body; // Optional password for protected rooms

      const roomData = await this.roomService.joinRoom(id, req.user.id, password);
      res.json({
        success: true,
        data: roomData
      });
    } catch (error: any) {
      this.logger.error('Failed to join room', { error: error.message });
      if (error instanceof ValidationError) {
        res.status(400).json({ 
          success: false,
          error: error.message 
        });
      } else if (error instanceof ForbiddenError) {
        res.status(403).json({ 
          success: false,
          error: error.message 
        });
      } else {
        res.status(500).json({ 
          success: false,
          error: 'Internal server error' 
        });
      }
    }
  }

  /**
   * Upload file to room
   */
  async uploadFileToRoom(req: Request, res: Response) {
    try {
      const { id } = req.params;
      
      // Check if the room is locked
      const room = await this.roomService.getRoomById(id);
      if (room.isLocked) {
        throw new ForbiddenError('Room is locked. File uploads are not allowed');
      }

      // Get file from request (multer middleware handles this)
      if (!req.file) {
        throw new ValidationError('No file provided');
      }

      const file = {
        filename: req.file.originalname,
        contentType: req.file.mimetype,
        size: req.file.size,
        buffer: req.file.buffer
      };

      // Upload file to room
      const result = await this.roomService.uploadFileToRoom(id, req.user.id, file);
      
      res.status(201).json({
        success: true,
        data: {
          fileId: result.fileId,
          filename: result.filename,
          transferId: result.transferId
        }
      });
    } catch (error: any) {
      this.logger.error('Failed to upload file to room', { error: error.message });
      if (error instanceof ValidationError) {
        res.status(400).json({ 
          success: false,
          error: error.message 
        });
      } else if (error instanceof ForbiddenError) {
        res.status(403).json({ 
          success: false,
          error: error.message 
        });
      } else {
        res.status(500).json({ 
          success: false,
          error: 'Internal server error' 
        });
      }
    }
  }

  /**
   * Cancel file transfer
   */
  async cancelFileTransfer(req: Request, res: Response) {
    try {
      const { id, transferId } = req.params;
      
      // Cancel the transfer
      await this.roomService.cancelFileTransfer(id, transferId, req.user.id);
      
      res.json({
        success: true,
        message: 'Transfer cancelled successfully'
      });
    } catch (error: any) {
      this.logger.error('Failed to cancel file transfer', { error: error.message });
      if (error instanceof ValidationError) {
        res.status(400).json({ 
          success: false,
          error: error.message 
        });
      } else if (error instanceof ForbiddenError) {
        res.status(403).json({ 
          success: false,
          error: error.message 
        });
      } else {
        res.status(500).json({ 
          success: false,
          error: 'Internal server error' 
        });
      }
    }
  }
} 