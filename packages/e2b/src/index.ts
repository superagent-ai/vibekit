import { Sandbox as E2BSandbox } from "@e2b/code-interpreter";
import { VibeKitMCPManager } from "@vibe-kit/vibekit/mcp/manager";
import type { MCPConfig, MCPTool, MCPToolResult } from "@vibe-kit/vibekit";

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
  // MCP-related methods
  initializeMCP?(mcpConfig: MCPConfig): Promise<void>;
  getAvailableTools?(): Promise<MCPTool[]>;
  executeMCPTool?(toolName: string, args: any): Promise<MCPToolResult>;
}

export interface SandboxProvider {
  create(
    envs?: Record<string, string>,
    agentType?: "codex" | "claude" | "opencode" | "gemini" | "grok",
    workingDirectory?: string,
    mcpConfig?: MCPConfig
  ): Promise<SandboxInstance>;
  resume(
    sandboxId: string,
    mcpConfig?: MCPConfig
  ): Promise<SandboxInstance>;
}

export type AgentType = "codex" | "claude" | "opencode" | "gemini" | "grok";

export interface E2BConfig {
  apiKey: string;
  templateId?: string;
  mcpConfig?: MCPConfig;
}

// E2B implementation
export class E2BSandboxInstance implements SandboxInstance {
  public mcpManager?: VibeKitMCPManager;
  
  constructor(private sandbox: E2BSandbox, mcpConfig?: MCPConfig) {
    if (mcpConfig) {
      this.initializeMCP(mcpConfig).catch(error => {
        console.error('Failed to initialize MCP in E2B sandbox:', error);
      });
    }
  }

  get sandboxId(): string {
    return this.sandbox.sandboxId;
  }

  get commands(): SandboxCommands {
    return {
      run: async (command: string, options?: SandboxCommandOptions) => {
        // Extract our custom options and pass the rest to E2B
        const { background, ...e2bOptions } = options || {};

        // E2B has specific overloads for background vs non-background execution
        if (background) {
          // For background execution, E2B returns a CommandHandle, not a CommandResult
          await this.sandbox.commands.run(command, {
            ...e2bOptions,
            background: true,
            onStdout: (data) => console.log("stdout", data),
            onStderr: (data) => console.log("stderr", data),
          });
          // Since we need to return SandboxExecutionResult consistently,
          // return a placeholder result for background commands

          return {
            exitCode: 0,
            stdout: "Background command started successfully",
            stderr: "",
          };
        } else {
          // For non-background execution, E2B returns a CommandResult
          return await this.sandbox.commands.run(command, e2bOptions);
        }
      },
    };
  }

  async kill(): Promise<void> {
    // Cleanup MCP before killing sandbox
    await this.cleanupMCP();
    await this.sandbox.kill();
  }

  async pause(): Promise<void> {
    await this.sandbox.pause();
  }

  async getHost(port: number): Promise<string> {
    return await this.sandbox.getHost(port);
  }

  async initializeMCP(mcpConfig: MCPConfig): Promise<void> {
    if (!mcpConfig.servers || mcpConfig.servers.length === 0) {
      return;
    }

    this.mcpManager = new VibeKitMCPManager();
    await this.mcpManager.initialize(mcpConfig.servers);
  }

  async getAvailableTools(): Promise<MCPTool[]> {
    if (!this.mcpManager) {
      return [];
    }
    return await this.mcpManager.listTools();
  }

  async executeMCPTool(toolName: string, args: any): Promise<MCPToolResult> {
    if (!this.mcpManager) {
      throw new Error('MCP not initialized in E2B sandbox');
    }
    return await this.mcpManager.executeTool(toolName, args);
  }

  private async cleanupMCP(): Promise<void> {
    if (this.mcpManager) {
      await this.mcpManager.cleanup();
      this.mcpManager = undefined;
    }
  }
}

export class E2BSandboxProvider implements SandboxProvider {
  constructor(private config: E2BConfig) {}

  async create(
    envs?: Record<string, string>,
    agentType?: AgentType,
    workingDirectory?: string,
    mcpConfig?: MCPConfig
  ): Promise<SandboxInstance> {
    // Determine default template based on agent type if not specified in config
    let templateId = this.config.templateId;
    if (!templateId) {
      if (agentType === "claude") {
        templateId = "vibekit-claude";
      } else if (agentType === "opencode") {
        templateId = "vibekit-opencode";
      } else if (agentType === "gemini") {
        templateId = "vibekit-gemini";
      } else if (agentType === "grok") {
        templateId = "vibekit-grok";
      } else {
        templateId = "vibekit-codex";
      }
    }

    const sandbox = await E2BSandbox.create(templateId, {
      envs,
      apiKey: this.config.apiKey,
      timeoutMs: 3600000, // 1 hour in milliseconds
    });

    // Set up working directory if specified
    if (workingDirectory) {
      await sandbox.commands.run(
        `sudo mkdir -p ${workingDirectory} && sudo chown $USER:$USER ${workingDirectory}`
      );
    }

    // Use MCP config from parameters or fallback to provider config
    const finalMCPConfig = mcpConfig || this.config.mcpConfig;
    return new E2BSandboxInstance(sandbox, finalMCPConfig);
  }

  async resume(
    sandboxId: string,
    mcpConfig?: MCPConfig
  ): Promise<SandboxInstance> {
    const sandbox = await E2BSandbox.resume(sandboxId, {
      timeoutMs: 3600000,
      apiKey: this.config.apiKey,
    });
    // Use MCP config from parameters or fallback to provider config
    const finalMCPConfig = mcpConfig || this.config.mcpConfig;
    return new E2BSandboxInstance(sandbox, finalMCPConfig);
  }
}

export function createE2BProvider(config: E2BConfig): E2BSandboxProvider {
  return new E2BSandboxProvider(config);
}
