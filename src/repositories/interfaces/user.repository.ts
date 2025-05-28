export interface CreateUserParams {
  id?: string;
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  status?: string;
  isGuest?: boolean;
  auth0Id?: string;
  profilePicture?: string;
  emailVerified?: boolean;
  userType?: string;
  metadata?: Record<string, any>;
  lastLoginAt?: Date;
}

export interface UpdateUserParams {
  email?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  status?: string;
  isGuest?: boolean;
  auth0Id?: string;
  profilePicture?: string;
  emailVerified?: boolean;
  userType?: string;
  metadata?: Record<string, any>;
  lastLoginAt?: Date;
}

export interface UserRepository {
  findById(id: string): Promise<any>;
  findByEmail(email: string): Promise<any>;
  findByAuth0Id(auth0Id: string): Promise<any>;
  create(data: CreateUserParams): Promise<any>;
  update(id: string, data: UpdateUserParams): Promise<any>;
  delete(id: string): Promise<boolean>;
  list(params?: {
    page?: number;
    limit?: number;
    search?: string;
    role?: string;
    status?: string;
    isGuest?: boolean;
  }): Promise<{ users: any[]; total: number }>;
  addToCompany(userId: string, companyId: string, role?: string): Promise<any>;
  removeFromCompany(userId: string, companyId: string): Promise<boolean>;
  updateCompanyRole(userId: string, companyId: string, role: string): Promise<any>;
  setDefaultCompany(userId: string, companyId: string): Promise<boolean>;
  getCompanies(userId: string): Promise<any[]>;
  createSession(userId: string, expiresIn: number): Promise<any>;
  validateSession(token: string): Promise<any>;
  deleteSession(token: string): Promise<boolean>;
  deleteAllSessions(userId: string): Promise<boolean>;
  createGuestUser(email: string, metadata?: Record<string, any>): Promise<any>;
  convertGuestToUser(guestId: string, password: string): Promise<any>;
} 