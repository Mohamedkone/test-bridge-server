// src/services/sharing/sharing.service.ts
import { injectable, inject } from 'inversify';
import { Logger } from '../../utils/logger';
import { DrizzleClient } from '../../db/drizzle.client';
import { shares } from '../../db/schema/shares';
import { eq, and, or, sql, lt } from 'drizzle-orm';
import { ValidationError, ForbiddenError } from '../../utils/errors';
import { v4 as uuidv4 } from 'uuid';
import { WebSocketService } from '../websocket/websocket.service';
import { FileService } from '../file/file.service';
import { ActivityService } from '../activity/activity.service';
import * as bcrypt from 'bcrypt';

export interface CreateShareDto {
  fileId: string;
  createdById: string;
  accessLevel: 'read' | 'write';
  expiresAt?: Date;
  maxDownloads?: number;
  password?: string;
  isPublic?: boolean;
}

export interface UpdateShareDto {
  accessLevel?: 'read' | 'write';
  expiresAt?: Date;
  maxDownloads?: number;
  password?: string;
  isPublic?: boolean;
  isActive?: boolean;
}

export interface VerifyPasswordDto {
  password: string;
}

export interface ShareLinkOptions {
  includePassword?: boolean;
  baseUrl?: string;
  expiresInHours?: number;
}

@injectable()
export class SharingService {
  constructor(
    @inject('DrizzleClient') private db: DrizzleClient,
    @inject('Logger') private logger: Logger,
    @inject('WebSocketService') private wsService: WebSocketService,
    @inject('FileService') private fileService: FileService,
    @inject('ActivityService') private activityService: ActivityService
  ) {
    this.logger = logger.createChildLogger('SharingService');
    
    // Start the cleanup task for expired shares
    this.setupExpiredSharesCleanup();
  }

  /**
   * Create a new share
   */
  async createShare(data: CreateShareDto) {
    try {
      const db = this.db.getInstance();
      const shareId = uuidv4();

      // Check if user has access to the file
      const hasAccess = await this.fileService.checkAccess(data.fileId, data.createdById, 'read');
      if (!hasAccess) {
        throw new ForbiddenError('No access to file');
      }

      // Hash password if provided
      let hashedPassword = null;
      if (data.password) {
        hashedPassword = await bcrypt.hash(data.password, 10);
      }

      // Create share
      await db.insert(shares).values({
        id: shareId,
        fileId: data.fileId,
        createdById: data.createdById,
        accessLevel: data.accessLevel,
        expiresAt: data.expiresAt,
        maxDownloads: data.maxDownloads,
        password: hashedPassword,
        isPublic: data.isPublic || false,
        downloadCount: 0
      });

      const [share] = await db
        .select()
        .from(shares)
        .where(eq(shares.id, shareId));

      // Log the share creation
      await this.activityService.createActivity({
        type: 'share',
        userId: data.createdById,
        fileId: data.fileId,
        metadata: {
          shareId,
          accessLevel: data.accessLevel,
          isPasswordProtected: !!data.password,
          expiresAt: data.expiresAt,
          maxDownloads: data.maxDownloads
        }
      });

      this.logger.info('Share created', { shareId, fileId: data.fileId });
      return share;
    } catch (error: any) {
      this.logger.error('Failed to create share', { error: error.message });
      throw error;
    }
  }

  /**
   * Get share by ID
   */
  async getShareById(id: string) {
    try {
      const db = this.db.getInstance();
      const [share] = await db
        .select()
        .from(shares)
        .where(eq(shares.id, id));

      if (!share) {
        throw new ValidationError('Share not found');
      }

      // Check if share is expired
      if (share.expiresAt && share.expiresAt < new Date()) {
        throw new ValidationError('Share has expired');
      }

      // Check if max downloads reached
      if (share.maxDownloads && share.downloadCount >= share.maxDownloads) {
        throw new ValidationError('Maximum downloads reached');
      }

      return share;
    } catch (error: any) {
      this.logger.error('Failed to get share', { shareId: id, error: error.message });
      throw error;
    }
  }

  /**
   * Update share
   */
  async updateShare(id: string, data: UpdateShareDto, userId: string) {
    try {
      const db = this.db.getInstance();

      // Check if user is share creator
      const [share] = await db
        .select()
        .from(shares)
        .where(
          and(
            eq(shares.id, id),
            eq(shares.createdById, userId)
          )
        );

      if (!share) {
        throw new ForbiddenError('Not authorized to update share');
      }

      // Hash new password if provided
      let hashedPassword = undefined;
      if (data.password !== undefined) {
        hashedPassword = data.password ? await bcrypt.hash(data.password, 10) : null;
      }

      // Update share
      await db
        .update(shares)
        .set({
          accessLevel: data.accessLevel,
          expiresAt: data.expiresAt,
          maxDownloads: data.maxDownloads,
          password: hashedPassword,
          isPublic: data.isPublic,
          updatedAt: new Date()
        })
        .where(eq(shares.id, id));

      const [updatedShare] = await db
        .select()
        .from(shares)
        .where(eq(shares.id, id));

      // Log the share update
      await this.activityService.createActivity({
        type: 'admin_action',
        userId,
        fileId: share.fileId,
        metadata: {
          action: 'update_share',
          shareId: id,
          changes: Object.keys(data)
        }
      });

      this.logger.info('Share updated', { shareId: id, updatedBy: userId });
      return updatedShare;
    } catch (error: any) {
      this.logger.error('Failed to update share', { shareId: id, error: error.message });
      throw error;
    }
  }

  /**
   * Delete share
   */
  async deleteShare(id: string, userId: string) {
    try {
      const db = this.db.getInstance();

      // Check if user is share creator
      const [share] = await db
        .select()
        .from(shares)
        .where(
          and(
            eq(shares.id, id),
            eq(shares.createdById, userId)
          )
        );

      if (!share) {
        throw new ForbiddenError('Not authorized to delete share');
      }

      // Delete share
      await db.delete(shares).where(eq(shares.id, id));

      // Log the share deletion
      await this.activityService.createActivity({
        type: 'admin_action',
        userId,
        fileId: share.fileId,
        metadata: {
          action: 'delete_share',
          shareId: id
        }
      });

      this.logger.info('Share deleted', { shareId: id, deletedBy: userId });
    } catch (error: any) {
      this.logger.error('Failed to delete share', { shareId: id, error: error.message });
      throw error;
    }
  }

  /**
   * Verify share password
   */
  async verifyPassword(id: string, data: VerifyPasswordDto): Promise<boolean> {
    try {
      const db = this.db.getInstance();
      const [share] = await db
        .select({ password: shares.password })
        .from(shares)
        .where(eq(shares.id, id));

      if (!share) {
        throw new ValidationError('Share not found');
      }

      if (!share.password) {
        // No password required
        return true;
      }

      // Verify password
      const isMatch = await bcrypt.compare(data.password, share.password);
      
      // Log failed password attempts for security monitoring
      if (!isMatch) {
        this.logger.warn('Failed password attempt for share', { shareId: id });
      }
      
      return isMatch;
    } catch (error: any) {
      this.logger.error('Failed to verify share password', { shareId: id, error: error.message });
      throw error;
    }
  }

  /**
   * Generate a shareable link
   */
  async generateShareLink(id: string, options?: ShareLinkOptions): Promise<string> {
    try {
      const db = this.db.getInstance();
      const [share] = await db
        .select({
          id: shares.id,
          password: shares.password,
          expiresAt: shares.expiresAt
        })
        .from(shares)
        .where(eq(shares.id, id));

      if (!share) {
        throw new ValidationError('Share not found');
      }

      // Check if we need to update the expiration
      if (options?.expiresInHours) {
        const newExpiresAt = new Date();
        newExpiresAt.setHours(newExpiresAt.getHours() + options.expiresInHours);
        
        await db
          .update(shares)
          .set({ expiresAt: newExpiresAt })
          .where(eq(shares.id, id));
      }
      
      // Build the link
      const baseUrl = options?.baseUrl || process.env.BASE_URL || 'https://app.lockbridge.com';
      let link = `${baseUrl}/share/${id}`;
      
      // Add password as query param if requested (for direct links)
      if (options?.includePassword && share.password) {
        // This is not ideal for security - only use for trusted endpoints
        link += `?t=${Buffer.from(id).toString('base64')}`;
      }
      
      return link;
    } catch (error: any) {
      this.logger.error('Failed to generate share link', { shareId: id, error: error.message });
      throw error;
    }
  }

  /**
   * Get file shares
   */
  async getFileShares(fileId: string, userId: string) {
    try {
      const db = this.db.getInstance();

      // Check if user has access to the file
      const hasAccess = await this.fileService.checkAccess(fileId, userId, 'read');
      if (!hasAccess) {
        throw new ForbiddenError('No access to file');
      }

      const fileShares = await db
        .select()
        .from(shares)
        .where(eq(shares.fileId, fileId));

      return fileShares;
    } catch (error: any) {
      this.logger.error('Failed to get file shares', {
        fileId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Increment download count
   */
  async incrementDownloadCount(id: string) {
    try {
      const db = this.db.getInstance();
      
      // Get current share to check limits
      const [share] = await db
        .select({
          downloadCount: shares.downloadCount,
          maxDownloads: shares.maxDownloads
        })
        .from(shares)
        .where(eq(shares.id, id));
      
      // Check if max downloads will be exceeded
      if (share.maxDownloads && share.downloadCount >= share.maxDownloads) {
        throw new ValidationError('Maximum downloads reached');
      }
      
      // Increment download count
      await db
        .update(shares)
        .set({
          downloadCount: sql`${shares.downloadCount} + 1`
        })
        .where(eq(shares.id, id));

      // Log the download
      const updatedCount = share.downloadCount + 1;
      const maxReached = share.maxDownloads && updatedCount >= share.maxDownloads;
      
      this.logger.info('Download count incremented', { 
        shareId: id, 
        count: updatedCount,
        maxReached 
      });
      
      // If this was the last allowed download, log it
      if (maxReached) {
        this.logger.info('Share has reached maximum downloads', { shareId: id });
      }
      
      return updatedCount;
    } catch (error: any) {
      this.logger.error('Failed to increment download count', {
        shareId: id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Clean expired shares
   */
  async cleanExpiredShares() {
    try {
      const db = this.db.getInstance();
      
      // Get shares that are about to be deleted for logging
      const expiredShares = await db
        .select()
        .from(shares)
        .where(
          or(
            lt(shares.expiresAt, new Date()),
            and(
              sql`${shares.maxDownloads} > 0`,
              sql`${shares.downloadCount} >= ${shares.maxDownloads}`
            )
          )
        );
      
      // Log the expired shares that will be deleted
      if (expiredShares.length > 0) {
        this.logger.info('Cleaning expired shares', { count: expiredShares.length });
        
        // Log each expired share
        for (const share of expiredShares) {
          await this.activityService.createActivity({
            type: 'system_event',
            userId: share.createdById,
            fileId: share.fileId,
            metadata: {
              action: 'share_expired',
              shareId: share.id,
              reason: share.expiresAt && share.expiresAt < new Date() 
                ? 'time_expired' 
                : 'max_downloads_reached'
            }
          });
        }
      }
      
      // Delete expired shares
      await db
        .delete(shares)
        .where(
          or(
            lt(shares.expiresAt, new Date()),
            and(
              sql`${shares.maxDownloads} > 0`,
              sql`${shares.downloadCount} >= ${shares.maxDownloads}`
            )
          )
        );
    } catch (error: any) {
      this.logger.error('Failed to clean expired shares', {
        error: error.message
      });
    }
  }
  
  /**
   * Setup automated cleanup of expired shares
   */
  private setupExpiredSharesCleanup() {
    // Run every hour
    const ONE_HOUR = 60 * 60 * 1000;
    
    setInterval(() => {
      this.cleanExpiredShares().catch(error => {
        this.logger.error('Error in scheduled expired shares cleanup', {
          error: error.message
        });
      });
    }, ONE_HOUR);
    
    // Also run immediately on service start
    this.cleanExpiredShares().catch(error => {
      this.logger.error('Error in initial expired shares cleanup', {
        error: error.message
      });
    });
  }
} 