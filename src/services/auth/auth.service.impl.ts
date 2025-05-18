// src/services/auth/auth.service.impl.ts
import { injectable, inject } from 'inversify';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { AuthService, UserProfile, TokenValidationResult, TokenOptions, Session, AuthResult } from './auth.service';
import { Auth0Service } from './auth0.service';
import { UserRepository } from '../../repositories/user.repository';
import { setValue, getValue, deleteKey } from '../../utils/redis';
import { Logger } from '../../utils/logger';
import { AuthenticationError, NotFoundError } from '../../utils/errors';
import { env } from '../../config/env';

@injectable()
export class AuthServiceImpl implements AuthService {
  private readonly JWT_SECRET = env.JWT_SECRET;
  private readonly TOKEN_EXPIRY = 3600; // 1 hour in seconds
  
  constructor(
    @inject('Auth0Service') private auth0Service: Auth0Service,
    @inject('UserRepository') private userRepository: UserRepository,
    @inject('Logger') private logger: Logger
  ) {}
  
  async validateToken(token: string): Promise<TokenValidationResult> {
    try {
      // Check if token is in blacklist (for logged out tokens)
      const isBlacklisted = await getValue(`blacklist:${token}`);
      if (isBlacklisted) {
        return { valid: false, error: 'Token has been revoked' };
      }
      
      // Verify the JWT
      const decoded = jwt.verify(token, this.JWT_SECRET) as any;
      
      // Additional validation
      if (!decoded.userId) {
        return { valid: false, error: 'Invalid token structure' };
      }
      
      // Check if user exists and is active
      const user = await this.userRepository.findById(decoded.userId);
      if (!user || !user.isActive) {
        return { valid: false, error: 'User not found or inactive' };
      }
      
      return { valid: true, userId: decoded.userId };
    } catch (error:any) {
      this.logger.error('Token validation failed', { error: error.message });
      
      if (error instanceof jwt.TokenExpiredError) {
        return { valid: false, error: 'Token expired' };
      }
      
      return { valid: false, error: 'Invalid token' };
    }
  }
  
  async generateToken(userId: string, options?: TokenOptions): Promise<string> {
    const expiresIn = options?.expiresIn || this.TOKEN_EXPIRY;
    
    const token = jwt.sign(
      { userId },
      this.JWT_SECRET,
      {
        expiresIn,
        audience: options?.audience || env.JWT_AUDIENCE || 'https://api.filetransfer.com',
        issuer: options?.issuer || env.JWT_ISSUER || 'https://filetransfer.com'
      }
    );
    
    return token;
  }
  
  async revokeToken(token: string): Promise<boolean> {
    try {
      // Get token expiry by decoding it without verification
      const decoded = jwt.decode(token) as any;
      if (!decoded || !decoded.exp) {
        return false;
      }
      
      // Calculate remaining time until expiry
      const expiryTime = decoded.exp - Math.floor(Date.now() / 1000);
      
      // Add token to blacklist for its remaining lifetime
      await setValue(`blacklist:${token}`, 'revoked', expiryTime > 0 ? expiryTime : 3600);
      
      this.logger.info('Token revoked successfully', { userId: decoded.userId });
      return true;
    } catch (error:any) {
      this.logger.error('Token revocation failed', { error: error.message });
      return false;
    }
  }
  
  async processAuth0Login(auth0Token: string): Promise<AuthResult> {
    try {
      // Get user profile from Auth0
      const auth0Profile = await this.auth0Service.getUserProfile(auth0Token);
      
      // Find or create user in our database
      let user = await this.userRepository.findByAuth0Id(auth0Profile.auth0Id);
      
      if (!user) {
        // Create new user
        user = await this.userRepository.create({
          id: uuidv4(),
          auth0Id: auth0Profile.auth0Id,
          email: auth0Profile.email,
          firstName: auth0Profile.firstName,
          lastName: auth0Profile.lastName,
          profilePicture: auth0Profile.picture,
          emailVerified: auth0Profile.emailVerified,
          isActive: true,
          userType: 'b2c'
        });
        
        this.logger.info('New user created from Auth0 login', { 
          userId: user.id, 
          email: auth0Profile.email 
        });
      } else {
        // Update existing user
        user = await this.userRepository.update(user.id, {
          firstName: auth0Profile.firstName,
          lastName: auth0Profile.lastName,
          profilePicture: auth0Profile.picture,
          emailVerified: auth0Profile.emailVerified
        });
        
        this.logger.info('Existing user updated from Auth0 login', { 
          userId: user.id
        });
      }
      
      // Generate our application JWT
      const token = await this.generateToken(user.id);
      
      // Create session
      const session = await this.createSession(user.id);
      
      this.logger.info('User logged in successfully', {
        userId: user.id,
        sessionId: session.id
      });
      
      return {
        success: true,
        user,
        token,
        refreshToken: undefined, // In this implementation we're not using refresh tokens
        expiresIn: this.TOKEN_EXPIRY
      };
    } catch (error:any) {
      this.logger.error('Auth0 login failed', { error: error.message });
      
      throw new AuthenticationError('Authentication failed');
    }
  }
  
  async getUserProfile(auth0Token: string): Promise<UserProfile> {
    return this.auth0Service.getUserProfile(auth0Token);
  }
  
  async createSession(userId: string): Promise<Session> {
    const sessionId = uuidv4();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.TOKEN_EXPIRY * 1000);
    
    const session: Session = {
      id: sessionId,
      userId,
      createdAt: now,
      expiresAt,
      lastActiveAt: now
    };
    
    // Store session in Redis
    await setValue(
      `session:${sessionId}`,
      JSON.stringify(session),
      this.TOKEN_EXPIRY
    );
    
    // Add session to user's session list
    const userSessionsKey = `user:${userId}:sessions`;
    const userSessions = await getValue(userSessionsKey);
    
    if (userSessions) {
      const sessions = JSON.parse(userSessions);
      sessions.push(sessionId);
      await setValue(userSessionsKey, JSON.stringify(sessions), 30 * 24 * 60 * 60); // 30 days
    } else {
      await setValue(userSessionsKey, JSON.stringify([sessionId]), 30 * 24 * 60 * 60); // 30 days
    }
    
    return session;
  }
  
  async validateSession(sessionId: string): Promise<boolean> {
    const sessionData = await getValue(`session:${sessionId}`);
    if (!sessionData) {
      return false;
    }
    
    const session = JSON.parse(sessionData) as Session;
    return new Date(session.expiresAt) > new Date();
  }
  
  async revokeSession(sessionId: string): Promise<boolean> {
    const sessionData = await getValue(`session:${sessionId}`);
    if (!sessionData) {
      return false;
    }
    
    const session = JSON.parse(sessionData) as Session;
    
    // Remove session from Redis
    await deleteKey(`session:${sessionId}`);
    
    // Remove session from user's session list
    const userSessionsKey = `user:${session.userId}:sessions`;
    const userSessions = await getValue(userSessionsKey);
    
    if (userSessions) {
      const sessions = JSON.parse(userSessions) as string[];
      const updatedSessions = sessions.filter(id => id !== sessionId);
      await setValue(userSessionsKey, JSON.stringify(updatedSessions), 30 * 24 * 60 * 60); // 30 days
    }
    
    this.logger.info('Session revoked', { sessionId, userId: session.userId });
    return true;
  }
  
  async getUserSessions(userId: string): Promise<Session[]> {
    const userSessionsKey = `user:${userId}:sessions`;
    const userSessions = await getValue(userSessionsKey);
    
    if (!userSessions) {
      return [];
    }
    
    const sessionIds = JSON.parse(userSessions) as string[];
    const sessions: Session[] = [];
    
    for (const sessionId of sessionIds) {
      const sessionData = await getValue(`session:${sessionId}`);
      if (sessionData) {
        sessions.push(JSON.parse(sessionData) as Session);
      }
    }
    
    return sessions;
  }
  
  async hasPermission(userId: string, resource: string, action: string): Promise<boolean> {
    // Get user
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('User', userId);
    }
    
    // Implement your permission logic here
    // This is a simplified example - you would typically check against a
    // permission database or use a more sophisticated approach
    
    // For example, based on resource type:
    const [resourceType, resourceId] = resource.split(':');
    
    if (resourceType === 'user') {
      // Users can always access their own data
      return resourceId === userId;
    }
    
    if (resourceType === 'company') {
      // Check if user belongs to company
      // This would require additional repository methods
      return true; // Simplified for now
    }
    
    if (resourceType === 'room') {
      // Check if user has access to room
      // This would require additional repository methods
      return true; // Simplified for now
    }
    
    if (resourceType === 'file') {
      // Check if user has access to file
      // This would require additional repository methods
      return true; // Simplified for now
    }
    
    this.logger.warn('Unknown resource type in permission check', { 
      resourceType, userId, action 
    });
    
    // Default to false for unknown resource types
    return false;
  }
  
  async getUserRoles(userId: string): Promise<string[]> {
    // Implementation would typically query a roles database
    // This is a placeholder implementation
    return ['user'];
  }
}