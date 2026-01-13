/**
 * @vibe-kit/cloudflare
 *
 * Cloudflare sandbox provider for VibeKit SDK v2.
 *
 * @example
 * ```typescript
 * import { createSandbox } from "@vibe-kit/cloudflare";
 *
 * const sandbox = await createSandbox({
 *   env: context.env,
 *   hostname: "my-app.workers.dev",
 * });
 *
 * // Use agents
 * await sandbox.claude({
 *   apiKey: process.env.ANTHROPIC_API_KEY,
 * }).run("Create a web app");
 *
 * // Cleanup
 * await sandbox.close();
 * ```
 *
 * @packageDocumentation
 */

import { getSandbox, type LogEvent, parseSSEStream, type Sandbox, type SandboxEnv } from "@cloudflare/sandbox";
import { attachAgents, type BaseSandbox, type Agents, type ProcessHandle } from "@vibe-kit/core";

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Configuration for creating a Cloudflare sandbox
 */
export interface CloudflareConfig {
  /**
   * Cloudflare environment with Sandbox binding
   */
  env: SandboxEnv;

  /**
   * Hostname for exposed ports
   */
  hostname: string;

  /**
   * Optional sandbox ID (for resuming)
   */
  sandboxId?: string;

  /**
   * Environment variables
   */
  envs?: Record<string, string>;
}

// ============================================================================
// Sandbox Type
// ============================================================================

/**
 * Cloudflare Sandbox with agents attached
 */
export type CloudflareSandboxWithAgents = Sandbox & Agents & {
  sandboxId: string;
  close(): Promise<void>;
};

// ============================================================================
// Adapter to make Cloudflare compatible with BaseSandbox interface
// ============================================================================

function adaptToBaseSandbox(sandbox: Sandbox): BaseSandbox {
  return {
    process: {
      async start(cmd, opts): Promise<ProcessHandle> {
        const response = await sandbox.startProcess(cmd);
        
        let stdoutData = "";
        let stderrData = "";
        let processEnded = false;

        // Start streaming logs in background
        const logsPromise = (async () => {
          try {
            const logStream = await sandbox.streamProcessLogs(response.id);
            for await (const log of parseSSEStream<LogEvent>(logStream)) {
              if (log.type === "stdout") {
                stdoutData += log.data;
                if (opts?.onStdout) opts.onStdout(log.data);
              } else if (log.type === "stderr") {
                stderrData += log.data;
                if (opts?.onStderr) opts.onStderr(log.data);
              } else if (log.type === "exit" || log.type === "error") {
                processEnded = true;
                break;
              }
            }
          } catch {
            processEnded = true;
          }
          processEnded = true;
        })();

        return {
          pid: response.id,
          async wait() {
            await logsPromise;
            return { exitCode: 0, stdout: stdoutData, stderr: stderrData };
          },
          async kill() {
            processEnded = true;
            await sandbox.killProcess(response.id);
          },
          stdout: {
            async *[Symbol.asyncIterator]() {
              await logsPromise;
              if (stdoutData) yield stdoutData;
            },
          },
          stderr: {
            async *[Symbol.asyncIterator]() {
              await logsPromise;
              if (stderrData) yield stderrData;
            },
          },
        };
      },

      async startAndWait(cmd, opts) {
        const response = await sandbox.exec(cmd, {
          stream: true,
          onOutput(stream: string, data: string) {
            if (stream === "stdout" && opts?.onStdout) opts.onStdout(data);
            else if (stream === "stderr" && opts?.onStderr) opts.onStderr(data);
          },
        });
        return { exitCode: response.exitCode, stdout: response.stdout, stderr: response.stderr };
      },
    },

    files: {
      async write(path, content) {
        await sandbox.exec(`cat > "${path}" << 'VIBEKIT_EOF'\n${content}\nVIBEKIT_EOF`);
      },

      async read(path) {
        const result = await sandbox.exec(`cat "${path}"`);
        return result.stdout;
      },
    },
  };
}

// ============================================================================
// Main API
// ============================================================================

/**
 * Create a Cloudflare sandbox with agents attached.
 *
 * @param config - Configuration for the sandbox
 * @returns Cloudflare sandbox with agent capabilities
 */
export async function createSandbox(config: CloudflareConfig): Promise<CloudflareSandboxWithAgents> {
  const { env, hostname, sandboxId, envs = {} } = config;

  if (!env || !env.Sandbox) {
    throw new Error(
      `Cloudflare Durable Object binding "Sandbox" not found. ` +
      `Make sure you're running within a Cloudflare Worker and the binding is configured.`
    );
  }

  const id = sandboxId || `vibekit-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  const sandbox = getSandbox(env.Sandbox, id) as Sandbox;
  
  if (Object.keys(envs).length > 0) {
    sandbox.setEnvVars(envs);
  }

  // Create adapted BaseSandbox for agents
  const baseSandbox = adaptToBaseSandbox(sandbox);
  const sandboxWithAgents = attachAgents(baseSandbox);

  // Create result with both native methods and agents
  const result = Object.assign(sandbox, {
    sandboxId: id,
    claude: sandboxWithAgents.claude,
    codex: sandboxWithAgents.codex,
    gemini: sandboxWithAgents.gemini,
    grok: sandboxWithAgents.grok,
    opencode: sandboxWithAgents.opencode,
    close: async () => {
      await sandbox.destroy();
    },
    async getHost(port: number) {
      const response = await sandbox.exposePort(port, { name: "vibekit", hostname });
      return response.url;
    },
  }) as CloudflareSandboxWithAgents;

  return result;
}

// ============================================================================
// Re-exports
// ============================================================================

export type {
  Agent,
  AgentEvent,
  AgentResult,
  FinalResult,
  ClaudeConfig,
  CodexConfig,
  GeminiConfig,
  GrokConfig,
  OpencodeConfig,
} from "@vibe-kit/core";

export type { SandboxEnv } from "@cloudflare/sandbox";

// ============================================================================
// Legacy API (deprecated)
// ============================================================================

/**
 * @deprecated Use `createSandbox` instead.
 */
export function createCloudflareProvider(config: { env: SandboxEnv; hostname: string }) {
  console.warn("⚠️  createCloudflareProvider() is deprecated. Please use createSandbox() instead.");
  
  return {
    async create(envs?: Record<string, string>) {
      const sandbox = await createSandbox({ ...config, envs });
      const baseSandbox = adaptToBaseSandbox(sandbox);
      return {
        sandboxId: sandbox.sandboxId,
        commands: {
          async run(command: string, options?: { timeoutMs?: number; background?: boolean; onStdout?: (data: string) => void; onStderr?: (data: string) => void }) {
            if (options?.background) {
              baseSandbox.process.start(command, options);
              return { exitCode: 0, stdout: "Background command started", stderr: "" };
            }
            return baseSandbox.process.startAndWait(command, options);
          },
        },
        async kill() { await sandbox.close(); },
        async pause() { await sandbox.stop(); },
        async getHost(port: number) {
          const response = await sandbox.exposePort(port, { name: "vibekit", hostname: config.hostname });
          return response.url;
        },
      };
    },
    async resume(_sandboxId: string) {
      return this.create();
    },
  };
}
