/**
 * @vibe-kit/blaxel
 *
 * Blaxel sandbox provider for VibeKit SDK v2.
 *
 * @example
 * ```typescript
 * import { createSandbox } from "@vibe-kit/blaxel";
 *
 * const sandbox = await createSandbox({
 *   image: "blaxel/vibekit-claude",
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

import { SandboxInstance as BlaxelSandbox, Ports } from "@blaxel/core";
import { attachAgents, type BaseSandbox, type Agents } from "@vibe-kit/core";

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Configuration for creating a Blaxel sandbox
 */
export interface BlaxelConfig {
  /**
   * Blaxel workspace
   */
  workspace?: string;

  /**
   * Blaxel API key
   */
  apiKey?: string;

  /**
   * Docker image to use
   */
  image?: string;

  /**
   * Memory allocation (MB)
   */
  memory?: number;

  /**
   * Region
   */
  region?: string;

  /**
   * Time to live
   */
  ttl?: string;

  /**
   * Ports to expose
   */
  ports?: Ports[];

  /**
   * Environment variables
   */
  envs?: Record<string, string>;
}

// ============================================================================
// Sandbox Type
// ============================================================================

/**
 * Blaxel Sandbox with agents attached
 */
export type BlaxelSandboxWithAgents = BlaxelSandbox & Agents & {
  sandboxId: string;
  close(): Promise<void>;
};

// ============================================================================
// Adapter to make Blaxel compatible with BaseSandbox interface
// ============================================================================

function adaptToBaseSandbox(sandbox: BlaxelSandbox, sandboxId: string): BaseSandbox {
  return {
    process: {
      async start(cmd, opts) {
        const proc = await sandbox.process.exec({
          command: cmd,
          waitForCompletion: false,
        });

        let stdoutData = "";
        let stderrData = "";

        // Stream logs in background
        if (opts?.onStdout || opts?.onStderr) {
          sandbox.process.streamLogs(proc.pid, {
            onStdout: (data) => {
              stdoutData += data;
              opts?.onStdout?.(data);
            },
            onStderr: (data) => {
              stderrData += data;
              opts?.onStderr?.(data);
            },
          });
        }

        return {
          pid: String(proc.pid),
          async wait() {
            // Wait a bit for logs to come in
            await new Promise((resolve) => setTimeout(resolve, 1000));
            const stdout = await sandbox.process.logs(proc.pid, "stdout");
            const stderr = await sandbox.process.logs(proc.pid, "stderr");
            return { exitCode: proc.exitCode, stdout: stdout || stdoutData, stderr: stderr || stderrData };
          },
          async kill() {
            // Blaxel doesn't have direct kill, process will terminate on its own
          },
          stdout: {
            [Symbol.asyncIterator]() {
              let done = false;
              return {
                async next(): Promise<IteratorResult<string>> {
                  if (done) return { value: "", done: true };
                  done = true;
                  const data = await sandbox.process.logs(proc.pid, "stdout");
                  return { value: data || "", done: false };
                },
              };
            },
          },
          stderr: {
            [Symbol.asyncIterator]() {
              let done = false;
              return {
                async next(): Promise<IteratorResult<string>> {
                  if (done) return { value: "", done: true };
                  done = true;
                  const data = await sandbox.process.logs(proc.pid, "stderr");
                  return { value: data || "", done: false };
                },
              };
            },
          },
        };
      },

      async startAndWait(cmd, opts) {
        const proc = await sandbox.process.exec({
          command: cmd,
          waitForCompletion: true,
        });
        const stdout = await sandbox.process.logs(proc.pid, "stdout");
        const stderr = await sandbox.process.logs(proc.pid, "stderr");
        opts?.onStdout?.(stdout);
        opts?.onStderr?.(stderr);
        return { exitCode: proc.exitCode, stdout, stderr };
      },
    },

    files: {
      async write(path, content) {
        await sandbox.process.exec({
          command: `cat > "${path}" << 'VIBEKIT_EOF'\n${content}\nVIBEKIT_EOF`,
          waitForCompletion: true,
        });
      },

      async read(path) {
        const proc = await sandbox.process.exec({
          command: `cat "${path}"`,
          waitForCompletion: true,
        });
        return sandbox.process.logs(proc.pid, "stdout");
      },
    },
  };
}

// ============================================================================
// Main API
// ============================================================================

/**
 * Create a Blaxel sandbox with agents attached.
 *
 * @param config - Configuration for the sandbox
 * @returns Blaxel sandbox with agent capabilities
 */
export async function createSandbox(config: BlaxelConfig = {}): Promise<BlaxelSandboxWithAgents> {
  const {
    image = "blaxel/vibekit-codex",
    memory = 4096,
    region,
    ttl,
    ports = [{ target: 3000, name: "web-server" }],
    envs = {},
  } = config;

  const name = `vibekit-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

  const formattedEnvs = Object.entries(envs).map(([key, value]) => ({
    name: key,
    value,
  }));

  const sandbox = await BlaxelSandbox.create({
    name,
    image,
    memory,
    region,
    ttl,
    envs: formattedEnvs,
    ports,
  });

  // Create adapted BaseSandbox for agents
  const baseSandbox = adaptToBaseSandbox(sandbox, name);
  const sandboxWithAgents = attachAgents(baseSandbox);

  // Create result with both native methods and agents
  const result = Object.assign(sandbox, {
    sandboxId: name,
    claude: sandboxWithAgents.claude,
    codex: sandboxWithAgents.codex,
    gemini: sandboxWithAgents.gemini,
    grok: sandboxWithAgents.grok,
    opencode: sandboxWithAgents.opencode,
    close: async () => {
      await BlaxelSandbox.delete(name);
    },
  }) as BlaxelSandboxWithAgents;

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

export type { Ports } from "@blaxel/core";

// ============================================================================
// Legacy API (deprecated)
// ============================================================================

/**
 * @deprecated Use `createSandbox` instead.
 */
export function createBlaxelProvider(config: BlaxelConfig) {
  console.warn("⚠️  createBlaxelProvider() is deprecated. Please use createSandbox() instead.");
  
  return {
    async create(envs?: Record<string, string>) {
      const sandbox = await createSandbox({ ...config, envs });
      const baseSandbox = adaptToBaseSandbox(sandbox, sandbox.sandboxId);
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
        async pause() { console.log("Pause not needed for Blaxel - auto standby"); },
        async getHost(port: number) {
          const preview = await sandbox.previews.createIfNotExists({
            metadata: { name: `vibekit-${sandbox.sandboxId}-${port}` },
            spec: { port, public: true },
          });
          return preview.spec?.url || "";
        },
      };
    },
    async resume(sandboxId: string) {
      const sandbox = await BlaxelSandbox.get(sandboxId);
      const baseSandbox = adaptToBaseSandbox(sandbox, sandboxId);
      return {
        sandboxId,
        commands: {
          async run(command: string, options?: { timeoutMs?: number; background?: boolean; onStdout?: (data: string) => void; onStderr?: (data: string) => void }) {
            if (options?.background) {
              baseSandbox.process.start(command, options);
              return { exitCode: 0, stdout: "Background command started", stderr: "" };
            }
            return baseSandbox.process.startAndWait(command, options);
          },
        },
        async kill() { await BlaxelSandbox.delete(sandboxId); },
        async pause() { console.log("Pause not needed for Blaxel - auto standby"); },
        async getHost(port: number) {
          const preview = await sandbox.previews.createIfNotExists({
            metadata: { name: `vibekit-${sandboxId}-${port}` },
            spec: { port, public: true },
          });
          return preview.spec?.url || "";
        },
      };
    },
  };
}
