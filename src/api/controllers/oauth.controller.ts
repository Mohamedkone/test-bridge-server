// src/api/controllers/oauth.controller.ts
import { injectable, inject } from 'inversify';
import { Request, Response } from 'express';
import { OAuthService } from '../../services/auth/oauth.service';
import { StorageService } from '../../services/storage/storage.service';
import { Logger } from '../../utils/logger';
import { ValidationError } from '../../utils/errors';

@injectable()
export class OAuthController {
  constructor(
    @inject('OAuthService') private oauthService: OAuthService,
    @inject('StorageService') private storageService: StorageService,
    @inject('Logger') private logger: Logger
  ) {
    this.logger = logger.createChildLogger('OAuthController');
  }

  /**
   * Start OAuth flow for a provider
   */
  async authorize(req: Request, res: Response) {
    try {
      const { provider } = req.params;
      const { purpose = 'storage', redirectAfter = '/', storageName, storageType } = req.body;
      
      if (!provider) {
        throw new ValidationError('Provider is required');
      }
      
      // Get authorization URL
      const authUrl = await this.oauthService.getAuthorizationUrl(
        provider,
        req.user.id,
        req.user.companyId,
        purpose as any,
        { redirectAfter, storageName, storageType }
      );
      
      res.json({ 
        success: true, 
        authUrl 
      });
    } catch (error: any) {
      this.logger.error('Failed to generate authorization URL', { error: error.message });
      
      if (error instanceof ValidationError) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Failed to generate authorization URL' });
      }
    }
  }

  /**
   * Handle OAuth callback
   */
  async callback(req: Request, res: Response) {
    try {
      const { code, state, error } = req.query;
      
      if (error) {
        throw new Error(`OAuth error: ${error}`);
      }
      
      if (!code || !state) {
        throw new ValidationError('Missing required parameters');
      }
      
      // Extract provider from state ID
      const stateData = await this.oauthService.getStateData(state as string);
      if (!stateData) {
        throw new ValidationError('Invalid or expired state');
      }
      
      // Exchange code for token
      const { tokens, state: stateInfo } = await this.oauthService.exchangeCodeForToken(
        stateData.provider,
        code as string,
        state as string
      );
      
      // Handle based on purpose
      if (stateInfo.purpose === 'storage') {
        // Create storage account
        await this.handleStorageOAuth(tokens, stateInfo);
        
        // Redirect to success page with custom redirect path
        res.redirect(`/oauth/success?redirectTo=${encodeURIComponent(stateInfo.redirectAfter)}`);
      } else if (stateInfo.purpose === 'authentication') {
        // Handle authentication flow
        // Not implemented in this example
        res.redirect('/oauth/success');
      } else {
        // Generic success
        res.redirect('/oauth/success');
      }
    } catch (error: any) {
      this.logger.error('OAuth callback error', { error: error.message });
      res.redirect(`/oauth/error?message=${encodeURIComponent(error.message)}`);
    }
  }
  
  /**
   * Handle storage-related OAuth
   */
  private async handleStorageOAuth(tokens: any, state: any): Promise<void> {
    try {
      const { provider, userId, companyId, storageName, storageType } = state;
      
      if (!storageName || !storageType) {
        throw new Error('Missing storage account information');
      }
      
      // Create appropriate credentials based on provider
      let credentials: any = {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresIn: tokens.expires_in
      };
      
      // Add provider-specific fields
      switch (provider) {
        case 'google-drive':
          credentials = {
            ...credentials,
            type: 'oauth',
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET
          };
          break;
          
        case 'dropbox':
          credentials = {
            ...credentials,
            type: 'oauth',
            appKey: process.env.DROPBOX_CLIENT_ID,
            appSecret: process.env.DROPBOX_CLIENT_SECRET
          };
          break;
          
        case 'onedrive':
          credentials = {
            ...credentials,
            type: 'oauth',
            clientId: process.env.ONEDRIVE_CLIENT_ID,
            clientSecret: process.env.ONEDRIVE_CLIENT_SECRET
          };
          break;
          
        default:
          throw new Error(`Unsupported provider: ${provider}`);
      }
      
      // Create storage account
      await this.storageService.createStorageAccount({
        name: storageName,
        companyId,
        storageType,
        isDefault: false,
        credentials
      });
      
      this.logger.info('Created storage account from OAuth flow', {
        provider,
        userId,
        companyId
      });
    } catch (error: any) {
      this.logger.error('Failed to create storage account from OAuth', { error: error.message });
      throw error;
    }
  }
  
  /**
   * Revoke OAuth tokens
   */
  async revokeTokens(req: Request, res: Response) {
    try {
      const { provider } = req.params;
      const { accessToken } = req.body;
      
      if (!provider || !accessToken) {
        throw new ValidationError('Provider and access token are required');
      }
      
      const result = await this.oauthService.revokeToken(provider, accessToken);
      
      res.json({
        success: result,
        message: result ? 'Token revoked successfully' : 'Failed to revoke token'
      });
    } catch (error: any) {
      this.logger.error('Failed to revoke tokens', { error: error.message });
      
      if (error instanceof ValidationError) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Failed to revoke tokens' });
      }
    }
  }
  
  /**
   * Get all available OAuth providers
   */
  async getProviders(req: Request, res: Response) {
    try {
      const providers = this.oauthService.getAllProviders().map(provider => ({
        name: provider.name,
        displayName: this.getProviderDisplayName(provider.name),
        scope: provider.scope
      }));
      
      res.json({ 
        success: true, 
        providers 
      });
    } catch (error: any) {
      this.logger.error('Failed to get OAuth providers', { error: error.message });
      res.status(500).json({ error: 'Failed to get OAuth providers' });
    }
  }
  
  /**
   * Get display name for a provider
   */
  private getProviderDisplayName(providerName: string): string {
    switch (providerName) {
      case 'google-drive': return 'Google Drive';
      case 'dropbox': return 'Dropbox';
      case 'onedrive': return 'Microsoft OneDrive';
      default: return providerName;
    }
  }
} 