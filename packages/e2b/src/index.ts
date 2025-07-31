import { Sandbox as E2BSandbox } from "@e2b/code-interpreter";

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

export interface E2BConfig {
  apiKey: string;
  templateId?: string;
}

// E2B implementation
export class E2BSandboxInstance implements SandboxInstance {
  constructor(private sandbox: E2BSandbox) {}

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
    await this.sandbox.kill();
  }

  async pause(): Promise<void> {
    await this.sandbox.pause();
  }

  async getHost(port: number): Promise<string> {
    return await this.sandbox.getHost(port);
  }
}

export class E2BSandboxProvider implements SandboxProvider {
  constructor(private config: E2BConfig) {}

  async create(
    envs?: Record<string, string>,
    agentType?: AgentType,
    workingDirectory?: string
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

    return new E2BSandboxInstance(sandbox);
  }

  async resume(sandboxId: string): Promise<SandboxInstance> {
    const sandbox = await E2BSandbox.resume(sandboxId, {
      timeoutMs: 3600000,
      apiKey: this.config.apiKey,
    });
    return new E2BSandboxInstance(sandbox);
  }
}

export function createE2BProvider(config: E2BConfig): E2BSandboxProvider {
  return new E2BSandboxProvider(config);
}
