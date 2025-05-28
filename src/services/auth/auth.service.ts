// src/services/auth/auth.service.ts

export interface UserProfile {
    auth0Id: string;
    email: string;
    firstName: string;
    lastName: string;
    picture: string;
    emailVerified: boolean;
  }
  
  export interface TokenValidationResult {
    valid: boolean;
    userId?: string;
    error?: string;
    roles?: string[];
  }
  
  export interface TokenOptions {
    expiresIn?: number;
    audience?: string;
    issuer?: string;
  }
  
  export interface AuthResult {
    success: boolean;
    user: any;
    token: string;
    refreshToken?: string;
    expiresIn: number;
  }
  
  export interface Session {
    id: string;
    userId: string;
    createdAt: Date;
    expiresAt: Date;
    lastActiveAt: Date;
  }
  
  export interface AuthService {
    // Authentication
    validateToken(token: string): Promise<TokenValidationResult>;
    verifyToken(token: string): Promise<any>;
    generateToken(userId: string, options?: TokenOptions): Promise<string>;
    revokeToken(token: string): Promise<boolean>;
    
    // Auth0 Integration
    processAuth0Login(auth0Token: string): Promise<AuthResult>;
    getUserProfile(auth0Token: string): Promise<UserProfile>;
    
    // Session management
    createSession(userId: string): Promise<Session>;
    validateSession(sessionId: string): Promise<boolean>;
    revokeSession(sessionId: string): Promise<boolean>;
    getUserSessions(userId: string): Promise<Session[]>;
    
    // Permissions
    hasPermission(userId: string, resource: string, action: string): Promise<boolean>;
    getUserRoles(userId: string): Promise<string[]>;
    validateCredentials(email: string, password: string): Promise<{ token: string; user: any }>;
    handleAuth0Callback(auth0User: any): Promise<{ token: string; user: any }>;
    refreshToken(token: string): Promise<{ token: string; user: any }>;
  }