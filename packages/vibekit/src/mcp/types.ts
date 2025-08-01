import { MCPServerConfig, MCPTool, MCPToolResult } from '../types.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

// Use the real Client from MCP SDK
export type ClientSession = Client;

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