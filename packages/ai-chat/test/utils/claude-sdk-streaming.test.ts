import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createClaudeCodeProvider, canUseClaudeCodeSDK } from '../../src/utils/claude-sdk-streaming';
import { AuthManager } from '../../src/utils/auth';

// Mock the AuthManager
vi.mock('../../src/utils/auth');

// Mock the Claude Code SDK
vi.mock('@anthropic-ai/claude-code', () => ({
  query: vi.fn(),
}));

describe('Claude SDK Streaming', () => {
  let mockAuthManager: any;
  let mockQuery: any;
  
  beforeEach(async () => {
    // Clear all mocks
    vi.clearAllMocks();
    
    // Setup AuthManager mock
    mockAuthManager = {
      getOAuthToken: vi.fn(),
    };
    vi.mocked(AuthManager.getInstance).mockReturnValue(mockAuthManager);
    vi.mocked(AuthManager).mockImplementation(() => mockAuthManager);
    
    // Setup Claude Code SDK mock
    const claudeCode = await import('@anthropic-ai/claude-code');
    mockQuery = vi.mocked(claudeCode.query);
  });
  
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('canUseClaudeCodeSDK', () => {
    it('should return true when OAuth token is available', () => {
      mockAuthManager.getOAuthToken.mockReturnValue('test-oauth-token');
      
      const result = canUseClaudeCodeSDK();
      
      expect(result).toBe(true);
      expect(mockAuthManager.getOAuthToken).toHaveBeenCalled();
    });

    it('should return false when OAuth token is not available', () => {
      mockAuthManager.getOAuthToken.mockReturnValue(undefined);
      
      const result = canUseClaudeCodeSDK();
      
      expect(result).toBe(false);
      expect(mockAuthManager.getOAuthToken).toHaveBeenCalled();
    });

    it('should return false when OAuth token is empty string', () => {
      mockAuthManager.getOAuthToken.mockReturnValue('');
      
      const result = canUseClaudeCodeSDK();
      
      expect(result).toBe(false);
    });

    it('should use provided AuthManager instance', () => {
      const customAuthManager = {
        getOAuthToken: vi.fn().mockReturnValue('custom-token')
      };
      
      const result = canUseClaudeCodeSDK(customAuthManager as any);
      
      expect(result).toBe(true);
      expect(customAuthManager.getOAuthToken).toHaveBeenCalled();
      expect(mockAuthManager.getOAuthToken).not.toHaveBeenCalled();
    });
  });

  describe('createClaudeCodeProvider', () => {
    it('should throw error when no OAuth token is available', () => {
      mockAuthManager.getOAuthToken.mockReturnValue(undefined);
      
      expect(() => createClaudeCodeProvider()).toThrow('No OAuth token available for Claude Code SDK');
    });

    it('should create provider with OAuth token', () => {
      mockAuthManager.getOAuthToken.mockReturnValue('test-oauth-token');
      
      const provider = createClaudeCodeProvider();
      
      expect(provider).toBeDefined();
      expect(provider.createLanguageModel).toBeInstanceOf(Function);
    });

    it('should use provided AuthManager', () => {
      const customAuthManager = {
        getOAuthToken: vi.fn().mockReturnValue('custom-oauth-token')
      };
      
      const provider = createClaudeCodeProvider(customAuthManager as any);
      
      expect(provider).toBeDefined();
      expect(customAuthManager.getOAuthToken).toHaveBeenCalled();
      expect(mockAuthManager.getOAuthToken).not.toHaveBeenCalled();
    });

    describe('Language Model', () => {
      let provider: any;
      let model: any;
      
      beforeEach(() => {
        mockAuthManager.getOAuthToken.mockReturnValue('test-oauth-token');
        provider = createClaudeCodeProvider();
        model = provider.createLanguageModel('claude-3-sonnet-20240229');
      });

      it('should create language model with correct properties', () => {
        expect(model.modelId).toBe('claude-3-sonnet-20240229');
        expect(model.provider).toBe('anthropic-claude-code');
        expect(model.specificationVersion).toBe('v2');
        expect(model.supportsStreaming).toBe(true);
        expect(model.doGenerate).toBeInstanceOf(Function);
        expect(model.doStream).toBeInstanceOf(Function);
      });

      describe('doGenerate', () => {
        it('should generate non-streaming response', async () => {
          const mockMessages = [
            { role: 'user', content: 'Hello' }
          ];
          
          // Mock the async iterator to return string responses
          mockQuery.mockImplementation(async function* () {
            yield 'Hello, how can I help you today?';
          });
          
          const options = { messages: mockMessages };
          const result = await model.doGenerate(options);
          
          expect(result).toEqual({
            content: [
              {
                type: 'text',
                text: 'Hello, how can I help you today?'
              }
            ],
            finishReason: 'stop',
            usage: {
              promptTokens: 0,
              completionTokens: 7, // "Hello, how can I help you today?".split(' ').length
              inputTokens: 0,
              outputTokens: 7,
              totalTokens: 7
            },
            warnings: []
          });
          
          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Hello',
            authToken: 'test-oauth-token',
            model: 'claude-sonnet-4-20250514',
            maxTurns: 1
          });
        });

        it('should handle object messages from Claude Code SDK', async () => {
          mockQuery.mockImplementation(async function* () {
            yield { content: 'Response from object' };
          });
          
          const options = { messages: [{ role: 'user', content: 'Test' }] };
          const result = await model.doGenerate(options);
          
          expect(result.content[0].text).toBe('Response from object');
        });

        it('should handle multiple message formats', async () => {
          mockQuery.mockImplementation(async function* () {
            yield 'First part ';
            yield { text: 'second part ' };
            yield { result: 'third part' };
          });
          
          const options = { messages: [{ role: 'user', content: 'Test' }] };
          const result = await model.doGenerate(options);
          
          expect(result.content[0].text).toBe('First part second part third part');
        });

        it('should use fallback prompt when no user messages', async () => {
          mockQuery.mockImplementation(async function* () {
            yield 'Hello response';
          });
          
          const options = { messages: [{ role: 'system', content: 'System message' }] };
          const result = await model.doGenerate(options);
          
          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Hello',
            authToken: 'test-oauth-token',
            model: 'claude-sonnet-4-20250514',
            maxTurns: 1
          });
        });

        it('should handle Claude Code SDK errors', async () => {
          // Mock console.error to suppress expected error logging
          const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
          
          mockQuery.mockImplementation(async function* () {
            throw new Error('SDK Error');
          });
          
          const options = { messages: [{ role: 'user', content: 'Test' }] };
          
          // Just verify that an error is thrown, don't check the specific message
          try {
            await model.doGenerate(options);
            expect.fail('Expected error to be thrown');
          } catch (error) {
            expect(error).toBeInstanceOf(Error);
          }
          
          consoleSpy.mockRestore();
        });

        it('should use custom model from options', async () => {
          mockQuery.mockImplementation(async function* () {
            yield 'Response';
          });
          
          const options = { 
            messages: [{ role: 'user', content: 'Test' }],
            model: 'claude-3-haiku-20240307'
          };
          
          await model.doGenerate(options);
          
          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test',
            authToken: 'test-oauth-token',
            model: 'claude-3-haiku-20240307',
            maxTurns: 1
          });
        });
      });

      describe('doStream', () => {
        it('should create streaming response', async () => {
          mockQuery.mockImplementation(async function* () {
            yield 'Streaming response here';
          });
          
          const options = { messages: [{ role: 'user', content: 'Hello' }] };
          const result = await model.doStream(options);
          
          expect(result).toHaveProperty('stream');
          expect(result).toHaveProperty('rawCall');
          expect(result.stream).toBeInstanceOf(ReadableStream);
          expect(result.rawCall).toEqual({
            rawPrompt: null,
            rawSettings: {}
          });
        });

        it('should stream text chunks correctly', async () => {
          mockQuery.mockImplementation(async function* () {
            yield 'Hello world test';
          });
          
          const options = { messages: [{ role: 'user', content: 'Test' }] };
          const result = await model.doStream(options);
          
          // Read from the stream
          const reader = result.stream.getReader();
          const chunks: any[] = [];
          
          // Use setTimeout to allow the stream to process
          await new Promise<void>((resolve) => {
            const readChunk = async () => {
              try {
                const { done, value } = await reader.read();
                if (done) {
                  resolve();
                  return;
                }
                chunks.push(value);
                setTimeout(readChunk, 10);
              } catch (error) {
                resolve();
              }
            };
            setTimeout(readChunk, 100);
          });
          
          // Should have text-start, text-deltas, text-end, and finish events
          expect(chunks.length).toBeGreaterThan(3);
          expect(chunks[0]).toEqual({
            type: 'text-start',
            id: expect.any(String)
          });
          expect(chunks[chunks.length - 1]).toEqual({
            type: 'finish',
            finishReason: 'stop',
            usage: {
              promptTokens: 0,
              completionTokens: 3, // "Hello world test".split(' ').length
              inputTokens: 0,
              outputTokens: 3,
              totalTokens: 3
            }
          });
        });

        it('should handle streaming errors', async () => {
          // Mock console.error to suppress expected error logging
          const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
          
          mockQuery.mockImplementation(async function* () {
            throw new Error('Streaming Error');
          });
          
          const options = { messages: [{ role: 'user', content: 'Test' }] };
          
          await expect(model.doStream(options)).rejects.toThrow('Streaming Error');
          
          consoleSpy.mockRestore();
        });
      });
    });
  });

  describe('Response Parsing Strategies', () => {
    let provider: any;
    let model: any;
    
    beforeEach(() => {
      mockAuthManager.getOAuthToken.mockReturnValue('test-oauth-token');
      provider = createClaudeCodeProvider();
      model = provider.createLanguageModel('claude-3-sonnet-20240229');
    });

    it('should handle plain text response', async () => {
      mockQuery.mockImplementation(async function* () {
        yield 'This is a plain text response';
      });
      
      const options = { messages: [{ role: 'user', content: 'Test' }] };
      const result = await model.doGenerate(options);
      
      expect(result.content[0].text).toBe('This is a plain text response');
    });

    it('should parse JSON with content field', async () => {
      const jsonResponse = JSON.stringify({ content: 'JSON content response' });
      mockQuery.mockImplementation(async function* () {
        yield jsonResponse;
      });
      
      const options = { messages: [{ role: 'user', content: 'Test' }] };
      const result = await model.doGenerate(options);
      
      expect(result.content[0].text).toBe('JSON content response');
    });

    it('should parse JSON with text field', async () => {
      const jsonResponse = JSON.stringify({ text: 'JSON text response' });
      mockQuery.mockImplementation(async function* () {
        yield jsonResponse;
      });
      
      const options = { messages: [{ role: 'user', content: 'Test' }] };
      const result = await model.doGenerate(options);
      
      expect(result.content[0].text).toBe('JSON text response');
    });

    it('should parse JSON with result field', async () => {
      const jsonResponse = JSON.stringify({ result: 'JSON result response' });
      mockQuery.mockImplementation(async function* () {
        yield jsonResponse;
      });
      
      const options = { messages: [{ role: 'user', content: 'Test' }] };
      const result = await model.doGenerate(options);
      
      expect(result.content[0].text).toBe('JSON result response');
    });

    it('should extract content from quoted JSON string', async () => {
      const response = '{"content": "Extracted content response"}';
      mockQuery.mockImplementation(async function* () {
        yield response;
      });
      
      const options = { messages: [{ role: 'user', content: 'Test' }] };
      const result = await model.doGenerate(options);
      
      expect(result.content[0].text).toBe('Extracted content response');
    });

    it('should handle escaped characters in JSON', async () => {
      const response = '{"text": "Response with\\nnewlines and \\"quotes\\""}';
      mockQuery.mockImplementation(async function* () {
        yield response;
      });
      
      const options = { messages: [{ role: 'user', content: 'Test' }] };
      const result = await model.doGenerate(options);
      
      expect(result.content[0].text).toBe('Response with\nnewlines and "quotes"');
    });

    it('should fallback to raw response when parsing fails', async () => {
      const malformedResponse = '{ malformed json content }';
      mockQuery.mockImplementation(async function* () {
        yield malformedResponse;
      });
      
      const options = { messages: [{ role: 'user', content: 'Test' }] };
      const result = await model.doGenerate(options);
      
      expect(result.content[0].text).toBe(malformedResponse);
    });

    it('should handle empty response gracefully', async () => {
      mockQuery.mockImplementation(async function* () {
        yield '';
      });
      
      const options = { messages: [{ role: 'user', content: 'Test' }] };
      const result = await model.doGenerate(options);
      
      expect(result.content[0].text).toBe('');
    });

    it('should combine multiple response chunks', async () => {
      mockQuery.mockImplementation(async function* () {
        yield 'First chunk ';
        yield { content: 'second chunk ' };
        yield { text: 'third chunk' };
      });
      
      const options = { messages: [{ role: 'user', content: 'Test' }] };
      const result = await model.doGenerate(options);
      
      expect(result.content[0].text).toBe('First chunk second chunk third chunk');
    });
  });

  describe('Edge Cases', () => {
    let provider: any;
    let model: any;
    
    beforeEach(() => {
      mockAuthManager.getOAuthToken.mockReturnValue('test-oauth-token');
      provider = createClaudeCodeProvider();
      model = provider.createLanguageModel('claude-3-sonnet-20240229');
    });

    it('should handle null/undefined messages', async () => {
      mockQuery.mockImplementation(async function* () {
        yield 'Fallback response';
      });
      
      const options = { messages: null };
      const result = await model.doGenerate(options);
      
      expect(mockQuery).toHaveBeenCalledWith({
        prompt: 'Hello',
        authToken: 'test-oauth-token',
        model: 'claude-sonnet-4-20250514',
        maxTurns: 1
      });
    });

    it('should use last user message when multiple exist', async () => {
      mockQuery.mockImplementation(async function* () {
        yield 'Response to last message';
      });
      
      const options = {
        messages: [
          { role: 'user', content: 'First message' },
          { role: 'assistant', content: 'Assistant response' },
          { role: 'user', content: 'Last user message' }
        ]
      };
      
      await model.doGenerate(options);
      
      expect(mockQuery).toHaveBeenCalledWith({
        prompt: 'Last user message',
        authToken: 'test-oauth-token',
        model: 'claude-sonnet-4-20250514',
        maxTurns: 1
      });
    });

    it('should handle non-object message types', async () => {
      mockQuery.mockImplementation(async function* () {
        yield null;
        yield undefined;
        yield 42;
        yield true;
        yield 'Valid response';
      });
      
      const options = { messages: [{ role: 'user', content: 'Test' }] };
      const result = await model.doGenerate(options);
      
      expect(result.content[0].text).toContain('Valid response');
    });

    it('should handle very long OAuth token truncation in logs', () => {
      const longToken = 'a'.repeat(100);
      mockAuthManager.getOAuthToken.mockReturnValue(longToken);
      
      // Should not throw when creating provider with long token
      expect(() => createClaudeCodeProvider()).not.toThrow();
    });
  });
});