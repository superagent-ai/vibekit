/**
 * Node.js-specific OAuth authentication utilities for VibeKit
 * This module includes Node.js specific features like file system access and child_process
 */

import {
  authenticate,
  getValidToken,
  loadToken,
  saveToken,
  clearToken,
  isTokenExpired,
  refreshToken,
  refreshTokenToAccessToken,
  type OAuthToken
} from './oauth.js';

export class ClaudeAuth {
  /**
   * Start OAuth authentication flow
   * Opens browser for user authentication
   */
  static async authenticate(): Promise<OAuthToken> {
    return authenticate();
  }

  /**
   * Check if currently authenticated
   */
  static async isAuthenticated(): Promise<boolean> {
    const token = await getValidToken();
    return token !== null;
  }

  /**
   * Get current authentication status
   */
  static async getStatus(): Promise<{
    authenticated: boolean;
    tokenType?: string;
    scope?: string;
    expiresAt?: Date;
    hasRefreshToken?: boolean;
  }> {
    const tokenData = await loadToken();
    
    if (!tokenData) {
      return { authenticated: false };
    }

    const validToken = await getValidToken();
    const status: any = {
      authenticated: !!validToken,
      tokenType: tokenData.token_type || 'Bearer',
      scope: tokenData.scope,
      hasRefreshToken: !!tokenData.refresh_token
    };

    if (tokenData.expires_in && tokenData.created_at) {
      status.expiresAt = new Date(tokenData.created_at + tokenData.expires_in * 1000);
    }

    return status;
  }

  /**
   * Get valid access token (auto-refreshes if expired)
   */
  static async getValidToken(): Promise<string | null> {
    return getValidToken();
  }

  /**
   * Export token in various formats
   * @param format - 'env', 'json', 'full', or 'refresh'
   */
  static async exportToken(format: 'env' | 'json' | 'full' | 'refresh' = 'env'): Promise<string | object> {
    const tokenData = await loadToken();
    if (!tokenData) {
      throw new Error('No authentication token found');
    }

    const accessToken = await getValidToken();
    if (!accessToken && format !== 'refresh') {
      throw new Error('Token is expired and could not be refreshed');
    }

    switch (format) {
      case 'env':
        return `export CLAUDE_CODE_OAUTH_TOKEN="${accessToken}"`;
        
      case 'json':
        return { access_token: accessToken };
        
      case 'full':
        return {
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          token_type: tokenData.token_type || 'Bearer',
          expires_in: tokenData.expires_in,
          scope: tokenData.scope,
          created_at: tokenData.created_at
        };
        
      case 'refresh':
        if (!tokenData.refresh_token) {
          throw new Error('No refresh token available');
        }
        return tokenData.refresh_token;
        
      default:
        throw new Error(`Unknown format: ${format}`);
    }
  }

  /**
   * Import token from various sources
   */
  static async importToken(options: {
    accessToken?: string;
    refreshToken?: string;
    tokenData?: OAuthToken;
    fromEnv?: boolean;
    fromFile?: string;
  }): Promise<void> {
    let tokenData: OAuthToken;

    if (options.fromEnv) {
      const envToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;
      if (!envToken) {
        throw new Error('No CLAUDE_CODE_OAUTH_TOKEN environment variable found');
      }
      tokenData = {
        access_token: envToken,
        token_type: 'Bearer',
        created_at: Date.now()
      };
    } else if (options.fromFile) {
      // Read token from file
      const fs = await import('fs/promises');
      try {
        const fileContent = await fs.readFile(options.fromFile, 'utf-8');
        const parsedData = JSON.parse(fileContent);
        
        // Validate required fields
        if (!parsedData.access_token) {
          throw new Error('Invalid token file: missing access_token');
        }
        
        tokenData = {
          ...parsedData,
          created_at: parsedData.created_at || Date.now()
        };
      } catch (error) {
        if ((error as any).code === 'ENOENT') {
          throw new Error(`File not found: ${options.fromFile}`);
        }
        throw error;
      }
    } else if (options.refreshToken) {
      tokenData = await refreshTokenToAccessToken(options.refreshToken);
    } else if (options.accessToken) {
      tokenData = {
        access_token: options.accessToken,
        token_type: 'Bearer',
        created_at: Date.now()
      };
    } else if (options.tokenData) {
      tokenData = {
        ...options.tokenData,
        created_at: options.tokenData.created_at || Date.now()
      };
    } else {
      throw new Error('No token source provided');
    }

    await saveToken(tokenData);
  }

  /**
   * Verify authentication by making a test API call
   */
  static async verify(): Promise<boolean> {
    const accessToken = await getValidToken();
    if (!accessToken) {
      return false;
    }

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'oauth-2025-04-20',
          'Authorization': `Bearer ${accessToken}`,
          'X-API-Key': '',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 10,
          system: 'You are Claude Code, Anthropic\'s official CLI for Claude.',
          messages: [{
            role: 'user',
            content: 'Reply with OK only.'
          }]
        }),
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Verify authentication with detailed response
   * @returns Detailed verification result including API response
   */
  static async verifyWithDetails(): Promise<{
    success: boolean;
    status?: number;
    response?: any;
    error?: string;
  }> {
    const accessToken = await getValidToken();
    if (!accessToken) {
      return { 
        success: false, 
        error: 'No valid authentication token found' 
      };
    }

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'oauth-2025-04-20',
          'Authorization': `Bearer ${accessToken}`,
          'X-API-Key': '',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 10,
          system: 'You are Claude Code, Anthropic\'s official CLI for Claude.',
          messages: [{
            role: 'user',
            content: 'Reply with OK only.'
          }]
        }),
      });

      if (response.ok) {
        const data = await response.json() as any;
        return { 
          success: true, 
          status: response.status,
          response: data.content[0].text 
        };
      } else {
        const error = await response.text();
        return { 
          success: false, 
          status: response.status,
          error: `API Error: ${response.status} ${error}` 
        };
      }
    } catch (error) {
      return { 
        success: false, 
        error: (error as Error).message 
      };
    }
  }

  /**
   * Clear authentication (logout)
   */
  static async logout(): Promise<void> {
    return clearToken();
  }

  /**
   * Get raw token data (for advanced use)
   */
  static async getRawToken(): Promise<OAuthToken | null> {
    return loadToken();
  }

  /**
   * Check if token is expired
   */
  static async isTokenExpired(): Promise<boolean> {
    const tokenData = await loadToken();
    if (!tokenData) return true;
    return isTokenExpired(tokenData);
  }

  /**
   * Manually refresh token
   */
  static async refreshToken(): Promise<OAuthToken | null> {
    const tokenData = await loadToken();
    if (!tokenData || !tokenData.refresh_token) {
      return null;
    }
    return refreshToken(tokenData);
  }
}

// Re-export types and functions for direct use
export type { OAuthToken } from './oauth.js';
export {
  authenticate,
  getValidToken,
  loadToken,
  saveToken,
  clearToken,
  isTokenExpired,
  refreshToken,
  refreshTokenToAccessToken
} from './oauth.js';