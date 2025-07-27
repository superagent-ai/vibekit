import { MCPServerConfig, MCPTool, MCPToolResult } from '../types.js';

// Placeholder for ClientSession - will be imported from MCP SDK in Phase 2
export interface ClientSession {
  initialize(): Promise<void>;
  list_tools(): Promise<{ tools: any[] }>;
  call_tool(name: string, args: any): Promise<any>;
}

export interface MCPSession {
  id: string;
  config: MCPServerConfig;
  session: ClientSession;
  isConnected: boolean;
  tools: MCPTool[];
  lastError?: string;
  startTime?: Date;
}

export interface MCPTransport {
  connect(config: MCPServerConfig): Promise<{ stdio: any; write: any }>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
}

export interface MCPManager {
  initialize(servers: MCPServerConfig[]): Promise<void>;
  connectToServer(config: MCPServerConfig): Promise<MCPSession>;
  disconnectFromServer(serverId: string): Promise<void>;
  listTools(): Promise<MCPTool[]>;
  executeTool(toolName: string, args: any): Promise<MCPToolResult>;
  getServerStatus(serverId?: string): Promise<any>;
  cleanup(): Promise<void>;
} 