import { streamText } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { AuthManager } from '../utils/auth';
import type { NextRequest } from 'next/server';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  parts?: Array<{ type: string; text?: string }>;
}

interface ChatRequestBody {
  messages: ChatMessage[];
  data?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    showMCPTools?: boolean;
    webSearch?: boolean;
  };
}

/**
 * Handles chat requests with optional MCP tool support
 * @param req - Next.js request object
 * @returns Streaming response or error response
 */
export async function handleChatRequestWithMCP(req: NextRequest): Promise<Response> {
  try {
    // Parse and validate request
    const body = await req.json() as ChatRequestBody;
    const { messages, data } = body;
    
    if (!messages || messages.length === 0) {
      return new Response('Messages are required', { status: 400 });
    }

    // Get model from data or use default
    const model = data?.model || 'claude-sonnet-4-20250514';
    const showMCPTools = data?.showMCPTools ?? false;
    
    // Get auth manager instance
    const authManager = AuthManager.getInstance();
    const apiKey = authManager.getApiKey();
    
    if (!apiKey) {
      const errorMessage = authManager.getErrorMessage();
      console.error('Chat API: Auth error:', errorMessage);
      return new Response(
        JSON.stringify({ 
          error: errorMessage || 'API key not configured'
        }),
        { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    // Create Anthropic client
    const anthropic = createAnthropic({
      apiKey,
    });
    
    // Convert messages to the format expected by the AI SDK
    const formattedMessages = messages.map((msg: ChatMessage) => {
      // For assistant messages with parts array, extract the text content
      if (msg.role === 'assistant' && Array.isArray(msg.parts)) {
        const textContent = msg.parts
          .filter((part: any) => part.type === 'text')
          .map((part: any) => part.text || '')
          .join('');
        return {
          role: 'assistant' as const,
          content: textContent || ''
        };
      }
      
      // For user messages, ensure content is a string
      if (msg.role === 'user') {
        return {
          role: 'user' as const,
          content: typeof msg.content === 'string' ? msg.content : ''
        };
      }
      
      // System messages
      if (msg.role === 'system') {
        return {
          role: 'system' as const,
          content: msg.content || ''
        };
      }
      
      // Default to assistant
      return {
        role: 'assistant' as const,
        content: msg.content || ''
      };
    });
    
    // Initialize MCP tools if enabled
    let tools: any = undefined;
    if (showMCPTools) {
      console.log('MCP tools enabled, checking for MCP client...');
      
      try {
        // Try to import and use MCP client if available
        const mcpModule = await import('@vibe-kit/mcp-client');
        if (mcpModule && mcpModule.MCPClientManager) {
          console.log('MCP client found, initializing tools...');
          
          // Create a simple tool for demonstration
          // In production, you would dynamically load tools from connected MCP servers
          tools = {
            // Example MCP tool - this would be dynamically generated from MCP servers
            mcp_example: {
              description: 'Example MCP tool (placeholder)',
              parameters: {
                type: 'object',
                properties: {
                  query: { type: 'string', description: 'Query to process' }
                },
                required: ['query']
              },
              execute: async ({ query }: { query: string }) => {
                return { 
                  result: `MCP tool executed with query: ${query}`,
                  note: 'This is a placeholder. Connect MCP servers to get real tools.'
                };
              }
            }
          };
          
          console.log('MCP tools initialized (placeholder mode)');
        }
      } catch (error) {
        console.log('MCP client not available:', error);
      }
    }
    
    // Stream the response with optional tools
    try {
      const streamConfig: any = {
        model: anthropic(model),
        messages: formattedMessages,
        temperature: data?.temperature || 0.7,
        maxOutputTokens: data?.maxTokens || 4096,
      };
      
      // Only add tools if we have any
      if (tools && Object.keys(tools).length > 0) {
        streamConfig.tools = tools;
        streamConfig.maxSteps = 10; // Allow multiple tool calls
        console.log('Streaming with MCP tools enabled');
      }
      
      const result = streamText(streamConfig);

      // Return the streaming response
      const response = result.toTextStreamResponse();
      return response;
    } catch (innerError: any) {
      console.error('Chat API: Streaming error:', innerError);
      console.error('Chat API: Error stack:', innerError?.stack);
      throw innerError;
    }
  } catch (error: any) {
    console.error('Chat API error:', error);
    console.error('Error stack:', error?.stack);
    
    // Return error as JSON for better debugging
    return new Response(
      JSON.stringify({ 
        error: error?.message || 'Internal server error',
        details: error?.stack
      }),
      { 
        status: 500, 
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

// Also export the original handler for backward compatibility
export { handleChatRequest } from './chat-handler';