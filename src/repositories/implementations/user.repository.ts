import { eq, and, or, like, desc, sql } from 'drizzle-orm';
import { MySql2Database } from 'drizzle-orm/mysql2';
import { createId } from '@paralleldrive/cuid2';
import bcrypt from 'bcryptjs';
import { injectable, inject } from 'inversify';
import { 
  UserRepository, 
  CreateUserParams, 
  UpdateUserParams,
  UserWithRelations 
} from '../user.repository';
import { users, userCompanies, userSessions } from '../../db/schema/users';
import { DatabaseError } from '../../errors/database.error';
import { ResultSetHeader } from 'mysql2';

@injectable()
export class MySQLUserRepository implements UserRepository {
  constructor(
    @inject('Database') private db: MySql2Database
  ) {}

  async findById(id: string) {
    try {
      const result = await this.db.select().from(users).where(eq(users.id, id));
      return result[0] || null;
    } catch (error) {
      throw new DatabaseError('Failed to find user by ID', error);
    }
  }

  async findByEmail(email: string) {
    try {
      const result = await this.db.select().from(users).where(eq(users.email, email));
      return result[0] || null;
    } catch (error) {
      throw new DatabaseError('Failed to find user by email', error);
    }
  }

  async create(data: CreateUserParams) {
    try {
      const hashedPassword = await bcrypt.hash(data.password, 10);
      const id = createId();
      
      await this.db.insert(users).values({
        id,
        email: data.email,
        password: hashedPassword,
        firstName: data.firstName,
        lastName: data.lastName,
        role: data.role || 'user',
        status: 'active',
        isGuest: data.isGuest || false,
        metadata: data.metadata || {},
      });

      return this.findById(id);
    } catch (error) {
      throw new DatabaseError('Failed to create user', error);
    }
  }

  async update(id: string, data: UpdateUserParams) {
    try {
      await this.db
        .update(users)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(eq(users.id, id));

      return this.findById(id);
    } catch (error) {
      throw new DatabaseError('Failed to update user', error);
    }
  }

  async delete(id: string) {
    try {
      const result = await this.db.delete(users).where(eq(users.id, id)) as unknown as ResultSetHeader;
      return result.affectedRows > 0;
    } catch (error) {
      throw new DatabaseError('Failed to delete user', error);
    }
  }

  async list(params?: {
    page?: number;
    limit?: number;
    search?: string;
    role?: string;
    status?: string;
    isGuest?: boolean;
  }) {
    try {
      const page = params?.page || 1;
      const limit = params?.limit || 10;
      const offset = (page - 1) * limit;

      const conditions = [];

      if (params?.search) {
        conditions.push(
          or(
            like(users.email, `%${params.search}%`),
            like(users.firstName, `%${params.search}%`),
            like(users.lastName, `%${params.search}%`)
          )
        );
      }

      if (params?.role) {
        conditions.push(eq(users.role, params.role));
      }

      if (params?.status) {
        conditions.push(eq(users.status, params.status));
      }

      if (params?.isGuest !== undefined) {
        conditions.push(eq(users.isGuest, params.isGuest));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [total] = await this.db
        .select({ count: sql<number>`count(*)` })
        .from(users)
        .where(whereClause);

      const result = await this.db
        .select()
        .from(users)
        .where(whereClause)
        .limit(limit)
        .offset(offset)
        .orderBy(desc(users.createdAt));

      return {
        users: result,
        total: Number(total.count),
      };
    } catch (error) {
      throw new DatabaseError('Failed to list users', error);
    }
  }

  async addToCompany(userId: string, companyId: string, role?: string) {
    try {
      await this.db
        .insert(userCompanies)
        .values({
          userId,
          companyId,
          role: role || 'member',
          isDefault: false,
        });

      const [userCompany] = await this.db
        .select()
        .from(userCompanies)
        .where(
          and(
            eq(userCompanies.userId, userId),
            eq(userCompanies.companyId, companyId)
          )
        );

      return userCompany;
    } catch (error) {
      throw new DatabaseError('Failed to add user to company', error);
    }
  }

  async removeFromCompany(userId: string, companyId: string) {
    try {
      const result = await this.db
        .delete(userCompanies)
        .where(
          and(
            eq(userCompanies.userId, userId),
            eq(userCompanies.companyId, companyId)
          )
        ) as unknown as ResultSetHeader;

      return result.affectedRows > 0;
    } catch (error) {
      throw new DatabaseError('Failed to remove user from company', error);
    }
  }

  async updateCompanyRole(userId: string, companyId: string, role: string) {
    try {
      await this.db
        .update(userCompanies)
        .set({ role })
        .where(
          and(
            eq(userCompanies.userId, userId),
            eq(userCompanies.companyId, companyId)
          )
        );

      const [userCompany] = await this.db
        .select()
        .from(userCompanies)
        .where(
          and(
            eq(userCompanies.userId, userId),
            eq(userCompanies.companyId, companyId)
          )
        );

      return userCompany;
    } catch (error) {
      throw new DatabaseError('Failed to update company role', error);
    }
  }

  async setDefaultCompany(userId: string, companyId: string) {
    try {
      // First, unset any existing default company
      await this.db
        .update(userCompanies)
        .set({ isDefault: false })
        .where(eq(userCompanies.userId, userId));

      // Then set the new default company
      await this.db
        .update(userCompanies)
        .set({ isDefault: true })
        .where(
          and(
            eq(userCompanies.userId, userId),
            eq(userCompanies.companyId, companyId)
          )
        );

      const [userCompany] = await this.db
        .select()
        .from(userCompanies)
        .where(
          and(
            eq(userCompanies.userId, userId),
            eq(userCompanies.companyId, companyId)
          )
        );

      return !!userCompany;
    } catch (error) {
      throw new DatabaseError('Failed to set default company', error);
    }
  }

  async getCompanies(userId: string) {
    try {
      return await this.db
        .select()
        .from(userCompanies)
        .where(eq(userCompanies.userId, userId));
    } catch (error) {
      throw new DatabaseError('Failed to get user companies', error);
    }
  }

  async createSession(userId: string, expiresIn: number) {
    try {
      const token = createId();
      const expiresAt = new Date(Date.now() + expiresIn * 1000);

      await this.db
        .insert(userSessions)
        .values({
          userId,
          token,
          expiresAt,
        });

      const [session] = await this.db
        .select()
        .from(userSessions)
        .where(eq(userSessions.token, token));

      return session;
    } catch (error) {
      throw new DatabaseError('Failed to create session', error);
    }
  }

  async validateSession(token: string) {
    try {
      const [session] = await this.db
        .select()
        .from(userSessions)
        .where(
          and(
            eq(userSessions.token, token),
            sql`${userSessions.expiresAt} > NOW()`
          )
        );

      return session || null;
    } catch (error) {
      throw new DatabaseError('Failed to validate session', error);
    }
  }

  async deleteSession(token: string) {
    try {
      const result = await this.db
        .delete(userSessions)
        .where(eq(userSessions.token, token)) as unknown as ResultSetHeader;

      return result.affectedRows > 0;
    } catch (error) {
      throw new DatabaseError('Failed to delete session', error);
    }
  }

  async deleteAllSessions(userId: string) {
    try {
      const result = await this.db
        .delete(userSessions)
        .where(eq(userSessions.userId, userId)) as unknown as ResultSetHeader;

      return result.affectedRows > 0;
    } catch (error) {
      throw new DatabaseError('Failed to delete all sessions', error);
    }
  }

  async createGuestUser(email: string, metadata?: Record<string, any>) {
    try {
      const id = createId();
      
      await this.db
        .insert(users)
        .values({
          id,
          email,
          password: '', // Guest users don't have passwords
          role: 'guest',
          status: 'active',
          isGuest: true,
          metadata: metadata || {},
        });

      return this.findById(id);
    } catch (error) {
      throw new DatabaseError('Failed to create guest user', error);
    }
  }

  async convertGuestToUser(guestId: string, password: string) {
    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      
      await this.db
        .update(users)
        .set({
          password: hashedPassword,
          role: 'user',
          isGuest: false,
          updatedAt: new Date(),
        })
        .where(eq(users.id, guestId));

      return this.findById(guestId);
    } catch (error) {
      throw new DatabaseError('Failed to convert guest to user', error);
    }
  }
} 