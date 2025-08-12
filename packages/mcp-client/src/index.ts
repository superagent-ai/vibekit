// Version for debugging
export const MCP_CLIENT_VERSION = '0.0.1';

export { MCPClientManager } from './manager/server-manager';
export { MCPClient } from './client/mcp-client';
export { ConfigStore } from './manager/config-store';

export * from './types';

// Re-export commonly used types
export type {
  MCPServer,
  ServerStatus,
  TransportType,
  ServerCreateInput,
  ServerUpdateInput,
  Tool,
  Resource,
  Prompt,
  ToolExecutionResult,
  ServerCapabilities,
} from './types';