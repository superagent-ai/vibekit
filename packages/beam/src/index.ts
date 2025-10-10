import {
  beamOpts,
  Image,
  Sandbox as BeamSandbox,
  SandboxInstance as BeamSandboxInstance,
} from "@beamcloud/beam-js";

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

export interface BeamConfig {
  token: string;
  workspaceId: string;
  image?: string;
  cpu?: number;
  memory?: number | string;
  keepWarmSeconds?: number;
}

const getDockerImageFromAgentType = (agentType?: AgentType): string => {
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

// Beam implementation
export class BeamSandboxInstanceWrapper implements SandboxInstance {
  constructor(private beamInstance: BeamSandboxInstance) {}

  get sandboxId(): string {
    return this.beamInstance.sandboxId;
  }

  get commands(): SandboxCommands {
    return {
      run: async (
        command: string,
        options?: SandboxCommandOptions
      ): Promise<SandboxExecutionResult> => {
        try {
          const process = await this.beamInstance.exec("bash", "-c", command);

          let stdoutBuffer = "";
          let stderrBuffer = "";

          if (options?.background) {
            // Start async streaming in the background
            (async () => {
              try {
                const stdout = await process.stdout.read();
                stdoutBuffer += stdout;
                options.onStdout?.(stdout);
              } catch (e) {
                // Ignore errors for background processes
              }
            })();

            (async () => {
              try {
                const stderr = await process.stderr.read();
                stderrBuffer += stderr;
                options.onStderr?.(stderr);
              } catch (e) {
                // Ignore errors for background processes
              }
            })();

            return {
              exitCode: 0,
              stdout: "Background command started successfully",
              stderr: "",
            };
          }

          // For non-background execution, wait for completion and stream output
          const [exitCode, stdoutData, stderrData] = await Promise.all([
            process.wait(),
            process.stdout.read(),
            process.stderr.read(),
          ]);

          stdoutBuffer = stdoutData;
          stderrBuffer = stderrData;

          // Call callbacks if provided
          if (options?.onStdout && stdoutBuffer) {
            options.onStdout(stdoutBuffer);
          }
          if (options?.onStderr && stderrBuffer) {
            options.onStderr(stderrBuffer);
          }

          return {
            exitCode: exitCode,
            stdout: stdoutBuffer,
            stderr: stderrBuffer,
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
    await this.beamInstance.terminate();
  }

  async pause(): Promise<void> {
    // TODO: Implement using snapshots
    console.log(
      "Pause not directly supported for Beam sandboxes - sandbox remains active. Use updateTtl() to manage keep-warm settings."
    );
  }

  async getHost(port: number): Promise<string> {
    try {
      const url = await this.beamInstance.exposePort(port);
      return url;
    } catch (error) {
      throw new Error(
        `Failed to expose port ${port}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
}

export class BeamSandboxProvider implements SandboxProvider {
  constructor(private config: BeamConfig) {
    // Configure Beam globally
    beamOpts.token = this.config.token;
    beamOpts.workspaceId = this.config.workspaceId;
  }

  async create(
    envs?: Record<string, string>,
    agentType?: AgentType,
    _workingDirectory?: string
  ): Promise<SandboxInstance> {
    try {
      const imageName =
        this.config.image || getDockerImageFromAgentType(agentType);

      const image = new Image({
        baseImage: imageName,
        envVars: envs
          ? Object.entries(envs).map(([key, value]) => `${key}=${value}`)
          : [],
      });

      const sandbox = new BeamSandbox({
        name: `vibekit-${agentType || "sandbox"}-${Date.now()}`,
        image: image,
        cpu: this.config.cpu || 2,
        memory: this.config.memory || "1Gi",
        keepWarmSeconds: this.config.keepWarmSeconds || 300,
      });

      const instance = await sandbox.create();

      return new BeamSandboxInstanceWrapper(instance);
    } catch (error) {
      throw new Error(
        `Failed to create Beam sandbox: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  async resume(sandboxId: string): Promise<SandboxInstance> {
    try {
      const instance = await BeamSandbox.connect(sandboxId);

      return new BeamSandboxInstanceWrapper(instance);
    } catch (error) {
      throw new Error(
        `Failed to resume Beam sandbox: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
}

export function createBeamProvider(config: BeamConfig): BeamSandboxProvider {
  return new BeamSandboxProvider(config);
}
