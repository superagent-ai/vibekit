import { EventEmitter } from 'eventemitter3';
import PQueue from 'p-queue';
import { createLogger } from '@vibe-kit/logger';
import { MCPClient } from '../client/mcp-client';
import { ConfigStore } from './config-store';
import type { 
  MCPServer, 
  ServerCreateInput, 
  ServerUpdateInput,
  ServerStatus 
} from '../types/server';
import type { Tool, Resource, Prompt, ToolExecutionResult } from '../types/tools';
import type { MCPClientConfig, ConnectionOptions } from '../types';

// Create logger for this module
const log = createLogger('mcp-server-manager');

interface ManagerEvents {
  'server:connected': (serverId: string) => void;
  'server:disconnected': (serverId: string) => void;
  'server:error': (serverId: string, error: Error) => void;
  'server:status': (serverId: string, status: ServerStatus) => void;
}

export class MCPClientManager extends EventEmitter<ManagerEvents> {
  private configStore: ConfigStore;
  private clients: Map<string, MCPClient> = new Map();
  private queue: PQueue;
  private reconnectTimers: Map<string, NodeJS.Timeout> = new Map();
  private reconnectAttempts: Map<string, number> = new Map();
  private config: MCPClientConfig;

  constructor(config: MCPClientConfig = {}) {
    super();
    this.config = {
      autoConnect: false,
      reconnectAttempts: 3,
      reconnectDelay: 1000,
      ...config,
    };
    
    this.configStore = new ConfigStore({
      configPath: config.configPath,
      configDir: config.configDir,
      configFileName: config.configFileName,
      metadataKey: config.metadataKey,
    });
    this.queue = new PQueue({ concurrency: 5 });
  }

  async initialize(): Promise<void> {
    await this.configStore.initialize();
    
    if (this.config.autoConnect) {
      const servers = this.configStore.getAllServers();
      for (const server of servers) {
        if (server.status === 'active') {
          this.queue.add(() => this.connect(server.id).catch(err => log.error('Auto-connect failed', err)));
        }
      }
    }
  }

  // Server Management
  async addServer(input: ServerCreateInput): Promise<MCPServer> {
    const server = await this.configStore.addServer(input);
    return server;
  }

  async removeServer(id: string): Promise<void> {
    // Disconnect if connected
    await this.disconnect(id);
    
    // Remove from store
    await this.configStore.removeServer(id);
  }

  async updateServer(id: string, updates: ServerUpdateInput): Promise<MCPServer> {
    // Disconnect if connected (config may have changed)
    const wasConnected = this.isConnected(id);
    if (wasConnected) {
      await this.disconnect(id);
    }

    const updated = await this.configStore.updateServer(id, updates);
    
    // Reconnect if it was connected
    if (wasConnected) {
      await this.connect(id);
    }

    return updated;
  }

  getServer(id: string): MCPServer | undefined {
    return this.configStore.getServer(id);
  }

  getAllServers(): MCPServer[] {
    return this.configStore.getAllServers();
  }

  // Connection Management
  async connect(serverId: string, options: ConnectionOptions = {}): Promise<void> {
    const server = this.configStore.getServer(serverId);
    if (!server) {
      throw new Error(`Server ${serverId} not found`);
    }

    // Check if already connected
    if (this.clients.has(serverId)) {
      const client = this.clients.get(serverId)!;
      if (client.isConnected()) {
        return;
      }
    }

    // Update status
    await this.updateServerStatus(serverId, 'connecting');

    try {
      const client = new MCPClient(server, { 
        clientName: this.config.clientName 
      });
      
      // Set up event listeners
      client.on('connected', () => {
        this.handleConnected(serverId);
      });

      client.on('disconnected', (reason) => {
        this.handleDisconnected(serverId, reason);
      });

      client.on('error', (error) => {
        this.handleError(serverId, error);
      });

      client.on('tool:discovered', async (tools) => {
        await this.configStore.updateServer(serverId, {
          toolCount: tools.length,
        });
      });

      client.on('resource:discovered', async (resources) => {
        await this.configStore.updateServer(serverId, {
          resourceCount: resources.length,
        });
      });

      // Connect with timeout
      const timeout = options.timeout || 30000;
      await Promise.race([
        client.connect(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Connection timeout')), timeout)
        ),
      ]);

      this.clients.set(serverId, client);
      
      // Clear reconnect attempts on successful connection
      this.reconnectAttempts.delete(serverId);
      
    } catch (error) {
      await this.updateServerStatus(serverId, 'error', (error as Error).message);
      
      // Handle reconnection
      if (options.retryAttempts || this.config.reconnectAttempts) {
        this.scheduleReconnect(serverId, options);
      }
      
      throw error;
    }
  }

  async disconnect(serverId: string): Promise<void> {
    const client = this.clients.get(serverId);
    if (!client) {
      return;
    }

    // Cancel any reconnect timers
    const timer = this.reconnectTimers.get(serverId);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(serverId);
    }

    await client.disconnect();
    this.clients.delete(serverId);
    await this.updateServerStatus(serverId, 'disconnected');
  }

  async disconnectAll(): Promise<void> {
    const promises = Array.from(this.clients.keys()).map(id => 
      this.disconnect(id).catch(console.error)
    );
    await Promise.all(promises);
  }

  isConnected(serverId: string): boolean {
    const client = this.clients.get(serverId);
    return client ? client.isConnected() : false;
  }

  getServerStatus(serverId: string): ServerStatus {
    const server = this.configStore.getServer(serverId);
    if (!server) {
      return 'inactive';
    }
    
    if (this.isConnected(serverId)) {
      return 'active';
    }
    
    return server.status || 'disconnected';
  }

  // Tool/Resource Discovery
  async getTools(serverId: string): Promise<Tool[]> {
    const client = this.clients.get(serverId);
    if (!client || !client.isConnected()) {
      throw new Error(`Server ${serverId} is not connected`);
    }

    return client.getTools();
  }

  async getResources(serverId: string): Promise<Resource[]> {
    const client = this.clients.get(serverId);
    if (!client || !client.isConnected()) {
      throw new Error(`Server ${serverId} is not connected`);
    }

    return client.getResources();
  }

  async getPrompts(serverId: string): Promise<Prompt[]> {
    const client = this.clients.get(serverId);
    if (!client || !client.isConnected()) {
      throw new Error(`Server ${serverId} is not connected`);
    }

    return client.getPrompts();
  }

  // Tool Execution
  async executeTool(
    serverId: string, 
    toolName: string, 
    params: any = {}
  ): Promise<ToolExecutionResult> {
    const client = this.clients.get(serverId);
    if (!client || !client.isConnected()) {
      throw new Error(`Server ${serverId} is not connected`);
    }

    return client.executeTool(toolName, params);
  }

  // Combined operations
  async listTools(serverId?: string): Promise<Tool[]> {
    if (serverId) {
      return this.getTools(serverId);
    }
    
    // Get tools from all connected servers
    const allTools: Tool[] = [];
    for (const [id, client] of this.clients.entries()) {
      if (client.isConnected()) {
        try {
          const tools = await client.getTools();
          // Add server ID to each tool for identification
          const serverTools = tools.map(tool => ({
            ...tool,
            serverId: id,
          }));
          allTools.push(...serverTools);
        } catch (error) {
          log.error('Failed to get tools from server', error, { serverId: id });
        }
      }
    }
    return allTools;
  }

  async destroy(): Promise<void> {
    // Clear all reconnection timers
    for (const timer of this.reconnectTimers.values()) {
      clearTimeout(timer);
    }
    this.reconnectTimers.clear();
    
    // Disconnect all clients
    await this.disconnectAll();
    
    // Clear all data
    this.clients.clear();
    this.reconnectAttempts.clear();
    this.queue.clear();
  }

  // Import/Export
  async exportConfig(): Promise<string> {
    return this.configStore.exportConfig();
  }

  async importConfig(jsonData: string): Promise<void> {
    // Disconnect all servers before importing
    await this.disconnectAll();
    
    await this.configStore.importConfig(jsonData);
    
    // Reconnect if autoConnect is enabled
    if (this.config.autoConnect) {
      await this.initialize();
    }
  }

  // Private methods
  private async handleConnected(serverId: string): Promise<void> {
    await this.updateServerStatus(serverId, 'active');
    
    // Get tool/resource/prompt counts
    const client = this.clients.get(serverId);
    let updates: any = {
      lastConnected: new Date(),
    };
    
    if (client && client.isConnected()) {
      try {
        const [tools, resources, prompts] = await Promise.all([
          client.getTools().catch(() => []),
          client.getResources().catch(() => []),
          client.getPrompts().catch(() => [])
        ]);
        
        updates.toolCount = tools.length;
        updates.resourceCount = resources.length;
        updates.promptCount = prompts.length;
      } catch (error) {
        console.error('Failed to get server capabilities:', error);
      }
    }
    
    await this.configStore.updateServer(serverId, updates);
    this.emit('server:connected', serverId);
  }

  private async handleDisconnected(serverId: string, _reason?: string): Promise<void> {
    await this.updateServerStatus(serverId, 'disconnected');
    this.emit('server:disconnected', serverId);
    
    // Auto-reconnect if configured
    if (this.config.reconnectAttempts && this.config.reconnectAttempts > 0) {
      this.scheduleReconnect(serverId);
    }
  }

  private async handleError(serverId: string, error: Error): Promise<void> {
    await this.updateServerStatus(serverId, 'error', error.message);
    this.emit('server:error', serverId, error);
  }

  private async updateServerStatus(
    serverId: string, 
    status: ServerStatus, 
    error?: string
  ): Promise<void> {
    await this.configStore.updateServer(serverId, {
      status,
      error: error || undefined,
    });
    this.emit('server:status', serverId, status);
  }

  private scheduleReconnect(serverId: string, options: ConnectionOptions = {}): void {
    const attempts = this.reconnectAttempts.get(serverId) || 0;
    const maxAttempts = options.retryAttempts || this.config.reconnectAttempts || 3;
    
    if (attempts >= maxAttempts) {
      console.error(`Max reconnect attempts reached for server ${serverId}`);
      return;
    }

    const delay = options.retryDelay || this.config.reconnectDelay || 1000;
    const backoffDelay = delay * Math.pow(2, attempts); // Exponential backoff

    const timer = setTimeout(() => {
      this.reconnectAttempts.set(serverId, attempts + 1);
      this.connect(serverId, options).catch(console.error);
      this.reconnectTimers.delete(serverId);
    }, backoffDelay);

    this.reconnectTimers.set(serverId, timer);
  }
}