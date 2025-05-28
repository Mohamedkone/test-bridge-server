import { Router } from 'express';
import { injectable, inject } from 'inversify';
import { RoomController } from '../controllers/room.controller';
import { AuthMiddleware } from '../middleware/auth.middleware';

@injectable()
export class RoomRoutes {
  private router: Router;

  constructor(
    @inject('RoomController') private roomController: RoomController,
    @inject('AuthMiddleware') private authMiddleware: AuthMiddleware
  ) {
    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Room management routes
    this.router.post('/', this.authMiddleware.verifyToken.bind(this.authMiddleware), this.roomController.createRoom.bind(this.roomController));
    this.router.get('/:id', this.authMiddleware.verifyToken.bind(this.authMiddleware), this.roomController.getRoomById.bind(this.roomController));
    this.router.put('/:id', this.authMiddleware.verifyToken.bind(this.authMiddleware), this.roomController.updateRoom.bind(this.roomController));
    this.router.delete('/:id', this.authMiddleware.verifyToken.bind(this.authMiddleware), this.roomController.deleteRoom.bind(this.roomController));
    
    // Room locking/unlocking routes
    this.router.post('/:id/lock', this.authMiddleware.verifyToken.bind(this.authMiddleware), this.roomController.lockRoom.bind(this.roomController));
    this.router.post('/:id/unlock', this.authMiddleware.verifyToken.bind(this.authMiddleware), this.roomController.unlockRoom.bind(this.roomController));
    
    // Room join route
    this.router.post('/:id/join', this.authMiddleware.verifyToken.bind(this.authMiddleware), this.roomController.joinRoom.bind(this.roomController));
    
    // Room membership routes
    this.router.post('/:id/members', this.authMiddleware.verifyToken.bind(this.authMiddleware), this.roomController.addMember.bind(this.roomController));
    this.router.delete('/:id/members/:userId', this.authMiddleware.verifyToken.bind(this.authMiddleware), this.roomController.removeMember.bind(this.roomController));
    this.router.get('/:id/members', this.authMiddleware.verifyToken.bind(this.authMiddleware), this.roomController.getRoomMembers.bind(this.roomController));
    
    // P2P ephemeral file routes
    this.router.post('/:id/ephemeral-files', this.authMiddleware.verifyToken.bind(this.authMiddleware), this.roomController.registerEphemeralFile.bind(this.roomController));
    this.router.get('/:id/ephemeral-files', this.authMiddleware.verifyToken.bind(this.authMiddleware), this.roomController.getEphemeralFiles.bind(this.roomController));
    this.router.delete('/:id/ephemeral-files/:fileId', this.authMiddleware.verifyToken.bind(this.authMiddleware), this.roomController.removeEphemeralFile.bind(this.roomController));
    
    // Room file operations routes
    this.router.post('/:id/files', this.authMiddleware.verifyToken.bind(this.authMiddleware), this.roomController.uploadFileToRoom.bind(this.roomController));
    this.router.post('/:id/files/transfer/:transferId/cancel', this.authMiddleware.verifyToken.bind(this.authMiddleware), this.roomController.cancelFileTransfer.bind(this.roomController));
    
    // Real-time participant awareness routes
    this.router.post('/:id/participants/status', this.authMiddleware.verifyToken.bind(this.authMiddleware), this.roomController.updateParticipantStatus.bind(this.roomController));
    this.router.get('/:id/participants', this.authMiddleware.verifyToken.bind(this.authMiddleware), this.roomController.getRoomParticipants.bind(this.roomController));
  }

  public getRouter(): Router {
    return this.router;
  }
} 