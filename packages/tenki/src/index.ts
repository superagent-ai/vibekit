import {
  TenkiSandbox,
  isSuccess,
  stderrText,
  stdoutText,
  type CreateOptions,
  type Session,
} from "@tenkicloud/sandbox";

// Define the interfaces we need from the SDK.
// (Mirrors the shared contract in @vibe-kit/sdk, duplicated per provider to
// match the pattern used by @vibe-kit/daytona and @vibe-kit/blaxel.)
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

export interface TenkiConfig {
  /**
   * Tenki API key (`tk_…`). When omitted, the SDK falls back to the
   * `TENKI_AUTH_TOKEN` / `TENKI_API_KEY` environment variables.
   */
  apiKey?: string;
  /** Override the Tenki API base URL (defaults to https://api.tenki.cloud). */
  baseUrl?: string;
  /**
   * Explicit workspace scope — only needed for service-token callers. A normal
   * Tenki workspace API key (`tk_…`) infers the workspace server-side.
   */
  workspaceId?: string;
  /**
   * Boot from a pre-built Tenki registry image (ref string or image object).
   * NOTE: this is a Tenki registry reference, NOT a Docker Hub image. When set,
   * the agent CLI is assumed to be pre-installed and runtime install is skipped.
   */
  image?: CreateOptions["image"];
  /** Boot from a Tenki snapshot id. Same skip-install behavior as `image`. */
  snapshotId?: string;
  /** vCPU cores for the sandbox (defaults to the Tenki service default). */
  cpuCores?: number;
  /** Memory in MB for the sandbox (defaults to the Tenki service default). */
  memoryMb?: number;
  /**
   * Hard cap on total sandbox lifetime (ms) — a backstop so an abandoned or
   * leaked sandbox self-terminates. Defaults to the Tenki service default; set
   * it longer than your longest expected run.
   */
  maxDurationMs?: number;
  /**
   * Auto-stop the sandbox after this many idle minutes. Defaults to the Tenki
   * service default; keep it longer than your longest single task so active
   * work is not paused mid-run.
   */
  idleTimeoutMinutes?: number;
  /**
   * How long create() waits for the sandbox to become ready (ms). Bounds
   * provisioning independently of per-command timeouts.
   */
  waitTimeoutMs?: number;
  /** Keep the sandbox persistent/long-lived (enables reliable `resume`). */
  sticky?: boolean;
  /**
   * Install the requested agent's CLI at create() time on Tenki's default base
   * image. Defaults to `true` unless a custom `image`/`snapshotId` is provided
   * (in which case the CLI is assumed to be baked in).
   */
  installAgent?: boolean;
}

// Agent CLI packages, sourced from assets/dockerfiles/Dockerfile.<agent> in this
// repo — the same packages baked into the prebuilt superagentai/vibekit-* images.
const AGENT_CLI_PACKAGES: Record<AgentType, string> = {
  claude: "@anthropic-ai/claude-code@latest",
  codex: "@openai/codex@latest",
  gemini: "@google/gemini-cli",
  opencode: "opencode-ai@latest",
  grok: "@vibe-kit/grok-cli@latest",
};

// Bash that ensures the requested agent's CLI is present on Tenki's default base
// image. Mirrors assets/dockerfiles/Dockerfile.<agent>: install Node via
// NodeSource only if it is missing, then `npm install -g` the CLI. `set -e` so an
// early step failure aborts instead of being masked by a later success.
function getAgentSetupCommand(agentType: AgentType): string {
  const pkg = AGENT_CLI_PACKAGES[agentType];
  return [
    "set -e",
    "if ! command -v node >/dev/null 2>&1; then curl -fsSL https://deb.nodesource.com/setup_24.x | bash - && apt-get install -y nodejs; fi",
    `npm install -g ${pkg}`,
  ].join(" && ");
}

// Single-quote a value for safe interpolation into a bash command.
function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Tenki's documented resource ranges for create() (see @tenkicloud/sandbox).
const CPU_CORES_RANGE = { min: 1, max: 16 };
const MEMORY_MB_RANGE = { min: 128, max: 65536 };

// Fail fast at construction on invalid resource config, rather than minutes
// later mid-provisioning.
function validateConfig(config: TenkiConfig): void {
  const { cpuCores, memoryMb } = config;
  if (
    cpuCores !== undefined &&
    (!Number.isInteger(cpuCores) ||
      cpuCores < CPU_CORES_RANGE.min ||
      cpuCores > CPU_CORES_RANGE.max)
  ) {
    throw new Error(
      `Invalid Tenki config: cpuCores must be an integer in [${CPU_CORES_RANGE.min}, ${CPU_CORES_RANGE.max}], got ${cpuCores}.`
    );
  }
  if (
    memoryMb !== undefined &&
    (!Number.isInteger(memoryMb) ||
      memoryMb < MEMORY_MB_RANGE.min ||
      memoryMb > MEMORY_MB_RANGE.max)
  ) {
    throw new Error(
      `Invalid Tenki config: memoryMb must be an integer in [${MEMORY_MB_RANGE.min}, ${MEMORY_MB_RANGE.max}], got ${memoryMb}.`
    );
  }
}

// Pump a Tenki byte stream into a VibeKit string callback. Uses a single
// streaming decoder so multi-byte UTF-8 sequences split across chunks are not
// corrupted at the boundary.
function pipeStream(
  stream: ReadableStream<Uint8Array>,
  onData: (data: string) => void
): void {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  void (async () => {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) onData(decoder.decode(value, { stream: true }));
      }
    } catch {
      // Stream closed or sandbox torn down mid-read — nothing to do.
    } finally {
      reader.releaseLock();
    }
  })();
}

// Tenki implementation
class TenkiSandboxInstance implements SandboxInstance {
  constructor(
    private session: Session,
    public sandboxId: string
  ) {}

  get commands(): SandboxCommands {
    return {
      run: async (
        command: string,
        options?: SandboxCommandOptions
      ): Promise<SandboxExecutionResult> => {
        const { background, onStdout, onStderr, timeoutMs } = options || {};

        try {
          if (background) {
            // Non-blocking: start the process, stream output, and return
            // immediately so callers can e.g. getHost() a dev server.
            const handle = this.session.run(["bash", "-lc", command]);
            // Prevent an unhandled rejection if the detached process errors.
            void Promise.resolve(handle).catch(() => {});
            if (onStdout) pipeStream(handle.stdout, onStdout);
            if (onStderr) pipeStream(handle.stderr, onStderr);
            return {
              exitCode: 0,
              stdout: "Background command started successfully",
              stderr: "",
            };
          }

          // Foreground: run through a login shell so pipes, redirects and env
          // expansion (and the agent CLIs on the login PATH) behave as expected.
          // Persistent per-stream decoders avoid UTF-8 corruption at chunk
          // boundaries; the final result is decoded from the full buffer.
          const stdoutDecoder = new TextDecoder();
          const stderrDecoder = new TextDecoder();
          const result = await this.session.exec("bash", {
            args: ["-lc", command],
            timeoutMs,
            onOutput: (output) => {
              if (output.isStderr) {
                onStderr?.(stderrDecoder.decode(output.data, { stream: true }));
              } else {
                onStdout?.(stdoutDecoder.decode(output.data, { stream: true }));
              }
            },
          });

          // Don't let a non-successful command (e.g. signaled/timed-out with a
          // 0 exit code, such as SIGKILL) read as success.
          const succeeded = isSuccess(result.status);
          const stderr = stderrText(result);
          return {
            exitCode:
              result.exitCode !== 0 ? result.exitCode : succeeded ? 0 : 1,
            stdout: stdoutText(result),
            stderr:
              !succeeded && result.exitCode === 0 && !stderr
                ? `Command did not complete successfully (status: ${result.status})`
                : stderr,
          };
        } catch (error) {
          const message = toMessage(error);
          onStderr?.(message);
          return { exitCode: 1, stdout: "", stderr: message };
        }
      },
    };
  }

  async kill(): Promise<void> {
    // Let teardown failures propagate — never report a failed terminate as
    // success, so callers can retry.
    await this.session.close();
  }

  async pause(): Promise<void> {
    await this.session.pause();
  }

  async getHost(port: number): Promise<string> {
    const exposed = await this.session.exposePort(port);
    return exposed.previewUrl;
  }
}

export class TenkiSandboxProvider implements SandboxProvider {
  constructor(private config: TenkiConfig = {}) {
    validateConfig(config);
  }

  private createClient(): TenkiSandbox {
    return new TenkiSandbox({
      authToken: this.config.apiKey,
      baseUrl: this.config.baseUrl,
    });
  }

  // Best-effort teardown used only for create-failure cleanup. Returns whether
  // the sandbox was closed, so the caller can surface the id if teardown itself
  // failed and the VM needs to be terminated manually.
  private async safeClose(session: Session): Promise<boolean> {
    try {
      await session.close();
      return true;
    } catch {
      return false;
    }
  }

  async create(
    envs?: Record<string, string>,
    agentType?: AgentType,
    workingDirectory?: string
  ): Promise<SandboxInstance> {
    const client = this.createClient();
    const usesPrebuiltImage = Boolean(
      this.config.image || this.config.snapshotId
    );

    let session: Session;
    try {
      session = await client.create({
        env: envs,
        image: this.config.image,
        snapshotId: this.config.snapshotId,
        cpuCores: this.config.cpuCores,
        memoryMb: this.config.memoryMb,
        maxDurationMs: this.config.maxDurationMs,
        idleTimeoutMinutes: this.config.idleTimeoutMinutes,
        waitTimeoutMs: this.config.waitTimeoutMs,
        sticky: this.config.sticky,
        // Only needed for service-token callers; a workspace API key infers scope.
        workspaceId: this.config.workspaceId,
      });
    } catch (error) {
      throw new Error(`Failed to create Tenki sandbox: ${toMessage(error)}`);
    }

    // The VM now exists. Any setup failure past this point must tear it down so
    // we never leak a running sandbox (create is failure-atomic).
    try {
      const shouldInstall = this.config.installAgent ?? !usesPrebuiltImage;
      if (shouldInstall && agentType) {
        const setup = await session.exec("bash", {
          args: ["-lc", getAgentSetupCommand(agentType)],
        });
        if (setup.exitCode !== 0 || !isSuccess(setup.status)) {
          throw new Error(
            `Failed to install the ${agentType} CLI in the Tenki sandbox: ${
              stderrText(setup) || `status ${setup.status}`
            }`
          );
        }
      }

      if (workingDirectory) {
        const dir = shellSingleQuote(workingDirectory);
        // Tenki's default image runs as a non-root user, so a root-owned path
        // (e.g. VibeKit's default "/vibe0") can't be created with a plain mkdir.
        // Try as the current user first (works under $HOME), then fall back to
        // sudo + chown so the directory is owned by — and writable for — us.
        const mkdir = await session.exec("bash", {
          args: [
            "-lc",
            `mkdir -p ${dir} 2>/dev/null || { sudo -n mkdir -p ${dir} && sudo -n chown "$(id -u):$(id -g)" ${dir}; }`,
          ],
        });
        if (mkdir.exitCode !== 0 || !isSuccess(mkdir.status)) {
          throw new Error(
            `Failed to create working directory ${workingDirectory}: ${
              stderrText(mkdir) || `status ${mkdir.status}`
            }`
          );
        }
      }

      return new TenkiSandboxInstance(session, session.id);
    } catch (error) {
      const closed = await this.safeClose(session);
      const detail = `Failed to set up Tenki sandbox: ${toMessage(error)}`;
      throw new Error(
        closed
          ? `${detail} (sandbox ${session.id} was torn down)`
          : `${detail} (WARNING: automatic teardown of sandbox ${session.id} failed — terminate it manually)`
      );
    }
  }

  async resume(sandboxId: string): Promise<SandboxInstance> {
    try {
      const client = this.createClient();
      const session = await client.get(sandboxId);
      if (session.state === "PAUSED") {
        await session.resume();
      }
      return new TenkiSandboxInstance(session, session.id);
    } catch (error) {
      throw new Error(`Failed to resume Tenki sandbox: ${toMessage(error)}`);
    }
  }
}

export function createTenkiProvider(
  config: TenkiConfig = {}
): TenkiSandboxProvider {
  return new TenkiSandboxProvider(config);
}
