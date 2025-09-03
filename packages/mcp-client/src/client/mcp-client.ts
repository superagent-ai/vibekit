import { EventEmitter } from 'eventemitter3';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { createLogger } from '@vibe-kit/logger';
import type { MCPServer, StdioConfig, HttpConfig } from '../types/server';
import type { Tool, Resource, Prompt, ToolExecutionResult } from '../types/tools';
import type { ClientEvents, MCPClient as MCPClientType } from './types';

// Create logger for this module
const log = createLogger('mcp-client');

export class MCPClient extends EventEmitter<ClientEvents> {
  private client: MCPClientType | null = null;
  private server: MCPServer;
  private connected: boolean = false;
  private transport: any = null;
  private clientName: string;

  constructor(server: MCPServer, options?: { clientName?: string }) {
    super();
    this.server = server;
    this.clientName = options?.clientName || process.env.MCP_CLIENT_NAME || 'mcp-client';
  }

  async connect(): Promise<void> {
    if (this.connected) {
      throw new Error('Client is already connected');
    }

    try {
      this.client = new Client(
        {
          name: this.clientName,
          version: '0.0.1',
        },
        {
          capabilities: {
            // Add sampling capability that some servers expect
            sampling: {},
            // Add other standard capabilities
            roots: {
              listChanged: true,
            },
          },
        }
      );

      if (this.server.transport === 'stdio') {
        await this.connectStdio();
      } else if (this.server.transport === 'sse' || this.server.transport === 'http') {
        await this.connectHttp();
      } else {
        throw new Error(`Unsupported transport: ${this.server.transport}`);
      }

      this.connected = true;
      this.emit('connected');

      // Discover capabilities after a small delay to ensure connection is stable
      setTimeout(() => {
        this.discoverCapabilities().catch(error => {
          log.error('Failed to discover capabilities', error);
        });
      }, 100);
    } catch (error) {
      this.connected = false;
      this.emit('error', error as Error);
      throw error;
    }
  }

  private async connectStdio(): Promise<void> {
    const config = this.server.config as StdioConfig;
    
    log.debug('Connecting to MCP server via stdio', {
      command: config.command,
      args: config.args,
      cwd: config.cwd,
    });
    
    // Ensure PATH is included in env for npx to work
    const processEnv: Record<string, string> = {};
    
    // Copy process.env, filtering out undefined values
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) {
        processEnv[key] = value;
      }
    }
    
    // Override with config env
    if (config.env) {
      Object.assign(processEnv, config.env);
    }
    
    // Log environment keys (not values for security)
    console.log('Environment variables provided:', Object.keys(processEnv).filter(k => 
      k.includes('API_KEY') || k.includes('ANTHROPIC') || k.includes('OPENAI')
    ));
    
    // StdioClientTransport handles the subprocess internally
    this.transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: processEnv,
      cwd: config.cwd,
    });

    try {
      log.debug('Attempting to connect with transport');
      
      // Set up error handlers on the transport before connecting
      if (this.transport && typeof this.transport.on === 'function') {
        this.transport.on('error', (err: any) => {
          log.error('Transport error', err);
        });
      }
      
      await this.client!.connect(this.transport);
      log.debug('Transport connected, waiting for initialization');
      
      // Give the server a moment to fully initialize
      await new Promise(resolve => setTimeout(resolve, 500));
      
      log.info('Successfully connected to MCP server');
    } catch (error) {
      log.error('Failed to connect to MCP server', error);
      // Log more details about the error
      if (error && typeof error === 'object') {
        const err = error as any;
        console.error('Error details:', {
          code: err.code,
          data: err.data,
          message: err.message,
          name: err.name,
        });
        
        // Check if it's an MCP protocol error
        if (err.code === -32000) {
          console.error('MCP Protocol Error: Connection closed by server');
          console.error('This usually means the server crashed or rejected the connection');
        }
      }
      throw error;
    }
  }

  private async connectHttp(): Promise<void> {
    const config = this.server.config as HttpConfig;
    
    this.transport = new SSEClientTransport(new URL(config.url));
    await this.client!.connect(this.transport);
  }

  async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }

    try {
      if (this.client) {
        await this.client.close();
      }

      this.transport = null;
      this.client = null;
      this.connected = false;
      this.emit('disconnected');
    } catch (error) {
      this.emit('error', error as Error);
      throw error;
    }
  }

  private async discoverCapabilities(): Promise<void> {
    if (!this.client || !this.connected) {
      throw new Error('Client is not connected');
    }

    try {
      // Discover tools
      const toolsResponse = await (this.client as any).listTools();
      
      if (toolsResponse.tools) {
        this.emit('tool:discovered', toolsResponse.tools);
      }

      // Discover resources
      const resourcesResponse = await (this.client as any).listResources();
      
      if (resourcesResponse.resources) {
        this.emit('resource:discovered', resourcesResponse.resources);
      }

      // Discover prompts
      const promptsResponse = await (this.client as any).listPrompts();
      
      if (promptsResponse.prompts) {
        // We don't have an event for prompts yet, but we could add one
      }
    } catch (error) {
      console.error('Failed to discover capabilities:', error);
    }
  }

  async getTools(): Promise<Tool[]> {
    if (!this.client || !this.connected) {
      throw new Error('Client is not connected');
    }

    try {
      const response = await (this.client as any).listTools();
      return response.tools || [];
    } catch (error) {
      console.error('Failed to get tools:', error);
      return [];
    }
  }

  async getResources(): Promise<Resource[]> {
    if (!this.client || !this.connected) {
      throw new Error('Client is not connected');
    }

    try {
      const response = await (this.client as any).listResources();
      return response.resources || [];
    } catch (error) {
      console.error('Failed to get resources:', error);
      return [];
    }
  }

  async getPrompts(): Promise<Prompt[]> {
    if (!this.client || !this.connected) {
      throw new Error('Client is not connected');
    }

    try {
      const response = await (this.client as any).listPrompts();
      return response.prompts || [];
    } catch (error) {
      console.error('Failed to get prompts:', error);
      return [];
    }
  }

  async executeTool(toolName: string, params: any = {}): Promise<ToolExecutionResult> {
    if (!this.client || !this.connected) {
      throw new Error('Client is not connected');
    }

    const startTime = Date.now();

    try {
      const response = await (this.client as any).callTool({
        name: toolName,
        arguments: params,
      });

      return {
        success: true,
        result: response.content,
        executionTime: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
        executionTime: Date.now() - startTime,
      };
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  getServer(): MCPServer {
    return this.server;
  }
}