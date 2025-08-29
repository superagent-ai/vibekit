import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  createAnthropicProvider, 
  createAnthropicProviderWithModel,
  getAuthInfo,
  shouldUseClaudeCodeSDK,
  getAuthMethod
} from '../src/utils/provider-factory';

// Mock the AI SDK
vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn().mockReturnValue((model: string) => `anthropic-model-${model}`),
}));

// Mock AuthManager
vi.mock('../src/utils/auth', () => ({
  AuthManager: {
    getInstance: vi.fn().mockReturnValue({
      getOAuthToken: vi.fn(),
      getApiKey: vi.fn(),
      hasValidAuth: vi.fn(),
      getAuthStatus: vi.fn().mockReturnValue({
        authMethod: 'none',
        claudeCodeMaxUser: undefined,
      }),
    }),
  },
}));

describe('provider-factory utilities', () => {
  let mockAuthManager: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Get the mocked AuthManager instance
    const { AuthManager } = await import('../src/utils/auth');
    mockAuthManager = AuthManager.getInstance();
    
    // Reset default mock implementations
    mockAuthManager.getOAuthToken.mockReturnValue(undefined);
    mockAuthManager.getApiKey.mockReturnValue(undefined);
    mockAuthManager.hasValidAuth.mockReturnValue(false);
    mockAuthManager.getAuthStatus.mockReturnValue({
      authMethod: 'none',
      claudeCodeMaxUser: undefined,
    });
  });

  describe('createAnthropicProvider', () => {
    it('should create provider with API key', async () => {
      const { createAnthropic } = await import('@ai-sdk/anthropic');
      
      mockAuthManager.getApiKey.mockReturnValue('test-api-key');
      mockAuthManager.getAuthStatus.mockReturnValue({
        authMethod: 'API Key (env)',
        claudeCodeMaxUser: undefined,
      });

      const provider = createAnthropicProvider();

      expect(createAnthropic).toHaveBeenCalledWith({ apiKey: 'test-api-key' });
      expect(provider).toBe('anthropic-model-claude-sonnet-4-20250514');
    });

    it('should throw error when OAuth token is detected', () => {
      mockAuthManager.getOAuthToken.mockReturnValue('oauth-token');
      mockAuthManager.getAuthStatus.mockReturnValue({
        authMethod: 'OAuth Token (env)',
        claudeCodeMaxUser: 'user@example.com',
      });

      expect(() => createAnthropicProvider()).toThrow(
        'OAuth token detected - use Claude Code SDK streaming instead of AI provider'
      );
    });

    it('should throw error when no authentication is configured', () => {
      expect(() => createAnthropicProvider()).toThrow(
        'No authentication configured. Please run \'claude login\' or set CLAUDE_CODE_OAUTH_TOKEN environment variable, or set ANTHROPIC_API_KEY in your .env file.'
      );
    });

    it('should use provided AuthManager instead of singleton', async () => {
      const customAuthManager = {
        getOAuthToken: vi.fn().mockReturnValue(undefined),
        getApiKey: vi.fn().mockReturnValue('custom-api-key'),
        hasValidAuth: vi.fn().mockReturnValue(true),
        getAuthStatus: vi.fn().mockReturnValue({
          authMethod: 'API Key (custom)',
          claudeCodeMaxUser: undefined,
        }),
      };

      const { createAnthropic } = await import('@ai-sdk/anthropic');
      
      const provider = createAnthropicProvider(customAuthManager as any);

      expect(createAnthropic).toHaveBeenCalledWith({ apiKey: 'custom-api-key' });
      expect(provider).toBe('anthropic-model-claude-sonnet-4-20250514');
    });
  });

  describe('createAnthropicProviderWithModel', () => {
    it('should create provider with custom model and API key', async () => {
      const { createAnthropic } = await import('@ai-sdk/anthropic');
      
      mockAuthManager.getApiKey.mockReturnValue('test-api-key');

      const provider = createAnthropicProviderWithModel('claude-3-opus-20240229');

      expect(createAnthropic).toHaveBeenCalledWith({ apiKey: 'test-api-key' });
      expect(provider).toBe('anthropic-model-claude-3-opus-20240229');
    });

    it('should throw error when OAuth token is detected for custom model', () => {
      mockAuthManager.getOAuthToken.mockReturnValue('oauth-token');

      expect(() => createAnthropicProviderWithModel('claude-3-haiku-20240307')).toThrow(
        'OAuth token detected - use Claude Code SDK streaming instead of AI provider'
      );
    });

    it('should throw error when no authentication for custom model', () => {
      expect(() => createAnthropicProviderWithModel('claude-3-sonnet-20240229')).toThrow(
        'No authentication configured. Please run \'claude login\' or set CLAUDE_CODE_OAUTH_TOKEN environment variable, or set ANTHROPIC_API_KEY in your .env file.'
      );
    });
  });

  describe('getAuthInfo', () => {
    it('should return auth info with OAuth token', () => {
      mockAuthManager.getOAuthToken.mockReturnValue('oauth-token');
      mockAuthManager.getApiKey.mockReturnValue(undefined);
      mockAuthManager.hasValidAuth.mockReturnValue(true);
      mockAuthManager.getAuthStatus.mockReturnValue({
        authMethod: 'OAuth Token (env)',
        claudeCodeMaxUser: 'user@example.com',
      });

      const authInfo = getAuthInfo();

      expect(authInfo).toEqual({
        hasOAuthToken: true,
        hasApiKey: false,
        authMethod: 'OAuth Token (env)',
        isConfigured: true,
      });
    });

    it('should return auth info with API key', () => {
      mockAuthManager.getOAuthToken.mockReturnValue(undefined);
      mockAuthManager.getApiKey.mockReturnValue('api-key');
      mockAuthManager.hasValidAuth.mockReturnValue(true);
      mockAuthManager.getAuthStatus.mockReturnValue({
        authMethod: 'API Key (env)',
        claudeCodeMaxUser: undefined,
      });

      const authInfo = getAuthInfo();

      expect(authInfo).toEqual({
        hasOAuthToken: false,
        hasApiKey: true,
        authMethod: 'API Key (env)',
        isConfigured: true,
      });
    });

    it('should return auth info with no authentication', () => {
      const authInfo = getAuthInfo();

      expect(authInfo).toEqual({
        hasOAuthToken: false,
        hasApiKey: false,
        authMethod: 'none',
        isConfigured: false,
      });
    });

    it('should use provided AuthManager', () => {
      const customAuthManager = {
        getOAuthToken: vi.fn().mockReturnValue('custom-oauth'),
        getApiKey: vi.fn().mockReturnValue('custom-api-key'),
        hasValidAuth: vi.fn().mockReturnValue(true),
        getAuthStatus: vi.fn().mockReturnValue({
          authMethod: 'OAuth Token (custom)',
          claudeCodeMaxUser: 'custom@example.com',
        }),
      };

      const authInfo = getAuthInfo(customAuthManager as any);

      expect(authInfo).toEqual({
        hasOAuthToken: true,
        hasApiKey: true,
        authMethod: 'OAuth Token (custom)',
        isConfigured: true,
      });
    });
  });

  describe('shouldUseClaudeCodeSDK', () => {
    it('should return true when OAuth token is available', () => {
      mockAuthManager.getOAuthToken.mockReturnValue('oauth-token');

      const result = shouldUseClaudeCodeSDK();

      expect(result).toBe(true);
    });

    it('should return false when no OAuth token', () => {
      mockAuthManager.getOAuthToken.mockReturnValue(undefined);

      const result = shouldUseClaudeCodeSDK();

      expect(result).toBe(false);
    });

    it('should return false when OAuth token is empty string', () => {
      mockAuthManager.getOAuthToken.mockReturnValue('');

      const result = shouldUseClaudeCodeSDK();

      expect(result).toBe(false);
    });

    it('should use provided AuthManager', () => {
      const customAuthManager = {
        getOAuthToken: vi.fn().mockReturnValue('custom-oauth-token'),
        getApiKey: vi.fn(),
        hasValidAuth: vi.fn(),
        getAuthStatus: vi.fn(),
      };

      const result = shouldUseClaudeCodeSDK(customAuthManager as any);

      expect(result).toBe(true);
    });
  });

  describe('getAuthMethod', () => {
    it('should return claude-code-sdk when OAuth token is available', () => {
      mockAuthManager.getOAuthToken.mockReturnValue('oauth-token');
      mockAuthManager.getApiKey.mockReturnValue('api-key'); // Should prefer OAuth

      const method = getAuthMethod();

      expect(method).toBe('claude-code-sdk');
    });

    it('should return anthropic-api when only API key is available', () => {
      mockAuthManager.getOAuthToken.mockReturnValue(undefined);
      mockAuthManager.getApiKey.mockReturnValue('api-key');

      const method = getAuthMethod();

      expect(method).toBe('anthropic-api');
    });

    it('should return none when no authentication is available', () => {
      const method = getAuthMethod();

      expect(method).toBe('none');
    });

    it('should prioritize OAuth over API key', () => {
      mockAuthManager.getOAuthToken.mockReturnValue('oauth-token');
      mockAuthManager.getApiKey.mockReturnValue('api-key');

      const method = getAuthMethod();

      expect(method).toBe('claude-code-sdk');
    });

    it('should use provided AuthManager', () => {
      const customAuthManager = {
        getOAuthToken: vi.fn().mockReturnValue(undefined),
        getApiKey: vi.fn().mockReturnValue('custom-api-key'),
        hasValidAuth: vi.fn(),
        getAuthStatus: vi.fn(),
      };

      const method = getAuthMethod(customAuthManager as any);

      expect(method).toBe('anthropic-api');
    });
  });

  describe('edge cases', () => {
    it('should handle null values from AuthManager', () => {
      mockAuthManager.getOAuthToken.mockReturnValue(null);
      mockAuthManager.getApiKey.mockReturnValue(null);

      const authInfo = getAuthInfo();
      const shouldUseSDK = shouldUseClaudeCodeSDK();
      const authMethod = getAuthMethod();

      expect(authInfo.hasOAuthToken).toBe(false);
      expect(authInfo.hasApiKey).toBe(false);
      expect(shouldUseSDK).toBe(false);
      expect(authMethod).toBe('none');
    });

    it('should handle undefined values from AuthManager', () => {
      mockAuthManager.getOAuthToken.mockReturnValue(undefined);
      mockAuthManager.getApiKey.mockReturnValue(undefined);

      const authInfo = getAuthInfo();
      const shouldUseSDK = shouldUseClaudeCodeSDK();
      const authMethod = getAuthMethod();

      expect(authInfo.hasOAuthToken).toBe(false);
      expect(authInfo.hasApiKey).toBe(false);
      expect(shouldUseSDK).toBe(false);
      expect(authMethod).toBe('none');
    });

    it('should handle empty string values from AuthManager', () => {
      mockAuthManager.getOAuthToken.mockReturnValue('');
      mockAuthManager.getApiKey.mockReturnValue('');

      const authInfo = getAuthInfo();
      const shouldUseSDK = shouldUseClaudeCodeSDK();
      const authMethod = getAuthMethod();

      expect(authInfo.hasOAuthToken).toBe(false);
      expect(authInfo.hasApiKey).toBe(false);
      expect(shouldUseSDK).toBe(false);
      expect(authMethod).toBe('none');
    });
  });
});