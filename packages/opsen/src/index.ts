import { Opsen, Session } from "@opsendev/opsen";

// Declared here rather than imported from @vibe-kit/sdk, matching the
// other providers in this repo: the SDK is a peer dependency, and a
// provider that imports its types at build time cannot be compiled
// independently of it.
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

export interface OpsenConfig {
  apiKey: string;
  /** For self-hosted deployments. */
  baseUrl?: string;
  /** Groups this agent's spend. One id, one line on the spend page. */
  taskId?: string;
  /** Hard cap. A budgeted session is refused rather than spending past it. */
  budgetUsd?: number;
  /** Arbitrary tags to group spend by — customer, environment. */
  labels?: Record<string, string>;
  /** "auto" lets opsen's router choose from what the workload needs. */
  runtime?: "auto" | "local" | "e2b" | "modal" | string;
}

export class OpsenSandboxInstance implements SandboxInstance {
  constructor(private session: Session) {}

  get sandboxId(): string {
    return this.session.id;
  }

  get commands(): SandboxCommands {
    return {
      run: async (command: string, options?: SandboxCommandOptions) => {
        const res = await this.session.exec(
          command,
          options?.timeoutMs ? Math.ceil(options.timeoutMs / 1000) : 300
        );
        // Called with the completed output rather than incrementally:
        // opsen's exec returns a finished result, so invoking these
        // keeps the callback contract without pretending the output
        // streamed. Silently dropping them would be worse.
        if (options?.onStdout && res.stdout) options.onStdout(res.stdout);
        if (options?.onStderr && res.stderr) options.onStderr(res.stderr);
        return {
          exitCode: res.exitCode,
          stdout: res.stdout,
          stderr: res.stderr,
        };
      },
    };
  }

  async kill(): Promise<void> {
    await this.session.kill();
  }

  async pause(): Promise<void> {
    await this.session.suspend();
  }

  async getHost(port: number): Promise<string> {
    // Depends on the runtime underneath: E2B fronts every port, Modal
    // needs the port declared at sandbox creation, and a local runtime
    // has no public address at all. Where it is unavailable this throws
    // with a message naming the runtime rather than returning a URL that
    // does not answer — a dead address turns "preview my server" into a
    // debugging session in someone else's framework.
    return await this.session.host(port);
  }

  /**
   * Machine, model and tool spend for this agent, under one task id.
   *
   * Not part of `SandboxInstance`. It is here because VibeKit takes the
   * model provider and key separately from the sandbox, so a team
   * running Grok on a sandbox today holds two bills with no shared
   * identifier between them. opsen sits in both paths.
   */
  async cost() {
    return await this.session.cost();
  }
}

export class OpsenSandboxProvider implements SandboxProvider {
  private client: Opsen;

  constructor(private config: OpsenConfig) {
    this.client = new Opsen({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
    });
  }

  async create(
    envs?: Record<string, string>,
    agentType?: AgentType,
    workingDirectory?: string
  ): Promise<SandboxInstance> {
    const session = await this.client.createSession({
      taskId: this.config.taskId ?? `vibekit-${agentType ?? "agent"}`,
      budgetUsd: this.config.budgetUsd,
      runtime: this.config.runtime,
      // `workingDirectory` is not a session option in opsen; the sandbox
      // starts in its own working directory. Passed through as an
      // environment variable so an agent that needs it can read it,
      // rather than accepted and silently ignored.
      env: {
        ...(envs ?? {}),
        ...(workingDirectory ? { VIBEKIT_WORKDIR: workingDirectory } : {}),
      },
      // The agent type is recorded as a LABEL at creation. "Which agent
      // cost what" is only answerable if it is written down when the
      // session starts; afterwards the runs are indistinguishable.
      labels: {
        ...(this.config.labels ?? {}),
        ...(agentType ? { agent: agentType } : {}),
      },
    });
    return new OpsenSandboxInstance(session);
  }

  async resume(sandboxId: string): Promise<SandboxInstance> {
    const session = await this.client.getSession(sandboxId);
    await session.resume();
    return new OpsenSandboxInstance(session);
  }
}

export function createOpsenProvider(config: OpsenConfig): OpsenSandboxProvider {
  return new OpsenSandboxProvider(config);
}
