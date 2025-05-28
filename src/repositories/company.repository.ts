import { companies, companyInvites } from '../db/schema/companies';
import { InferModel } from 'drizzle-orm';
import { injectable, inject } from 'inversify';
import { Logger } from '../utils/logger';
import { DrizzleClient } from '../db/drizzle.client';
import { CompanyMember, CompanySettings } from '../types/company';
import { PaginationOptions } from '../types/common';
import { eq, like, and } from 'drizzle-orm';
import { companyMembers, companySettings } from '../db/schema';
import { MySql2Database } from 'drizzle-orm/mysql2';
import * as schema from '../db/schema';
import { v4 as uuidv4 } from 'uuid';

type Company = InferModel<typeof companies>;
type CompanyInvite = InferModel<typeof companyInvites>;

export interface CreateCompanyParams {
  name: string;
  description?: string;
  logo?: string;
  website?: string;
  industry?: string;
  size?: string;
  location?: string;
  settings?: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface UpdateCompanyParams {
  name?: string;
  description?: string;
  logo?: string;
  website?: string;
  industry?: string;
  size?: string;
  location?: string;
  settings?: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface CreateInviteParams {
  companyId: string;
  email: string;
  role: string;
  token?: string;
  expiresAt?: Date;
  status?: string;
  metadata?: Record<string, any>;
  expiresIn?: number;
}

export interface CompanyWithRelations extends Company {
  invites?: CompanyInvite[];
}

@injectable()
export class CompanyRepository {
  constructor(
    @inject('DrizzleClient') private drizzleClient: DrizzleClient,
    @inject('Logger') private logger: Logger
  ) {
    this.logger = logger.createChildLogger('CompanyRepository');
  }

  private getDb(): MySql2Database<typeof schema> {
    return this.drizzleClient.getInstance();
  }

  /**
   * Create a new company
   */
  async create(data: CreateCompanyParams): Promise<Company> {
    try {
      const db = this.getDb();
      
      // Create the company
      await db.insert(companies).values(data);
      
      // Get the created company
      const [company] = await db
        .select()
        .from(companies)
        .where(eq(companies.name, data.name))
        .limit(1);
      
      // Initialize company settings with default values
      await db.insert(companySettings).values({
        id: uuidv4(),
        companyId: company.id,
        allowGuestUploads: false,
        maxFileSize: 100, // 100MB default
        allowedFileTypes: [],
        storageQuota: 1000, // 1GB default
        customBranding: {},
        notifications: {
          email: true,
          push: false,
          webhook: ""
        },
        security: {
          requireApproval: false,
          passwordProtected: false,
          expirationDays: 7
        }
      });
      
      return company;
    } catch (error: any) {
      this.logger.error('Failed to create company', { error });
      throw error;
    }
  }

  /**
   * Find company by ID
   */
  async findById(id: string): Promise<Company | null> {
    try {
      const db = this.getDb();
      const [company] = await db
        .select()
        .from(companies)
        .where(eq(companies.id, id));
      return company || null;
    } catch (error: any) {
      this.logger.error('Failed to find company', { id, error });
      throw error;
    }
  }

  /**
   * Update company
   */
  async update(id: string, data: UpdateCompanyParams): Promise<Company | null> {
    try {
      const db = this.getDb();
      await db
        .update(companies)
        .set(data)
        .where(eq(companies.id, id));
      return this.findById(id);
    } catch (error: any) {
      this.logger.error('Failed to update company', { id, error });
      throw error;
    }
  }

  /**
   * Delete company
   */
  async delete(id: string): Promise<boolean> {
    try {
      const db = this.getDb();
      const [result] = await db
        .delete(companies)
        .where(eq(companies.id, id));
      return result.affectedRows > 0;
    } catch (error: any) {
      this.logger.error('Failed to delete company', { id, error });
      throw error;
    }
  }

  /**
   * Search companies
   */
  async search(query: string, options: PaginationOptions): Promise<{ data: Company[]; total: number }> {
    try {
      const db = this.getDb();
      const { page, limit } = options;
      const offset = (page - 1) * limit;

      const whereClause = query
        ? like(companies.name, `%${query}%`)
        : undefined;

      const [data, total] = await Promise.all([
        db
          .select()
          .from(companies)
          .where(whereClause)
          .limit(limit)
          .offset(offset),
        db
          .select({ count: companies.id })
          .from(companies)
          .where(whereClause)
          .then((result: any[]) => result.length)
      ]);

      return { data, total };
    } catch (error: any) {
      this.logger.error('Failed to search companies', { query, error });
      throw error;
    }
  }

  /**
   * Get company members
   */
  async getMembers(companyId: string): Promise<CompanyMember[]> {
    try {
      const db = this.getDb();
      return await db
        .select()
        .from(companyMembers)
        .where(eq(companyMembers.companyId, companyId));
    } catch (error: any) {
      this.logger.error('Failed to get company members', { companyId, error });
      throw error;
    }
  }

  /**
   * Add member to company
   */
  async addMember(companyId: string, userId: string, role: string): Promise<CompanyMember> {
    try {
      const db = this.getDb();
      await db
        .insert(companyMembers)
        .values({ companyId, userId, role });
      const [member] = await db
        .select()
        .from(companyMembers)
        .where(
          and(
            eq(companyMembers.companyId, companyId),
            eq(companyMembers.userId, userId)
          )
        );
      return member;
    } catch (error: any) {
      this.logger.error('Failed to add company member', { companyId, userId, error });
      throw error;
    }
  }

  /**
   * Remove member from company
   */
  async removeMember(companyId: string, userId: string): Promise<boolean> {
    try {
      const db = this.getDb();
      const [result] = await db
        .delete(companyMembers)
        .where(
          and(
            eq(companyMembers.companyId, companyId),
            eq(companyMembers.userId, userId)
          )
        );
      return result.affectedRows > 0;
    } catch (error: any) {
      this.logger.error('Failed to remove company member', { companyId, userId, error });
      throw error;
    }
  }

  /**
   * Update member role
   */
  async updateMemberRole(companyId: string, userId: string, role: string): Promise<CompanyMember | null> {
    try {
      const db = this.getDb();
      await db
        .update(companyMembers)
        .set({ role })
        .where(
          and(
            eq(companyMembers.companyId, companyId),
            eq(companyMembers.userId, userId)
          )
        );
      const [member] = await db
        .select()
        .from(companyMembers)
        .where(
          and(
            eq(companyMembers.companyId, companyId),
            eq(companyMembers.userId, userId)
          )
        );
      return member || null;
    } catch (error: any) {
      this.logger.error('Failed to update member role', { companyId, userId, role, error });
      throw error;
    }
  }

  /**
   * Get company settings
   */
  async getSettings(companyId: string): Promise<CompanySettings | null> {
    try {
      const db = this.getDb();
      const [settings] = await db
        .select()
        .from(companySettings)
        .where(eq(companySettings.companyId, companyId));
      return settings || null;
    } catch (error: any) {
      this.logger.error('Failed to get company settings', { companyId, error });
      throw error;
    }
  }

  /**
   * Update company settings
   */
  async updateSettings(companyId: string, settings: Partial<CompanySettings>): Promise<CompanySettings | null> {
    try {
      const db = this.getDb();
      await db
        .update(companySettings)
        .set(settings)
        .where(eq(companySettings.companyId, companyId));
      return this.getSettings(companyId);
    } catch (error: any) {
      this.logger.error('Failed to update company settings', { companyId, error });
      throw error;
    }
  }

  /**
   * List companies with pagination and filters
   */
  async list(params?: {
    page?: number;
    limit?: number;
    search?: string;
  }): Promise<{ companies: Company[]; total: number }> {
    try {
      const db = this.getDb();
      const { page = 1, limit = 10, search } = params || {};
      const offset = (page - 1) * limit;

      const whereClause = search
        ? like(companies.name, `%${search}%`)
        : undefined;

      const [companyList, total] = await Promise.all([
        db
          .select()
          .from(companies)
          .where(whereClause)
          .limit(limit)
          .offset(offset),
        db
          .select({ count: companies.id })
          .from(companies)
          .where(whereClause)
          .then((result: any[]) => result.length)
      ]);

      return { companies: companyList, total };
    } catch (error: any) {
      this.logger.error('Failed to list companies', { params, error });
      throw error;
    }
  }

  /**
   * Create company invite
   */
  async createInvite(data: CreateInviteParams): Promise<CompanyInvite> {
    try {
      const db = this.getDb();
      
      // Generate required fields if not provided
      const token = data.token || uuidv4();
      const expiresAt = data.expiresAt || new Date(Date.now() + (data.expiresIn || 7 * 24 * 60 * 60 * 1000));
      const status = data.status || 'pending';
      
      // Create a properly typed object for insertion
      const inviteData = {
        companyId: data.companyId,
        email: data.email,
        role: data.role,
        token,
        expiresAt,
        status,
        metadata: data.metadata
      };
      
      await db.insert(companyInvites).values(inviteData);
      
      const [invite] = await db
        .select()
        .from(companyInvites)
        .where(
          and(
            eq(companyInvites.companyId, data.companyId),
            eq(companyInvites.email, data.email)
          )
        );
      return invite;
    } catch (error: any) {
      this.logger.error('Failed to create company invite', { data, error });
      throw error;
    }
  }

  /**
   * Find invite by token
   */
  async findInviteByToken(token: string): Promise<CompanyInvite | null> {
    try {
      const db = this.getDb();
      const [invite] = await db
        .select()
        .from(companyInvites)
        .where(eq(companyInvites.token, token));
      return invite || null;
    } catch (error: any) {
      this.logger.error('Failed to find invite by token', { token, error });
      throw error;
    }
  }

  /**
   * Find invite by email
   */
  async findInviteByEmail(companyId: string, email: string): Promise<CompanyInvite | null> {
    try {
      const db = this.getDb();
      const [invite] = await db
        .select()
        .from(companyInvites)
        .where(
          and(
            eq(companyInvites.companyId, companyId),
            eq(companyInvites.email, email)
          )
        );
      return invite || null;
    } catch (error: any) {
      this.logger.error('Failed to find invite by email', { companyId, email, error });
      throw error;
    }
  }

  /**
   * Update invite status
   */
  async updateInviteStatus(token: string, status: string): Promise<CompanyInvite> {
    try {
      const db = this.getDb();
      await db
        .update(companyInvites)
        .set({ status })
        .where(eq(companyInvites.token, token));
      const [invite] = await db
        .select()
        .from(companyInvites)
        .where(eq(companyInvites.token, token));
      return invite;
    } catch (error: any) {
      this.logger.error('Failed to update invite status', { token, status, error });
      throw error;
    }
  }

  /**
   * Delete invite
   */
  async deleteInvite(token: string): Promise<boolean> {
    try {
      const db = this.getDb();
      const [result] = await db
        .delete(companyInvites)
        .where(eq(companyInvites.token, token));
      return result.affectedRows > 0;
    } catch (error: any) {
      this.logger.error('Failed to delete invite', { token, error });
      throw error;
    }
  }

  /**
   * List company invites
   */
  async listInvites(companyId: string, params?: {
    page?: number;
    limit?: number;
    status?: string;
  }): Promise<{ invites: CompanyInvite[]; total: number }> {
    try {
      const db = this.getDb();
      const { page = 1, limit = 10, status } = params || {};
      const offset = (page - 1) * limit;

      const whereClause = and(
        eq(companyInvites.companyId, companyId),
        status ? eq(companyInvites.status, status) : undefined
      );

      const [invites, total] = await Promise.all([
        db
          .select()
          .from(companyInvites)
          .where(whereClause)
          .limit(limit)
          .offset(offset),
        db
          .select({ count: companyInvites.id })
          .from(companyInvites)
          .where(whereClause)
          .then((result: any[]) => result.length)
      ]);

      return { invites, total };
    } catch (error: any) {
      this.logger.error('Failed to list company invites', { companyId, params, error });
      throw error;
    }
  }

  /**
   * Create company settings
   */
  async createSettings(companyId: string, settings: any): Promise<CompanySettings | null> {
    try {
      const db = this.getDb();
      
      // Ensure we have a proper ID and companyId
      const settingsData = {
        ...settings,
        id: settings.id || uuidv4(),
        companyId: companyId
      };
      
      await db.insert(companySettings).values(settingsData);
      
      return this.getSettings(companyId);
    } catch (error: any) {
      this.logger.error('Failed to create company settings', { companyId, error });
      throw error;
    }
  }
} 