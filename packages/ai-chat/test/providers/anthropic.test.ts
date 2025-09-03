import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AnthropicProvider } from '../../src/providers/anthropic';
import { AuthManager } from '../../src/utils/auth';

// Mock the auth manager
vi.mock('../../src/utils/auth');

// Mock @ai-sdk/anthropic
vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn(() => vi.fn(() => ({ model: 'mocked-model' })))
}));

describe('AnthropicProvider', () => {
  let provider: AnthropicProvider;
  let mockAuthManager: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockAuthManager = {
      getApiKey: vi.fn()
    };
    
    (AuthManager.getInstance as any).mockReturnValue(mockAuthManager);
  });

  describe('constructor', () => {
    it('should initialize with API key from AuthManager', () => {
      mockAuthManager.getApiKey.mockReturnValue('test-api-key');
      
      provider = new AnthropicProvider();
      
      expect(AuthManager.getInstance).toHaveBeenCalled();
      expect(mockAuthManager.getApiKey).toHaveBeenCalled();
      expect(provider.name).toBe('Anthropic');
    });

    it('should handle missing API key', () => {
      mockAuthManager.getApiKey.mockReturnValue(undefined);
      
      provider = new AnthropicProvider();
      
      expect(provider.name).toBe('Anthropic');
    });
  });

  describe('createModel', () => {
    it('should create model when API key is available', () => {
      mockAuthManager.getApiKey.mockReturnValue('test-api-key');
      provider = new AnthropicProvider();
      
      const model = provider.createModel('claude-sonnet-4-20250514');
      
      expect(model).toBeDefined();
    });

    it('should throw error when API key is not available', () => {
      mockAuthManager.getApiKey.mockReturnValue(undefined);
      provider = new AnthropicProvider();
      
      expect(() => provider.createModel('claude-sonnet-4-20250514'))
        .toThrow('Anthropic API key not configured');
    });

    it('should throw error when API key is empty string', () => {
      mockAuthManager.getApiKey.mockReturnValue('');
      provider = new AnthropicProvider();
      
      expect(() => provider.createModel('claude-sonnet-4-20250514'))
        .toThrow('Anthropic API key not configured');
    });
  });

  describe('isAvailable', () => {
    it('should return true when API key is available', () => {
      mockAuthManager.getApiKey.mockReturnValue('test-api-key');
      provider = new AnthropicProvider();
      
      expect(provider.isAvailable()).toBe(true);
    });

    it('should return false when API key is not available', () => {
      mockAuthManager.getApiKey.mockReturnValue(undefined);
      provider = new AnthropicProvider();
      
      expect(provider.isAvailable()).toBe(false);
    });

    it('should return false when API key is empty string', () => {
      mockAuthManager.getApiKey.mockReturnValue('');
      provider = new AnthropicProvider();
      
      expect(provider.isAvailable()).toBe(false);
    });
  });

  describe('getAvailableModels', () => {
    it('should return list of available models', () => {
      mockAuthManager.getApiKey.mockReturnValue('test-api-key');
      provider = new AnthropicProvider();
      
      const models = provider.getAvailableModels();
      
      expect(models).toEqual([
        {
          name: 'Claude Sonnet 4',
          value: 'claude-sonnet-4-20250514',
        },
        {
          name: 'Claude Opus 4.1',
          value: 'claude-opus-4-1-20250805',
        },
      ]);
    });

    it('should return same models regardless of API key availability', () => {
      mockAuthManager.getApiKey.mockReturnValue(undefined);
      provider = new AnthropicProvider();
      
      const models = provider.getAvailableModels();
      
      expect(models).toHaveLength(2);
      expect(models[0]).toHaveProperty('name');
      expect(models[0]).toHaveProperty('value');
    });
  });
});