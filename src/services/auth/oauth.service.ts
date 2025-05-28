import { injectable, inject } from 'inversify';
import { Logger } from '../../utils/logger';
import axios from 'axios';
import crypto from 'crypto';
import querystring from 'querystring';
import { v4 as uuidv4 } from 'uuid';
import { redisClient } from '../../utils/redis';

export interface OAuthProvider {
  name: string;
  authUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scope: string[];
  apiUrl?: string;
  extraParams?: Record<string, string>;
}

export interface OAuthToken {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}

export interface OAuthState {
  provider: string;
  userId: string;
  companyId: string;
  purpose: 'storage' | 'authentication' | 'integration';
  redirectAfter: string;
  storageName?: string;
  storageType?: string;
}

@injectable()
export class OAuthService {
  private providers: Map<string, OAuthProvider> = new Map();
  private stateExpiry = 60 * 10; // 10 minutes in seconds
  
  constructor(@inject('Logger') private logger: Logger) {
    this.logger = logger.createChildLogger('OAuthService');
  }
  
  /**
   * Register an OAuth provider
   */
  registerProvider(provider: OAuthProvider): void {
    this.providers.set(provider.name, provider);
    this.logger.info(`Registered OAuth provider: ${provider.name}`);
  }
  
  /**
   * Get a provider by name
   */
  getProvider(providerName: string): OAuthProvider | undefined {
    return this.providers.get(providerName);
  }
  
  /**
   * Get all registered providers
   */
  getAllProviders(): OAuthProvider[] {
    return Array.from(this.providers.values());
  }
  
  /**
   * Generate an authorization URL
   */
  async getAuthorizationUrl(
    providerName: string, 
    userId: string, 
    companyId: string,
    purpose: 'storage' | 'authentication' | 'integration' = 'storage', 
    options?: {
      redirectAfter?: string;
      storageName?: string;
      storageType?: string;
    }
  ): Promise<string> {
    const provider = this.providers.get(providerName);
    
    if (!provider) {
      throw new Error(`OAuth provider not found: ${providerName}`);
    }
    
    // Generate a random state
    const stateId = crypto.randomBytes(16).toString('hex');
    
    // Store state information
    const state: OAuthState = {
      provider: providerName,
      userId,
      companyId,
      purpose,
      redirectAfter: options?.redirectAfter || '/',
      storageName: options?.storageName,
      storageType: options?.storageType
    };
    
    // Store state in Redis with expiration
    await redisClient.set(
      `oauth:state:${stateId}`, 
      JSON.stringify(state), 
      { EX: this.stateExpiry }
    );
    
    // Build authorization URL
    const params = {
      client_id: provider.clientId,
      redirect_uri: provider.redirectUri,
      response_type: 'code',
      scope: provider.scope.join(' '),
      state: stateId,
      ...provider.extraParams
    };
    
    const authUrl = `${provider.authUrl}?${querystring.stringify(params)}`;
    
    this.logger.info('Generated OAuth authorization URL', { 
      provider: providerName,
      userId,
      purpose
    });
    
    return authUrl;
  }
  
  /**
   * Get state data from Redis
   */
  async getStateData(stateId: string): Promise<OAuthState | null> {
    try {
      const stateStr = await redisClient.get(`oauth:state:${stateId}`);
      if (!stateStr) {
        return null;
      }
      
      return JSON.parse(stateStr) as OAuthState;
    } catch (error: any) {
      this.logger.error('Failed to get state data', { 
        stateId,
        error: error.message 
      });
      return null;
    }
  }
  
  /**
   * Exchange an authorization code for a token
   */
  async exchangeCodeForToken(
    providerName: string, 
    code: string, 
    stateId: string
  ): Promise<{ tokens: OAuthToken, state: OAuthState }> {
    // Validate provider
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new Error(`OAuth provider not found: ${providerName}`);
    }
    
    // Retrieve and validate state
    const stateStr = await redisClient.get(`oauth:state:${stateId}`);
    if (!stateStr) {
      throw new Error('Invalid or expired OAuth state');
    }
    
    const state: OAuthState = JSON.parse(stateStr);
    if (state.provider !== providerName) {
      throw new Error('Provider mismatch in OAuth flow');
    }
    
    // Exchange code for token
    try {
      const tokenResponse = await axios.post(provider.tokenUrl, querystring.stringify({
        client_id: provider.clientId,
        client_secret: provider.clientSecret,
        redirect_uri: provider.redirectUri,
        code,
        grant_type: 'authorization_code'
      }), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });
      
      const tokens: OAuthToken = tokenResponse.data;
      
      // Delete the state from Redis
      await redisClient.del(`oauth:state:${stateId}`);
      
      this.logger.info('Exchanged authorization code for token', { 
        provider: providerName,
        userId: state.userId,
        purpose: state.purpose
      });
      
      return { tokens, state };
    } catch (error: any) {
      this.logger.error('Failed to exchange code for token', { 
        provider: providerName,
        error: error.response?.data || error.message
      });
      throw new Error(`Failed to exchange code for token: ${error.message}`);
    }
  }
  
  /**
   * Refresh an expired OAuth token
   */
  async refreshToken(
    providerName: string, 
    refreshToken: string
  ): Promise<OAuthToken> {
    // Validate provider
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new Error(`OAuth provider not found: ${providerName}`);
    }
    
    try {
      const tokenResponse = await axios.post(provider.tokenUrl, querystring.stringify({
        client_id: provider.clientId,
        client_secret: provider.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
      }), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });
      
      const tokens: OAuthToken = tokenResponse.data;
      
      // Some providers don't return a new refresh token
      if (!tokens.refresh_token) {
        tokens.refresh_token = refreshToken;
      }
      
      this.logger.info('Refreshed OAuth token', { provider: providerName });
      
      return tokens;
    } catch (error: any) {
      this.logger.error('Failed to refresh token', { 
        provider: providerName,
        error: error.response?.data || error.message
      });
      throw new Error(`Failed to refresh token: ${error.message}`);
    }
  }
  
  /**
   * Revoke an OAuth token
   */
  async revokeToken(
    providerName: string, 
    token: string
  ): Promise<boolean> {
    // Validate provider
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new Error(`OAuth provider not found: ${providerName}`);
    }
    
    try {
      // Different providers have different revocation endpoints and methods
      // This is a simplified implementation
      switch (providerName) {
        case 'google':
          await axios.post(`https://oauth2.googleapis.com/revoke?token=${token}`);
          break;
          
        case 'dropbox':
          await axios.post('https://api.dropboxapi.com/2/auth/token/revoke', null, {
            headers: { 
              'Authorization': `Bearer ${token}` 
            }
          });
          break;
          
        case 'onedrive':
          // Microsoft has a different revocation flow
          // Simplified implementation
          break;
          
        default:
          this.logger.warn(`No specific revocation method for provider: ${providerName}`);
          return false;
      }
      
      this.logger.info('Revoked OAuth token', { provider: providerName });
      return true;
    } catch (error: any) {
      this.logger.error('Failed to revoke token', { 
        provider: providerName,
        error: error.response?.data || error.message
      });
      return false;
    }
  }
  
  /**
   * Initialize with default providers
   */
  async initialize(): Promise<void> {
    // Register Google Drive
    this.registerProvider({
      name: 'google-drive',
      authUrl: 'https://accounts.google.com/o/oauth2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      redirectUri: `${process.env.API_URL}/api/auth/oauth/callback`,
      scope: [
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/drive.metadata.readonly'
      ],
      extraParams: { access_type: 'offline', prompt: 'consent' }
    });
    
    // Register Dropbox
    this.registerProvider({
      name: 'dropbox',
      authUrl: 'https://www.dropbox.com/oauth2/authorize',
      tokenUrl: 'https://api.dropboxapi.com/oauth2/token',
      clientId: process.env.DROPBOX_CLIENT_ID || '',
      clientSecret: process.env.DROPBOX_CLIENT_SECRET || '',
      redirectUri: `${process.env.API_URL}/api/auth/oauth/callback`,
      scope: [],
      extraParams: { token_access_type: 'offline' }
    });
    
    // Register OneDrive
    this.registerProvider({
      name: 'onedrive',
      authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
      tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      clientId: process.env.ONEDRIVE_CLIENT_ID || '',
      clientSecret: process.env.ONEDRIVE_CLIENT_SECRET || '',
      redirectUri: `${process.env.API_URL}/api/auth/oauth/callback`,
      scope: ['files.readwrite', 'offline_access'],
      extraParams: {}
    });
  }
} 