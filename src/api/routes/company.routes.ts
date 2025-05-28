import { Router } from 'express';
import { injectable, inject } from 'inversify';
import { CompanyController } from '../controllers/company.controller';
import { AuthMiddleware } from '../middleware/auth.middleware';
import { validateCompanyCreate, validateCompanyUpdate, validate } from '../middleware/validation.middleware';

@injectable()
export class CompanyRoutes {
  private router: Router;

  constructor(
    @inject('CompanyController') private companyController: CompanyController,
    @inject('AuthMiddleware') private authMiddleware: AuthMiddleware
  ) {
    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Protected routes - require authentication
    this.router.use(this.authMiddleware.verifyToken.bind(this.authMiddleware));

    // Create company
    this.router.post('/', validateCompanyCreate, validate, this.companyController.createCompany.bind(this.companyController));

    // Search companies - MUST be before the /:id route to avoid being interpreted as an ID
    this.router.get('/search', this.companyController.searchCompanies.bind(this.companyController));

    // Company settings routes - must be before the basic /:id routes
    this.router.get('/:id/settings', this.companyController.getCompanySettings.bind(this.companyController));
    this.router.put('/:id/settings', this.companyController.updateCompanySettings.bind(this.companyController));
    
    // Company members routes - must be before the basic /:id routes
    this.router.get('/:id/members', this.companyController.getCompanyMembers.bind(this.companyController));
    this.router.post('/:id/members', this.companyController.addCompanyMember.bind(this.companyController));
    this.router.delete('/:id/members/:userId', this.companyController.removeCompanyMember.bind(this.companyController));
    this.router.put('/:id/members/:userId/role', this.companyController.updateMemberRole.bind(this.companyController));

    // Basic company CRUD routes
    this.router.get('/:id', this.companyController.getCompany.bind(this.companyController));
    this.router.put('/:id', validateCompanyUpdate, validate, this.companyController.updateCompany.bind(this.companyController));
    this.router.delete('/:id', this.companyController.deleteCompany.bind(this.companyController));
  }

  public getRouter(): Router {
    return this.router;
  }
} 