// src/services/company/company.service.ts
import { injectable, inject } from 'inversify';
import { Logger } from '../../utils/logger';
import { CompanyRepository, CreateCompanyParams, UpdateCompanyParams } from '../../repositories/company.repository';
import { NotFoundError, ValidationError } from '../../utils/errors';
import { CompanyMember, CompanySettings } from '../../types/company';
import { PaginationOptions } from '../../types/common';
import { companies } from '../../db/schema/companies';
import { InferModel } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

type Company = InferModel<typeof companies>;

@injectable()
export class CompanyService {
  constructor(
    @inject('CompanyRepository') private companyRepository: CompanyRepository,
    @inject('Logger') private logger: Logger
  ) {
    this.logger = logger.createChildLogger('CompanyService');
  }

  /**
   * Create a new company
   */
  async createCompany(data: CreateCompanyParams): Promise<Company> {
    try {
      if (!data.name) {
        throw new ValidationError('Company name is required');
      }
      return await this.companyRepository.create(data);
    } catch (error: any) {
      this.logger.error('Failed to create company', { error });
      throw error;
    }
  }

  /**
   * Get company by ID
   */
  async getCompanyById(id: string): Promise<Company> {
    try {
      const company = await this.companyRepository.findById(id);
      if (!company) {
        throw new NotFoundError(`Company with ID ${id} not found`);
      }
      return company;
    } catch (error: any) {
      this.logger.error('Failed to get company', { id, error });
      throw error;
    }
  }

  /**
   * Update company
   */
  async updateCompany(id: string, data: UpdateCompanyParams): Promise<Company> {
    try {
      const company = await this.companyRepository.update(id, data);
      if (!company) {
        throw new NotFoundError(`Company with ID ${id} not found`);
      }
      return company;
    } catch (error: any) {
      this.logger.error('Failed to update company', { id, error });
      throw error;
    }
  }

  /**
   * Delete company
   */
  async deleteCompany(id: string): Promise<void> {
    try {
      const deleted = await this.companyRepository.delete(id);
      if (!deleted) {
        throw new NotFoundError(`Company with ID ${id} not found`);
      }
    } catch (error: any) {
      this.logger.error('Failed to delete company', { id, error });
      throw error;
    }
  }

  /**
   * Search companies
   */
  async searchCompanies(query: string, options: PaginationOptions): Promise<{ data: Company[]; total: number }> {
    try {
      return await this.companyRepository.search(query, options);
    } catch (error: any) {
      this.logger.error('Failed to search companies', { query, error });
      throw error;
    }
  }

  /**
   * Get company members
   */
  async getCompanyMembers(companyId: string): Promise<CompanyMember[]> {
    try {
      const members = await this.companyRepository.getMembers(companyId);
      return members;
    } catch (error: any) {
      this.logger.error('Failed to get company members', { companyId, error });
      throw error;
    }
  }

  /**
   * Add member to company
   */
  async addCompanyMember(companyId: string, userId: string, role: string): Promise<CompanyMember> {
    try {
      const member = await this.companyRepository.addMember(companyId, userId, role);
      return member;
    } catch (error: any) {
      this.logger.error('Failed to add company member', { companyId, userId, error });
      throw error;
    }
  }

  /**
   * Remove member from company
   */
  async removeCompanyMember(companyId: string, userId: string): Promise<void> {
    try {
      const removed = await this.companyRepository.removeMember(companyId, userId);
      if (!removed) {
        throw new NotFoundError(`Member ${userId} not found in company ${companyId}`);
      }
    } catch (error: any) {
      this.logger.error('Failed to remove company member', { companyId, userId, error });
      throw error;
    }
  }

  /**
   * Update member role
   */
  async updateMemberRole(companyId: string, userId: string, role: string): Promise<CompanyMember> {
    try {
      const member = await this.companyRepository.updateMemberRole(companyId, userId, role);
      if (!member) {
        throw new NotFoundError(`Member ${userId} not found in company ${companyId}`);
      }
      return member;
    } catch (error: any) {
      this.logger.error('Failed to update member role', { companyId, userId, role, error });
      throw error;
    }
  }

  /**
   * Get company settings
   */
  async getCompanySettings(companyId: string): Promise<CompanySettings> {
    try {
      // Try to get existing settings
      let settings = await this.companyRepository.getSettings(companyId);
      
      // If settings don't exist, create default settings
      if (!settings) {
        this.logger.info('Settings not found, creating default settings', { companyId });
        
        // Create default settings
        const defaultSettings = {
          id: uuidv4(),
          companyId: companyId,
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
        };
        
        await this.companyRepository.createSettings(companyId, defaultSettings);
        
        // Fetch the newly created settings
        settings = await this.companyRepository.getSettings(companyId);
        
        if (!settings) {
          throw new NotFoundError(`Failed to create settings for company ${companyId}`);
        }
      }
      
      return settings;
    } catch (error: any) {
      this.logger.error('Failed to get company settings', { companyId, error });
      throw error;
    }
  }

  /**
   * Update company settings
   */
  async updateCompanySettings(companyId: string, settings: Partial<CompanySettings>): Promise<CompanySettings> {
    try {
      // Check if settings exist first
      const existingSettings = await this.companyRepository.getSettings(companyId);
      
      // If settings don't exist, create them first
      if (!existingSettings) {
        await this.getCompanySettings(companyId); // This will create default settings
      }
      
      // Now update the settings
      const updatedSettings = await this.companyRepository.updateSettings(companyId, settings);
      
      if (!updatedSettings) {
        throw new NotFoundError(`Settings not found for company ${companyId}`);
      }
      
      return updatedSettings;
    } catch (error: any) {
      this.logger.error('Failed to update company settings', { companyId, error });
      throw error;
    }
  }

  /**
   * Create a company invite
   */
  async createCompanyInvite(data: {
    companyId: string;
    email: string;
    role: string;
  }): Promise<any> {
    try {
      // Create invite with token that expires in 7 days
      const invite = await this.companyRepository.createInvite({
        companyId: data.companyId,
        email: data.email,
        role: data.role,
        expiresIn: 7 * 24 * 60 * 60 * 1000 // 7 days
      });
      
      this.logger.info('Company invite created', { companyId: data.companyId, email: data.email });
      
      // TODO: Send invitation email
      
      return invite;
    } catch (error: any) {
      this.logger.error('Failed to create company invite', { companyId: data.companyId, email: data.email, error });
      throw error;
    }
  }
} 