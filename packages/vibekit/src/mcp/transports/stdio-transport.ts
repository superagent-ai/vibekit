import { spawn, ChildProcess } from 'child_process';
import { MCPTransport } from '../types.js';
import { MCPServerConfig } from '../../types.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export class StdioMCPTransport implements MCPTransport {
  private process?: ChildProcess;
  private transport?: any;

  async connect(config: MCPServerConfig) {
    if (config.type !== 'local') {
      throw new Error('StdioTransport only supports local servers');
    }

    const serverParams = {
      command: config.command || 'node',
      args: config.path ? [config.path, ...(config.args || [])] : (config.args || []),
      env: Object.fromEntries(
        Object.entries({ ...process.env, ...config.env })
          .filter(([, value]) => value !== undefined)
          .map(([key, value]) => [key, String(value)])
      )
    };

    try {
      this.transport = new StdioClientTransport(serverParams);
      return { stdio: this.transport, write: this.transport };
    } catch (error: any) {
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