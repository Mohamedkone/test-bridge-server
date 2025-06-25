// src/api/controllers/sharing.controller.ts
import { injectable, inject } from 'inversify';
import { Request, Response } from 'express';
import { SharingService, CreateShareDto, UpdateShareDto } from '../../services/sharing/sharing.service';
import { Logger } from '../../utils/logger';
import { ValidationError } from '../../utils/errors';

@injectable()
export class SharingController {
  constructor(
    @inject('SharingService') private sharingService: SharingService,
    @inject('Logger') private logger: Logger
  ) {
    this.logger = logger.createChildLogger('SharingController');
  }

  /**
   * Create a new share
   */
  async createShare(req: Request, res: Response) {
    try {
      const data: CreateShareDto = {
        ...req.body,
        createdById: req.user.id
      };

      const share = await this.sharingService.createShare(data);
      res.status(201).json(share);
    } catch (error: any) {
      this.logger.error('Failed to create share', { error: error.message });
      if (error instanceof ValidationError) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  }

  /**
   * Get share by ID
   */
  async getShareById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const share = await this.sharingService.getShareById(id);
      res.json(share);
    } catch (error: any) {
      this.logger.error('Failed to get share', { error: error.message });
      if (error instanceof ValidationError) {
        res.status(404).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  }

  /**
   * Update share
   */
  async updateShare(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const data: UpdateShareDto = req.body;
      const share = await this.sharingService.updateShare(id, data, req.user.id);
      res.json(share);
    } catch (error: any) {
      this.logger.error('Failed to update share', { error: error.message });
      if (error instanceof ValidationError) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  }

  /**
   * Delete share
   */
  async deleteShare(req: Request, res: Response) {
    try {
      const { id } = req.params;
      await this.sharingService.deleteShare(id, req.user.id);
      res.status(204).send();
    } catch (error: any) {
      this.logger.error('Failed to delete share', { error: error.message });
      if (error instanceof ValidationError) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  }

  /**
   * Get file shares
   */
  async getFileShares(req: Request, res: Response) {
    try {
      const { fileId } = req.params;
      const shares = await this.sharingService.getFileShares(fileId, req.user.id);
      res.json(shares);
    } catch (error: any) {
      this.logger.error('Failed to get file shares', { error: error.message });
      if (error instanceof ValidationError) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  }
} 