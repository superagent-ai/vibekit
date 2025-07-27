import { Client } from '@modelcontextprotocol/sdk/client/index.js';
// ExitStack is not available in current SDK version, use manual cleanup
import { 
  MCPManager, 
  MCPSession, 
  MCPTransport 
} from './types.js';
import { 
  MCPServerConfig, 
  MCPTool, 
  MCPToolResult 
} from '../types.js';
import { MCPTransportFactory } from './transports/factory.js';

export class VibeKitMCPManager implements MCPManager {
  private sessions = new Map<string, MCPSession>();
  private tools = new Map<string, MCPTool>();

  async initialize(servers: MCPServerConfig[]): Promise<void> {
    // Connect to all servers in parallel
    const connectionPromises = servers.map(server => 
      this.connectToServer(server).catch(error => {
        console.error(`Failed to connect to MCP server ${server.id}:`, error);
        return null;
      })
    );

    const results = await Promise.allSettled(connectionPromises);
    
    // Log connection results
    const connected = results.filter(r => r.status === 'fulfilled' && r.value).length;
    console.log(`MCP: Connected to ${connected}/${servers.length} servers`);

    // Discover and register all tools
    await this.discoverAllTools();
  }

  async connectToServer(config: MCPServerConfig): Promise<MCPSession> {
    if (this.sessions.has(config.id)) {
      throw new Error(`MCP server ${config.id} already connected`);
    }

    const transport = MCPTransportFactory.create(config);
    const connection = await transport.connect(config);
    
    const client = new Client(
      { name: 'vibekit-mcp-client', version: '1.0.0' },
      { capabilities: {} }
    );
    await client.connect(connection.stdio);

    // Discover tools from this server
    const toolsResponse = await client.listTools();
    const tools = toolsResponse.tools.map((tool: any) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      serverId: config.id,
      serverName: config.name
    }));

    const mcpSession: MCPSession = {
      id: config.id,
      config,
      session: client as any, // Type assertion for compatibility
      isConnected: true,
      tools,
      startTime: new Date()
    };

    this.sessions.set(config.id, mcpSession);

    // Register tools globally
    tools.forEach((tool: MCPTool) => {
      this.tools.set(tool.name, tool);
    });

    console.log(`MCP: Connected to ${config.id} with ${tools.length} tools`);
    return mcpSession;
  }

  async disconnectFromServer(serverId: string): Promise<void> {
    const session = this.sessions.get(serverId);
    if (!session) return;

    // Remove tools from global registry
    session.tools.forEach(tool => {
      this.tools.delete(tool.name);
    });

    // Close session (exitStack will handle cleanup)
    session.isConnected = false;
    this.sessions.delete(serverId);
  }

  async listTools(): Promise<MCPTool[]> {
    return Array.from(this.tools.values());
  }

  async executeTool(toolName: string, args: any): Promise<MCPToolResult> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new Error(`Tool ${toolName} not found`);
    }

    const session = this.sessions.get(tool.serverId);
    if (!session || !session.isConnected) {
      throw new Error(`MCP server ${tool.serverId} not connected`);
    }

    try {
      const result = await session.session.callTool({ name: toolName, arguments: args });
      return {
        content: result.content,
        isError: Boolean(result.isError),
        toolUseId: result.toolUseId ? String(result.toolUseId) : undefined
      };
    } catch (error: any) {
      return {
        content: error.message,
        isError: true
      };
    }
  }

  async getServerStatus(serverId?: string): Promise<any> {
    if (serverId) {
      const session = this.sessions.get(serverId);
      return session ? {
        id: session.id,
        isConnected: session.isConnected,
        toolCount: session.tools.length,
        startTime: session.startTime,
        lastError: session.lastError
      } : null;
    }

    return Array.from(this.sessions.values()).map(session => ({
      id: session.id,
      isConnected: session.isConnected,
      toolCount: session.tools.length,
      startTime: session.startTime,
      lastError: session.lastError
    }));
  }

  async cleanup(): Promise<void> {
    // Clear tool registry
    this.tools.clear();
    
    // Disconnect all sessions
    for (const [sessionId] of this.sessions) {
      await this.disconnectFromServer(sessionId);
    }
    
    // Clear sessions
    this.sessions.clear();
  }

  private async discoverAllTools(): Promise<void> {
    this.tools.clear();
    
    for (const session of this.sessions.values()) {
      session.tools.forEach(tool => {
        this.tools.set(tool.name, tool);
      });
    }
  }
} 