import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChat } from '../src/hooks/use-chat';

// Mock the AI SDK's useChat hook
const createMockAIChat = () => ({
  messages: [],
  input: '',
  handleInputChange: vi.fn(),
  handleSubmit: vi.fn(),
  isLoading: false,
  error: null,
  stop: vi.fn(),
  setMessages: vi.fn(),
  sendMessage: vi.fn().mockResolvedValue('success'),
});

let mockAIChat = createMockAIChat();

vi.mock('@ai-sdk/react', () => ({
  useChat: vi.fn(() => mockAIChat),
}));

// Mock window for browser environment
Object.defineProperty(global, 'window', {
  value: {
    fetch: vi.fn(),
  },
  writable: true,
});

describe('useChat hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAIChat = createMockAIChat();
  });

  it('should initialize with default options', () => {
    const { result } = renderHook(() => useChat());

    expect(result.current).toMatchObject({
      messages: [],
      input: '',
      isLoading: false,
      error: null,
    });

    expect(typeof result.current.handleInputChange).toBe('function');
    expect(typeof result.current.handleSubmit).toBe('function');
    expect(typeof result.current.stop).toBe('function');
    expect(typeof result.current.setMessages).toBe('function');
  });

  it('should accept custom model option', () => {
    const customModel = 'claude-3-5-haiku-20241022';
    const { result } = renderHook(() => useChat({ model: customModel }));

    expect(result.current).toBeDefined();
  });

  it('should accept custom temperature and maxTokens', () => {
    const options = {
      temperature: 0.5,
      maxTokens: 2048,
    };

    const { result } = renderHook(() => useChat(options));
    expect(result.current).toBeDefined();
  });

  it('should handle MCP tools configuration', () => {
    const options = {
      showMCPTools: true,
      mcpServerFilter: ['server1', 'server2'],
    };

    const { result } = renderHook(() => useChat(options));
    expect(result.current).toBeDefined();
  });

  it('should handle project-specific configuration', () => {
    const options = {
      projectId: 'test-project',
      projectRoot: '/test/project',
      projectName: 'Test Project',
    };

    const { result } = renderHook(() => useChat(options));
    expect(result.current).toBeDefined();
  });

  describe('sendMessage override', () => {
    it('should return custom sendMessage function', () => {
      const { result } = renderHook(() => useChat());

      expect(typeof result.current.sendMessage).toBe('function');
      expect(result.current.sendMessage).not.toBe(mockAIChat.sendMessage);
    });

    it('should call getCurrentState when provided', async () => {
      const getCurrentState = vi.fn(() => ({
        model: 'dynamic-model',
        webSearch: true,
        mcpTools: false,
      }));

      const { result } = renderHook(() => useChat({
        getCurrentState,
      }));

      await act(async () => {
        await result.current.sendMessage('test message');
      });

      expect(getCurrentState).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      mockAIChat.sendMessage.mockRejectedValue(new Error('Send failed'));

      const { result } = renderHook(() => useChat());

      await expect(act(async () => {
        await result.current.sendMessage('test message');
      })).rejects.toThrow('Send failed');

      // Function should still be available after error
      expect(typeof result.current.sendMessage).toBe('function');
    });
  });


  describe('getMessageExtras', () => {
    it('should extract reasoning from tool invocations', () => {
      const { result } = renderHook(() => useChat());

      const message = {
        toolInvocations: [
          { toolName: 'reasoning', result: 'This is my reasoning' },
          { toolName: 'other_tool', result: 'Other result' },
        ],
      };

      const extras = result.current.getMessageExtras(message);

      expect(extras.reasoning).toBe('This is my reasoning');
    });

    it('should extract sources from web search tool invocations', () => {
      const { result } = renderHook(() => useChat());

      const message = {
        toolInvocations: [
          {
            toolName: 'web_search',
            result: [
              { title: 'First Result', url: 'https://example.com/1' },
              { title: 'Second Result', url: 'https://example.com/2' },
            ],
          },
        ],
      };

      const extras = result.current.getMessageExtras(message);

      expect(extras.sources).toHaveLength(2);
      expect(extras.sources[0]).toEqual({
        title: 'First Result',
        url: 'https://example.com/1',
      });
    });

    it('should handle missing tool invocations gracefully', () => {
      const { result } = renderHook(() => useChat());

      const message = {};

      const extras = result.current.getMessageExtras(message);

      expect(extras).toEqual({});
    });

    it('should handle web search results without title/url', () => {
      const { result } = renderHook(() => useChat());

      const message = {
        toolInvocations: [
          {
            toolName: 'web_search',
            result: [
              { title: 'With Title', url: 'https://example.com' },
              { data: 'incomplete result' },
            ],
          },
        ],
      };

      const extras = result.current.getMessageExtras(message);

      expect(extras.sources).toHaveLength(2);
      expect(extras.sources[1]).toEqual({
        title: 'Source',
        url: '#',
      });
    });

    it('should handle non-array web search results', () => {
      const { result } = renderHook(() => useChat());

      const message = {
        toolInvocations: [
          {
            toolName: 'web_search',
            result: 'not an array',
          },
        ],
      };

      const extras = result.current.getMessageExtras(message);

      expect(extras.sources).toBeUndefined();
    });
  });

  describe('getMessageContent', () => {
    it('should extract content from parts array', () => {
      const { result } = renderHook(() => useChat());

      const message = {
        parts: [
          { type: 'text', text: 'First part ' },
          { type: 'text', text: 'Second part' },
          { type: 'tool', data: 'should be ignored' },
        ],
      };

      const content = result.current.getMessageContent(message);

      expect(content).toBe('First part Second part');
    });

    it('should handle string parts in parts array', () => {
      const { result } = renderHook(() => useChat());

      const message = {
        parts: ['Direct string content', { type: 'text', text: ' and text part' }],
      };

      const content = result.current.getMessageContent(message);

      expect(content).toBe('Direct string content and text part');
    });

    it('should fallback to parts[0].text', () => {
      const { result } = renderHook(() => useChat());

      const message = {
        parts: [{ text: 'Fallback text' }],
      };

      const content = result.current.getMessageContent(message);

      expect(content).toBe('Fallback text');
    });

    it('should fallback to parts[0] as string', () => {
      const { result } = renderHook(() => useChat());

      const message = {
        parts: ['Direct string'],
      };

      const content = result.current.getMessageContent(message);

      expect(content).toBe('Direct string');
    });

    it('should use message.text property', () => {
      const { result } = renderHook(() => useChat());

      const message = {
        text: 'Simple text content',
      };

      const content = result.current.getMessageContent(message);

      expect(content).toBe('Simple text content');
    });

    it('should use message.content property', () => {
      const { result } = renderHook(() => useChat());

      const message = {
        content: 'Content property text',
      };

      const content = result.current.getMessageContent(message);

      expect(content).toBe('Content property text');
    });

    it('should extract from content array', () => {
      const { result } = renderHook(() => useChat());

      const message = {
        content: [
          { type: 'text', text: 'Array text 1' },
          { type: 'text', text: ' Array text 2' },
          { type: 'image', data: 'should be ignored' },
        ],
      };

      const content = result.current.getMessageContent(message);

      expect(content).toBe('Array text 1 Array text 2');
    });

    it('should return empty string for no content', () => {
      const { result } = renderHook(() => useChat());

      const message = {
        role: 'user',
      };

      const content = result.current.getMessageContent(message);

      expect(content).toBe('');
    });

    it('should handle parts with different states', () => {
      const { result } = renderHook(() => useChat());

      const message = {
        parts: [
          { type: 'text', text: 'Complete part', state: 'complete' },
          { type: 'text', text: 'Partial part', state: 'partial' },
          { type: 'text', text: 'No state part' },
        ],
      };

      const content = result.current.getMessageContent(message);

      expect(content).toBe('Complete partPartial partNo state part');
    });

    it('should handle null/undefined messages', () => {
      const { result } = renderHook(() => useChat());

      expect(result.current.getMessageContent(null)).toBe('');
      expect(result.current.getMessageContent(undefined)).toBe('');
    });

    it('should handle non-object messages', () => {
      const { result } = renderHook(() => useChat());

      expect(result.current.getMessageContent('string')).toBe('');
      expect(result.current.getMessageContent(123)).toBe('');
    });
  });

  describe('status property', () => {
    it('should return "streaming" when isLoading is true', () => {
      mockAIChat.isLoading = true;

      const { result } = renderHook(() => useChat());

      expect(result.current.status).toBe('streaming');

      // Reset for other tests
      mockAIChat.isLoading = false;
    });

    it('should return "ready" when not loading', () => {
      mockAIChat.isLoading = false;

      const { result } = renderHook(() => useChat());

      expect(result.current.status).toBe('ready');
    });
  });

  describe('callback handling', () => {
    it('should handle error callback', () => {
      const onError = vi.fn();
      
      const { result } = renderHook(() => useChat({ onError }));

      // Should initialize without calling onError
      expect(result.current).toBeDefined();
      expect(onError).not.toHaveBeenCalled();
    });

    it('should handle finish callback', () => {
      const onFinish = vi.fn();
      
      const { result } = renderHook(() => useChat({ onFinish }));

      // Should initialize without calling onFinish
      expect(result.current).toBeDefined();
      expect(onFinish).not.toHaveBeenCalled();
    });
  });

  describe('utility methods', () => {
    it('should include enhanced utility methods', () => {
      const { result } = renderHook(() => useChat());

      expect(typeof result.current.getMessageExtras).toBe('function');
      expect(typeof result.current.getMessageContent).toBe('function');
      expect(typeof result.current.status).toBe('string');
      expect(typeof result.current.sendMessage).toBe('function');
    });

    it('should preserve all base chat properties', () => {
      const { result } = renderHook(() => useChat());

      // Should include all properties from mockAIChat
      expect(result.current.messages).toBe(mockAIChat.messages);
      expect(result.current.input).toBe(mockAIChat.input);
      expect(result.current.handleInputChange).toBe(mockAIChat.handleInputChange);
      expect(result.current.handleSubmit).toBe(mockAIChat.handleSubmit);
      expect(result.current.isLoading).toBe(mockAIChat.isLoading);
      expect(result.current.error).toBe(mockAIChat.error);
      expect(result.current.stop).toBe(mockAIChat.stop);
      expect(result.current.setMessages).toBe(mockAIChat.setMessages);
    });
  });

  describe('edge cases', () => {
    it('should handle malformed message extras', () => {
      const { result } = renderHook(() => useChat());

      // Test extras with malformed data
      expect(result.current.getMessageExtras(null)).toEqual({});
      expect(result.current.getMessageExtras(undefined)).toEqual({});
      expect(result.current.getMessageExtras({})).toEqual({});
    });

    it('should handle complex message content structures', () => {
      const { result } = renderHook(() => useChat());

      const complexMessage = {
        parts: [
          {
            type: 'text',
            text: 'Part 1',
            metadata: { state: 'complete' }
          },
          'String part',
          {
            type: 'tool',
            data: 'Should be ignored'
          },
          {
            type: 'text',
            text: 'Part 2'
          }
        ]
      };

      const content = result.current.getMessageContent(complexMessage);
      expect(content).toBe('Part 1String partPart 2');
    });

    it('should handle empty or missing tool invocations', () => {
      const { result } = renderHook(() => useChat());

      const messageWithEmptyTools = {
        toolInvocations: []
      };

      const extras1 = result.current.getMessageExtras(messageWithEmptyTools);
      expect(extras1).toEqual({});

      const messageWithNullTools = {
        toolInvocations: null
      };

      const extras2 = result.current.getMessageExtras(messageWithNullTools);
      expect(extras2).toEqual({});
    });

    it('should handle parts with falsy text values', () => {
      const { result } = renderHook(() => useChat());

      const messageWithFalsyText = {
        parts: [
          { type: 'text', text: '' },
          { type: 'text', text: null },
          { type: 'text', text: undefined },
          { type: 'text' }, // Missing text property
        ]
      };

      const content = result.current.getMessageContent(messageWithFalsyText);
      expect(content).toBe('');
    });

    it('should handle mixed content types in parts array', () => {
      const { result } = renderHook(() => useChat());

      const messageWithMixedContent = {
        parts: [
          { type: 'image', data: 'image-data' },
          { type: 'text', text: 'Valid text' },
          { type: 'unknown', content: 'unknown content' },
          42 // Non-string, non-object part
        ]
      };

      const content = result.current.getMessageContent(messageWithMixedContent);
      expect(content).toBe('Valid text');
    });

    it('should handle parts array with only non-text parts', () => {
      const { result } = renderHook(() => useChat());

      const messageWithOnlyNonText = {
        parts: [
          { type: 'image', data: 'image-data' },
          { type: 'tool', result: 'tool-result' },
          { type: 'metadata', info: 'meta-info' }
        ]
      };

      const content = result.current.getMessageContent(messageWithOnlyNonText);
      expect(content).toBe('');
    });

    it('should handle message with array content but non-text parts', () => {
      const { result } = renderHook(() => useChat());

      const messageWithNonTextContent = {
        content: [
          { type: 'image', data: 'image-data' },
          { type: 'tool', result: 'tool-result' },
          { type: 'unknown', value: 'unknown' }
        ]
      };

      const content = result.current.getMessageContent(messageWithNonTextContent);
      expect(content).toBe('');
    });

    it('should handle message extras with malformed tool invocations', () => {
      const { result } = renderHook(() => useChat());

      const messageWithMalformedTools = {
        toolInvocations: [
          'string-instead-of-object',
          { /* missing toolName */ result: 'result' },
          { toolName: 'reasoning' /* missing result */ }
        ]
      };

      const extras = result.current.getMessageExtras(messageWithMalformedTools);
      expect(extras).toEqual({});
    });

    it('should handle sendMessage with different error types', async () => {
      const onError = vi.fn();
      const { result } = renderHook(() => useChat({ onError }));

      // Test with non-Error object
      mockAIChat.sendMessage.mockRejectedValue('string error');

      await expect(act(async () => {
        await result.current.sendMessage('test message');
      })).rejects.toBe('string error');

      // Test with custom error object
      const customError = { message: 'Custom error', code: 500 };
      mockAIChat.sendMessage.mockRejectedValue(customError);

      await expect(act(async () => {
        await result.current.sendMessage('test message');
      })).rejects.toBe(customError);
    });

    it('should handle window fetch restoration edge cases', async () => {
      const { result } = renderHook(() => useChat());
      
      // Mock window.fetch being undefined
      const originalFetch = global.fetch;
      const originalWindow = global.window;
      
      // @ts-ignore - Testing edge case
      global.window = { fetch: undefined };
      
      try {
        await act(async () => {
          await result.current.sendMessage('test message');
        });
      } catch (error) {
        // Expected to fail, but should not crash
      }
      
      // Restore
      global.fetch = originalFetch;
      global.window = originalWindow;
    });
  });
});