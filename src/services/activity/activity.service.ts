import { injectable, inject } from 'inversify';
import { Logger } from '../../utils/logger';
import { DrizzleClient } from '../../db/drizzle.client';
import { activities } from '../../db/schema/activities';
import { eq, and, or, sql, lt, between } from 'drizzle-orm';
import { ValidationError } from '../../utils/errors';
import { v4 as uuidv4 } from 'uuid';
import { WebSocketService } from '../websocket/websocket.service';
import { getDb } from '../../db';
import { users } from '../../db/schema/users';
import { files } from '../../db/schema/files';
import { rooms } from '../../db/schema/rooms';

export type ActivityType =
  | 'upload'
  | 'download'
  | 'share'
  | 'delete'
  | 'restore'
  | 'move'
  | 'rename'
  | 'create_folder'
  | 'join_room'
  | 'leave_room'
  | 'update_permissions'
  | 'login'
  | 'logout'
  | 'password_change'
  | 'view'
  | 'print'
  | 'copy'
  | 'admin_action'
  | 'system_event'
  | 'subscription_change';

export interface CreateActivityDto {
  type: ActivityType;
  userId: string;
  fileId?: string;
  roomId?: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  companyId?: string;
}

export interface ActivityFilter {
  types?: ActivityType[];
  excludedTypes?: ActivityType[];
  startDate?: Date;
  endDate?: Date;
  userId?: string;
  fileId?: string;
  fileIds?: string[];
  roomId?: string;
  roomIds?: string[];
  companyId?: string;
  limit?: number;
  offset?: number;
}

export interface ActivitySubscriptionOptions {
  userId: string;
  notifyFileActivities?: boolean;
  notifyRoomActivities?: boolean;
  notifySystemActivities?: boolean;
  notifyInterval?: 'immediate' | 'daily' | 'weekly';
  fileIds?: string[];
  roomIds?: string[];
  excludedTypes?: ActivityType[];
}

@injectable()
export class ActivityService {
  private userActivitySubscriptions: Map<string, ActivitySubscriptionOptions> = new Map();
  
  constructor(
    @inject('DrizzleClient') private db: DrizzleClient,
    @inject('Logger') private logger: Logger,
    @inject('WebSocketService') private wsService: WebSocketService
  ) {
    this.logger = logger.createChildLogger('ActivityService');
    this.setupDailyActivitySummaries();
  }

  /**
   * Create a new activity
   */
  async createActivity(data: CreateActivityDto) {
    try {
      const activityId = uuidv4();
      const metadata = data.metadata ? JSON.stringify(data.metadata) : null;

      // Create activity
      await getDb().insert(activities).values({
        id: activityId,
        action: data.type,
        userId: data.userId,
        fileId: data.fileId || null,
        roomId: data.roomId || null,
        companyId: data.companyId || null,
        metadata,
        ipAddress: data.ipAddress || null,
        userAgent: data.userAgent || null
      });

      const [activity] = await getDb()
        .select()
        .from(activities)
        .where(eq(activities.id, activityId));
        
      // Process activity for real-time notifications
      await this.processActivityNotifications(activity);

      // Notify relevant users via WebSocket if connected
      if (data.roomId) {
        this.wsService.broadcastToRoom(data.roomId, 'activity:created', activity);
      }
      
      // Send targeted notifications to subscribed users
      await this.notifySubscribedUsers(activity);

      this.logger.info('Activity created', {
        activityId,
        type: data.type,
        userId: data.userId
      });

      return activity;
    } catch (error: any) {
      this.logger.error('Failed to create activity', { error: error.message });
      throw error;
    }
  }

  /**
   * Get file activities
   */
  async getFileActivities(fileId: string, userId: string) {
    try {
      const fileActivities = await getDb()
        .select()
        .from(activities)
        .where(eq(activities.fileId, fileId))
        .orderBy(sql`${activities.createdAt} DESC`);

      return fileActivities;
    } catch (error: any) {
      this.logger.error('Failed to get file activities', {
        fileId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get room activities
   */
  async getRoomActivities(roomId: string, userId: string) {
    try {
      const roomActivities = await getDb()
        .select()
        .from(activities)
        .where(eq(activities.roomId, roomId))
        .orderBy(sql`${activities.createdAt} DESC`);

      return roomActivities;
    } catch (error: any) {
      this.logger.error('Failed to get room activities', {
        roomId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get user activities
   */
  async getUserActivities(userId: string) {
    try {
      const userActivities = await getDb()
        .select()
        .from(activities)
        .where(eq(activities.userId, userId))
        .orderBy(sql`${activities.createdAt} DESC`);

      return userActivities;
    } catch (error: any) {
      this.logger.error('Failed to get user activities', {
        userId,
        error: error.message
      });
      throw error;
    }
  }
  
  /**
   * Get company activities (admin function)
   */
  async getCompanyActivities(companyId: string, filter?: ActivityFilter) {
    try {
      // Create conditions array
      const conditions = [];
      conditions.push(eq(activities.companyId, companyId));
      
      // Add filter conditions
      if (filter?.userId) {
        conditions.push(eq(activities.userId, filter.userId));
      }
      
      if (filter?.fileId) {
        conditions.push(eq(activities.fileId, filter.fileId));
      }
      
      if (filter?.roomId) {
        conditions.push(eq(activities.roomId, filter.roomId));
      }
      
      if (filter?.startDate && filter?.endDate) {
        conditions.push(between(activities.createdAt, filter.startDate, filter.endDate));
      }
      
      // Add type filter if present
      let typeCondition = null;
      if (filter?.types && filter.types.length > 0) {
        const typesStr = filter.types.map(t => `'${t}'`).join(',');
        typeCondition = sql`${activities.action} IN (${sql.raw(typesStr)})`;
      }
      
      // Create a query that includes all conditions
      let baseQuery;
      if (conditions.length > 0 && typeCondition) {
        baseQuery = getDb()
          .select()
          .from(activities)
          .where(and(...conditions, typeCondition));
      } else if (conditions.length > 0) {
        baseQuery = getDb()
          .select()
          .from(activities)
          .where(and(...conditions));
      } else if (typeCondition) {
        baseQuery = getDb()
          .select()
          .from(activities)
          .where(typeCondition);
      } else {
        baseQuery = getDb()
          .select()
          .from(activities);
      }
      
      // Apply order by
      const orderedQuery = baseQuery.orderBy(sql`${activities.createdAt} DESC`);
      
      // Apply pagination
      if (filter?.limit && filter?.offset) {
        return await orderedQuery.limit(filter.limit).offset(filter.offset);
      } else if (filter?.limit) {
        return await orderedQuery.limit(filter.limit);
      } else {
        return await orderedQuery;
      }
    } catch (error: any) {
      this.logger.error('Failed to get company activities', {
        companyId,
        error: error.message
      });
      throw error;
    }
  }
  
  /**
   * Export activity logs (for compliance)
   */
  async exportActivityLogs(filter: ActivityFilter): Promise<string> {
    try {
      // Create conditions array
      const conditions = [];
      
      // Add filter conditions
      if (filter.companyId) {
        conditions.push(eq(activities.companyId, filter.companyId));
      }
      
      if (filter.userId) {
        conditions.push(eq(activities.userId, filter.userId));
      }
      
      if (filter.fileId) {
        conditions.push(eq(activities.fileId, filter.fileId));
      }
      
      if (filter.roomId) {
        conditions.push(eq(activities.roomId, filter.roomId));
      }
      
      if (filter.startDate && filter.endDate) {
        conditions.push(between(activities.createdAt, filter.startDate, filter.endDate));
      }
      
      // Add type filter if present
      let typeCondition = null;
      if (filter.types && filter.types.length > 0) {
        const typesStr = filter.types.map(t => `'${t}'`).join(',');
        typeCondition = sql`${activities.action} IN (${sql.raw(typesStr)})`;
      }
      
      // Create a query that includes all conditions
      let baseQuery;
      if (conditions.length > 0 && typeCondition) {
        baseQuery = getDb()
          .select()
          .from(activities)
          .where(and(...conditions, typeCondition));
      } else if (conditions.length > 0) {
        baseQuery = getDb()
          .select()
          .from(activities)
          .where(and(...conditions));
      } else if (typeCondition) {
        baseQuery = getDb()
          .select()
          .from(activities)
          .where(typeCondition);
      } else {
        baseQuery = getDb()
          .select()
          .from(activities);
      }
      
      // Get the results ordered by creation date
      const activityLogs = await baseQuery.orderBy(sql`${activities.createdAt} ASC`);
      
      // Define the activity type
      interface ActivityLog {
        id: string;
        action: string;
        userId: string;
        fileId: string | null;
        roomId: string | null;
        companyId: string | null;
        ipAddress: string | null;
        userAgent: string | null;
        metadata: string | null;
        createdAt: Date;
      }
      
      // Convert to CSV format
      const csvHeader = 'ID,Type,User ID,File ID,Room ID,Company ID,IP Address,Timestamp,Metadata\n';
      const csvRows = activityLogs.map((activity: ActivityLog) => {
        return `${activity.id},${activity.action},${activity.userId},${activity.fileId || ''},${activity.roomId || ''},${activity.companyId || ''},${activity.ipAddress || ''},${activity.createdAt.toISOString()},${activity.metadata || ''}\n`;
      });
      
      const csvContent = csvHeader + csvRows.join('');
      
      this.logger.info('Activity logs exported', { 
        count: activityLogs.length,
        filters: filter 
      });
      
      return csvContent;
    } catch (error: any) {
      this.logger.error('Failed to export activity logs', { error: error.message });
      throw error;
    }
  }
  
  /**
   * Subscribe to activity notifications
   */
  async subscribeToActivities(options: ActivitySubscriptionOptions): Promise<boolean> {
    try {
      // Store subscription preferences
      this.userActivitySubscriptions.set(options.userId, options);
      
      this.logger.info('User subscribed to activity notifications', { 
        userId: options.userId,
        options 
      });
      
      return true;
    } catch (error: any) {
      this.logger.error('Failed to subscribe to activities', { error: error.message });
      throw error;
    }
  }
  
  /**
   * Unsubscribe from activity notifications
   */
  async unsubscribeFromActivities(userId: string): Promise<boolean> {
    try {
      this.userActivitySubscriptions.delete(userId);
      
      this.logger.info('User unsubscribed from activity notifications', { 
        userId 
      });
      
      return true;
    } catch (error: any) {
      this.logger.error('Failed to unsubscribe from activities', { error: error.message });
      throw error;
    }
  }

  /**
   * Clean up old activities
   */
  async cleanupOldActivities(retentionDays: number = 30): Promise<void> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      await getDb()
        .delete(activities)
        .where(lt(activities.createdAt, cutoffDate));

      this.logger.info('Cleaned up old activities', { retentionDays });
    } catch (error: any) {
      this.logger.error('Error cleaning up old activities', { error });
      throw error;
    }
  }
  
  /**
   * Process activity notifications
   */
  private async processActivityNotifications(activity: any): Promise<void> {
    try {
      // Extract metadata if it's a string
      const metadata = typeof activity.metadata === 'string' 
        ? JSON.parse(activity.metadata) 
        : activity.metadata;
      
      // Get more detailed information if needed
      let detailedActivity = { ...activity, metadata };
      
      // Add user information
      if (activity.userId) {
        try {
          const [user] = await getDb()
            .select({
              name: sql`CONCAT(first_name, ' ', last_name)`,
              email: sql`email`
            })
            .from(users)
            .where(eq(users.id, activity.userId));
            
          if (user) {
            detailedActivity.user = user;
          }
        } catch (error) {
          this.logger.warn('Could not fetch user details for activity', {
            activityId: activity.id,
            userId: activity.userId,
            error: (error as Error).message
          });
        }
      }
      
      // Add file information if file-related
      if (activity.fileId) {
        try {
          const [file] = await getDb()
            .select({
              name: files.name,
              size: files.size,
              contentType: files.mimeType
            })
            .from(files)
            .where(eq(files.id, activity.fileId));
            
          if (file) {
            detailedActivity.file = file;
          }
        } catch (error) {
          this.logger.warn('Could not fetch file details for activity', {
            activityId: activity.id,
            fileId: activity.fileId,
            error: (error as Error).message
          });
        }
      }
      
      // Add room information if room-related
      if (activity.roomId) {
        try {
          const [room] = await getDb()
            .select({
              name: rooms.name,
              roomType: rooms.roomType
            })
            .from(rooms)
            .where(eq(rooms.id, activity.roomId));
            
          if (room) {
            detailedActivity.room = room;
          }
        } catch (error) {
          this.logger.warn('Could not fetch room details for activity', {
            activityId: activity.id,
            roomId: activity.roomId,
            error: (error as Error).message
          });
        }
      }
      
      // Generate human-readable activity description
      detailedActivity.description = this.generateActivityDescription(detailedActivity);
      
      // Add to comprehensive audit trail
      await this.addToAuditTrail(detailedActivity);
      
      // Send real-time notification
      this.sendRealTimeNotification(detailedActivity);
    } catch (error) {
      this.logger.error('Error processing activity notifications', {
        activityId: activity.id,
        error: (error as Error).message
      });
    }
  }
  
  /**
   * Add detailed activity to comprehensive audit trail
   */
  private async addToAuditTrail(activity: any): Promise<void> {
    try {
      // This could be expanded to include additional audit trail features
      // such as writing to a separate audit log database or sending to
      // a security information and event management (SIEM) system
      
      // Log sensitive or security-related activities at higher severity
      const sensitiveActions = [
        'login', 'logout', 'password_change', 'admin_action',
        'update_permissions', 'delete'
      ];
      
      if (sensitiveActions.includes(activity.action)) {
        this.logger.warn('Security-related activity detected', {
          activityId: activity.id,
          action: activity.action,
          userId: activity.userId,
          description: activity.description,
          ipAddress: activity.ipAddress
        });
      }
    } catch (error) {
      this.logger.error('Error adding to audit trail', {
        activityId: activity.id,
        error: (error as Error).message
      });
    }
  }
  
  /**
   * Send real-time notification for activity
   */
  private sendRealTimeNotification(activity: any): void {
    try {
      // Determine who should be notified of this activity
      const notificationTargets: string[] = [];
      
      // Always notify the user who performed the action
      if (activity.userId) {
        notificationTargets.push(activity.userId);
      }
      
      // For file actions, notify other users with access
      if (activity.fileId && 
          ['upload', 'download', 'share', 'delete', 'rename', 'move'].includes(activity.action)) {
        // This would be implemented to fetch users with access to this file
        // and add them to notificationTargets
      }
      
      // For room actions, notify room members
      if (activity.roomId) {
        // Broadcast to room via WebSocket
        this.wsService.broadcastToRoom(activity.roomId, 'activity:new', {
          activity: {
            id: activity.id,
            action: activity.action,
            description: activity.description,
            user: activity.user ? {
              name: activity.user.name
            } : undefined,
            createdAt: activity.createdAt
          }
        });
      }
      
      // For company-wide actions, notify admins
      if (activity.companyId && 
          ['admin_action', 'system_event'].includes(activity.action)) {
        // This would be implemented to fetch company admins
        // and add them to notificationTargets
      }
      
      // Send individual notifications to users
      notificationTargets.forEach(userId => {
        this.wsService.broadcastToUser(userId, 'activity:notification', {
          activity: {
            id: activity.id,
            action: activity.action,
            description: activity.description,
            createdAt: activity.createdAt
          }
        });
      });
    } catch (error) {
      this.logger.error('Error sending real-time notification', {
        activityId: activity.id,
        error: (error as Error).message
      });
    }
  }
  
  /**
   * Generate human-readable description of activity
   */
  private generateActivityDescription(activity: any): string {
    const userName = activity.user?.name || 'A user';
    const fileName = activity.file?.name || 'a file';
    const roomName = activity.room?.name || 'a room';
    
    // Different descriptions based on activity type
    switch (activity.action) {
      case 'upload':
        return `${userName} uploaded ${fileName}${activity.roomId ? ` to ${roomName}` : ''}`;
      
      case 'download':
        return `${userName} downloaded ${fileName}`;
      
      case 'share':
        return `${userName} shared ${fileName}`;
      
      case 'delete':
        return `${userName} deleted ${fileName}`;
      
      case 'restore':
        return `${userName} restored ${fileName}`;
      
      case 'move':
        return `${userName} moved ${fileName}`;
      
      case 'rename':
        const newName = activity.metadata?.newName || 'a new name';
        return `${userName} renamed ${fileName} to ${newName}`;
      
      case 'create_folder':
        return `${userName} created folder ${activity.metadata?.roomName || roomName}`;
      
      case 'join_room':
        return `${userName} joined ${roomName}`;
      
      case 'leave_room':
        return `${userName} left ${roomName}`;
      
      case 'update_permissions':
        return `${userName} updated permissions for ${activity.fileId ? fileName : roomName}`;
      
      case 'login':
        return `${userName} logged in`;
      
      case 'logout':
        return `${userName} logged out`;
      
      case 'password_change':
        return `${userName} changed their password`;
      
      case 'view':
        return `${userName} viewed ${fileName}`;
      
      case 'print':
        return `${userName} printed ${fileName}`;
      
      case 'copy':
        return `${userName} copied ${fileName}`;
      
      case 'admin_action':
        const action = activity.metadata?.action || 'performed an admin action';
        return `${userName} ${action}`;
      
      case 'system_event':
        const event = activity.metadata?.action || 'system event occurred';
        return `System: ${event}`;
      
      case 'subscription_change':
        return `${userName} changed subscription settings`;
      
      default:
        return `${userName} performed action: ${activity.action}`;
    }
  }

  /**
   * Generate and send activity digest emails
   */
  private async generateActivityDigest(
    userId: string, 
    startDate: Date, 
    endDate: Date, 
    options: ActivitySubscriptionOptions
  ): Promise<void> {
    try {
      // Build filter based on subscription options
      const filter: ActivityFilter = {
        userId,
        startDate,
        endDate
      };
      
      // Add room filter if specified
      if (options.roomIds && options.roomIds.length > 0) {
        filter.roomIds = options.roomIds;
      }
      
      // Add file filter if specified
      if (options.fileIds && options.fileIds.length > 0) {
        filter.fileIds = options.fileIds;
      }
      
      // Add excluded types
      if (options.excludedTypes && options.excludedTypes.length > 0) {
        filter.excludedTypes = options.excludedTypes;
      }
      
      // Fetch activities
      const activities = await this.getFilteredActivities(filter);
      
      if (activities.length === 0) {
        this.logger.debug('No activities for digest', { userId });
        return;
      }
      
      // Group activities by type
      const groupedActivities: Record<string, any[]> = {};
      activities.forEach(activity => {
        const type = activity.action;
        if (!groupedActivities[type]) {
          groupedActivities[type] = [];
        }
        groupedActivities[type].push(activity);
      });
      
      // Generate summary counts
      const summaryCounts = Object.entries(groupedActivities).map(([type, acts]) => ({
        type,
        count: acts.length
      }));
      
      // TODO: Send email with digest
      this.logger.info('Activity digest generated', {
        userId,
        period: `${startDate.toISOString()} to ${endDate.toISOString()}`,
        totalActivities: activities.length,
        summary: summaryCounts
      });
      
      // For debugging/development
      this.wsService.broadcastToUser(userId, 'activity:digest', {
        period: `${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}`,
        totalActivities: activities.length,
        summary: summaryCounts,
        activities: activities.slice(0, 10).map(a => ({
          action: a.action,
          description: this.generateActivityDescription(a),
          createdAt: a.createdAt
        }))
      });
    } catch (error) {
      this.logger.error('Error generating activity digest', {
        userId,
        error: (error as Error).message
      });
    }
  }

  /**
   * Get activities filtered by various criteria
   */
  async getFilteredActivities(filter: ActivityFilter): Promise<any[]> {
    try {
      const db = getDb();
      
      // Build the where conditions
      const whereConditions = [];
      
      // Basic filters
      if (filter.userId) {
        whereConditions.push(eq(activities.userId, filter.userId));
      }
      
      if (filter.fileId) {
        whereConditions.push(eq(activities.fileId, filter.fileId));
      }
      
      if (filter.roomId) {
        whereConditions.push(eq(activities.roomId, filter.roomId));
      }
      
      if (filter.companyId) {
        whereConditions.push(eq(activities.companyId, filter.companyId));
      }
      
      // Date range
      if (filter.startDate && filter.endDate) {
        whereConditions.push(between(activities.createdAt, filter.startDate, filter.endDate));
      }
      
      // Room IDs array
      if (filter.roomIds && filter.roomIds.length > 0) {
        const roomIdsStr = filter.roomIds.map(id => `'${id}'`).join(',');
        whereConditions.push(sql`${activities.roomId} IN (${sql.raw(roomIdsStr)})`);
      }
      
      // File IDs array
      if (filter.fileIds && filter.fileIds.length > 0) {
        const fileIdsStr = filter.fileIds.map(id => `'${id}'`).join(',');
        whereConditions.push(sql`${activities.fileId} IN (${sql.raw(fileIdsStr)})`);
      }
      
      // Activity types
      if (filter.types && filter.types.length > 0) {
        const typesConditions = filter.types.map(type => eq(activities.action, type));
        whereConditions.push(or(...typesConditions));
      }
      
      // Build the main where condition
      let mainCondition = undefined;
      if (whereConditions.length > 0) {
        mainCondition = and(...whereConditions);
      }
      
      // Apply excluded types as a separate condition
      // Rather than chaining, we'll modify the main condition
      if (filter.excludedTypes && filter.excludedTypes.length > 0) {
        const excludeConditions = filter.excludedTypes.map(type => 
          sql`${activities.action} != ${type}`
        );
        
        if (mainCondition) {
          // Combine with existing conditions
          mainCondition = and(mainCondition, ...excludeConditions);
        } else {
          // Just use the exclude conditions
          mainCondition = and(...excludeConditions);
        }
      }
      
      // Create the query
      let results;
      
      // Execute the query with all parts at once to avoid TypeScript issues with chaining
      if (mainCondition) {
        results = await db
          .select()
          .from(activities)
          .where(mainCondition)
          .orderBy(sql`${activities.createdAt} DESC`)
          .limit(filter.limit || 100)
          .offset(filter.offset || 0);
      } else {
        // No conditions
        results = await db
          .select()
          .from(activities)
          .orderBy(sql`${activities.createdAt} DESC`)
          .limit(filter.limit || 100)
          .offset(filter.offset || 0);
      }
      
      // Process results
      const processedResults = results.map(activity => {
        // Process metadata if it's a string
        if (typeof activity.metadata === 'string') {
          try {
            return {
              ...activity,
              metadata: JSON.parse(activity.metadata)
            };
          } catch (e) {
            // If parsing fails, leave as is
            return activity;
          }
        }
        return activity;
      });
      
      return processedResults;
    } catch (error) {
      this.logger.error('Error getting filtered activities', {
        filter,
        error: (error as Error).message
      });
      throw error;
    }
  }

  /**
   * Set up daily activity summary emails
   */
  private setupDailyActivitySummaries(): void {
    // Run at midnight every day
    setInterval(async () => {
      try {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(0, 0, 0, 0);
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        // Find users who want daily digests
        for (const [userId, options] of this.userActivitySubscriptions.entries()) {
          if (options.notifyInterval === 'daily') {
            await this.generateActivityDigest(userId, yesterday, today, options);
          }
        }
      } catch (error: any) {
        this.logger.error('Error sending daily activity summaries', { 
          error: error.message 
        });
      }
    }, 24 * 60 * 60 * 1000); // Once per day
  }
  
  /**
   * Notify subscribed users about an activity
   */
  private async notifySubscribedUsers(activity: any): Promise<void> {
    try {
      for (const [userId, options] of this.userActivitySubscriptions.entries()) {
        // Skip immediate notifications for users who prefer digests
        if (options.notifyInterval !== 'immediate') {
          continue;
        }
        
        // Check if user should be notified about this type of activity
        if (options.excludedTypes?.includes(activity.action)) {
          continue;
        }
        
        let shouldNotify = false;
        
        // File activity
        if (activity.fileId && options.notifyFileActivities) {
          if (!options.fileIds || options.fileIds.includes(activity.fileId)) {
            shouldNotify = true;
          }
        }
        
        // Room activity
        if (activity.roomId && options.notifyRoomActivities) {
          if (!options.roomIds || options.roomIds.includes(activity.roomId)) {
            shouldNotify = true;
          }
        }
        
        // System activity
        if (!activity.fileId && !activity.roomId && options.notifySystemActivities) {
          shouldNotify = true;
        }
        
        if (shouldNotify) {
          // Send notification to user
          this.wsService.broadcastToUser(
            userId,
            'notification:activity',
            activity
          );
        }
      }
    } catch (error: any) {
      this.logger.error('Failed to notify subscribed users', { 
        activityId: activity.id,
        error: error.message 
      });
    }
  }
} 