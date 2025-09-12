import { App, Image, Secret, Sandbox as ModalSandbox } from "modal";

// Define the interfaces we need from the SDK
export interface SandboxExecutionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}
// Define interfaces we need from the SDK
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

export interface ModalConfig {
  image?: string;
  encryptedPorts?: number[];
  h2Ports?: number[];
}

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

//Modal implementation
export class ModalSandboxInstance implements SandboxInstance {
  constructor(private sandbox: ModalSandbox) {}
  get sandboxId(): string {
    return this.sandbox.sandboxId;
  }
  get commands(): SandboxCommands {
    return {
      run: async (
        command: string,
        options?: SandboxCommandOptions
      ): Promise<SandboxExecutionResult> => {
        const commands: string[] = ["bash", "-c", command];
        const proc = await this.sandbox.exec(commands, {
          stdout: "pipe",
          stderr: "pipe",
          timeout: options?.timeoutMs,
        });

        let stdoutBuffer = "";
        let stderrBuffer = "";

        // Stream stdout
        if (options?.onStdout && proc.stdout) {
          (async () => {
            try {
              // @ts-ignore - Modal stream is async iterable of Uint8Array|string
              for await (const chunk of proc.stdout as any) {
                const text =
                  typeof chunk === "string"
                    ? chunk
                    : new TextDecoder().decode(chunk);
                stdoutBuffer += text;
                options.onStdout!(text);
              }
            } catch {}
          })();
        }

        // Stream stderr
        if (options?.onStderr && proc.stderr) {
          (async () => {
            try {
              // @ts-ignore - Modal stream is async iterable of Uint8Array|string
              for await (const chunk of proc.stderr as any) {
                const text =
                  typeof chunk === "string"
                    ? chunk
                    : new TextDecoder().decode(chunk);
                stderrBuffer += text;
                options.onStderr!(text);
              }
            } catch {}
          })();
        }

        const exitCode = await proc.wait();
        return {
          exitCode: exitCode,
          stdout: stdoutBuffer,
          stderr: stderrBuffer,
        };
      },
    };
  }
  async kill(): Promise<void> {
    await this.sandbox.terminate();
  }

  async pause(): Promise<void> {
    console.log("Pause not directly supported"); //TODO: implement via FS or memory snapshots
  }

  async getHost(port: number): Promise<string> {
    const tunnels = await this.sandbox.tunnels();
    if (port in tunnels) {
      return tunnels[port].url;
    } else {
      return Promise.reject(`Port ${port} not found in Modal sandbox tunnels`);
    }
  }
}

export class ModalSandboxProvider implements SandboxProvider {
  constructor(private config: ModalConfig) {}

  async create(
    envs?: Record<string, string>,
    agentType?: AgentType,
    workingDirectory?: string
  ): Promise<ModalSandboxInstance> {
    try {
      const sbSecrets = await Secret.fromObject(envs || {});
      console.log("Creating Modal sandbox");
      let imageName =
        this.config.image || getDockerImageFromAgentType(agentType);
      let newAppName = Math.random().toString(36).substring(2, 15); // random app name
      const appPromise = App.lookup(newAppName, { createIfMissing: true });
      const imagePromise = Image.fromRegistry(imageName);
      const [app, image] = await Promise.all([appPromise, imagePromise]);
      const sandbox = await app.createSandbox(image, {
        encryptedPorts: this.config.encryptedPorts || [],
        h2Ports: this.config.h2Ports || [],
        secrets: [sbSecrets],
      });
      console.log(await sandbox.tunnels());
      return new ModalSandboxInstance(sandbox);
    } catch (error) {
      throw new Error(`Failed to create Modal sandbox: ${error}`);
    }
  }
  async resume(sandboxId: string): Promise<ModalSandboxInstance> {
    return await this.create(); //default to creating new instance as dagger and daytona implementations do
  }
}

export function createModalProvider(config: ModalConfig): ModalSandboxProvider {
  return new ModalSandboxProvider(config);
}
