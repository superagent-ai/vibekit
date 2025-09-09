import {
  Daytona,
  DaytonaConfig as DaytonaSDKConfig,
  Sandbox,
} from "@daytonaio/sdk";

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
  kill(): Promise<void>;
  pause(): Promise<void>;
  getHost(port: number): Promise<string>;
}

export interface SandboxProvider {
  create(
    envs?: Record<string, string>,
    agentType?: "codex" | "claude" | "opencode" | "gemini" | "grok",
    workingDirectory?: string
  ): Promise<SandboxInstance>;
  resume(sandboxId: string): Promise<SandboxInstance>;
}

export type AgentType = "codex" | "claude" | "opencode" | "gemini" | "grok";

export interface DaytonaConfig {
  apiKey: string;
  image?: string;
  serverUrl?: string;
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
  constructor(
    private workspace: Sandbox, // Daytona workspace object
    private daytona: Daytona, // Daytona client
    public sandboxId: string,
    private envs?: Record<string, string> // Store environment variables
  ) {}

  get commands(): SandboxCommands {
    return {
      run: async (command: string, options?: SandboxCommandOptions) => {
        const session = await this.workspace.process.getSession(
          this.workspace.id
        );

        try {
          // Execute command using Daytona's process execution API
          const response = await this.workspace.process.executeSessionCommand(
            session.sessionId,
            {
              command: command,
              runAsync: options?.background,
            },
            undefined
          );

          await this.workspace.process.getSessionCommandLogs(
            session.sessionId,
            response.cmdId!,
            (stdout) => options?.onStdout?.(stdout),
            (stderr) => options?.onStderr?.(stderr)
          );

          const logs = await this.workspace.process.getSessionCommandLogs(
            session.sessionId,
            response.cmdId!
          );

          return {
            exitCode: 0,
            stdout: logs.stdout || "",
            stderr: logs.stderr || "",
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
}

export class DaytonaSandboxProvider implements SandboxProvider {
  constructor(private config: DaytonaConfig) {}

  async create(
    envs?: Record<string, string>,
    agentType?: AgentType,
    workingDirectory?: string
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

      return new DaytonaSandboxInstance(workspace, daytona, workspace.id, envs);
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

  async resume(sandboxId: string): Promise<SandboxInstance> {
    try {
      const daytonaConfig: DaytonaSDKConfig = {
        apiKey: this.config.apiKey,
        apiUrl: this.config.serverUrl || "https://app.daytona.io/api",
      };

      const daytona = new Daytona(daytonaConfig);

      // Resume workspace by ID
      const workspace = await daytona.get(sandboxId);

      return new DaytonaSandboxInstance(
        workspace,
        daytona,
        sandboxId,
        undefined
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
