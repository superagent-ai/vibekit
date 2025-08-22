import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleChatRequest } from '../src/server/chat-handler';
import type { NextRequest } from 'next/server';

// Mock AI SDK
vi.mock('ai', () => ({
  streamText: vi.fn().mockReturnValue({
    toUIMessageStreamResponse: vi.fn().mockReturnValue(new Response('mocked stream')),
  }),
}));

// Mock AuthManager
vi.mock('../src/utils/auth', () => ({
  AuthManager: {
    getInstance: vi.fn().mockReturnValue({
      hasValidAuth: vi.fn(),
      getErrorMessage: vi.fn(),
      getApiKey: vi.fn(),
      getOAuthToken: vi.fn(),
      getAuthMethod: vi.fn(),
    }),
  },
}));

// Mock provider factory
vi.mock('../src/utils/provider-factory', () => ({
  createAnthropicProviderWithModel: vi.fn(),
  getAuthInfo: vi.fn(),
  shouldUseClaudeCodeSDK: vi.fn(),
}));

// Mock Claude Code SDK
vi.mock('../src/utils/claude-sdk-streaming', () => ({
  createClaudeCodeProvider: vi.fn().mockReturnValue({
    createLanguageModel: vi.fn().mockReturnValue('claude-model'),
  }),
}));

describe('handleChatRequest', () => {
  let mockRequest: Partial<NextRequest>;
  let mockAuthManager: any;
  let mockProviderFactory: any;
  let mockClaudeProvider: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Get the mocked modules
    const authModule = await import('../src/utils/auth');
    const providerModule = await import('../src/utils/provider-factory');
    const claudeModule = await import('../src/utils/claude-sdk-streaming');
    
    mockAuthManager = (authModule.AuthManager.getInstance as any)();
    mockProviderFactory = providerModule;
    mockClaudeProvider = (claudeModule.createClaudeCodeProvider as any)();
    
    // Default mock implementations
    mockAuthManager.hasValidAuth.mockReturnValue(true);
    mockAuthManager.getErrorMessage.mockReturnValue('');
    mockProviderFactory.getAuthInfo.mockReturnValue({ hasAuth: true });
    mockProviderFactory.shouldUseClaudeCodeSDK.mockReturnValue(false);
    mockProviderFactory.createAnthropicProviderWithModel.mockReturnValue('anthropic-provider');
    
    mockRequest = {
      json: vi.fn(),
    };
  });

  describe('request validation', () => {
    it('should return 400 when messages are missing', async () => {
      mockRequest.json = vi.fn().mockResolvedValue({});

      const response = await handleChatRequest(mockRequest as NextRequest);

      expect(response.status).toBe(400);
      const text = await response.text();
      expect(text).toBe('Messages are required');
    });

    it('should return 400 when messages array is empty', async () => {
      mockRequest.json = vi.fn().mockResolvedValue({ messages: [] });

      const response = await handleChatRequest(mockRequest as NextRequest);

      expect(response.status).toBe(400);
      const text = await response.text();
      expect(text).toBe('Messages are required');
    });

    it('should accept valid messages', async () => {
      mockRequest.json = vi.fn().mockResolvedValue({
        messages: [{ role: 'user', content: 'Hello' }],
      });

      const response = await handleChatRequest(mockRequest as NextRequest);

      expect(response.status).not.toBe(400);
    });
  });

  describe('authentication handling', () => {
    it('should return 500 when no valid auth is available', async () => {
      mockRequest.json = vi.fn().mockResolvedValue({
        messages: [{ role: 'user', content: 'Hello' }],
      });
      mockAuthManager.hasValidAuth.mockReturnValue(false);
      mockAuthManager.getErrorMessage.mockReturnValue('No API key configured');

      const response = await handleChatRequest(mockRequest as NextRequest);

      expect(response.status).toBe(500);
      const json = await response.json();
      expect(json.error).toBe('No API key configured');
    });

    it('should use default error message when auth error is empty', async () => {
      mockRequest.json = vi.fn().mockResolvedValue({
        messages: [{ role: 'user', content: 'Hello' }],
      });
      mockAuthManager.hasValidAuth.mockReturnValue(false);
      mockAuthManager.getErrorMessage.mockReturnValue('');

      const response = await handleChatRequest(mockRequest as NextRequest);

      expect(response.status).toBe(500);
      const json = await response.json();
      expect(json.error).toBe('No authentication configured');
    });

    it('should proceed when valid auth is available', async () => {
      mockRequest.json = vi.fn().mockResolvedValue({
        messages: [{ role: 'user', content: 'Hello' }],
      });
      mockAuthManager.hasValidAuth.mockReturnValue(true);

      const response = await handleChatRequest(mockRequest as NextRequest);

      expect(response.status).not.toBe(500);
    });
  });

  describe('message formatting', () => {
    beforeEach(() => {
      mockRequest.json = vi.fn();
    });

    it('should format user messages correctly', async () => {
      const { streamText } = await import('ai');
      mockRequest.json!.mockResolvedValue({
        messages: [{ role: 'user', content: 'Hello world' }],
      });

      await handleChatRequest(mockRequest as NextRequest);

      expect(streamText).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [{ role: 'user', content: 'Hello world' }],
        })
      );
    });

    it('should format assistant messages with parts array', async () => {
      const { streamText } = await import('ai');
      mockRequest.json!.mockResolvedValue({
        messages: [
          {
            role: 'assistant',
            content: '',
            parts: [
              { type: 'text', text: 'Hello' },
              { type: 'text', text: ' world' },
              { type: 'other', data: 'ignored' },
            ],
          },
        ],
      });

      await handleChatRequest(mockRequest as NextRequest);

      expect(streamText).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [{ role: 'assistant', content: 'Hello world' }],
        })
      );
    });

    it('should format system messages correctly', async () => {
      const { streamText } = await import('ai');
      mockRequest.json!.mockResolvedValue({
        messages: [{ role: 'system', content: 'You are a helpful assistant' }],
      });

      await handleChatRequest(mockRequest as NextRequest);

      expect(streamText).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [{ role: 'system', content: 'You are a helpful assistant' }],
        })
      );
    });

    it('should handle non-string content', async () => {
      const { streamText } = await import('ai');
      mockRequest.json!.mockResolvedValue({
        messages: [{ role: 'user', content: null }],
      });

      await handleChatRequest(mockRequest as NextRequest);

      expect(streamText).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [{ role: 'user', content: '' }],
        })
      );
    });
  });

  describe('model selection', () => {
    beforeEach(() => {
      mockRequest.json = vi.fn().mockResolvedValue({
        messages: [{ role: 'user', content: 'Hello' }],
      });
    });

    it('should use default model when none specified', async () => {
      await handleChatRequest(mockRequest as NextRequest);

      expect(mockProviderFactory.createAnthropicProviderWithModel).toHaveBeenCalledWith(
        'claude-sonnet-4-20250514',
        mockAuthManager
      );
    });

    it('should use custom model when specified', async () => {
      mockRequest.json = vi.fn().mockResolvedValue({
        messages: [{ role: 'user', content: 'Hello' }],
        data: { model: 'claude-3-opus-20240229' },
      });

      await handleChatRequest(mockRequest as NextRequest);

      expect(mockProviderFactory.createAnthropicProviderWithModel).toHaveBeenCalledWith(
        'claude-3-opus-20240229',
        mockAuthManager
      );
    });
  });

  describe('Claude Code SDK vs Anthropic API selection', () => {
    beforeEach(() => {
      mockRequest.json = vi.fn().mockResolvedValue({
        messages: [{ role: 'user', content: 'Hello' }],
      });
    });

    it('should use Claude Code SDK when OAuth is available', async () => {
      const { streamText } = await import('ai');
      const { createClaudeCodeProvider } = await import('../src/utils/claude-sdk-streaming');
      
      mockProviderFactory.shouldUseClaudeCodeSDK.mockReturnValue(true);

      await handleChatRequest(mockRequest as NextRequest);

      expect(createClaudeCodeProvider).toHaveBeenCalledWith(mockAuthManager);
      expect(mockClaudeProvider.createLanguageModel).toHaveBeenCalled();
      expect(streamText).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-model',
        })
      );
    });

    it('should fallback to Anthropic API when Claude Code SDK fails', async () => {
      // Mock console.error to suppress expected error logging
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      const { createClaudeCodeProvider } = await import('../src/utils/claude-sdk-streaming');
      
      mockProviderFactory.shouldUseClaudeCodeSDK.mockReturnValue(true);
      
      // Temporarily replace the implementation
      const originalImpl = createClaudeCodeProvider.getMockImplementation();
      createClaudeCodeProvider.mockImplementation(() => {
        throw new Error('Claude Code SDK error');
      });

      await handleChatRequest(mockRequest as NextRequest);

      expect(mockProviderFactory.createAnthropicProviderWithModel).toHaveBeenCalled();
      
      // Restore the original implementation for subsequent tests
      if (originalImpl) {
        createClaudeCodeProvider.mockImplementation(originalImpl);
      } else {
        createClaudeCodeProvider.mockReturnValue({
          createLanguageModel: vi.fn().mockReturnValue('claude-model'),
        });
      }
      
      consoleSpy.mockRestore();
    });

    it('should use Anthropic API directly when OAuth not available', async () => {
      mockProviderFactory.shouldUseClaudeCodeSDK.mockReturnValue(false);

      await handleChatRequest(mockRequest as NextRequest);

      expect(mockProviderFactory.createAnthropicProviderWithModel).toHaveBeenCalled();
    });
  });

  describe('streaming parameters', () => {
    beforeEach(() => {
      mockRequest.json = vi.fn();
    });

    it('should use default parameters when none specified', async () => {
      const { streamText } = await import('ai');
      mockRequest.json!.mockResolvedValue({
        messages: [{ role: 'user', content: 'Hello' }],
      });

      await handleChatRequest(mockRequest as NextRequest);

      expect(streamText).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.7,
          maxOutputTokens: 4096,
        })
      );
    });

    it('should use custom parameters when specified', async () => {
      const { streamText } = await import('ai');
      mockRequest.json!.mockResolvedValue({
        messages: [{ role: 'user', content: 'Hello' }],
        data: {
          temperature: 0.5,
          maxTokens: 2048,
        },
      });

      await handleChatRequest(mockRequest as NextRequest);

      expect(streamText).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.5,
          maxOutputTokens: 2048,
        })
      );
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      mockRequest.json = vi.fn().mockResolvedValue({
        messages: [{ role: 'user', content: 'Hello' }],
      });
    });

    it('should handle provider creation errors', async () => {
      // Mock console.error to suppress expected error logging
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      mockProviderFactory.createAnthropicProviderWithModel.mockImplementation(() => {
        throw new Error('Provider creation failed');
      });

      const response = await handleChatRequest(mockRequest as NextRequest);

      expect(response.status).toBe(500);
      const json = await response.json();
      expect(json.error).toBe('Provider creation failed');
      
      consoleSpy.mockRestore();
    });

    it('should handle streaming errors', async () => {
      // Mock console.error to suppress expected error logging
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      const { streamText } = await import('ai');
      streamText.mockImplementation(() => {
        throw new Error('Streaming failed');
      });

      const response = await handleChatRequest(mockRequest as NextRequest);

      expect(response.status).toBe(500);
      const json = await response.json();
      expect(json.error).toBe('Streaming failed');
      expect(json.details).toBeDefined();
      
      consoleSpy.mockRestore();
    });

    it('should handle JSON parsing errors', async () => {
      // Mock console.error to suppress expected error logging
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      mockRequest.json = vi.fn().mockRejectedValue(new Error('Invalid JSON'));

      const response = await handleChatRequest(mockRequest as NextRequest);

      expect(response.status).toBe(500);
      const json = await response.json();
      expect(json.error).toBe('Invalid JSON');
      
      consoleSpy.mockRestore();
    });

    it('should return streaming response when successful', async () => {
      const { streamText } = await import('ai');
      const expectedResponse = new Response('success stream');
      const mockResult = {
        toUIMessageStreamResponse: vi.fn().mockReturnValue(expectedResponse),
      };
      (streamText as any).mockReturnValue(mockResult);

      const response = await handleChatRequest(mockRequest as NextRequest);

      expect(response).toBe(expectedResponse);
      expect(mockResult.toUIMessageStreamResponse).toHaveBeenCalled();
    });
  });
});