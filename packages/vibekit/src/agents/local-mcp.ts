/**
 * Local MCP Server Integration (Dagger-based)
 * 
 * Simplified MCP server configuration for dagger-based local sandboxes.
 * Note: Full MCP integration may require additional implementation.
 */

import { SandboxInstance } from '../types';

export interface MCPServerConfig {
  sandboxId: string;
  serverType: 'stdio' | 'transport';
  port?: number;
  host?: string;
}

export interface MCPServerInstance {
  config: MCPServerConfig;
  isRunning: boolean;
  stop(): Promise<void>;
}

/**
 * Simplified MCP server manager for dagger-based sandboxes
 */
export class MCPServerManager {
  private servers = new Map<string, MCPServerInstance>();

  async initializeForSandbox(
    sandbox: SandboxInstance,
    agentType?: string
  ): Promise<MCPServerInstance | null> {
    // For now, return a mock implementation
    // Full MCP integration would require implementing MCP protocol over dagger
    console.log(`MCP initialization for sandbox ${sandbox.sandboxId} (agent: ${agentType || 'default'})`);
    
    const config: MCPServerConfig = {
      sandboxId: sandbox.sandboxId,
      serverType: 'stdio',
    };

    const serverInstance: MCPServerInstance = {
      config,
      isRunning: false,
      stop: async () => {
        this.servers.delete(sandbox.sandboxId);
      }
    };

    this.servers.set(sandbox.sandboxId, serverInstance);
    return serverInstance;
  }

  async cleanup(sandboxId: string): Promise<void> {
    const server = this.servers.get(sandboxId);
    if (server) {
      await server.stop();
    }
  }

  async cleanupAll(): Promise<void> {
    const cleanupPromises = Array.from(this.servers.values()).map(server => server.stop());
    await Promise.all(cleanupPromises);
    this.servers.clear();
  }
}

// Global MCP server manager instance
export const mcpServerManager = new MCPServerManager();

/**
 * Initialize MCP for an agent with a dagger sandbox
 */
export async function initializeMCPForAgent(
  sandbox: SandboxInstance,
  agentType?: string
): Promise<MCPServerInstance | null> {
  return mcpServerManager.initializeForSandbox(sandbox, agentType);
}

/**
 * Cleanup MCP for a sandbox
 */
export async function cleanupMCPForSandbox(sandboxId: string): Promise<void> {
  return mcpServerManager.cleanup(sandboxId);
}

// Legacy function name for compatibility
export async function cleanupMCPForEnvironment(environment: any): Promise<void> {
  // For legacy compatibility, try to extract sandboxId from environment
  const sandboxId = environment?.sandboxId || environment?.name || 'unknown';
  return cleanupMCPForSandbox(sandboxId);
} 