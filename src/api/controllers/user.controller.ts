// src/api/controllers/user.controller.ts
import { Request, Response, NextFunction } from 'express';
import { injectable, inject } from 'inversify';
import { Logger } from '../../utils/logger';
import { UserService } from '../../services/user/user.service';
import { ValidationError } from '../../utils/errors';
import { validate, validateUserCreate, validateUserUpdate } from '../middleware/validation.middleware';
import { validationResult } from 'express-validator';

@injectable()
export class UserController {
  constructor(
    @inject('UserService') private userService: UserService,
    @inject('Logger') private logger: Logger
  ) {
    this.logger = logger.createChildLogger('UserController');
  }

  /**
   * Create a new user
   */
  async createUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Run validation
      await Promise.all(validateUserCreate.map(validation => validation.run(req)));
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ValidationError('Invalid user data', errors.array());
      }

      const user = await this.userService.createUser(req.body);
      res.status(201).json(user);
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Get user profile
   */
  async getUserProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw new ValidationError('User ID is required');
      }

      const user = await this.userService.getUserById(userId);
      res.json(user);
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Update user profile
   */
  async updateUserProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Run validation
      await Promise.all(validateUserUpdate.map(validation => validation.run(req)));
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ValidationError('Invalid user data', errors.array());
      }

      const userId = req.user?.id;
      if (!userId) {
        throw new ValidationError('User ID is required');
      }

      const user = await this.userService.updateUser(userId, req.body);
      res.json(user);
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Search users
   */
  async searchUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { query, page = 1, limit = 10 } = req.query;
      const users = await this.userService.searchUsers(query as string, {
        page: Number(page),
        limit: Number(limit)
      });
      res.json(users);
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Get user by ID (admin only)
   */
  async getUserById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const user = await this.userService.getUserById(id);
      res.json(user);
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Update user (admin only)
   */
  async updateUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Run validation
      await Promise.all(validateUserUpdate.map(validation => validation.run(req)));
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ValidationError('Invalid user data', errors.array());
      }

      const { id } = req.params;
      const user = await this.userService.updateUser(id, req.body);
      res.json(user);
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Delete user (admin only)
   */
  async deleteUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      await this.userService.deleteUser(id);
      res.status(204).send();
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Get user roles
   */
  async getUserRoles(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw new ValidationError('User ID is required');
      }

      const roles = await this.userService.getUserRoles(userId);
      res.json(roles);
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Update user roles (admin only)
   */
  async updateUserRoles(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { roles } = req.body;

      if (!Array.isArray(roles)) {
        throw new ValidationError('Roles must be an array');
      }

      const updatedRoles = await this.userService.updateUserRoles(id, roles);
      res.json(updatedRoles);
    } catch (error: any) {
      next(error);
    }
  }
} 