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
          console.log('MCP client found, loading tools from connected servers...');
          
          // Initialize the MCP client manager
          const manager = new mcpModule.MCPClientManager({
            autoConnect: false,
            configDir: process.env.MCP_CONFIG_DIR,
          });
          
          await manager.initialize();
          
          // Get all connected servers
          const servers = manager.getAllServers();
          const connectedServers = servers.filter(server => 
            manager.isConnected(server.id) || server.status === 'active'
          );
          
          console.log(`Found ${connectedServers.length} MCP servers`);
          
          // Collect tools from all connected servers
          tools = {};
          
          for (const server of connectedServers) {
            try {
              // Connect to server if not already connected
              if (!manager.isConnected(server.id)) {
                console.log(`Connecting to MCP server: ${server.name}`);
                await manager.connect(server.id);
              }
              
              // Get tools from this server
              const serverTools = await manager.getTools(server.id);
              console.log(`Server ${server.name} has ${serverTools.length} tools`);
              
              // Convert MCP tools to AI SDK format
              for (const tool of serverTools) {
                const toolKey = `${server.name}_${tool.name}`.replace(/[^a-zA-Z0-9_]/g, '_');
                
                tools[toolKey] = {
                  description: tool.description || `Tool ${tool.name} from ${server.name}`,
                  parameters: tool.inputSchema || {
                    type: 'object',
                    properties: {},
                    required: []
                  },
                  execute: async (params: any) => {
                    try {
                      console.log(`Executing tool ${tool.name} on server ${server.name} with params:`, params);
                      const result = await manager.executeTool(server.id, tool.name, params);
                      return result.result || result;
                    } catch (error: any) {
                      console.error(`Error executing tool ${tool.name}:`, error);
                      return {
                        error: true,
                        message: error.message || 'Tool execution failed'
                      };
                    }
                  }
                };
              }
            } catch (error) {
              console.error(`Error loading tools from server ${server.name}:`, error);
            }
          }
          
          const toolCount = Object.keys(tools).length;
          if (toolCount > 0) {
            console.log(`Loaded ${toolCount} MCP tools from ${connectedServers.length} servers`);
          } else {
            console.log('No MCP tools available. Connect MCP servers to enable tool calling.');
            tools = undefined; // Don't pass empty tools object
          }
        }
      } catch (error) {
        console.log('MCP client not available or error loading tools:', error);
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
      // Use the same method as standard handler which supports tools
      const response = (result as any).toDataStreamResponse?.() || result.toTextStreamResponse();
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