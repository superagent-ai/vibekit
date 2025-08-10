import { streamText, tool } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
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
    // Get query parameters
    const { searchParams } = new URL(req.url);
    const queryShowMCPTools = searchParams.get('showMCPTools') === 'true';
    const queryModel = searchParams.get('model');
    const queryTemperature = searchParams.get('temperature');
    const queryMaxTokens = searchParams.get('maxTokens');
    
    // Parse and validate request
    const body = await req.json() as ChatRequestBody;
    const { messages, data } = body;
    
    if (!messages || messages.length === 0) {
      return new Response('Messages are required', { status: 400 });
    }

    // Get config from query params first, then body/data
    const model = queryModel || (body as any).model || data?.model || 'claude-sonnet-4-20250514';
    const showMCPTools = queryShowMCPTools || (body as any).showMCPTools || data?.showMCPTools || false;
    const temperature = queryTemperature ? parseFloat(queryTemperature) : (data?.temperature || 0.7);
    const maxTokens = queryMaxTokens ? parseInt(queryMaxTokens) : (data?.maxTokens || 4096);
    
    console.log('[MCP HANDLER] Config:', {
      model,
      showMCPTools,
      temperature,
      maxTokens,
      fromQuery: {
        showMCPTools: queryShowMCPTools,
        model: queryModel,
      },
      bodyKeys: Object.keys(body),
      hasData: !!data
    });
    
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
      console.log('[MCP DEBUG] MCP tools enabled, checking for MCP client...');
      console.log('[MCP DEBUG] MCP_CONFIG_DIR:', process.env.MCP_CONFIG_DIR);
      
      try {
        // Try to import and use MCP client if available
        const mcpModule = await import('@vibe-kit/mcp-client');
        if (mcpModule && mcpModule.MCPClientManager) {
          console.log('[MCP DEBUG] MCP client found, loading tools from connected servers...');
          
          // Initialize the MCP client manager and manually add servers from config
          const path = await import('path');
          const os = await import('os');
          const fs = await import('fs');
          
          const manager = new mcpModule.MCPClientManager({
            autoConnect: false,
            configDir: path.join(os.homedir(), '.vibekit'),
          });
          
          console.log('[MCP DEBUG] Initializing MCP manager...');
          await manager.initialize();
          
          // Load and add servers directly from mcp-servers.json
          const mcpConfigPath = path.join(os.homedir(), '.vibekit', 'mcp-servers.json');
          const addedServers = [];
          
          try {
            if (fs.existsSync(mcpConfigPath)) {
              const configData = fs.readFileSync(mcpConfigPath, 'utf-8');
              const config = JSON.parse(configData);
              console.log('[MCP DEBUG] Loading config:', config);
              
              if (config.mcpServers) {
                for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
                  try {
                    const configData = serverConfig as any;
                    console.log(`[MCP DEBUG] Adding server: ${name}`, configData);
                    
                    const server = await manager.addServer({
                      name,
                      transport: 'stdio',
                      config: {
                        command: configData.command,
                        args: configData.args || [],
                        env: configData.env || {},
                      },
                    });
                    
                    console.log(`[MCP DEBUG] Added server ${name} with ID: ${server.id}`);
                    addedServers.push(server);
                  } catch (error) {
                    console.error(`[MCP DEBUG] Failed to add server ${name}:`, error);
                  }
                }
              }
            } else {
              console.log('[MCP DEBUG] No config file found at:', mcpConfigPath);
            }
          } catch (error) {
            console.error('[MCP DEBUG] Error loading config:', error);
          }
          
          // Connect to all added servers
          for (const server of addedServers) {
            try {
              console.log(`[MCP DEBUG] Connecting to server: ${server.name} (${server.id})`);
              await manager.connect(server.id);
              console.log(`[MCP DEBUG] Successfully connected to: ${server.name}`);
            } catch (error) {
              console.error(`[MCP DEBUG] Failed to connect to server ${server.name}:`, error);
            }
          }
          
          // Get all connected servers
          const connectedServers = addedServers.filter(server => 
            manager.isConnected(server.id)
          );
          
          console.log(`[MCP DEBUG] Found ${connectedServers.length} connected MCP servers:`, 
            connectedServers.map(s => ({ id: s.id, name: s.name, status: s.status })));
          
          console.log(`[MCP DEBUG] Found ${connectedServers.length} MCP servers (connected or active)`);
          
          // Collect tools from all connected servers
          tools = {};
          
          for (const server of connectedServers) {
            try {
              // Connect to server if not already connected
              if (!manager.isConnected(server.id)) {
                console.log(`[MCP DEBUG] Connecting to MCP server: ${server.name} (id: ${server.id})`);
                await manager.connect(server.id);
                console.log(`[MCP DEBUG] Successfully connected to: ${server.name}`);
              } else {
                console.log(`[MCP DEBUG] Already connected to: ${server.name}`);
              }
              
              // Get tools from this server
              console.log(`[MCP DEBUG] Getting tools from server: ${server.name}`);
              const serverTools = await manager.getTools(server.id);
              console.log(`[MCP DEBUG] Server ${server.name} has ${serverTools.length} tools:`, serverTools.map(t => t.name));
              
              // Convert MCP tools to AI SDK format
              for (const mcpTool of serverTools) {
                const toolKey = `${server.name}_${mcpTool.name}`.replace(/[^a-zA-Z0-9_]/g, '_');
                console.log(`[MCP DEBUG] Registering tool: ${toolKey}`);
                console.log(`[MCP DEBUG] Tool inputSchema:`, JSON.stringify(mcpTool.inputSchema, null, 2));
                
                // Ensure the input schema has the required 'type' field
                let inputSchema = mcpTool.inputSchema || {
                  type: 'object',
                  properties: {},
                  required: []
                };
                
                // Make sure the schema has a type field at the root level
                if (!inputSchema.type) {
                  inputSchema = {
                    type: 'object',
                    ...inputSchema
                  };
                }
                
                // Convert JSON Schema to Zod schema for the AI SDK
                const convertJsonSchemaToZod = (schema: any): any => {
                  if (!schema || !schema.properties) {
                    return z.object({});
                  }
                  
                  const zodShape: any = {};
                  for (const [key, value] of Object.entries(schema.properties)) {
                    const prop = value as any;
                    let zodType: any;
                    
                    if (prop.type === 'string') {
                      zodType = z.string();
                    } else if (prop.type === 'number') {
                      zodType = z.number();
                    } else if (prop.type === 'boolean') {
                      zodType = z.boolean();
                    } else if (prop.type === 'array') {
                      if (prop.items?.type === 'string') {
                        zodType = z.array(z.string());
                      } else {
                        zodType = z.array(z.any());
                      }
                    } else if (prop.type === 'object') {
                      zodType = z.object({});
                    } else {
                      zodType = z.any();
                    }
                    
                    // Add description if present
                    if (prop.description) {
                      zodType = zodType.describe(prop.description);
                    }
                    
                    // Make optional if not required
                    if (!schema.required?.includes(key)) {
                      zodType = zodType.optional();
                    }
                    
                    zodShape[key] = zodType;
                  }
                  
                  return z.object(zodShape);
                };
                
                // Use the AI SDK's tool helper
                tools[toolKey] = tool({
                  description: mcpTool.description || `Tool ${mcpTool.name} from ${server.name}`,
                  inputSchema: convertJsonSchemaToZod(inputSchema),
                  execute: async (params: any) => {
                    try {
                      console.log(`[MCP EXEC] ===== TOOL EXECUTION START =====`);
                      console.log(`[MCP EXEC] Tool: ${mcpTool.name}`);
                      console.log(`[MCP EXEC] Server: ${server.name}`);
                      console.log(`[MCP EXEC] Params:`, JSON.stringify(params, null, 2));
                      
                      const result = await manager.executeTool(server.id, mcpTool.name, params);
                      
                      console.log(`[MCP EXEC] Result:`, JSON.stringify(result, null, 2));
                      console.log(`[MCP EXEC] ===== TOOL EXECUTION END =====`);
                      
                      return result.result || result;
                    } catch (error: any) {
                      console.error(`[MCP EXEC ERROR] Tool ${mcpTool.name} failed:`, error);
                      console.error(`[MCP EXEC ERROR] Stack:`, error.stack);
                      return {
                        error: true,
                        message: error.message || 'Tool execution failed'
                      };
                    }
                  }
                });
              }
            } catch (error) {
              console.error(`[MCP DEBUG ERROR] Error loading tools from server ${server.name}:`, error);
            }
          }
          
          const toolCount = Object.keys(tools).length;
          if (toolCount > 0) {
            console.log(`[MCP DEBUG] Successfully loaded ${toolCount} MCP tools from ${connectedServers.length} servers`);
            console.log(`[MCP DEBUG] Available tools:`, Object.keys(tools));
          } else {
            console.log('[MCP DEBUG] No MCP tools available. Connect MCP servers to enable tool calling.');
            tools = undefined; // Don't pass empty tools object
          }
        } else {
          console.log('[MCP DEBUG] MCP client module does not have MCPClientManager');
        }
      } catch (error) {
        console.log('[MCP DEBUG ERROR] MCP client not available or error loading tools:', error);
      }
    } else {
      console.log('[MCP DEBUG] MCP tools disabled (showMCPTools:', showMCPTools, ')');
    }

    // Add system message for tool usage if we have tools loaded
    if (showMCPTools && tools && Object.keys(tools).length > 0) {
      formattedMessages.unshift({
        role: 'system',
        content: 'When you use tools, ALWAYS provide a helpful response to the user after the tool execution completes. You must take another step after the tool runs to summarize what the tool did and present the results in a clear, user-friendly way. Never stop after just calling a tool - always explain the results to the user.'
      });
      console.log('[MCP DEBUG] Added system message for tool usage guidance');
    }
    
    // Stream response with optional tools
    try {
      const streamConfig: any = {
        model: anthropic(model),
        messages: formattedMessages,
        temperature: temperature,
        maxOutputTokens: maxTokens,
      };
      
      // Only add tools if we have any
      if (tools && Object.keys(tools).length > 0) {
        streamConfig.tools = tools;
        streamConfig.maxSteps = 10; // Enable multi-step execution - increase to ensure continuation
        
        // Add tool choice to encourage tool usage but allow continuation
        streamConfig.toolChoice = 'auto';
        
        // Add explicit stopping condition - continue until we have both tools AND text
        streamConfig.stopWhen = (step: any, stepIndex: number) => {
          console.log('[MCP DEBUG] StopWhen check - Step', stepIndex + 1, 'Type:', step?.stepType);
          // Only stop if we've had both tool execution AND follow-up text
          if (stepIndex >= 3) { // Allow at least 4 steps: text -> tool -> result -> text
            console.log('[MCP DEBUG] Allowing stop after step', stepIndex + 1);
            return true;
          }
          console.log('[MCP DEBUG] Continuing - need more steps');
          return false;
        };
        
        console.log('[MCP DEBUG] ===== STREAMING WITH TOOLS =====');
        console.log('[MCP DEBUG] Tool count:', Object.keys(tools).length);
        console.log('[MCP DEBUG] Tool names:', Object.keys(tools));
        console.log('[MCP DEBUG] Max steps:', streamConfig.maxSteps);
        console.log('[MCP DEBUG] Tool choice:', streamConfig.toolChoice);
        console.log('[MCP DEBUG] Model:', model);
        
        // Debug: log the actual tool structure being sent
        console.log('[MCP DEBUG] First tool structure:', JSON.stringify(tools[Object.keys(tools)[0]], null, 2));
      } else {
        console.log('[MCP DEBUG] Streaming WITHOUT tools (tools:', tools, ')');
      }
      
      const result = streamText(streamConfig);
      console.log('[MCP DEBUG] StreamText created, returning response');
      
      // Debug: Access the stream asynchronously to see what's actually happening
      (async () => {
        try {
          console.log('[MCP DEBUG] ===== ANALYZING STREAM EVENTS =====');
          let toolCallCount = 0;
          let textResponseCount = 0;
          
          for await (const chunk of result.fullStream) {
            console.log('[MCP DEBUG] Stream chunk type:', chunk.type);
            
            if (chunk.type === 'tool-call') {
              toolCallCount++;
              console.log('[MCP DEBUG] Tool call:', toolCallCount, chunk.toolName);
            } else if (chunk.type === 'tool-result') {
              console.log('[MCP DEBUG] Tool result received');
            } else if (chunk.type === 'text-delta') {
              textResponseCount++;
              if (textResponseCount === 1) {
                console.log('[MCP DEBUG] First text response started');
              }
            }
          }
          
          console.log('[MCP DEBUG] ===== FINAL SUMMARY =====');
          console.log('[MCP DEBUG] Total tool calls:', toolCallCount); 
          console.log('[MCP DEBUG] Total text responses:', textResponseCount);
        } catch (err) {
          console.error('[MCP DEBUG] Stream analysis error:', err);
        }
      })();

      // Return streaming response - check available methods and use correct one
      console.log('[MCP DEBUG] Available methods on streamText result:', Object.getOwnPropertyNames(result).concat(Object.getOwnPropertyNames(Object.getPrototypeOf(result))));
      
      // Try the correct streaming method
      if (result.toUIMessageStreamResponse) {
        console.log('[MCP DEBUG] Using toUIMessageStreamResponse');
        return result.toUIMessageStreamResponse();
      } else if ((result as any).toDataStreamResponse) {
        console.log('[MCP DEBUG] Using toDataStreamResponse');
        return (result as any).toDataStreamResponse();
      } else if (result.toTextStreamResponse) {
        console.log('[MCP DEBUG] Using toTextStreamResponse');
        return result.toTextStreamResponse();
      } else {
        console.log('[MCP DEBUG] No streaming method found, available keys:', Object.keys(result));
        throw new Error('No valid streaming response method available');
      }
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