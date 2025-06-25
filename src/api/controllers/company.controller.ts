// src/api/controllers/company.controller.ts
import { Request, Response, NextFunction } from 'express';
import { injectable, inject } from 'inversify';
import { Logger } from '../../utils/logger';
import { CompanyService } from '../../services/company/company.service';
import { ValidationError } from '../../utils/errors';
import { validate, validateCompanyCreate, validateCompanyUpdate } from '../middleware/validation.middleware';
import { validationResult } from 'express-validator';
import { UserService } from '../../services/user/user.service';

@injectable()
export class CompanyController {
  constructor(
    @inject('CompanyService') private companyService: CompanyService,
    @inject('Logger') private logger: Logger,
    @inject('UserService') private userService: UserService
  ) {
    this.logger = logger.createChildLogger('CompanyController');
  }

  /**
   * Create a new company
   */
  async createCompany(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Run validation
      await Promise.all(validateCompanyCreate.map(validation => validation.run(req)));
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ValidationError('Invalid company data', errors.array());
      }

      const company = await this.companyService.createCompany(req.body);
      res.status(201).json(company);
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Get company by ID
   */
  async getCompany(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const company = await this.companyService.getCompanyById(id);
      res.json(company);
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Update company
   */
  async updateCompany(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Run validation
      await Promise.all(validateCompanyUpdate.map(validation => validation.run(req)));
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ValidationError('Invalid company data', errors.array());
      }

      const { id } = req.params;
      const company = await this.companyService.updateCompany(id, req.body);
      res.json(company);
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Delete company
   */
  async deleteCompany(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      await this.companyService.deleteCompany(id);
      res.status(204).send();
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Search companies
   */
  async searchCompanies(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { query, page = 1, limit = 10 } = req.query;
      const companies = await this.companyService.searchCompanies(query as string, {
        page: Number(page),
        limit: Number(limit)
      });
      res.json(companies);
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Get company members
   */
  async getCompanyMembers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const members = await this.companyService.getCompanyMembers(id);
      
      const users = await Promise.all(
        members.map(async (member) => {
          const user = await this.userService.getUserById(member.userId);
          if (user) {
            return { ...user, role: member.role };
          }
          return null;
        })
      );
      
      // Filter out null values
      const validUsers = users.filter(user => user !== null);
      
      res.json(validUsers);
    } catch (error: any) {
      next(error);
    }
  }
  /**
   * Add member to company
   */
  async addCompanyMember(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { userId, email, role } = req.body;
      
      // If we have a userId, use it directly
      if (userId) {
        const member = await this.companyService.addCompanyMember(id, userId, role);
        res.status(201).json(member);
        return;
      }
      
      // If we have an email but no userId, we need to find or create the user
      if (email) {
        // Find user by email
        const user = await this.userService.findUserByEmail(email);
        
        if (user) {
          // User exists, add them as member
          const member = await this.companyService.addCompanyMember(id, user.id, role);
          res.status(201).json(member);
        } else {
          // User doesn't exist, create an invite instead
          const invite = await this.companyService.createCompanyInvite({
            companyId: id,
            email,
            role
          });
          res.status(201).json({ invited: true, invite });
        }
        return;
      }
      
      // Neither userId nor email provided
      throw new ValidationError('Either userId or email is required');
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Remove member from company
   */
  async removeCompanyMember(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id, userId } = req.params;
      await this.companyService.removeCompanyMember(id, userId);
      res.status(204).send();
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Update member role
   */
  async updateMemberRole(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id, userId } = req.params;
      const { role } = req.body;
      const member = await this.companyService.updateMemberRole(id, userId, role);
      res.json(member);
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Get company settings
   */
  async getCompanySettings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const settings = await this.companyService.getCompanySettings(id);
      res.json(settings);
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Update company settings
   */
  async updateCompanySettings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const settings = await this.companyService.updateCompanySettings(id, req.body);
      res.json(settings);
    } catch (error: any) {
      next(error);
    }
  }
} 