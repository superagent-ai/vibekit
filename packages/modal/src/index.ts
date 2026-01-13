/**
 * @vibe-kit/modal
 *
 * Modal sandbox provider for VibeKit SDK v2.
 *
 * @example
 * ```typescript
 * import { createSandbox } from "@vibe-kit/modal";
 *
 * const sandbox = await createSandbox({
 *   image: "ubuntu:22.04",
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

import { App, Image, Secret, Sandbox as ModalSandbox } from "modal";
import { attachAgents, type BaseSandbox, type Agents, type ProcessHandle } from "@vibe-kit/core";

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Configuration for creating a Modal sandbox
 */
export interface ModalConfig {
  /**
   * Docker image to use
   */
  image?: string;

  /**
   * Encrypted ports to expose
   */
  encryptedPorts?: number[];

  /**
   * HTTP/2 ports
   */
  h2Ports?: number[];

  /**
   * Environment variables
   */
  envs?: Record<string, string>;
}

// ============================================================================
// Sandbox Type
// ============================================================================

/**
 * Modal Sandbox with agents attached
 */
export type ModalSandboxWithAgents = ModalSandbox & Agents & {
  sandboxId: string;
  close(): Promise<void>;
};

// ============================================================================
// Adapter to make Modal compatible with BaseSandbox interface
// ============================================================================

function adaptToBaseSandbox(sandbox: ModalSandbox): BaseSandbox {
  return {
    process: {
      async start(cmd, opts): Promise<ProcessHandle> {
        const commands: string[] = ["bash", "-c", cmd];
        const proc = await sandbox.exec(commands, {
          stdout: "pipe",
          stderr: "pipe",
          timeout: opts?.timeoutMs,
        });

        let stdoutData = "";
        let stderrData = "";
        let processEnded = false;
        let exitCodeValue = 0;

        // Process streams - collect data
        const processPromise = (async () => {
          try {
            if (proc.stdout) {
              for await (const chunk of proc.stdout as AsyncIterable<Uint8Array | string>) {
                const text = typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
                stdoutData += text;
                if (opts?.onStdout) opts.onStdout(text);
              }
            }
          } catch {
            // Ignore stream errors
          }

          try {
            if (proc.stderr) {
              for await (const chunk of proc.stderr as AsyncIterable<Uint8Array | string>) {
                const text = typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
                stderrData += text;
                if (opts?.onStderr) opts.onStderr(text);
              }
            }
          } catch {
            // Ignore stream errors
          }

          exitCodeValue = await proc.wait();
          processEnded = true;
        })();

        return {
          pid: String(Date.now()),
          async wait() {
            await processPromise;
            return { exitCode: exitCodeValue, stdout: stdoutData, stderr: stderrData };
          },
          async kill() {
            processEnded = true;
          },
          stdout: {
            async *[Symbol.asyncIterator]() {
              await processPromise;
              if (stdoutData) yield stdoutData;
            },
          },
          stderr: {
            async *[Symbol.asyncIterator]() {
              await processPromise;
              if (stderrData) yield stderrData;
            },
          },
        };
      },

      async startAndWait(cmd, opts) {
        const commands: string[] = ["bash", "-c", cmd];
        const proc = await sandbox.exec(commands, {
          stdout: "pipe",
          stderr: "pipe",
          timeout: opts?.timeoutMs,
        });

        let stdoutData = "";
        let stderrData = "";

        if (proc.stdout) {
          for await (const chunk of proc.stdout as AsyncIterable<Uint8Array | string>) {
            const text = typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
            stdoutData += text;
            if (opts?.onStdout) opts.onStdout(text);
          }
        }

        if (proc.stderr) {
          for await (const chunk of proc.stderr as AsyncIterable<Uint8Array | string>) {
            const text = typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
            stderrData += text;
            if (opts?.onStderr) opts.onStderr(text);
          }
        }

        const exitCode = await proc.wait();
        return { exitCode, stdout: stdoutData, stderr: stderrData };
      },
    },

    files: {
      async write(path, content) {
        await sandbox.exec(["bash", "-c", `cat > "${path}" << 'VIBEKIT_EOF'\n${content}\nVIBEKIT_EOF`]);
      },

      async read(path) {
        const proc = await sandbox.exec(["cat", path], { stdout: "pipe" });
        let content = "";
        if (proc.stdout) {
          for await (const chunk of proc.stdout as AsyncIterable<Uint8Array | string>) {
            content += typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
          }
        }
        await proc.wait();
        return content;
      },
    },
  };
}

// ============================================================================
// Main API
// ============================================================================

/**
 * Create a Modal sandbox with agents attached.
 *
 * @param config - Configuration for the sandbox
 * @returns Modal sandbox with agent capabilities
 */
export async function createSandbox(config: ModalConfig = {}): Promise<ModalSandboxWithAgents> {
  const { image = "ubuntu:22.04", encryptedPorts = [], h2Ports = [], envs = {} } = config;

  const sbSecrets = await Secret.fromObject(envs);
  const appName = `vibekit-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  
  const [app, modalImage] = await Promise.all([
    App.lookup(appName, { createIfMissing: true }),
    Image.fromRegistry(image),
  ]);

  const sandbox = await app.createSandbox(modalImage, {
    encryptedPorts,
    h2Ports,
    secrets: [sbSecrets],
  });

  // Create adapted BaseSandbox for agents
  const baseSandbox = adaptToBaseSandbox(sandbox);
  const sandboxWithAgents = attachAgents(baseSandbox);

  // Create result with both native methods and agents
  const result = Object.assign(sandbox, {
    sandboxId: sandbox.sandboxId,
    claude: sandboxWithAgents.claude,
    codex: sandboxWithAgents.codex,
    gemini: sandboxWithAgents.gemini,
    grok: sandboxWithAgents.grok,
    opencode: sandboxWithAgents.opencode,
    close: async () => {
      await sandbox.terminate();
    },
  }) as ModalSandboxWithAgents;

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

// ============================================================================
// Legacy API (deprecated)
// ============================================================================

/**
 * @deprecated Use `createSandbox` instead.
 */
export function createModalProvider(config: ModalConfig) {
  console.warn("⚠️  createModalProvider() is deprecated. Please use createSandbox() instead.");
  
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
        async kill() { await sandbox.terminate(); },
        async pause() { console.log("Pause not supported for Modal"); },
        async getHost(port: number) {
          const tunnels = await sandbox.tunnels();
          return tunnels[port]?.url ?? "";
        },
      };
    },
    async resume() {
      return this.create();
    },
  };
}
