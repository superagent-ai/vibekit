import { MCPTransport, MCPServerConfig } from '../types.js';
import { StdioMCPTransport } from './stdio-transport.js';
import { SSEMCPTransport } from './sse-transport.js';

export class MCPTransportFactory {
  static create(config: MCPServerConfig): MCPTransport {
    switch (config.type) {
      case 'local':
        return new StdioMCPTransport();
      case 'remote':
        return new SSEMCPTransport();
      default:
        throw new Error(`Unsupported MCP server type: ${config.type}`);
    }
  }
} 