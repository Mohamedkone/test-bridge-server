// src/services/auth/types.ts

/**
 * User profile interface from Auth0
 */
export interface Auth0UserProfile {
    sub: string;
    email: string;
    email_verified: boolean;
    name?: string;
    nickname?: string;
    given_name?: string;
    family_name?: string;
    picture?: string;
    updated_at?: string;
    roles?: string[];
    permissions?: string[];
    [key: string]: any;
  }
  
  /**
   * JWT token interface
   */
  export interface JwtToken {
    token: string;
    expiresIn: number;
    expiresAt: Date;
    audience: string;
    issuer: string;
  }
  
  /**
   * Authentication result interface
   */
  export interface AuthResult {
    success: boolean;
    message?: string;
    user?: any;
    token?: JwtToken;
    error?: Error;
  }
  
  /**
   * Permission interface for role-based access control
   */
  export interface Permission {
    action: string;
    resource: string;
    conditions?: Record<string, any>;
  }
  
  /**
   * Authentication service interface
   */
  export interface AuthService {
    /**
     * Verify an authentication token
     */
    verifyToken(token: string): Promise<AuthResult>;
    
    /**
     * Get user profile from token
     */
    getUserProfile(token: string): Promise<Auth0UserProfile | null>;
    
    /**
     * Check if a user has a specific role
     */
    hasRole(userId: string, role: string): Promise<boolean>;
    
    /**
     * Check if a user has a specific permission
     */
    hasPermission(userId: string, permission: Permission): Promise<boolean>;
    
    /**
     * Get all roles for a user
     */
    getUserRoles(userId: string): Promise<string[]>;
    
    /**
     * Get all permissions for a user
     */
    getUserPermissions(userId: string): Promise<Permission[]>;
  }
  
  /**
   * Company authorization service interface
   */
  export interface CompanyAuthService {
    /**
     * Check if user belongs to company
     */
    isUserInCompany(userId: string, companyId: string): Promise<boolean>;
    
    /**
     * Check if user has role in company
     */
    hasCompanyRole(userId: string, companyId: string, role: string): Promise<boolean>;
    
    /**
     * Check if user can access a specific room
     */
    canAccessRoom(userId: string, roomId: string, accessType?: string): Promise<boolean>;
    
    /**
     * Check if a user can perform operations on a file
     */
    canAccessFile(userId: string, fileId: string, operation: 'read' | 'write' | 'delete'): Promise<boolean>;
    
    /**
     * Get all companies a user belongs to
     */
    getUserCompanies(userId: string): Promise<any[]>;
  }