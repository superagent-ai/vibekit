import { useChat as useAIChat } from '@ai-sdk/react';

export interface ChatOptions {
  /** AI model to use (defaults to claude-sonnet-4-20250514) */
  model?: string;
  /** Temperature for response generation (0-1, defaults to 0.7) */
  temperature?: number;
  /** Maximum tokens in response (defaults to 4096) */
  maxTokens?: number;
  /** Enable MCP tools (defaults to false) */
  showMCPTools?: boolean;
  /** Enable web search (defaults to false) */
  webSearch?: boolean;
  /** Error handler callback */
  onError?: (error: Error) => void;
  /** Completion handler callback */
  onFinish?: (message: any) => void;
  /** Custom API endpoint (defaults to /api/chat) */
  apiEndpoint?: string;
}

export interface MessageExtras {
  reasoning?: string;
  sources?: Array<{ title: string; url: string }>;
}

/**
 * Custom hook for AI chat functionality
 * Wraps the AI SDK's useChat with additional features
 * @param options - Chat configuration options
 * @returns Enhanced chat interface with utility methods
 */
export function useChat(options: ChatOptions = {}) {
  const {
    model = 'claude-sonnet-4-20250514',
    temperature = 0.7,
    maxTokens = 4096,
    showMCPTools = false,
    webSearch = false,
    onError,
    onFinish,
    apiEndpoint = '/api/chat',
  } = options;

  const chat = useAIChat({
    api: apiEndpoint,
    maxSteps: showMCPTools ? 10 : 5, // Allow more steps when using tools
    headers: {
      'Content-Type': 'application/json',
    },
    body: {
      model,
      temperature,
      maxTokens,
      showMCPTools,
      webSearch,
    },
    onError: (error: any) => {
      console.error('Chat error:', error);
      onError?.(error);
    },
    onFinish: (message: any) => {
      console.log('Message completed:', message);
      onFinish?.(message);
    },
  } as any);
  
  // Debug what methods are available
  console.log('useChat returned:', Object.keys(chat));

  // Parse message extras (reasoning, sources)
  const getMessageExtras = (message: any): MessageExtras => {
    const extras: MessageExtras = {};
    
    // Check for reasoning in tool invocations or metadata
    if (message.toolInvocations?.some((t: any) => t.toolName === 'reasoning')) {
      extras.reasoning = message.toolInvocations.find((t: any) => t.toolName === 'reasoning')?.result;
    }
    
    // Check for sources
    if (message.toolInvocations?.some((t: any) => t.toolName === 'web_search')) {
      const searchResults = message.toolInvocations.find((t: any) => t.toolName === 'web_search')?.result;
      if (searchResults && Array.isArray(searchResults)) {
        extras.sources = searchResults.map((r: any) => ({
          title: r.title || 'Source',
          url: r.url || '#',
        }));
      }
    }
    
    return extras;
  };

  // Get message content as string
  const getMessageContent = (message: any): string => {
    const msg = message;
    
    // Handle parts array (assistant messages from streaming)
    if (Array.isArray(msg.parts)) {
      const textContent = msg.parts
        .filter((part: any) => part.type === 'text' || typeof part === 'string')
        .map((part: any) => {
          if (typeof part === 'string') return part;
          if (part.type === 'text' && part.text) return part.text;
          return '';
        })
        .join('');
      if (textContent) return textContent;
    }
    
    // Handle different content types
    if (typeof msg.parts?.[0]?.text === 'string') {
      return msg.parts[0].text;
    }
    if (typeof msg.parts?.[0] === 'string') {
      return msg.parts[0];
    }
    if (typeof msg.text === 'string') {
      return msg.text;
    }
    if (typeof msg.content === 'string') {
      return msg.content;
    }
    
    // Check if content is an array of text parts
    if (Array.isArray(msg.content)) {
      const textParts = msg.content
        .filter((part: any) => part.type === 'text')
        .map((part: any) => part.text)
        .join('');
      if (textParts) return textParts;
    }
    
    return '';
  };

  // Add custom status property
  const status = (chat as any).isLoading ? 'streaming' : 'ready';
  
  return {
    ...chat,
    status,
    getMessageExtras,
    getMessageContent,
  };
}