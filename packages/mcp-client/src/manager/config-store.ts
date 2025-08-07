import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import type { MCPServer, ServerCreateInput } from '../types/server';

export class ConfigStore {
  private configPath: string;
  private metadataPath: string;
  private servers: Map<string, MCPServer> = new Map();
  private saveDebounceTimer: NodeJS.Timeout | null = null;

  constructor(configPath?: string) {
    this.configPath = configPath || join(homedir(), '.vibekit', 'mcp-servers.json');
    this.metadataPath = this.configPath.replace('.json', '.metadata.json');
  }

  async initialize(): Promise<void> {
    await this.ensureConfigDir();
    await this.load();
  }

  private async ensureConfigDir(): Promise<void> {
    const dir = dirname(this.configPath);
    try {
      await fs.access(dir);
    } catch {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  private async load(): Promise<void> {
    try {
      // Load main config
      const data = await fs.readFile(this.configPath, 'utf-8');
      const parsed = JSON.parse(data);
      
      // Load metadata separately
      let metadata: Record<string, any> = {};
      try {
        const metadataData = await fs.readFile(this.metadataPath, 'utf-8');
        metadata = JSON.parse(metadataData);
      } catch {
        // Check if metadata is in the old location (inside main config)
        metadata = parsed._vibekit_metadata || {};
      }
      
      // Support multiple formats:
      // 1. New correct format: { mcpServers: { ... } }
      // 2. Old array format: { servers: [...] }
      // 3. Direct object format (legacy): { "ServerName": { ... } }
      let serversData = parsed.mcpServers || parsed.servers;
      
      // If neither mcpServers nor servers exists, check if it's the direct format
      if (!serversData && !parsed._vibekit_metadata && typeof parsed === 'object') {
        // It's the direct object format, wrap it
        serversData = parsed;
      }
      
      if (serversData) {
        if (Array.isArray(serversData)) {
          // Old array format
          for (const server of serversData) {
            if (server.lastConnected && !(server.lastConnected instanceof Date)) {
              server.lastConnected = new Date(server.lastConnected);
            }
            if (!(server.createdAt instanceof Date)) {
              server.createdAt = new Date(server.createdAt || Date.now());
            }
            if (!(server.updatedAt instanceof Date)) {
              server.updatedAt = new Date(server.updatedAt || Date.now());
            }
            this.servers.set(server.id, server);
          }
        } else {
          // New object format (mcpServers or direct object)
          for (const [name, config] of Object.entries(serversData)) {
            // Skip metadata if it's still in the main file
            if (name === '_vibekit_metadata') continue;
            
            const serverMetadata = metadata[name] || {};
            const configData = config as any;
            const server: MCPServer = {
              id: serverMetadata.id || this.generateId(),
              name,
              description: serverMetadata.description,
              transport: configData.transport || 'stdio',
              config: configData,
              status: serverMetadata.status || 'inactive',
              lastConnected: serverMetadata.lastConnected ? new Date(serverMetadata.lastConnected) : undefined,
              createdAt: new Date(serverMetadata.createdAt || Date.now()),
              updatedAt: new Date(serverMetadata.updatedAt || Date.now()),
              toolCount: serverMetadata.toolCount,
              resourceCount: serverMetadata.resourceCount,
              promptCount: serverMetadata.promptCount,
            };
            this.servers.set(server.id, server);
          }
        }
      }
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        console.error('Failed to load config:', error);
      }
      // If file doesn't exist, start with empty config
    }
  }

  private async save(): Promise<void> {
    // Debounce saves to avoid excessive writes
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }

    this.saveDebounceTimer = setTimeout(async () => {
      try {
        // Save clean MCP server configs only
        const mcpServers: Record<string, any> = {};
        const metadata: Record<string, any> = {};
        
        for (const server of this.servers.values()) {
          // Create a clean config object for MCP standard format
          const serverConfig: any = {};
          const config = server.config as any;
          
          if (server.transport === 'stdio') {
            serverConfig.command = config.command;
            serverConfig.args = config.args;
            
            // Only add optional fields if they exist
            if (config.env && Object.keys(config.env).length > 0) {
              serverConfig.env = config.env;
            }
            if (config.cwd) {
              serverConfig.cwd = config.cwd;
            }
          } else {
            // HTTP/SSE transport
            serverConfig.url = config.url;
            if (config.headers) {
              serverConfig.headers = config.headers;
            }
          }
          
          // Use server name as key
          const key = server.name;
          mcpServers[key] = serverConfig;
          
          // Store metadata separately
          metadata[key] = {
            id: server.id,
            description: server.description,
            status: server.status,
            lastConnected: server.lastConnected,
            createdAt: server.createdAt,
            updatedAt: server.updatedAt,
            toolCount: server.toolCount,
            resourceCount: server.resourceCount,
            promptCount: server.promptCount,
          };
        }

        // Save clean config with mcpServers as outer key
        const configData = {
          mcpServers: mcpServers
        };
        
        await fs.writeFile(
          this.configPath,
          JSON.stringify(configData, null, 2),
          'utf-8'
        );
        
        // Save metadata separately
        await fs.writeFile(
          this.metadataPath,
          JSON.stringify(metadata, null, 2),
          'utf-8'
        );
      } catch (error) {
        console.error('Failed to save config:', error);
        throw error;
      }
    }, 100);
  }

  async addServer(input: ServerCreateInput): Promise<MCPServer> {
    const id = this.generateId();
    const now = new Date();
    
    const server: MCPServer = {
      id,
      ...input,
      status: 'inactive',
      createdAt: now,
      updatedAt: now,
    };

    this.servers.set(id, server);
    await this.save();
    
    return server;
  }

  async updateServer(id: string, updates: Partial<MCPServer>): Promise<MCPServer> {
    const server = this.servers.get(id);
    if (!server) {
      throw new Error(`Server ${id} not found`);
    }

    const updated: MCPServer = {
      ...server,
      ...updates,
      id: server.id, // Ensure ID can't be changed
      updatedAt: new Date(),
    };

    this.servers.set(id, updated);
    await this.save();
    
    return updated;
  }

  async removeServer(id: string): Promise<void> {
    if (!this.servers.has(id)) {
      throw new Error(`Server ${id} not found`);
    }

    this.servers.delete(id);
    await this.save();
  }

  getServer(id: string): MCPServer | undefined {
    return this.servers.get(id);
  }

  getAllServers(): MCPServer[] {
    return Array.from(this.servers.values());
  }

  async exportConfig(): Promise<string> {
    const mcpServers: Record<string, any> = {};
    
    for (const server of this.servers.values()) {
      const { id, description, status, lastConnected, createdAt, updatedAt, toolCount, resourceCount, promptCount, ...config } = server;
      
      // Build server config in the new format
      const serverConfig: any = {
        command: config.command,
        args: config.args
      };
      
      // Add optional fields
      if (config.env) {
        serverConfig.env = config.env;
      }
      
      if (config.cwd) {
        serverConfig.cwd = config.cwd;
      }
      
      if (config.transport === 'sse' && config.url) {
        serverConfig.url = config.url;
      }
      
      if (config.transport === 'http' && config.baseUrl) {
        serverConfig.baseUrl = config.baseUrl;
        if (config.headers) {
          serverConfig.headers = config.headers;
        }
      }
      
      mcpServers[server.name] = serverConfig;
    }
    
    const data = {
      mcpServers: mcpServers
    };

    return JSON.stringify(data, null, 2);
  }

  async importConfig(jsonData: string, merge: boolean = true): Promise<void> {
    try {
      const parsed = JSON.parse(jsonData);
      
      // Support both old and new formats
      let serversToImport: any = {};
      
      if (parsed.mcpServers) {
        // New format
        serversToImport = parsed.mcpServers;
      } else if (parsed.servers && Array.isArray(parsed.servers)) {
        // Old format - convert to new format temporarily
        for (const server of parsed.servers) {
          const { id, description, status, lastConnected, createdAt, updatedAt, toolCount, resourceCount, promptCount, ...config } = server;
          serversToImport[server.name] = config;
        }
      } else {
        throw new Error('Invalid config format - expected mcpServers object or servers array');
      }

      // If not merging, clear existing servers
      if (!merge) {
        this.servers.clear();
      }

      // Import servers from the new mcpServers format
      for (const [name, config] of Object.entries(serversToImport)) {
        // Check if server already exists (by name)
        const existingServer = Array.from(this.servers.values()).find(s => s.name === name);
        
        if (existingServer && merge) {
          // Update existing server config
          Object.assign(existingServer, {
            ...config,
            name,
            updatedAt: new Date(),
            status: 'inactive' // Reset status on import
          });
        } else {
          // Create new server
          const id = this.generateId();
          const now = new Date();
          
          // Determine transport type
          let transport: 'stdio' | 'sse' | 'http' = 'stdio';
          if ((config as any).url) transport = 'sse';
          if ((config as any).baseUrl) transport = 'http';
          
          const server: MCPServer = {
            id,
            name,
            transport,
            status: 'inactive',
            createdAt: now,
            updatedAt: now,
            ...(config as any)
          };
          
          this.servers.set(id, server);
        }
      }

      await this.save();
    } catch (error) {
      throw new Error(`Failed to import config: ${(error as Error).message}`);
    }
  }

  private generateId(): string {
    return `mcp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}