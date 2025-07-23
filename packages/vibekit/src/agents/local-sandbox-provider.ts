/**
 * Local Sandbox Provider for Agent Integration (Dagger-based)
 * 
 * Provides a specialized sandbox provider that integrates dagger-based
 * local sandboxes with Vibekit agents, including simplified MCP integration.
 */

import { SandboxProvider, SandboxInstance, SandboxCommands, SandboxExecutionResult, SandboxCommandOptions } from '../types';
import { LocalDaggerSandboxProvider, createLocalProvider, type LocalDaggerConfig, type AgentType } from '@vibekit/local';
import { 
  initializeMCPForAgent, 
  cleanupMCPForSandbox, 
  MCPServerInstance,
} from './local-mcp';

export interface LocalAgentSandboxConfig extends LocalDaggerConfig {
  workingDirectory?: string;
  enableMCP?: boolean;
  mcpServerType?: 'stdio' | 'transport';
}

/**
 * Local sandbox instance with simplified MCP integration
 */
export class LocalAgentSandboxInstance implements SandboxInstance {
  public sandboxId: string;
  public commands: SandboxCommands;
  private mcpServer?: MCPServerInstance;
  private baseSandbox: SandboxInstance;

  constructor(
    baseSandbox: SandboxInstance,
    private config: LocalAgentSandboxConfig,
    private agentType?: AgentType
  ) {
    this.baseSandbox = baseSandbox;
    this.sandboxId = baseSandbox.sandboxId;
    this.commands = baseSandbox.commands;
  }

  async initializeMCP(): Promise<void> {
    if (this.config.enableMCP) {
      try {
        const server = await initializeMCPForAgent(this.baseSandbox, this.agentType);
        this.mcpServer = server || undefined;
      } catch (error) {
        console.warn(`Failed to initialize MCP for sandbox ${this.sandboxId}: ${error}`);
      }
    }
  }

  async kill(): Promise<void> {
    if (this.mcpServer) {
      await this.mcpServer.stop();
    }
    await this.baseSandbox.kill();
  }

  async pause(): Promise<void> {
    await this.baseSandbox.pause();
  }

  async getHost(port: number): Promise<string> {
    return this.baseSandbox.getHost(port);
  }

  getMCPServer(): MCPServerInstance | undefined {
    return this.mcpServer;
  }
}

/**
 * Local sandbox provider with agent-specific configuration
 */
export class LocalAgentSandboxProvider implements SandboxProvider {
  private baseProvider: LocalDaggerSandboxProvider;

  constructor(private config: LocalAgentSandboxConfig = {}) {
    this.baseProvider = createLocalProvider(config);
  }

  async create(
    envs?: Record<string, string>,
    agentType?: AgentType,
    workingDirectory?: string
  ): Promise<LocalAgentSandboxInstance> {
    const baseSandbox = await this.baseProvider.create(
      envs, 
      agentType, 
      workingDirectory || this.config.workingDirectory
    );

    const agentSandbox = new LocalAgentSandboxInstance(
      baseSandbox,
      this.config,
      agentType
    );

    // Initialize MCP if enabled
    await agentSandbox.initializeMCP();

    return agentSandbox;
  }

  async resume(sandboxId: string): Promise<LocalAgentSandboxInstance> {
    const baseSandbox = await this.baseProvider.resume(sandboxId);

    const agentSandbox = new LocalAgentSandboxInstance(
      baseSandbox,
      this.config
    );

    return agentSandbox;
  }
}

/**
 * Create a local agent sandbox provider with configuration
 */
export function createLocalAgentProvider(config: LocalAgentSandboxConfig = {}): LocalAgentSandboxProvider {
  return new LocalAgentSandboxProvider(config);
}

/**
 * Agent-specific provider configurations
 */
export const AgentProviderConfigs = {
  claude: {
    enableMCP: true,
    mcpServerType: 'stdio' as const,
    workingDirectory: '/workspace',
  },
  
  codex: {
    enableMCP: true,
    mcpServerType: 'stdio' as const,
    workingDirectory: '/workspace',
  },
  
  opencode: {
    enableMCP: true,
    mcpServerType: 'stdio' as const,
    workingDirectory: '/workspace',
  },
  
  gemini: {
    enableMCP: true,
    mcpServerType: 'stdio' as const,
    workingDirectory: '/workspace',
  },
};

/**
 * Create agent-specific provider
 */
export function createAgentProvider(
  agentType: AgentType,
  overrides: Partial<LocalAgentSandboxConfig> = {}
): LocalAgentSandboxProvider {
  const defaultConfig = AgentProviderConfigs[agentType] || AgentProviderConfigs.codex;
  const config = { ...defaultConfig, ...overrides };
  return createLocalAgentProvider(config);
} 