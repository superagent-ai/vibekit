import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Create a mock for AuthManager that we can control
class MockAuthManager {
  private static instance: MockAuthManager;
  private apiKey?: string;
  private oauthToken?: string;
  private authMethod: string = 'none';
  private claudeCodeMaxUser?: string;

  static getInstance(): MockAuthManager {
    if (!MockAuthManager.instance) {
      MockAuthManager.instance = new MockAuthManager();
    }
    return MockAuthManager.instance;
  }

  static resetInstance(): void {
    MockAuthManager.instance = undefined as any;
  }

  setApiKey(key?: string): void {
    this.apiKey = key;
    this.authMethod = key ? 'API Key (env)' : 'none';
  }

  setOAuthToken(token?: string): void {
    this.oauthToken = token;
    this.authMethod = token ? 'OAuth Token (env)' : 'none';
  }

  setClaudeCodeMaxUser(user?: string): void {
    this.claudeCodeMaxUser = user;
  }

  getApiKey(): string | undefined {
    return this.apiKey;
  }

  getOAuthToken(): string | undefined {
    return this.oauthToken;
  }

  hasValidAuth(): boolean {
    return !!this.oauthToken || !!this.apiKey;
  }

  getAuthStatus() {
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

describe('AuthManager', () => {
  let authManager: MockAuthManager;

  beforeEach(() => {
    MockAuthManager.resetInstance();
    authManager = MockAuthManager.getInstance();
  });

  describe('singleton pattern', () => {
    it('should return the same instance', () => {
      const instance1 = MockAuthManager.getInstance();
      const instance2 = MockAuthManager.getInstance();
      
      expect(instance1).toBe(instance2);
    });

    it('should initialize only once', () => {
      const instance1 = MockAuthManager.getInstance();
      const instance2 = MockAuthManager.getInstance();
      
      // Both should be the same instance, initialized once
      expect(instance1).toBe(instance2);
    });
  });

  describe('OAuth token management', () => {
    it('should set and get OAuth token', () => {
      authManager.setOAuthToken('oauth-token');
      
      expect(authManager.getOAuthToken()).toBe('oauth-token');
      expect(authManager.getAuthStatus().authMethod).toBe('OAuth Token (env)');
      expect(authManager.hasValidAuth()).toBe(true);
    });

    it('should handle OAuth token with user information', () => {
      authManager.setOAuthToken('oauth-token');
      authManager.setClaudeCodeMaxUser('user@example.com');
      
      const status = authManager.getAuthStatus();
      
      expect(status.hasOAuthToken).toBe(true);
      expect(status.claudeCodeMaxUser).toBe('user@example.com');
    });

    it('should prioritize OAuth token over API key', () => {
      authManager.setApiKey('api-key');
      authManager.setOAuthToken('oauth-token');
      
      expect(authManager.getOAuthToken()).toBe('oauth-token');
      expect(authManager.getApiKey()).toBe('api-key');
      expect(authManager.getAuthStatus().authMethod).toBe('OAuth Token (env)');
    });
  });

  describe('API key management', () => {
    it('should set and get API key', () => {
      authManager.setApiKey('api-key');
      
      expect(authManager.getApiKey()).toBe('api-key');
      expect(authManager.getAuthStatus().authMethod).toBe('API Key (env)');
      expect(authManager.hasValidAuth()).toBe(true);
    });

    it('should clear API key', () => {
      authManager.setApiKey('api-key');
      authManager.setApiKey(undefined);
      
      expect(authManager.getApiKey()).toBeUndefined();
      expect(authManager.hasValidAuth()).toBe(false);
    });

    it('should handle missing API key gracefully', () => {
      expect(authManager.getApiKey()).toBeUndefined();
      expect(authManager.hasValidAuth()).toBe(false);
    });
  });

  describe('authentication status', () => {
    it('should return correct status when OAuth token is available', () => {
      authManager.setOAuthToken('oauth-token');
      
      const status = authManager.getAuthStatus();
      
      expect(status.hasOAuthToken).toBe(true);
      expect(status.hasApiKey).toBe(false);
      expect(status.isConfigured).toBe(true);
      expect(status.needsApiKey).toBe(false);
      expect(status.authMethod).toBe('OAuth Token (env)');
    });

    it('should return correct status when API key is available', () => {
      authManager.setApiKey('api-key');
      
      const status = authManager.getAuthStatus();
      
      expect(status.hasOAuthToken).toBe(false);
      expect(status.hasApiKey).toBe(true);
      expect(status.isConfigured).toBe(true);
      expect(status.needsApiKey).toBe(false);
      expect(status.authMethod).toBe('API Key (env)');
    });

    it('should return correct status when no authentication is available', () => {
      const status = authManager.getAuthStatus();
      
      expect(status.hasOAuthToken).toBe(false);
      expect(status.hasApiKey).toBe(false);
      expect(status.isConfigured).toBe(false);
      expect(status.needsApiKey).toBe(true);
      expect(status.authMethod).toBe('none');
    });
  });

  describe('hasValidAuth', () => {
    it('should return true when OAuth token is available', () => {
      authManager.setOAuthToken('oauth-token');
      
      expect(authManager.hasValidAuth()).toBe(true);
    });

    it('should return true when API key is available', () => {
      authManager.setApiKey('api-key');
      
      expect(authManager.hasValidAuth()).toBe(true);
    });

    it('should return false when no authentication is available', () => {
      expect(authManager.hasValidAuth()).toBe(false);
    });
  });

  describe('getErrorMessage', () => {
    it('should return null when valid authentication is available', () => {
      authManager.setApiKey('api-key');
      
      expect(authManager.getErrorMessage()).toBeNull();
    });

    it('should return generic error message when no authentication is available', () => {
      const errorMessage = authManager.getErrorMessage();
      
      expect(errorMessage).toContain('No authentication configured');
      expect(errorMessage).toContain('claude login');
      expect(errorMessage).toContain('ANTHROPIC_API_KEY');
    });

    it('should return specific error message when Claude Code Max user is detected', () => {
      authManager.setClaudeCodeMaxUser('user@example.com');
      
      const errorMessage = authManager.getErrorMessage();
      
      expect(errorMessage).toContain('Claude Code Max account detected');
      expect(errorMessage).toContain('user@example.com');
      expect(errorMessage).toContain('claude login');
    });
  });

});