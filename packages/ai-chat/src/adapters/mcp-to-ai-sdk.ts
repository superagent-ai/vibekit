import { MCPClientManager } from '@vibe-kit/mcp-client';
import { tool } from 'ai';
import { z } from 'zod';

export class MCPToAISDKAdapter {
  constructor(private serverManager: MCPClientManager) {}

  async getTools() {
    const allServers = this.serverManager.getAllServers();
    const tools: Record<string, any> = {};

    for (const server of allServers) {
      // Only get tools from connected servers
      if (!this.serverManager.isConnected(server.id)) {
        continue;
      }
      
      try {
        const mcpTools = await this.serverManager.getTools(server.id);

        for (const mcpTool of mcpTools) {
          // Create a unique tool name that includes server context
          const toolName = `${server.name}_${mcpTool.name}`.replace(/[^a-zA-Z0-9_]/g, '_');
          
          // Convert MCP tool schema to Zod schema
          const parameters = this.convertToZodSchema(mcpTool.inputSchema);

          tools[toolName] = tool({
            description: `[${server.name}] ${mcpTool.description || mcpTool.name}`,
            parameters,
            execute: async (params) => {
              try {
                const result = await this.serverManager.executeTool(
                  server.id,
                  mcpTool.name,
                  params
                );
                
                // Format the result for display
                if (result.success) {
                  return {
                    success: true,
                    result: result.result,
                    server: server.name,
                    tool: mcpTool.name,
                  };
                } else {
                  return {
                    success: false,
                    error: result.error,
                    server: server.name,
                    tool: mcpTool.name,
                  };
                }
              } catch (error) {
                return {
                  success: false,
                  error: error instanceof Error ? error.message : 'Unknown error',
                  server: server.name,
                  tool: mcpTool.name,
                };
              }
            },
          });
        }
      } catch (error) {
        console.error(`Failed to get tools from server ${server.name}:`, error);
      }
    }

    return tools;
  }

  private convertToZodSchema(inputSchema: any): z.ZodTypeAny {
    if (!inputSchema || typeof inputSchema !== 'object') {
      return z.object({});
    }

    // Handle JSON Schema to Zod conversion
    if (inputSchema.type === 'object' && inputSchema.properties) {
      const shape: Record<string, z.ZodTypeAny> = {};
      
      for (const [key, value] of Object.entries(inputSchema.properties)) {
        shape[key] = this.convertPropertyToZod(value as any, inputSchema.required?.includes(key));
      }
      
      return z.object(shape);
    }

    // Default to accepting any object
    return z.object({}).passthrough();
  }

  private convertPropertyToZod(property: any, isRequired: boolean = false): z.ZodTypeAny {
    let zodType: z.ZodTypeAny;

    switch (property.type) {
      case 'string':
        zodType = z.string();
        if (property.description) {
          zodType = zodType.describe(property.description);
        }
        break;
      case 'number':
      case 'integer':
        zodType = z.number();
        if (property.description) {
          zodType = zodType.describe(property.description);
        }
        break;
      case 'boolean':
        zodType = z.boolean();
        if (property.description) {
          zodType = zodType.describe(property.description);
        }
        break;
      case 'array':
        if (property.items) {
          zodType = z.array(this.convertPropertyToZod(property.items, true));
        } else {
          zodType = z.array(z.any());
        }
        if (property.description) {
          zodType = zodType.describe(property.description);
        }
        break;
      case 'object':
        if (property.properties) {
          const shape: Record<string, z.ZodTypeAny> = {};
          for (const [key, value] of Object.entries(property.properties)) {
            shape[key] = this.convertPropertyToZod(value as any, property.required?.includes(key));
          }
          zodType = z.object(shape);
        } else {
          zodType = z.record(z.any());
        }
        if (property.description) {
          zodType = zodType.describe(property.description);
        }
        break;
      default:
        zodType = z.any();
        if (property.description) {
          zodType = zodType.describe(property.description);
        }
    }

    // Make optional if not required
    if (!isRequired) {
      zodType = zodType.optional();
    }

    return zodType;
  }

  async getAvailableServers() {
    return this.serverManager.getAllServers();
  }

  async connectServer(serverId: string) {
    return this.serverManager.connect(serverId);
  }

  async disconnectServer(serverId: string) {
    return this.serverManager.disconnect(serverId);
  }
}