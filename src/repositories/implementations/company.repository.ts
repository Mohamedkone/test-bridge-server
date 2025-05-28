import { eq, and, like, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { createId } from '@paralleldrive/cuid2';
import { 
  CompanyRepository, 
  CreateCompanyParams, 
  UpdateCompanyParams,
  CreateInviteParams,
  CompanyWithRelations 
} from '../company.repository';
import { companies, companyInvites } from '../../db/schema/companies';
import { DatabaseError } from '../../errors/database.error';

export class MySQLCompanyRepository implements CompanyRepository {
  constructor(private db: NodePgDatabase) {}

  async findById(id: string) {
    try {
      const result = await this.db.select().from(companies).where(eq(companies.id, id));
      return result[0] || null;
    } catch (error) {
      throw new DatabaseError('Failed to find company by ID', error);
    }
  }

  async findBySlug(slug: string) {
    try {
      const result = await this.db.select().from(companies).where(eq(companies.slug, slug));
      return result[0] || null;
    } catch (error) {
      throw new DatabaseError('Failed to find company by slug', error);
    }
  }

  async create(data: CreateCompanyParams) {
    try {
      const id = createId();
      const slug = data.slug || this.generateSlug(data.name);
      
      const [company] = await this.db
        .insert(companies)
        .values({
          id,
          name: data.name,
          slug,
          description: data.description,
          logo: data.logo,
          website: data.website,
          status: 'active',
          settings: data.settings || {},
          metadata: data.metadata || {},
        })
        .returning();

      return company;
    } catch (error) {
      throw new DatabaseError('Failed to create company', error);
    }
  }

  async update(id: string, data: UpdateCompanyParams) {
    try {
      const updateData: any = { ...data };
      
      // If name is being updated and no slug is provided, generate a new slug
      if (data.name && !data.slug) {
        updateData.slug = this.generateSlug(data.name);
      }

      const [company] = await this.db
        .update(companies)
        .set({
          ...updateData,
          updatedAt: new Date(),
        })
        .where(eq(companies.id, id))
        .returning();

      return company;
    } catch (error) {
      throw new DatabaseError('Failed to update company', error);
    }
  }

  async delete(id: string) {
    try {
      const result = await this.db.delete(companies).where(eq(companies.id, id));
      return result.rowCount > 0;
    } catch (error) {
      throw new DatabaseError('Failed to delete company', error);
    }
  }

  async list(params?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
  }) {
    try {
      const page = params?.page || 1;
      const limit = params?.limit || 10;
      const offset = (page - 1) * limit;

      let query = this.db.select().from(companies);

      if (params?.search) {
        query = query.where(
          sql`${companies.name} LIKE ${`%${params.search}%`} OR ${companies.description} LIKE ${`%${params.search}%`}`
        );
      }

      if (params?.status) {
        query = query.where(eq(companies.status, params.status));
      }

      const [total] = await this.db
        .select({ count: sql<number>`count(*)` })
        .from(companies);

      const result = await query.limit(limit).offset(offset);

      return {
        companies: result,
        total: total.count,
      };
    } catch (error) {
      throw new DatabaseError('Failed to list companies', error);
    }
  }

  async createInvite(data: CreateInviteParams) {
    try {
      const token = createId();
      const expiresAt = new Date(Date.now() + (data.expiresIn || 7 * 24 * 60 * 60) * 1000);

      const [invite] = await this.db
        .insert(companyInvites)
        .values({
          companyId: data.companyId,
          email: data.email,
          role: data.role,
          token,
          expiresAt,
          status: 'pending',
          metadata: data.metadata || {},
        })
        .returning();

      return invite;
    } catch (error) {
      throw new DatabaseError('Failed to create company invite', error);
    }
  }

  async findInviteByToken(token: string) {
    try {
      const [invite] = await this.db
        .select()
        .from(companyInvites)
        .where(
          and(
            eq(companyInvites.token, token),
            sql`${companyInvites.expiresAt} > NOW()`
          )
        );

      return invite || null;
    } catch (error) {
      throw new DatabaseError('Failed to find invite by token', error);
    }
  }

  async findInviteByEmail(companyId: string, email: string) {
    try {
      const [invite] = await this.db
        .select()
        .from(companyInvites)
        .where(
          and(
            eq(companyInvites.companyId, companyId),
            eq(companyInvites.email, email),
            sql`${companyInvites.expiresAt} > NOW()`
          )
        );

      return invite || null;
    } catch (error) {
      throw new DatabaseError('Failed to find invite by email', error);
    }
  }

  async updateInviteStatus(token: string, status: string) {
    try {
      const [invite] = await this.db
        .update(companyInvites)
        .set({
          status,
          updatedAt: new Date(),
        })
        .where(eq(companyInvites.token, token))
        .returning();

      return invite;
    } catch (error) {
      throw new DatabaseError('Failed to update invite status', error);
    }
  }

  async deleteInvite(token: string) {
    try {
      const result = await this.db
        .delete(companyInvites)
        .where(eq(companyInvites.token, token));

      return result.rowCount > 0;
    } catch (error) {
      throw new DatabaseError('Failed to delete invite', error);
    }
  }

  async listInvites(companyId: string, params?: {
    page?: number;
    limit?: number;
    status?: string;
  }) {
    try {
      const page = params?.page || 1;
      const limit = params?.limit || 10;
      const offset = (page - 1) * limit;

      let query = this.db
        .select()
        .from(companyInvites)
        .where(eq(companyInvites.companyId, companyId));

      if (params?.status) {
        query = query.where(eq(companyInvites.status, params.status));
      }

      const [total] = await this.db
        .select({ count: sql<number>`count(*)` })
        .from(companyInvites)
        .where(eq(companyInvites.companyId, companyId));

      const result = await query.limit(limit).offset(offset);

      return {
        invites: result,
        total: total.count,
      };
    } catch (error) {
      throw new DatabaseError('Failed to list company invites', error);
    }
  }

  async updateSettings(companyId: string, settings: Record<string, any>) {
    try {
      const [company] = await this.db
        .update(companies)
        .set({
          settings,
          updatedAt: new Date(),
        })
        .where(eq(companies.id, companyId))
        .returning();

      return company;
    } catch (error) {
      throw new DatabaseError('Failed to update company settings', error);
    }
  }

  async getSettings(companyId: string) {
    try {
      const [company] = await this.db
        .select({ settings: companies.settings })
        .from(companies)
        .where(eq(companies.id, companyId));

      return company?.settings || {};
    } catch (error) {
      throw new DatabaseError('Failed to get company settings', error);
    }
  }

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }
} 