// src/repositories/user.repository.ts
import { injectable, inject } from 'inversify';
import { Logger } from '../utils/logger';
import { DrizzleClient } from '../db/drizzle.client';
import { users, userCompanies, userSessions } from '../db/schema/users';
import { eq, like, and, or, sql } from 'drizzle-orm';
import { CreateUserDto, UpdateUserDto } from '../services/user/user.service';
import { PaginationOptions } from '../types/common';
import { hash } from 'bcrypt';

type UserModel = typeof users.$inferSelect;
type UserCompany = typeof userCompanies.$inferSelect;
type UserSession = typeof userSessions.$inferSelect;

@injectable()
export class UserRepository {
  constructor(
    @inject('DrizzleClient') private db: DrizzleClient,
    @inject('Logger') private logger: Logger
  ) {
    this.logger = logger.createChildLogger('UserRepository');
  }

  /**
   * Create a new user
   */
  async create(data: CreateUserDto): Promise<UserModel> {
    try {
      const hashedPassword = await hash(data.password, 10);
      const db = this.db.getInstance();
      await db.insert(users).values({
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        password: hashedPassword,
        role: data.role || 'user',
        status: 'active',
        isGuest: false,
        metadata: {},
        lastLoginAt: data.lastLoginAt || new Date()
      });
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, data.email))
        .limit(1);
      return user;
    } catch (error: any) {
      this.logger.error('Failed to create user', { error: error.message });
      throw error;
    }
  }

  /**
   * Find user by ID
   */
  async findById(id: string): Promise<UserModel | null> {
    try {
      const db = this.db.getInstance();
      const [user] = await db.select().from(users).where(eq(users.id, id));
      return user || null;
    } catch (error: any) {
      this.logger.error('Failed to find user by ID', { userId: id, error: error.message });
      throw error;
    }
  }

  /**
   * Find user by email
   */
  async findByEmail(email: string): Promise<UserModel | null> {
    try {
      const db = this.db.getInstance();
      const [user] = await db.select().from(users).where(eq(users.email, email));
      return user || null;
    } catch (error: any) {
      this.logger.error('Failed to find user by email', { email, error: error.message });
      throw error;
    }
  }

  /**
   * Update user
   */
  async update(id: string, data: UpdateUserDto): Promise<UserModel> {
    try {
      const db = this.db.getInstance();
      const updateData: any = { ...data };
      if (data.password) {
        updateData.password = await hash(data.password, 10);
      }
      if (data.lastLoginAt) {
        updateData.lastLoginAt = data.lastLoginAt;
      }
      await db.update(users)
        .set(updateData)
        .where(eq(users.id, id));
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, id))
        .limit(1);
      return user;
    } catch (error: any) {
      this.logger.error('Failed to update user', { userId: id, error: error.message });
      throw error;
    }
  }

  /**
   * Delete user
   */
  async delete(id: string): Promise<void> {
    try {
      const db = this.db.getInstance();
      await db.delete(users).where(eq(users.id, id));
    } catch (error: any) {
      this.logger.error('Failed to delete user', { userId: id, error: error.message });
      throw error;
    }
  }

  /**
   * Search users
   */
  async search(query: string, options: PaginationOptions): Promise<{ users: UserModel[]; total: number }> {
    try {
      const db = this.db.getInstance();
      const { page, limit } = options;
      const offset = (page - 1) * limit;
      const searchQuery = query ? `%${query}%` : '%';
      const whereClause = or(
        like(users.email, searchQuery),
        like(users.firstName, searchQuery),
        like(users.lastName, searchQuery)
      );
      const [{ count }] = await db
        .select({ count: sql`count(*)` })
        .from(users)
        .where(whereClause);
      const results = await db
        .select()
        .from(users)
        .where(whereClause)
        .limit(limit)
        .offset(offset);
      return {
        users: results,
        total: Number(count)
      };
    } catch (error: any) {
      this.logger.error('Failed to search users', { query, error: error.message });
      throw error;
    }
  }

  /**
   * Find user by Auth0 ID
   */
  async findByAuth0Id(auth0Id: string): Promise<UserModel | null> {
    try {
      const db = this.db.getInstance();
      const [user] = await db
        .select()
        .from(users)
        .where(sql`JSON_EXTRACT(metadata, '$.auth0Id') = ${auth0Id}`)
        .limit(1);
      return user || null;
    } catch (error: any) {
      this.logger.error('Failed to find user by Auth0 ID', { auth0Id, error: error.message });
      throw error;
    }
  }

  // User-Company relationship methods
  async addToCompany(userId: string, companyId: string, role?: string): Promise<UserCompany> {
    // Implementation needed
    throw new Error('Method not implemented');
  }

  async removeFromCompany(userId: string, companyId: string): Promise<boolean> {
    // Implementation needed
    throw new Error('Method not implemented');
  }

  async updateCompanyRole(userId: string, companyId: string, role: string): Promise<UserCompany> {
    // Implementation needed
    throw new Error('Method not implemented');
  }

  async setDefaultCompany(userId: string, companyId: string): Promise<boolean> {
    // Implementation needed
    throw new Error('Method not implemented');
  }

  async getCompanies(userId: string): Promise<UserCompany[]> {
    // Implementation needed
    throw new Error('Method not implemented');
  }

  // Session methods
  async createSession(userId: string, expiresIn: number): Promise<UserSession> {
    // Implementation needed
    throw new Error('Method not implemented');
  }

  async validateSession(token: string): Promise<UserSession | null> {
    // Implementation needed
    throw new Error('Method not implemented');
  }

  async deleteSession(token: string): Promise<boolean> {
    // Implementation needed
    throw new Error('Method not implemented');
  }

  async deleteAllSessions(userId: string): Promise<boolean> {
    // Implementation needed
    throw new Error('Method not implemented');
  }

  // Guest user methods
  async createGuestUser(email: string, metadata?: Record<string, any>): Promise<UserModel> {
    // Implementation needed
    throw new Error('Method not implemented');
  }

  async convertGuestToUser(guestId: string, password: string): Promise<UserModel> {
    // Implementation needed
    throw new Error('Method not implemented');
  }
}