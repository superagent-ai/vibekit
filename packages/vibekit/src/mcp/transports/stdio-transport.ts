import { spawn, ChildProcess } from 'child_process';
import { MCPTransport, MCPServerConfig } from '../types.js';
import { stdio_client, StdioServerParameters } from '@modelcontextprotocol/sdk/client/stdio.js';

export class StdioMCPTransport implements MCPTransport {
  private process?: ChildProcess;
  private transport?: any;

  async connect(config: MCPServerConfig) {
    if (config.type !== 'local') {
      throw new Error('StdioTransport only supports local servers');
    }

    const serverParams: StdioServerParameters = {
      command: config.command || 'node',
      args: config.path ? [config.path, ...(config.args || [])] : (config.args || []),
      env: { ...process.env, ...config.env }
    };

    try {
      this.transport = await stdio_client(serverParams);
      return this.transport;
    } catch (error) {
      throw new Error(`Failed to connect to MCP server: ${error.message}`);
    }
  }

  async disconnect() {
    if (this.process && !this.process.killed) {
      this.process.kill('SIGTERM');
      
      // Wait for graceful shutdown, then force kill
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          this.process.kill('SIGKILL');
        }
      }, 5000);
    }
  }

  isConnected(): boolean {
    return this.process ? !this.process.killed : false;
  }
} 