import { randomUUID } from "node:crypto";
import {
  ExecError,
  SpritesClient,
} from "@fly/sprites";
import type { Sprite, SpriteCommand } from "@fly/sprites";

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
    agentType?: AgentType,
    workingDirectory?: string
  ): Promise<SandboxInstance>;
  resume(sandboxId: string): Promise<SandboxInstance>;
}

export type AgentType = "codex" | "claude" | "opencode" | "gemini" | "grok";

export interface FlyIOConfig {
  /** Sprites API token. */
  token: string;
  /** Override the Sprites API endpoint. */
  baseURL?: string;
  /** Runtime variant. VibeKit defaults to the agent-ready dev runtime. */
  runtime?: "default" | "dev";
  /** Access mode for the Sprite's HTTPS URL. Defaults to authenticated. */
  urlAuth?: "sprite" | "public";
  /** Wait for organization capacity rather than failing immediately. */
  waitForCapacity?: boolean;
  /** Labels added to Sprites created by this provider. */
  labels?: string[];
}

function text(value: string | Buffer): string {
  return typeof value === "string" ? value : value.toString("utf8");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class FlyIOSandboxInstance implements SandboxInstance {
  private readonly backgroundCommands = new Set<SpriteCommand>();

  constructor(
    private readonly sprite: Sprite,
    private readonly workingDirectory?: string
  ) {}

  get sandboxId(): string {
    return this.sprite.name;
  }

  get commands(): SandboxCommands {
    return {
      run: async (command, options = {}) => {
        if (options.background) {
          return this.runBackground(command, options);
        }

        try {
          const result = await this.sprite.execFile("bash", ["-lc", command], {
            cwd: this.workingDirectory,
            timeout: options.timeoutMs,
          });
          const stdout = text(result.stdout);
          const stderr = text(result.stderr);
          if (stdout) options.onStdout?.(stdout);
          if (stderr) options.onStderr?.(stderr);
          return { exitCode: result.exitCode, stdout, stderr };
        } catch (error) {
          if (error instanceof ExecError) {
            const stdout = text(error.stdout);
            const stderr = text(error.stderr);
            if (stdout) options.onStdout?.(stdout);
            if (stderr) options.onStderr?.(stderr);
            return { exitCode: error.exitCode, stdout, stderr };
          }

          const stderr = errorMessage(error);
          options.onStderr?.(stderr);
          return { exitCode: 1, stdout: "", stderr };
        }
      },
    };
  }

  private async runBackground(
    command: string,
    options: SandboxCommandOptions
  ): Promise<SandboxExecutionResult> {
    const child = this.sprite.spawn("bash", ["-lc", command], {
      cwd: this.workingDirectory,
      detachable: true,
    });
    this.backgroundCommands.add(child);

    child.stdout.on("data", (data: Buffer) => options.onStdout?.(text(data)));
    child.stderr.on("data", (data: Buffer) => options.onStderr?.(text(data)));
    child.once("exit", () => this.backgroundCommands.delete(child));

    try {
      await new Promise<void>((resolve, reject) => {
        child.once("spawn", resolve);
        child.once("error", reject);
      });
    } catch (error) {
      this.backgroundCommands.delete(child);
      const stderr = errorMessage(error);
      options.onStderr?.(stderr);
      return { exitCode: 1, stdout: "", stderr };
    }
    child.on("error", (error) => options.onStderr?.(errorMessage(error)));

    return {
      exitCode: 0,
      stdout: "Background command started successfully",
      stderr: "",
    };
  }

  async kill(): Promise<void> {
    await this.sprite.delete();
    this.backgroundCommands.clear();
  }

  async pause(): Promise<void> {
    // Sprites suspend automatically when idle; no explicit pause is required.
  }

  async getHost(port: number): Promise<string> {
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new RangeError("port must be an integer between 1 and 65535");
    }
    if (port !== 8080) {
      throw new Error(
        "Fly.io Sprites expose one HTTPS URL routed to port 8080 by default. " +
          "Configure a Sprite service for another HTTP port before using its URL."
      );
    }

    if (!this.sprite.url) {
      throw new Error(`Fly.io Sprite ${this.sprite.name} did not return a URL`);
    }
    return this.sprite.url;
  }
}

export class FlyIOSandboxProvider implements SandboxProvider {
  private readonly client: SpritesClient;

  constructor(private readonly config: FlyIOConfig) {
    if (!config.token) {
      throw new Error("A Fly.io Sprites API token is required");
    }
    this.client = new SpritesClient(config.token, { baseURL: config.baseURL });
  }

  async create(
    envs?: Record<string, string>,
    agentType?: AgentType,
    workingDirectory?: string
  ): Promise<SandboxInstance> {
    const name =
      `vibekit-${agentType ?? "default"}-${Date.now().toString(36)}-` +
      randomUUID().slice(0, 8);
    const sprite = await this.client.createSprite(name, {
      environment: envs,
      labels: [...new Set(["vibekit", ...(this.config.labels ?? [])])],
      runtime: this.config.runtime ?? "dev",
      urlSettings: { auth: this.config.urlAuth ?? "sprite" },
      waitForCapacity: this.config.waitForCapacity,
    });

    if (workingDirectory) {
      try {
        await sprite.execFile("mkdir", ["-p", workingDirectory]);
      } catch (error) {
        await sprite.delete().catch(() => undefined);
        throw error;
      }
    }

    return new FlyIOSandboxInstance(sprite, workingDirectory);
  }

  async resume(sandboxId: string): Promise<SandboxInstance> {
    const sprite = await this.client.getSprite(sandboxId);
    return new FlyIOSandboxInstance(sprite);
  }
}

export function createFlyIOProvider(config: FlyIOConfig): FlyIOSandboxProvider {
  return new FlyIOSandboxProvider(config);
}
