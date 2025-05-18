// src/services/auth/auth0.service.ts
import axios from 'axios';
import { injectable, inject } from 'inversify';
import { env } from '../../config/env';
import { Logger } from '../../utils/logger';
import { AuthenticationError, ThirdPartyServiceError } from '../../utils/errors';
import { UserProfile } from './auth.service';

@injectable()
export class Auth0Service {
  private readonly domain: string;
  private readonly audience: string;
  private readonly clientId: string | undefined;
  private readonly clientSecret: string | undefined;

  constructor(
    @inject('Logger') private readonly logger: Logger
  ) {
    this.domain = env.AUTH0_DOMAIN;
    this.audience = env.AUTH0_AUDIENCE;
    this.clientId = env.AUTH0_CLIENT_ID;
    this.clientSecret = env.AUTH0_CLIENT_SECRET;
    
    if (!this.domain || !this.audience) {
      this.logger.error('Auth0 configuration missing', { 
        domain: !!this.domain, 
        audience: !!this.audience 
      });
      throw new Error('Auth0 configuration is incomplete');
    }
  }

  /**
   * Verify an Auth0 issued JWT access token
   * 
   * @param token Auth0 JWT token
   * @returns Promise with token verification result
   */
  async verifyToken(token: string): Promise<any> {
    try {
      this.logger.debug('Verifying Auth0 token');
      
      // Make a call to the Auth0 userinfo endpoint which validates the token
      const response = await axios.get(`https://${this.domain}/userinfo`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      
      return response.data;
    } catch (error:any) {
      this.logger.error('Auth0 token verification failed', { 
        error: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      
      if (error.response?.status === 401) {
        throw new AuthenticationError('Invalid or expired token');
      }
      
      throw new ThirdPartyServiceError('Auth0', 'Token verification failed', error.message);
    }
  }

  /**
   * Get user profile from Auth0
   * 
   * @param token Auth0 JWT token
   * @returns Promise with user profile
   */
  async getUserProfile(token: string): Promise<UserProfile> {
    try {
      this.logger.debug('Getting user profile from Auth0');
      
      const userData = await this.verifyToken(token);
      
      return {
        auth0Id: userData.sub,
        email: userData.email,
        firstName: userData.given_name || userData.name?.split(' ')[0] || '',
        lastName: userData.family_name || userData.name?.split(' ').slice(1).join(' ') || '',
        picture: userData.picture,
        emailVerified: userData.email_verified || false
      };
    } catch (error:any) {
      this.logger.error('Failed to get user profile from Auth0', { 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Exchange Auth0 code for tokens (for Authorization Code flow)
   * 
   * @param code Auth0 authorization code
   * @param redirectUri Redirect URI used in the initial authorization request
   * @returns Promise with tokens
   */
  async exchangeCodeForTokens(code: string, redirectUri: string): Promise<{
    access_token: string;
    refresh_token?: string;
    id_token: string;
    expires_in: number;
  }> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error('Auth0 client credentials not configured');
    }
    
    try {
      this.logger.debug('Exchanging Auth0 code for tokens');
      
      const response = await axios.post(`https://${this.domain}/oauth/token`, {
        grant_type: 'authorization_code',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        redirect_uri: redirectUri
      });
      
      return response.data;
    } catch (error:any) {
      this.logger.error('Auth0 code exchange failed', { 
        error: error.message,
        responseData: error.response?.data
      });
      throw new AuthenticationError('Failed to authenticate with Auth0');
    }
  }

  /**
   * Refresh an Auth0 access token using a refresh token
   * 
   * @param refreshToken Auth0 refresh token
   * @returns Promise with new tokens
   */
  async refreshToken(refreshToken: string): Promise<{
    access_token: string;
    refresh_token?: string;
    id_token: string;
    expires_in: number;
  }> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error('Auth0 client credentials not configured');
    }
    
    try {
      this.logger.debug('Refreshing Auth0 token');
      
      const response = await axios.post(`https://${this.domain}/oauth/token`, {
        grant_type: 'refresh_token',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: refreshToken
      });
      
      return response.data;
    } catch (error:any) {
      this.logger.error('Auth0 token refresh failed', { 
        error: error.message,
        responseData: error.response?.data
      });
      throw new AuthenticationError('Failed to refresh token');
    }
  }
}