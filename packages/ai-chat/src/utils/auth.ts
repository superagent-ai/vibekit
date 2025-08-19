import { readFileSync, existsSync } from 'fs';
import path from 'path';
import os from 'os';
import dotenv from 'dotenv';

/**
 * Authentication status for AI services
 */
export interface AuthStatus {
  /** Current authentication method */
  authMethod: string;
  /** Whether an API key is configured */
  hasApiKey: boolean;
  /** Whether an OAuth token is configured */
  hasOAuthToken: boolean;
  /** Whether authentication is properly configured */
  isConfigured: boolean;
  /** Claude Code Max user if detected */
  claudeCodeMaxUser?: string;
  /** Whether API key is required (no valid auth) */
  needsApiKey: boolean;
}

/**
 * OAuth token structure from Claude Code Max
 */
export interface OAuthToken {
  access_token?: string;
  account?: {
    email_address?: string;
  };
}

/**
 * Singleton authentication manager for AI services
 * Handles API keys and OAuth token detection
 */
export class AuthManager {
  private static instance: AuthManager;
  private apiKey?: string;
  private oauthToken?: string;
  private authMethod: string = 'none';
  private claudeCodeMaxUser?: string;
  private initialized: boolean = false;

  private constructor() {
    // Initialize on server-side only
    if (typeof window === 'undefined') {
      this.initialize();
    }
  }

  /**
   * Get the singleton instance
   */
  static getInstance(): AuthManager {
    if (!AuthManager.instance) {
      AuthManager.instance = new AuthManager();
    }
    return AuthManager.instance;
  }

  /**
   * Initialize authentication from environment
   */
  private initialize(): void {
    if (this.initialized) return;
    this.initialized = true;
    
    // Check for OAuth token first (priority authentication)
    this.loadOAuthToken();
    
    // Check for Claude Code Max OAuth token (informational only)
    this.checkOAuthToken();
    
    // Load API key as fallback
    this.loadApiKey();
  }

  /**
   * Load OAuth token for Claude Code authentication
   * Checks environment variable first, then JSON file
   */
  private loadOAuthToken(): void {
    // First check environment variable (explicit OAuth)
    if (process.env.CLAUDE_CODE_OAUTH_TOKEN) {
      this.oauthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;
      this.authMethod = 'OAuth Token (env)';
      return;
    }

    // Then check the OAuth token file
    const oauthTokenPath = path.join(os.homedir(), '.vibekit', 'claude-oauth-token.json');
    if (existsSync(oauthTokenPath)) {
      try {
        const tokenContent = readFileSync(oauthTokenPath, 'utf-8');
        const oauthTokenData: OAuthToken = JSON.parse(tokenContent);
        if (oauthTokenData.access_token) {
          this.oauthToken = oauthTokenData.access_token;
          this.authMethod = 'OAuth Token (file)';
        }
      } catch (e) {
        // Ignore error - OAuth token is optional
      }
    }
  }

  /**
   * Check for Claude Code Max OAuth token
   * This is for informational purposes only
   */
  private checkOAuthToken(): void {
    const oauthTokenPath = path.join(os.homedir(), '.vibekit', 'claude-oauth-token.json');
    if (existsSync(oauthTokenPath)) {
      try {
        const tokenContent = readFileSync(oauthTokenPath, 'utf-8');
        const oauthToken: OAuthToken = JSON.parse(tokenContent);
        if (oauthToken.access_token) {
          this.claudeCodeMaxUser = oauthToken.account?.email_address;
        }
      } catch (e) {
        // Ignore error - OAuth token is optional
      }
    }
  }

  /**
   * Load API key from environment or .env files
   * Only used as fallback if no OAuth token is available
   */
  private loadApiKey(): void {
    // Skip if OAuth token is already available (OAuth has priority)
    if (this.oauthToken) {
      return;
    }

    // First check if API key is already in environment
    if (process.env.ANTHROPIC_API_KEY) {
      this.apiKey = process.env.ANTHROPIC_API_KEY;
      this.authMethod = 'API Key (env)';
      return;
    }

    // Try to load from .env files if not already set
    const possiblePaths = [
      path.resolve(process.cwd(), '.env'),
      path.resolve(process.cwd(), '../.env'),
      path.resolve(process.cwd(), '../../.env'),
      path.resolve(process.cwd(), '../../../.env'),
      path.resolve(process.cwd(), '../../../../.env'),
    ];

    for (const envPath of possiblePaths) {
      try {
        const envContent = readFileSync(envPath, 'utf-8');
        const envVars = dotenv.parse(envContent);
        if (envVars.ANTHROPIC_API_KEY) {
          this.apiKey = envVars.ANTHROPIC_API_KEY;
          this.authMethod = 'API Key';
          break;
        }
      } catch (e) {
        // Try next path
      }
    }
  }

  /**
   * Get the API key if available
   */
  getApiKey(): string | undefined {
    if (!this.initialized && typeof window === 'undefined') {
      this.initialize();
    }
    return this.apiKey;
  }

  /**
   * Get the OAuth token if available
   */
  getOAuthToken(): string | undefined {
    if (!this.initialized && typeof window === 'undefined') {
      this.initialize();
    }
    return this.oauthToken;
  }

  /**
   * Get current authentication status
   */
  getAuthStatus(): AuthStatus {
    const hasApiKey = !!this.apiKey;
    const hasOAuthToken = !!this.oauthToken;
    const isConfigured = hasOAuthToken || hasApiKey;
    
    return {
      authMethod: this.authMethod,
      hasApiKey,
      hasOAuthToken,
      isConfigured,
      claudeCodeMaxUser: this.claudeCodeMaxUser,
      needsApiKey: !isConfigured,
    };
  }

  /**
   * Check if valid authentication is available
   */
  hasValidAuth(): boolean {
    return !!this.oauthToken || !!this.apiKey;
  }

  /**
   * Get error message if authentication is not configured
   */
  getErrorMessage(): string | null {
    if (!this.oauthToken && !this.apiKey) {
      if (this.claudeCodeMaxUser) {
        return `Claude Code Max account detected (${this.claudeCodeMaxUser}). Please run 'claude login' or set CLAUDE_CODE_OAUTH_TOKEN to authenticate, or set ANTHROPIC_API_KEY for API access.`;
      }
      return 'No authentication configured. Please run \'claude login\' or set CLAUDE_CODE_OAUTH_TOKEN environment variable, or set ANTHROPIC_API_KEY in your .env file.';
    }
    return null;
  }
}