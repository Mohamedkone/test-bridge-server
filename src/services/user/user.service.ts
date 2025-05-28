// src/services/user/user.service.ts
import { injectable, inject } from 'inversify';
import { Logger } from '../../utils/logger';
import { UserRepository } from '../../repositories/user.repository';
import { ValidationError } from '../../utils/errors';
import { PaginationOptions } from '../../types/common';

export interface User {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  status: string;
  isGuest: boolean;
  lastLoginAt: Date | null;
  metadata: Record<string, any> | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserDto {
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  role?: string;
  companyId?: string;
  lastLoginAt?: Date;
}

export interface UpdateUserDto {
  firstName?: string;
  lastName?: string;
  email?: string;
  password?: string;
  role?: string;
  companyId?: string;
  status?: string;
  lastLoginAt?: Date;
}

@injectable()
export class UserService {
  constructor(
    @inject('UserRepository') private userRepository: UserRepository,
    @inject('Logger') private logger: Logger
  ) {
    this.logger = logger.createChildLogger('UserService');
  }

  /**
   * Create a new user
   */
  async createUser(data: CreateUserDto): Promise<User> {
    try {
      // Check if user with email already exists
      const existingUser = await this.userRepository.findByEmail(data.email);
      if (existingUser) {
        throw new ValidationError('User with this email already exists');
      }

      // Create user
      const user = await this.userRepository.create(data);
      this.logger.info('User created', { userId: user.id });
      return user;
    } catch (error: any) {
      this.logger.error('Failed to create user', { error: error.message });
      throw error;
    }
  }

  /**
   * Get user by ID
   */
  async getUserById(id: string): Promise<User> {
    try {
      const user = await this.userRepository.findById(id);
      if (!user) {
        throw new ValidationError('User not found');
      }
      return user;
    } catch (error: any) {
      this.logger.error('Failed to get user', { userId: id, error: error.message });
      throw error;
    }
  }

  /**
   * Update user
   */
  async updateUser(id: string, data: UpdateUserDto): Promise<User> {
    try {
      // Check if user exists
      const existingUser = await this.userRepository.findById(id);
      if (!existingUser) {
        throw new ValidationError('User not found');
      }

      // If email is being updated, check for duplicates
      if (data.email && data.email !== existingUser.email) {
        const emailExists = await this.userRepository.findByEmail(data.email);
        if (emailExists) {
          throw new ValidationError('User with this email already exists');
        }
      }

      // Update user
      const user = await this.userRepository.update(id, data);
      this.logger.info('User updated', { userId: id });
      return user;
    } catch (error: any) {
      this.logger.error('Failed to update user', { userId: id, error: error.message });
      throw error;
    }
  }

  /**
   * Delete user
   */
  async deleteUser(id: string): Promise<void> {
    try {
      // Check if user exists
      const existingUser = await this.userRepository.findById(id);
      if (!existingUser) {
        throw new ValidationError('User not found');
      }

      // Delete user
      await this.userRepository.delete(id);
      this.logger.info('User deleted', { userId: id });
    } catch (error: any) {
      this.logger.error('Failed to delete user', { userId: id, error: error.message });
      throw error;
    }
  }

  /**
   * Search users
   */
  async searchUsers(query: string, options: PaginationOptions): Promise<{ users: User[]; total: number }> {
    try {
      const result = await this.userRepository.search(query, options);
      return result;
    } catch (error: any) {
      this.logger.error('Failed to search users', { query, error: error.message });
      throw error;
    }
  }

  /**
   * Get user roles
   */
  async getUserRoles(userId: string): Promise<string[]> {
    try {
      const user = await this.userRepository.findById(userId);
      if (!user) {
        throw new ValidationError('User not found');
      }
      return [user.role];
    } catch (error: any) {
      this.logger.error('Failed to get user roles', { userId, error: error.message });
      throw error;
    }
  }

  /**
   * Update user roles
   */
  async updateUserRoles(userId: string, roles: string[]): Promise<string[]> {
    try {
      // Check if user exists
      const existingUser = await this.userRepository.findById(userId);
      if (!existingUser) {
        throw new ValidationError('User not found');
      }

      // Update user role (currently only supporting single role)
      const role = roles[0] || existingUser.role;
      await this.userRepository.update(userId, { role });
      this.logger.info('User roles updated', { userId, roles });
      return [role];
    } catch (error: any) {
      this.logger.error('Failed to update user roles', { userId, error: error.message });
      throw error;
    }
  }

  /**
   * Find a user by email
   */
  async findUserByEmail(email: string): Promise<User | null> {
    try {
      const user = await this.userRepository.findByEmail(email);
      return user;
    } catch (error: any) {
      this.logger.error('Failed to find user by email', { email, error: error.message });
      throw error;
    }
  }
} 