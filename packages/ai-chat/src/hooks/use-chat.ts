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
  /** Function to get current state (for handling state updates) */
  getCurrentState?: () => { model: string; webSearch: boolean; mcpTools: boolean };
  /** Project ID for project-specific chat */
  projectId?: string;
  /** Project root directory for MCP tool configuration */
  projectRoot?: string;
  /** Project name for display */
  projectName?: string;
  /** Filter for MCP servers - only these server IDs will be enabled */
  mcpServerFilter?: string[];
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
    showMCPTools = true, // Enable MCP tools by default
    webSearch = false,
    onError,
    onFinish,
    apiEndpoint = '/api/chat',
    getCurrentState,
    projectId,
    projectRoot,
    projectName,
    mcpServerFilter,
  } = options;


  // The AI SDK sends the body directly with the messages in a POST request
  // We'll use a workaround - override the sendMessage function
  const baseChat = useAIChat({
    api: apiEndpoint,
    maxSteps: 10, // Allow multiple steps for tools
    headers: {
      'Content-Type': 'application/json',
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
  
  // Override sendMessage to include our custom data
  const originalSendMessage = baseChat.sendMessage;
  
  // Create a wrapper that intercepts the internal fetch
  const originalFetch = typeof window !== 'undefined' ? window.fetch.bind(window) : fetch;
  
  const chat = {
    ...baseChat,
    sendMessage: async (message: any) => {
      // Get current state values
      const currentState = getCurrentState ? getCurrentState() : { 
        model, 
        webSearch, 
        mcpTools: showMCPTools 
      };
      
      
      // Temporarily override fetch to inject our custom data
      const tempFetch = (url: string, options: any) => {
        if (url === apiEndpoint || url.includes('/api/chat')) {
          const body = JSON.parse(options.body || '{}');
          const modifiedBody = {
            ...body,
            showMCPTools: currentState.mcpTools,
            webSearch: currentState.webSearch,
            model: currentState.model,
            temperature,
            maxTokens,
            projectId,
            projectRoot,
            projectName,
            mcpServerFilter,
          };
          
          return originalFetch(url, {
            ...options,
            body: JSON.stringify(modifiedBody),
          });
        }
        return originalFetch(url, options);
      };
      
      // Temporarily replace fetch
      if (typeof window !== 'undefined') {
        (window as any).fetch = tempFetch;
      }
      
      try {
        // Call the original sendMessage which will use our modified fetch
        const result = await originalSendMessage(message);
        
        // Restore original fetch
        if (typeof window !== 'undefined') {
          (window as any).fetch = originalFetch;
        }
        
        return result;
      } catch (error) {
        // Always restore fetch even on error
        if (typeof window !== 'undefined') {
          (window as any).fetch = originalFetch;
        }
        
        throw error;
      }
    }
  };
  

  // Parse message extras (reasoning, sources)
  const getMessageExtras = (message: any): MessageExtras => {
    const extras: MessageExtras = {};
    
    // Handle null/undefined messages
    if (!message || typeof message !== 'object') {
      return extras;
    }
    
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
    // Handle null/undefined messages
    if (!message || typeof message !== 'object') {
      return '';
    }
    
    const msg = message;
    
    
    // Handle parts array (assistant messages from streaming)
    if (Array.isArray(msg.parts)) {
      
      const textContent = msg.parts
        .filter((part: any) => {
          // Accept text parts regardless of state, or string parts
          const isTextPart = part.type === 'text' || typeof part === 'string';
          return isTextPart;
        })
        .map((part: any) => {
          if (typeof part === 'string') return part;
          if (part.type === 'text' && part.text) {
            return part.text;
          }
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