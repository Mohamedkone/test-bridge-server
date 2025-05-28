import { injectable, inject } from 'inversify';
import { Logger } from '../../utils/logger';
import { DrizzleClient } from '../../db/drizzle.client';
import { accessControlPolicies } from '../../db/schema/access';
import { rooms } from '../../db/schema/rooms';
import { and, eq, isNull, or } from 'drizzle-orm';
import { ValidationError, ForbiddenError } from '../../utils/errors';
import { v4 as uuidv4 } from 'uuid';
import { ActivityService } from '../activity/activity.service';
import { WebSocketService } from '../websocket/websocket.service';
import { isIPInRange } from '../../utils/network';

export interface AccessControlPolicyDto {
  name: string;
  description?: string;
  roomId?: string; // If null, applies to the whole company
  companyId: string;
  allowedIpRanges?: string; // Comma-separated list
  deniedIpRanges?: string; // Comma-separated list
  timeRestrictions?: {
    days?: string[]; // e.g., ["monday", "tuesday"]
    startTime?: string; // e.g., "09:00"
    endTime?: string; // e.g., "17:00"
    timezone?: string; // e.g., "America/New_York"
  };
  allowDownloads?: boolean;
  allowSharing?: boolean;
  allowPrinting?: boolean;
  maxConcurrentUsers?: number;
  requireMfa?: boolean;
  maxSessionLength?: number; // in minutes
  inactivityTimeout?: number; // in minutes
}

@injectable()
export class AccessPolicyService {
  constructor(
    @inject('DrizzleClient') private db: DrizzleClient,
    @inject('Logger') private logger: Logger,
    @inject('ActivityService') private activityService: ActivityService,
    @inject('WebSocketService') private wsService: WebSocketService
  ) {
    this.logger = logger.createChildLogger('AccessPolicyService');
  }

  /**
   * Create a new access control policy
   */
  async createPolicy(data: AccessControlPolicyDto, createdById: string) {
    try {
      const db = this.db.getInstance();
      const policyId = uuidv4();

      // If room-specific, check if room exists
      if (data.roomId) {
        const [room] = await db
          .select()
          .from(rooms)
          .where(eq(rooms.id, data.roomId));

        if (!room) {
          throw new ValidationError('Room not found');
        }

        // Check if room belongs to company
        if (room.companyId !== data.companyId) {
          throw new ValidationError('Room does not belong to specified company');
        }
      }

      // Create policy
      await db.insert(accessControlPolicies).values({
        id: policyId,
        name: data.name,
        description: data.description || null,
        roomId: data.roomId || null,
        companyId: data.companyId,
        createdById,
        allowedIpRanges: data.allowedIpRanges || null,
        deniedIpRanges: data.deniedIpRanges || null,
        timeRestrictions: data.timeRestrictions || null,
        allowDownloads: data.allowDownloads !== undefined ? data.allowDownloads : true,
        allowSharing: data.allowSharing !== undefined ? data.allowSharing : true,
        allowPrinting: data.allowPrinting !== undefined ? data.allowPrinting : true,
        maxConcurrentUsers: data.maxConcurrentUsers || null,
        requireMfa: data.requireMfa || false,
        maxSessionLength: data.maxSessionLength || null,
        inactivityTimeout: data.inactivityTimeout || null,
      });

      const [policy] = await db
        .select()
        .from(accessControlPolicies)
        .where(eq(accessControlPolicies.id, policyId));

      // Log activity
      await this.activityService.createActivity({
        type: 'admin_action',
        userId: createdById,
        roomId: data.roomId,
        companyId: data.companyId,
        metadata: {
          action: 'create_access_policy',
          policyName: data.name,
          policyId
        }
      });

      // Notify room members if room-specific
      if (data.roomId) {
        this.wsService.broadcastToRoom(data.roomId, 'room:policy_updated', {
          roomId: data.roomId,
          policyId,
          action: 'created'
        });
      }

      this.logger.info('Access control policy created', { policyId, createdBy: createdById });
      return policy;
    } catch (error: any) {
      this.logger.error('Failed to create access control policy', { error: error.message });
      throw error;
    }
  }

  /**
   * Update an access control policy
   */
  async updatePolicy(id: string, data: Partial<AccessControlPolicyDto>, userId: string) {
    try {
      const db = this.db.getInstance();

      // Get existing policy
      const [policy] = await db
        .select()
        .from(accessControlPolicies)
        .where(eq(accessControlPolicies.id, id));

      if (!policy) {
        throw new ValidationError('Access control policy not found');
      }

      // Update policy
      await db
        .update(accessControlPolicies)
        .set({
          name: data.name || policy.name,
          description: data.description !== undefined ? data.description : policy.description,
          allowedIpRanges: data.allowedIpRanges !== undefined ? data.allowedIpRanges : policy.allowedIpRanges,
          deniedIpRanges: data.deniedIpRanges !== undefined ? data.deniedIpRanges : policy.deniedIpRanges,
          timeRestrictions: data.timeRestrictions !== undefined ? data.timeRestrictions : policy.timeRestrictions,
          allowDownloads: data.allowDownloads !== undefined ? data.allowDownloads : policy.allowDownloads,
          allowSharing: data.allowSharing !== undefined ? data.allowSharing : policy.allowSharing,
          allowPrinting: data.allowPrinting !== undefined ? data.allowPrinting : policy.allowPrinting,
          maxConcurrentUsers: data.maxConcurrentUsers !== undefined ? data.maxConcurrentUsers : policy.maxConcurrentUsers,
          requireMfa: data.requireMfa !== undefined ? data.requireMfa : policy.requireMfa,
          maxSessionLength: data.maxSessionLength !== undefined ? data.maxSessionLength : policy.maxSessionLength,
          inactivityTimeout: data.inactivityTimeout !== undefined ? data.inactivityTimeout : policy.inactivityTimeout,
          updatedAt: new Date()
        })
        .where(eq(accessControlPolicies.id, id));

      const [updatedPolicy] = await db
        .select()
        .from(accessControlPolicies)
        .where(eq(accessControlPolicies.id, id));

      // Log activity
      await this.activityService.createActivity({
        type: 'admin_action',
        userId,
        roomId: policy.roomId || undefined,
        companyId: policy.companyId,
        metadata: {
          action: 'update_access_policy',
          policyName: policy.name,
          policyId: id,
          changes: Object.keys(data)
        }
      });

      // Notify room members if room-specific
      if (policy.roomId) {
        this.wsService.broadcastToRoom(policy.roomId, 'room:policy_updated', {
          roomId: policy.roomId,
          policyId: id,
          action: 'updated'
        });
      }

      this.logger.info('Access control policy updated', { policyId: id, updatedBy: userId });
      return updatedPolicy;
    } catch (error: any) {
      this.logger.error('Failed to update access control policy', { policyId: id, error: error.message });
      throw error;
    }
  }

  /**
   * Delete an access control policy
   */
  async deletePolicy(id: string, userId: string) {
    try {
      const db = this.db.getInstance();

      // Get existing policy
      const [policy] = await db
        .select()
        .from(accessControlPolicies)
        .where(eq(accessControlPolicies.id, id));

      if (!policy) {
        throw new ValidationError('Access control policy not found');
      }

      // Delete policy
      await db
        .delete(accessControlPolicies)
        .where(eq(accessControlPolicies.id, id));

      // Log activity
      await this.activityService.createActivity({
        type: 'admin_action',
        userId,
        roomId: policy.roomId || undefined,
        companyId: policy.companyId,
        metadata: {
          action: 'delete_access_policy',
          policyName: policy.name,
          policyId: id
        }
      });

      // Notify room members if room-specific
      if (policy.roomId) {
        this.wsService.broadcastToRoom(policy.roomId, 'room:policy_updated', {
          roomId: policy.roomId,
          policyId: id,
          action: 'deleted'
        });
      }

      this.logger.info('Access control policy deleted', { policyId: id, deletedBy: userId });
    } catch (error: any) {
      this.logger.error('Failed to delete access control policy', { policyId: id, error: error.message });
      throw error;
    }
  }

  /**
   * Get policies for a room
   */
  async getRoomPolicies(roomId: string) {
    try {
      const db = this.db.getInstance();

      // Get room-specific policies and company-wide policies
      const [room] = await db
        .select({ companyId: rooms.companyId })
        .from(rooms)
        .where(eq(rooms.id, roomId));

      if (!room) {
        throw new ValidationError('Room not found');
      }

      const policies = await db
        .select()
        .from(accessControlPolicies)
        .where(
          and(
            eq(accessControlPolicies.isActive, true),
            or(
              eq(accessControlPolicies.roomId, roomId),
              and(
                eq(accessControlPolicies.companyId, room.companyId),
                isNull(accessControlPolicies.roomId)
              )
            )
          )
        );

      return policies;
    } catch (error: any) {
      this.logger.error('Failed to get room policies', { roomId, error: error.message });
      throw error;
    }
  }

  /**
   * Check if a user's access complies with access control policies
   */
  async validateAccess(
    roomId: string, 
    userId: string, 
    ipAddress?: string, 
    hasMfa: boolean = false
  ): Promise<{ allowed: boolean; reason?: string }> {
    try {
      const policies = await this.getRoomPolicies(roomId);
      
      if (policies.length === 0) {
        // No policies, access is allowed
        return { allowed: true };
      }
      
      // Check each policy constraint
      for (const policy of policies) {
        // Check IP restrictions
        if (ipAddress && policy.allowedIpRanges) {
          const allowedRanges = policy.allowedIpRanges.split(',').map(r => r.trim());
          let ipAllowed = false;
          
          for (const range of allowedRanges) {
            if (isIPInRange(ipAddress, range)) {
              ipAllowed = true;
              break;
            }
          }
          
          if (!ipAllowed) {
            return { 
              allowed: false, 
              reason: 'IP address not in allowed range' 
            };
          }
        }
        
        if (ipAddress && policy.deniedIpRanges) {
          const deniedRanges = policy.deniedIpRanges.split(',').map(r => r.trim());
          
          for (const range of deniedRanges) {
            if (isIPInRange(ipAddress, range)) {
              return { 
                allowed: false, 
                reason: 'IP address in denied range' 
              };
            }
          }
        }
        
        // Check MFA requirement
        if (policy.requireMfa && !hasMfa) {
          return { 
            allowed: false, 
            reason: 'Multi-factor authentication required' 
          };
        }
        
        // Check time restrictions
        if (policy.timeRestrictions) {
          const restrictions = policy.timeRestrictions;
          
          if (restrictions.days && restrictions.days.length > 0) {
            const currentDay = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
            if (!restrictions.days.includes(currentDay)) {
              return { 
                allowed: false, 
                reason: 'Access not allowed on this day' 
              };
            }
          }
          
          if (restrictions.startTime && restrictions.endTime) {
            const now = new Date();
            const currentHour = now.getHours();
            const currentMinute = now.getMinutes();
            
            const [startHour, startMinute] = restrictions.startTime.split(':').map(Number);
            const [endHour, endMinute] = restrictions.endTime.split(':').map(Number);
            
            const currentTimeMinutes = currentHour * 60 + currentMinute;
            const startTimeMinutes = startHour * 60 + startMinute;
            const endTimeMinutes = endHour * 60 + endMinute;
            
            if (currentTimeMinutes < startTimeMinutes || currentTimeMinutes > endTimeMinutes) {
              return { 
                allowed: false, 
                reason: 'Access not allowed at this time' 
              };
            }
          }
        }
      }
      
      // All policies passed, access is allowed
      return { allowed: true };
    } catch (error: any) {
      this.logger.error('Failed to validate access against policies', { 
        roomId, 
        userId, 
        ipAddress, 
        error: error.message 
      });
      // Default to allowed on error, but log the issue
      return { allowed: true };
    }
  }
} 