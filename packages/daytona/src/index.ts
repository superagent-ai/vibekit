import {
  Daytona,
  DaytonaConfig as DaytonaSDKConfig,
  Sandbox,
} from "@daytonaio/sdk";
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

export interface DaytonaConfig {
  apiKey: string;
  image?: string;
  serverUrl?: string;
  mcpConfig?: MCPConfig;
}

// Helper function to get Docker image based on agent type
const getDockerImageFromAgentType = (agentType?: AgentType) => {
  if (agentType === "codex") {
    return "superagentai/vibekit-codex:1.0";
  } else if (agentType === "claude") {
    return "superagentai/vibekit-claude:1.0";
  } else if (agentType === "opencode") {
    return "superagentai/vibekit-opencode:1.0";
  } else if (agentType === "gemini") {
    return "superagentai/vibekit-gemini:1.1";
  } else if (agentType === "grok") {
    return "superagentai/vibekit-grok-cli:1.0";
  }
  return "ubuntu:22.04";
};

// Daytona implementation
class DaytonaSandboxInstance implements SandboxInstance {
  public mcpManager?: VibeKitMCPManager;
  
  constructor(
    private workspace: Sandbox, // Daytona workspace object
    private daytona: Daytona, // Daytona client
    public sandboxId: string,
    private envs?: Record<string, string>, // Store environment variables
    mcpConfig?: MCPConfig
  ) {
    if (mcpConfig) {
      this.initializeMCP(mcpConfig).catch(error => {
        console.error('Failed to initialize MCP in Daytona sandbox:', error);
      });
    }
  }

  get commands(): SandboxCommands {
    return {
      run: async (command: string, options?: SandboxCommandOptions) => {
        const session = await this.workspace.process.getSession(
          this.workspace.id
        );
        // Check if background execution is requested - not supported in Daytona
        if (options?.background) {
          const response = await this.workspace.process.executeSessionCommand(
            session.sessionId, // sessionId - using a default session name
            {
              command: command,
              runAsync: true, // run asynchronously for background execution
            },
            undefined // timeout - use default working directory
          );

          // Set up logging for the background command
          this.workspace.process.getSessionCommandLogs(
            session.sessionId,
            response.cmdId!,
            (chunk) => {
              options?.onStdout?.(chunk);
            }
          );

          // Wait for the command to complete
          while (true) {
            const commandInfo = await this.workspace.process.getSessionCommand(
              session.sessionId,
              response.cmdId!
            );

            const exitCode = commandInfo.exitCode;
            if (exitCode !== null && exitCode !== undefined) {
              return {
                exitCode: exitCode,
                stdout: "Background command started successfully",
                stderr: "", // SessionExecuteResponse doesn't have stderr
              };
            }

            // Wait before checking again
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        }

        try {
          // Execute command using Daytona's process execution API
          // Format: executeCommand(command, cwd?, env?, timeout?)
          const response = await this.workspace.process.executeSessionCommand(
            session.sessionId, // sessionId - using a default session name
            {
              command: command,
              runAsync: false,
            },
            undefined // timeout - use default working directory
          );

          return {
            exitCode: response.exitCode || 0,
            stdout: response.output || "",
            stderr: "", // ExecuteResponse doesn't have stderr
          };
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          if (options?.onStderr) {
            options.onStderr(errorMessage);
          }
          return {
            exitCode: 1,
            stdout: "",
            stderr: errorMessage,
          };
        }
      },
    };
  }

  async kill(): Promise<void> {
    // Cleanup MCP before killing sandbox
    await this.cleanupMCP();
    if (this.daytona && this.workspace) {
      await this.daytona.delete(this.workspace);
    }
  }

  async pause(): Promise<void> {
    // Daytona doesn't have a direct pause equivalent
    console.log(
      "Pause not directly supported for Daytona sandboxes - workspace remains active"
    );
  }

  async getHost(port: number): Promise<string> {
    const previewLink = await this.workspace.getPreviewLink(port);
    return previewLink.url;
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
      throw new Error('MCP not initialized in Daytona sandbox');
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

export class DaytonaSandboxProvider implements SandboxProvider {
  constructor(private config: DaytonaConfig) {}

  async create(
    envs?: Record<string, string>,
    agentType?: AgentType,
    workingDirectory?: string,
    mcpConfig?: MCPConfig
  ): Promise<SandboxInstance> {
    try {
      // Dynamic import to avoid dependency issues if daytona-sdk is not installed
      const daytonaConfig: DaytonaSDKConfig = {
        apiKey: this.config.apiKey,
        apiUrl: this.config.serverUrl || "https://app.daytona.io/api",
      };

      const daytona = new Daytona(daytonaConfig);

      // Determine default image based on agent type if not specified in config
      let image = this.config.image || getDockerImageFromAgentType(agentType);

      // Create workspace with specified image or default and environment variables
      const workspace = await daytona.create({
        image,
        envVars: envs || {},
      });

      await workspace.process.createSession(workspace.id);

      // Set up working directory if specified
      if (workingDirectory) {
        await workspace.process.executeSessionCommand(
          workspace.id,
          {
            command: `mkdir -p ${workingDirectory}`,
            runAsync: false,
          },
          undefined
        );
      }

      // Use MCP config from parameters or fallback to provider config
      const finalMCPConfig = mcpConfig || this.config.mcpConfig;
      return new DaytonaSandboxInstance(workspace, daytona, workspace.id, envs, finalMCPConfig);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("Cannot resolve module")
      ) {
        throw new Error(
          "Daytona SDK not found. Please install daytona-sdk: npm install daytona-sdk"
        );
      }
      throw new Error(
        `Failed to create Daytona sandbox: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  async resume(
    sandboxId: string,
    mcpConfig?: MCPConfig
  ): Promise<SandboxInstance> {
    try {
      const daytonaConfig: DaytonaSDKConfig = {
        apiKey: this.config.apiKey,
        apiUrl: this.config.serverUrl || "https://app.daytona.io/api",
      };

      const daytona = new Daytona(daytonaConfig);

      // Resume workspace by ID
      const workspace = await daytona.get(sandboxId);

      // Use MCP config from parameters or fallback to provider config
      const finalMCPConfig = mcpConfig || this.config.mcpConfig;
      return new DaytonaSandboxInstance(
        workspace,
        daytona,
        sandboxId,
        undefined,
        finalMCPConfig
      );
    } catch (error) {
      throw new Error(
        `Failed to resume Daytona sandbox: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
}

export function createDaytonaProvider(
  config: DaytonaConfig
): DaytonaSandboxProvider {
  return new DaytonaSandboxProvider(config);
}
