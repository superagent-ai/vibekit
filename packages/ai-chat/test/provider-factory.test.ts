import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAnthropicProvider, createAnthropicProviderWithModel } from '../src/utils/provider-factory';

// Mock the dependencies
vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn(() => vi.fn((model: string) => ({ model }))),
}));

vi.mock('../src/utils/auth', () => ({
  AuthManager: {
    getInstance: vi.fn(() => ({
      getOAuthToken: vi.fn(),
      getApiKey: vi.fn(),
      getAuthStatus: vi.fn(() => ({
        authMethod: 'api-key',
        claudeCodeMaxUser: false,
      })),
    })),
  },
}));

describe('provider-factory', () => {
  const mockAuthManager = {
    getOAuthToken: vi.fn(),
    getApiKey: vi.fn(),
    getAuthStatus: vi.fn(() => ({
      authMethod: 'api-key',
      claudeCodeMaxUser: false,
    })),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Suppress console.log for cleaner test output
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  describe('createAnthropicProvider', () => {
    it('should create provider with API key', () => {
      mockAuthManager.getOAuthToken.mockReturnValue(null);
      mockAuthManager.getApiKey.mockReturnValue('test-api-key');

      const result = createAnthropicProvider(mockAuthManager as any);

      expect(result).toBeDefined();
      expect(mockAuthManager.getApiKey).toHaveBeenCalled();
      expect(mockAuthManager.getOAuthToken).toHaveBeenCalled();
    });

    it('should throw error when OAuth token is present', () => {
      mockAuthManager.getOAuthToken.mockReturnValue('oauth-token');
      mockAuthManager.getApiKey.mockReturnValue(null);

      expect(() => {
        createAnthropicProvider(mockAuthManager as any);
      }).toThrow('OAuth token detected - use Claude Code SDK streaming instead of AI provider');
    });

    it('should throw error when no authentication is available', () => {
      mockAuthManager.getOAuthToken.mockReturnValue(null);
      mockAuthManager.getApiKey.mockReturnValue(null);

      expect(() => {
        createAnthropicProvider(mockAuthManager as any);
      }).toThrow('No authentication configured');
    });

    it('should use default AuthManager when none provided', async () => {
      const { AuthManager } = await import('../src/utils/auth');
      const mockInstance = {
        getOAuthToken: vi.fn().mockReturnValue(null),
        getApiKey: vi.fn().mockReturnValue('test-api-key'),
        getAuthStatus: vi.fn(() => ({
          authMethod: 'api-key',
          claudeCodeMaxUser: false,
        })),
      };
      
      AuthManager.getInstance.mockReturnValue(mockInstance);

      const result = createAnthropicProvider();

      expect(result).toBeDefined();
      expect(AuthManager.getInstance).toHaveBeenCalled();
    });
  });

  describe('createAnthropicProviderWithModel', () => {
    it('should create provider with specific model and API key', () => {
      mockAuthManager.getOAuthToken.mockReturnValue(null);
      mockAuthManager.getApiKey.mockReturnValue('test-api-key');

      const customModel = 'claude-3-5-haiku-20241022';
      const result = createAnthropicProviderWithModel(customModel, mockAuthManager as any);

      expect(result).toBeDefined();
      expect(mockAuthManager.getApiKey).toHaveBeenCalled();
      expect(mockAuthManager.getOAuthToken).toHaveBeenCalled();
    });

    it('should throw error when OAuth token is present for custom model', () => {
      mockAuthManager.getOAuthToken.mockReturnValue('oauth-token');
      mockAuthManager.getApiKey.mockReturnValue(null);

      const customModel = 'claude-3-5-haiku-20241022';

      expect(() => {
        createAnthropicProviderWithModel(customModel, mockAuthManager as any);
      }).toThrow('OAuth token detected - use Claude Code SDK streaming instead of AI provider');
    });

    it('should throw error when no authentication is available for custom model', () => {
      mockAuthManager.getOAuthToken.mockReturnValue(null);
      mockAuthManager.getApiKey.mockReturnValue(null);

      const customModel = 'claude-3-5-haiku-20241022';

      expect(() => {
        createAnthropicProviderWithModel(customModel, mockAuthManager as any);
      }).toThrow('No authentication configured');
    });

    it('should use default AuthManager when none provided for custom model', async () => {
      const { AuthManager } = await import('../src/utils/auth');
      const mockInstance = {
        getOAuthToken: vi.fn().mockReturnValue(null),
        getApiKey: vi.fn().mockReturnValue('test-api-key'),
        getAuthStatus: vi.fn(() => ({
          authMethod: 'api-key',
          claudeCodeMaxUser: false,
        })),
      };
      
      AuthManager.getInstance.mockReturnValue(mockInstance);

      const customModel = 'claude-3-5-haiku-20241022';
      const result = createAnthropicProviderWithModel(customModel);

      expect(result).toBeDefined();
      expect(AuthManager.getInstance).toHaveBeenCalled();
    });
  });
});