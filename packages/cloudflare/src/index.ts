import { getSandbox, type LogEvent, parseSSEStream, type Sandbox, type SandboxEnv } from "@cloudflare/sandbox";

// MCP integration imports
import { VibeKitMCPManager } from '@vibe-kit/vibekit/mcp/manager';
import type { MCPConfig, MCPTool, MCPToolResult } from '@vibe-kit/vibekit';

// Define the interfaces we need from the SDK
export interface SandboxExecutionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface SandboxCommandOptions {
  timeoutMs?: number;
  background?: boolean;
  onStdout?: (data: string) => void;
  onStderr?: (data: string) => void;
}

export interface SandboxCommands {
  run(
    command: string,
    options?: SandboxCommandOptions
  ): Promise<SandboxExecutionResult>;
}

export interface SandboxInstance {
  sandboxId: string;
  commands: SandboxCommands;
  mcpManager?: VibeKitMCPManager;
  kill(): Promise<void>;
  pause(): Promise<void>;
  getHost(port: number): Promise<string>;
  // MCP integration methods
  initializeMCP?(mcpConfig: MCPConfig): Promise<void>;
  getAvailableTools?(): Promise<MCPTool[]>;
  executeMCPTool?(toolName: string, args: any): Promise<MCPToolResult>;
}

export interface SandboxProvider {
  create(
    envs?: Record<string, string>,
    agentType?: "codex" | "claude" | "opencode" | "gemini",
    workingDirectory?: string,
    mcpConfig?: MCPConfig
  ): Promise<SandboxInstance>;
  resume(sandboxId: string, mcpConfig?: MCPConfig): Promise<SandboxInstance>;
}

export type AgentType = "codex" | "claude" | "opencode" | "gemini";

export interface CloudflareConfig {
  env: SandboxEnv;
  hostname: string;
  mcpConfig?: MCPConfig;
}

// Cloudflare implementation
export class CloudflareSandboxInstance implements SandboxInstance {
  public mcpManager?: VibeKitMCPManager;

  constructor(
    private sandbox: Sandbox,
    public sandboxId: string,
    private hostname: string,
    mcpConfig?: MCPConfig
  ) {
    // Initialize MCP manager if config is provided
    if (mcpConfig) {
      this.initializeMCP(mcpConfig).catch(error => {
        console.error('Failed to initialize MCP in Cloudflare sandbox:', error);
      });
    }
  }

  async initializeMCP(mcpConfig: MCPConfig): Promise<void> {
    if (!mcpConfig) return;
    
    try {
      this.mcpManager = new VibeKitMCPManager();
      const servers = Array.isArray(mcpConfig.servers) ? mcpConfig.servers : [mcpConfig.servers];
      await this.mcpManager.initialize(servers);
      console.log('MCP initialized successfully in Cloudflare sandbox');
    } catch (error) {
      console.error('Failed to initialize MCP in Cloudflare sandbox:', error);
      throw error;
    }
  }

  async getAvailableTools(): Promise<MCPTool[]> {
    if (!this.mcpManager) {
      return [];
    }
    return await this.mcpManager.listTools();
  }

  async executeMCPTool(toolName: string, args: any): Promise<MCPToolResult> {
    if (!this.mcpManager) {
      throw new Error('MCP manager not initialized. Call initializeMCP() first.');
    }
    return await this.mcpManager.executeTool(toolName, args);
  }

  private async handleBackgroundCommand(command: string, options?: SandboxCommandOptions) {
    const response = await this.sandbox.startProcess(command);

    // Defer log streaming to avoid blocking the return
    (async () => {
      try {
        const logStream = await this.sandbox.streamProcessLogs(response.id);
        for await (const log of parseSSEStream<LogEvent>(logStream)) {
          if (log.type === 'stdout') {
            options?.onStdout?.(log.data);
          } else if (log.type === 'stderr') {
            options?.onStderr?.(log.data);
          } else if (log.type === 'exit') {
            await this.sandbox.killProcess(response.id);
          } else if (log.type === 'error') {
            options?.onStderr?.(log.data);
            await this.sandbox.killProcess(response.id);
          }
        }
      } catch (error) {
        console.error('Background log streaming error:', error);
      }
    })();

    // Return immediately for background commands
    return {
      exitCode: 0,
      stdout: "Background command started successfully",
      stderr: "",
    };
  }

  private async handleForegroundCommand(command: string, options?: SandboxCommandOptions) {
    const response = await this.sandbox.exec(command, {
      stream: true,
      onOutput(stream, data) {
        if (stream === 'stdout') {
          options?.onStdout?.(data);
        } else if (stream === 'stderr') {
          options?.onStderr?.(data);
        }
      },
    });

    return response;
  }

  get commands(): SandboxCommands {
    return {
      run: (command: string, options?: SandboxCommandOptions) => {
        return options?.background
          ? this.handleBackgroundCommand(command, options)
          : this.handleForegroundCommand(command, options);
      },
    };
  }

  async kill(): Promise<void> {
    // Clean up MCP manager before destroying sandbox
    if (this.mcpManager) {
      try {
        await this.mcpManager.cleanup();
      } catch (error) {
        console.error('Error cleaning up MCP manager:', error);
      }
    }
    await this.sandbox.destroy();
  }

  async pause(): Promise<void> {
    await this.sandbox.stop();
  }

  async getHost(port: number): Promise<string> {
    const response = await this.sandbox.exposePort(port, { name: 'vibekit', hostname: this.hostname });
    return response.url;
  }
}

export class CloudflareSandboxProvider implements SandboxProvider {
  constructor(private config: CloudflareConfig) { }

  async create(
    envs?: Record<string, string>,
    agentType?: AgentType,
    workingDirectory?: string,
    mcpConfig?: MCPConfig
  ): Promise<SandboxInstance> {
    const finalMcpConfig = mcpConfig || this.config.mcpConfig;
    if (!this.config.env || !this.config.env.Sandbox) {
      throw new Error(
        `Cloudflare Durable Object binding "Sandbox" not found. ` +
        `Make sure you're running within a Cloudflare Worker and the binding is configured in wrangler.json/toml`
      );
    }

    // Generate a unique sandbox ID
    const sandboxId = `vibekit-${agentType || 'default'}-${Date.now()}`;

    // Get or create a sandbox instance using the SDK
    const sandbox = getSandbox(this.config.env.Sandbox, sandboxId) as Sandbox;
    sandbox.setEnvVars(envs || {});
    await sandbox.exec(`sudo mkdir -p ${workingDirectory} && sudo chown $USER:$USER ${workingDirectory}`);

    return new CloudflareSandboxInstance(sandbox, sandboxId, this.config.hostname, finalMcpConfig);
  }

  async resume(sandboxId: string, mcpConfig?: MCPConfig): Promise<SandboxInstance> {
    const finalMcpConfig = mcpConfig || this.config.mcpConfig;
    const sandbox = getSandbox(this.config.env.Sandbox, sandboxId) as Sandbox;
    return new CloudflareSandboxInstance(sandbox, sandboxId, this.config.hostname, finalMcpConfig);
  }
}

export function createCloudflareProvider(
  config: CloudflareConfig
): CloudflareSandboxProvider {
  return new CloudflareSandboxProvider(config);
}
