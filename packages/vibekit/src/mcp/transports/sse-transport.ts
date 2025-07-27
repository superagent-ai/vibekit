import { MCPTransport, MCPServerConfig } from '../types.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

export class SSEMCPTransport implements MCPTransport {
  private transport?: SSEClientTransport;

  async connect(config: MCPServerConfig) {
    if (config.type !== 'remote') {
      throw new Error('SSETransport only supports remote servers');
    }

    if (!config.url) {
      throw new Error('Remote server URL is required');
    }

    const headers: Record<string, string> = {};
    
    // Add authentication headers
    if (config.auth) {
      switch (config.auth.type) {
        case 'bearer':
          headers['Authorization'] = `Bearer ${config.auth.token}`;
          break;
        case 'basic':
          const credentials = btoa(`${config.auth.username}:${config.auth.password}`);
          headers['Authorization'] = `Basic ${credentials}`;
          break;
        case 'custom':
          Object.assign(headers, config.auth.headers);
          break;
      }
    }

    try {
      this.transport = new SSEClientTransport(config.url, { headers });
      return { stdio: this.transport, write: this.transport };
    } catch (error) {
      throw new Error(`Failed to connect to remote MCP server: ${error.message}`);
    }
  }

  async disconnect() {
    if (this.transport) {
      await this.transport.close();
    }
  }

  isConnected(): boolean {
    return this.transport?.readyState === 1; // OPEN
  }
} 