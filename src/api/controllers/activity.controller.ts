// src/api/controllers/activity.controller.ts
import { injectable, inject } from 'inversify';
import { Request, Response } from 'express';
import { ActivityService, ActivityFilter, ActivitySubscriptionOptions, CreateActivityDto } from '../../services/activity/activity.service';
import { Logger } from '../../utils/logger';
import { ValidationError } from '../../utils/errors';

@injectable()
export class ActivityController {
  constructor(
    @inject('ActivityService') private activityService: ActivityService,
    @inject('Logger') private logger: Logger
  ) {
    this.logger = logger.createChildLogger('ActivityController');
  }

  /**
   * Create a new activity
   */
  async createActivity(req: Request, res: Response) {
    try {
      const data: CreateActivityDto = {
        ...req.body,
        userId: req.user.id
      };

      const activity = await this.activityService.createActivity(data);
      res.status(201).json(activity);
    } catch (error: any) {
      this.logger.error('Failed to create activity', { error: error.message });
      if (error instanceof ValidationError) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  }

  /**
   * Get file activities
   */
  async getFileActivities(req: Request, res: Response) {
    try {
      const { fileId } = req.params;
      
      if (!fileId) {
        throw new ValidationError('File ID is required');
      }
      
      const activities = await this.activityService.getFileActivities(fileId, req.user.id);
      res.json(activities);
    } catch (error: any) {
      this.logger.error('Failed to get file activities', { error: error.message });
      
      if (error instanceof ValidationError) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  }

  /**
   * Get room activities
   */
  async getRoomActivities(req: Request, res: Response) {
    try {
      const { roomId } = req.params;
      
      if (!roomId) {
        throw new ValidationError('Room ID is required');
      }
      
      const activities = await this.activityService.getRoomActivities(roomId, req.user.id);
      res.json(activities);
    } catch (error: any) {
      this.logger.error('Failed to get room activities', { error: error.message });
      
      if (error instanceof ValidationError) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  }

  /**
   * Get user activities
   */
  async getUserActivities(req: Request, res: Response) {
    try {
      const activities = await this.activityService.getUserActivities(req.user.id);
      res.json(activities);
    } catch (error: any) {
      this.logger.error('Failed to get user activities', { error: error.message });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
  
  /**
   * Get company activities (admin only)
   */
  async getCompanyActivities(req: Request, res: Response) {
    try {
      const { companyId } = req.params;
      
      if (!companyId) {
        throw new ValidationError('Company ID is required');
      }
      
      // Extract filter parameters
      const filter: ActivityFilter = {};
      
      if (req.query.types) {
        filter.types = (req.query.types as string).split(',') as any[];
      }
      
      if (req.query.startDate) {
        filter.startDate = new Date(req.query.startDate as string);
      }
      
      if (req.query.endDate) {
        filter.endDate = new Date(req.query.endDate as string);
      }
      
      if (req.query.userId) {
        filter.userId = req.query.userId as string;
      }
      
      if (req.query.fileId) {
        filter.fileId = req.query.fileId as string;
      }
      
      if (req.query.roomId) {
        filter.roomId = req.query.roomId as string;
      }
      
      if (req.query.limit) {
        filter.limit = parseInt(req.query.limit as string);
      }
      
      if (req.query.offset) {
        filter.offset = parseInt(req.query.offset as string);
      }
      
      const activities = await this.activityService.getCompanyActivities(companyId, filter);
      res.json(activities);
    } catch (error: any) {
      this.logger.error('Failed to get company activities', { error: error.message });
      
      if (error instanceof ValidationError) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  }
  
  /**
   * Export activity logs (admin only)
   */
  async exportActivityLogs(req: Request, res: Response) {
    try {
      const filter: ActivityFilter = req.body;
      
      if (!filter.companyId) {
        throw new ValidationError('Company ID is required');
      }
      
      const csvContent = await this.activityService.exportActivityLogs(filter);
      
      // Set response headers for CSV download
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=activity_logs_${new Date().toISOString().split('T')[0]}.csv`);
      
      res.send(csvContent);
    } catch (error: any) {
      this.logger.error('Failed to export activity logs', { error: error.message });
      
      if (error instanceof ValidationError) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  }
  
  /**
   * Subscribe to activity notifications
   */
  async subscribeToActivities(req: Request, res: Response) {
    try {
      const options: ActivitySubscriptionOptions = {
        ...req.body,
        userId: req.user.id
      };
      
      const success = await this.activityService.subscribeToActivities(options);
      
      res.json({
        success,
        message: success ? 'Successfully subscribed to activities' : 'Failed to subscribe to activities'
      });
    } catch (error: any) {
      this.logger.error('Failed to subscribe to activities', { error: error.message });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
  
  /**
   * Unsubscribe from activity notifications
   */
  async unsubscribeFromActivities(req: Request, res: Response) {
    try {
      const success = await this.activityService.unsubscribeFromActivities(req.user.id);
      
      res.json({
        success,
        message: success ? 'Successfully unsubscribed from activities' : 'Failed to unsubscribe from activities'
      });
    } catch (error: any) {
      this.logger.error('Failed to unsubscribe from activities', { error: error.message });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
} 