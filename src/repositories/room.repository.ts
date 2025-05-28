import { injectable, inject } from 'inversify';
import { Logger } from '../utils/logger';
import { rooms } from '../db/schema/rooms';
import { roomMembers } from '../db/schema/room-members';
import { eq, and } from 'drizzle-orm';
import { DrizzleClient } from '../db/drizzle.client';

/**
 * Room Repository
 */
@injectable()
export class RoomRepository {
  constructor(
    @inject('Logger') private logger: Logger,
    @inject('DrizzleClient') private dbClient: DrizzleClient
  ) {
    this.logger = logger.createChildLogger('RoomRepository');
  }
  
  /**
   * Check if a user has access to a room
   */
  async checkUserAccess(roomId: string, userId: string): Promise<boolean> {
    try {
      const db = await this.dbClient.getInstance();
      
      // Check if user is a member of the room
      const roomMember = await db.query.roomMembers.findFirst({
        where: and(
          eq(roomMembers.roomId, roomId),
          eq(roomMembers.userId, userId)
        )
      });
      
      return !!roomMember;
    } catch (error) {
      this.logger.error('Error checking room access', { roomId, userId, error });
      return false;
    }
  }
} 