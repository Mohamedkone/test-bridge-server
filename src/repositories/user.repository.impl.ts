// src/repositories/user.repository.impl.ts
import { inject, injectable } from 'inversify';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { User } from '../types/models';
import { UserRepository } from './user.repository';
import { DrizzleClient } from '../db/client';
import { users } from '../db/schema';
import { Logger } from '../utils/logger';
import { NotFoundError } from '../utils/errors';

@injectable()
export class UserRepositoryImpl implements UserRepository {
  constructor(
    @inject('DrizzleClient') private readonly db: DrizzleClient,
    @inject('Logger') private readonly logger: Logger
  ) {}

  async findById(id: string): Promise<User | null> {
    try {
      const results = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
      return results.length > 0 ? results[0] : null;
    } catch (error:any) {
      this.logger.error('Error finding user by ID', { id, error: error.message });
      throw error;
    }
  }

  async findByEmail(email: string): Promise<User | null> {
    try {
      const results = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
      return results.length > 0 ? results[0] : null;
    } catch (error:any) {
      this.logger.error('Error finding user by email', { email, error: error.message });
      throw error;
    }
  }

  async findByAuth0Id(auth0Id: string): Promise<User | null> {
    try {
      const results = await this.db.select().from(users).where(eq(users.auth0Id, auth0Id)).limit(1);
      return results.length > 0 ? results[0] : null;
    } catch (error:any) {
      this.logger.error('Error finding user by Auth0 ID', { auth0Id, error: error.message });
      throw error;
    }
  }

  async create(data: Partial<User>): Promise<User> {
    try {
      const now = new Date();
      const userId = data.id || uuidv4();

      const newUser = {
        id: userId,
        email: data.email!,
        firstName: data.firstName!,
        lastName: data.lastName!,
        auth0Id: data.auth0Id!,
        picture: data.picture,
        emailVerified: data.emailVerified || false,
        isActive: data.isActive !== undefined ? data.isActive : true,
        userType: data.userType || 'b2c',
        createdAt: now,
        updatedAt: now
      };

      await this.db.insert(users).values(newUser);
      
      this.logger.info('User created', { userId: newUser.id, email: newUser.email });
      return newUser;
    } catch (error:any) {
      this.logger.error('Error creating user', { 
        email: data.email, 
        error: error.message 
      });
      throw error;
    }
  }

  async update(id: string, data: Partial<User>): Promise<User> {
    try {
      const user = await this.findById(id);
      if (!user) {
        throw new NotFoundError('User', id);
      }

      const updateData = {
        ...data,
        updatedAt: new Date()
      };

      await this.db.update(users).set(updateData).where(eq(users.id, id));
      
      const updatedUser = await this.findById(id);
      if (!updatedUser) {
        throw new Error('Failed to retrieve updated user');
      }
      
      this.logger.info('User updated', { userId: id });
      return updatedUser;
    } catch (error:any) {
      this.logger.error('Error updating user', { id, error: error.message });
      throw error;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      const result = await this.db.delete(users).where(eq(users.id, id));
      const success = result && result.length > 0;
      
      if (success) {
        this.logger.info('User deleted', { userId: id });
      } else {
        this.logger.warn('User not found for deletion', { userId: id });
      }
      
      return success;
    } catch (error:any) {
      this.logger.error('Error deleting user', { id, error: error.message });
      throw error;
    }
  }

  async exists(id: string): Promise<boolean> {
    try {
      const user = await this.findById(id);
      return !!user;
    } catch (error:any) {
      this.logger.error('Error checking if user exists', { id, error: error.message });
      throw error;
    }
  }
}