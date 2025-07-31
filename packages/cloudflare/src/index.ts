import { getSandbox, type LogEvent, parseSSEStream, type Sandbox, type SandboxEnv } from "@cloudflare/sandbox";

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
    agentType?: "codex" | "claude" | "opencode" | "gemini",
    workingDirectory?: string
  ): Promise<SandboxInstance>;
  resume(sandboxId: string): Promise<SandboxInstance>;
}

export type AgentType = "codex" | "claude" | "opencode" | "gemini";

export interface CloudflareConfig {
  env: SandboxEnv;
  hostname: string;
}

// Cloudflare implementation
export class CloudflareSandboxInstance implements SandboxInstance {
  constructor(
    private sandbox: Sandbox,
    public sandboxId: string,
    private hostname: string,
  ) { }

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
    workingDirectory?: string
  ): Promise<SandboxInstance> {
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

    return new CloudflareSandboxInstance(sandbox, sandboxId, this.config.hostname);
  }

  async resume(sandboxId: string): Promise<SandboxInstance> {
    const sandbox = getSandbox(this.config.env.Sandbox, sandboxId) as Sandbox;
    return new CloudflareSandboxInstance(sandbox, sandboxId, this.config.hostname);
  }
}

export function createCloudflareProvider(
  config: CloudflareConfig
): CloudflareSandboxProvider {
  return new CloudflareSandboxProvider(config);
}
