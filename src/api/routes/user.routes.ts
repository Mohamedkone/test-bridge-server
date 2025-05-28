import { Router } from 'express';
import { injectable, inject } from 'inversify';
import { UserController } from '../controllers/user.controller';
import { AuthMiddleware } from '../middleware/auth.middleware';
import { validateUserCreate, validateUserUpdate } from '../middleware/validation.middleware';

@injectable()
export class UserRoutes {
  private router: Router;

  constructor(
    @inject('UserController') private userController: UserController,
    @inject('AuthMiddleware') private authMiddleware: AuthMiddleware
  ) {
    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Public routes
    this.router.post('/', validateUserCreate, this.userController.createUser.bind(this.userController));

    // Protected routes
    this.router.use(this.authMiddleware.verifyToken.bind(this.authMiddleware));

    // User profile routes
    this.router.get('/profile', this.userController.getUserProfile.bind(this.userController));
    this.router.put('/profile', validateUserUpdate, this.userController.updateUserProfile.bind(this.userController));
    this.router.get('/roles', this.userController.getUserRoles.bind(this.userController));

    // Admin routes
    this.router.use(this.authMiddleware.hasRole('admin'));

    this.router.get('/search', this.userController.searchUsers.bind(this.userController));
    this.router.get('/:id', this.userController.getUserById.bind(this.userController));
    this.router.put('/:id', validateUserUpdate, this.userController.updateUser.bind(this.userController));
    this.router.delete('/:id', this.userController.deleteUser.bind(this.userController));
    this.router.put('/:id/roles', this.userController.updateUserRoles.bind(this.userController));
  }

  public getRouter(): Router {
    return this.router;
  }
} 