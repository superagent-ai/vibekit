/**
 * @vibe-kit/e2b
 *
 * E2B sandbox provider for VibeKit SDK v2.
 *
 * @example
 * ```typescript
 * import { createSandbox } from "@vibe-kit/e2b";
 *
 * const sandbox = await createSandbox({
 *   apiKey: process.env.E2B_API_KEY,
 * });
 *
 * // Use agents
 * const result = await sandbox.claude({
 *   apiKey: process.env.ANTHROPIC_API_KEY,
 *   model: "claude-sonnet-4-20250514",
 * }).run("Create a REST API with Express");
 *
 * // Stream events
 * for await (const event of result) {
 *   if (event.type === "text") console.log(event.content);
 * }
 *
 * // Native E2B methods work directly
 * await sandbox.files.write("/app/config.json", JSON.stringify(config));
 * const files = await sandbox.files.list("/app");
 *
 * // Cleanup
 * await sandbox.close();
 * ```
 *
 * @packageDocumentation
 */

import { Sandbox as E2BSandbox, type SandboxOpts } from "@e2b/code-interpreter";
import { attachAgents, type BaseSandbox, type Agents } from "@vibe-kit/core";

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Configuration for creating an E2B sandbox
 */
export interface E2BConfig extends Partial<SandboxOpts> {
  /**
   * E2B API key
   */
  apiKey: string;

  /**
   * Template ID for the sandbox (defaults to "base")
   */
  template?: string;
}

// ============================================================================
// Sandbox Type
// ============================================================================

/**
 * E2B Sandbox with agents attached.
 * This type extends the native E2B Sandbox with agent capabilities.
 */
export type E2BSandboxWithAgents = E2BSandbox & Agents;

// ============================================================================
// Adapter to make E2B compatible with BaseSandbox interface
// ============================================================================

/**
 * Adapt E2B Sandbox to BaseSandbox interface for agent compatibility
 */
function adaptToBaseSandbox(sandbox: E2BSandbox): BaseSandbox {
  return {
    process: {
      async start(cmd, opts) {
        // Create process streams
        let stdoutData = "";
        let stderrData = "";
        const stdoutChunks: string[] = [];
        const stderrChunks: string[] = [];
        let stdoutResolve: ((value: IteratorResult<string>) => void) | null = null;
        let stderrResolve: ((value: IteratorResult<string>) => void) | null = null;
        let processEnded = false;

        const processHandle = await sandbox.commands.run(cmd, {
          background: true,
          envs: opts?.env,
          cwd: opts?.cwd,
          timeoutMs: opts?.timeoutMs,
          onStdout: (data) => {
            stdoutData += data;
            if (stdoutResolve) {
              stdoutResolve({ value: data, done: false });
              stdoutResolve = null;
            } else {
              stdoutChunks.push(data);
            }
            opts?.onStdout?.(data);
          },
          onStderr: (data) => {
            stderrData += data;
            if (stderrResolve) {
              stderrResolve({ value: data, done: false });
              stderrResolve = null;
            } else {
              stderrChunks.push(data);
            }
            opts?.onStderr?.(data);
          },
        });

        return {
          pid: String(processHandle.pid),
          async wait() {
            const result = await processHandle.wait();
            processEnded = true;
            // Signal end of streams
            if (stdoutResolve) {
              stdoutResolve({ value: "", done: true });
            }
            if (stderrResolve) {
              stderrResolve({ value: "", done: true });
            }
            return {
              exitCode: result.exitCode,
              stdout: stdoutData,
              stderr: stderrData,
            };
          },
          async kill() {
            processEnded = true;
            await processHandle.kill();
          },
          stdout: {
            [Symbol.asyncIterator]() {
              return {
                async next(): Promise<IteratorResult<string>> {
                  if (stdoutChunks.length > 0) {
                    return { value: stdoutChunks.shift()!, done: false };
                  }
                  if (processEnded) {
                    return { value: "", done: true };
                  }
                  return new Promise((resolve) => {
                    stdoutResolve = resolve;
                  });
                },
              };
            },
          },
          stderr: {
            [Symbol.asyncIterator]() {
              return {
                async next(): Promise<IteratorResult<string>> {
                  if (stderrChunks.length > 0) {
                    return { value: stderrChunks.shift()!, done: false };
                  }
                  if (processEnded) {
                    return { value: "", done: true };
                  }
                  return new Promise((resolve) => {
                    stderrResolve = resolve;
                  });
                },
              };
            },
          },
        };
      },

      async startAndWait(cmd, opts) {
        const result = await sandbox.commands.run(cmd, {
          envs: opts?.env,
          cwd: opts?.cwd,
          timeoutMs: opts?.timeoutMs,
          onStdout: opts?.onStdout,
          onStderr: opts?.onStderr,
        });
        return {
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
        };
      },
    },

    files: {
      async write(path, content) {
        await sandbox.files.write(path, content);
      },

      async read(path) {
        return sandbox.files.read(path);
      },
    },
  };
}

// ============================================================================
// Main API
// ============================================================================

/**
 * Create an E2B sandbox with agents attached.
 *
 * @example
 * ```typescript
 * const sandbox = await createSandbox({
 *   apiKey: process.env.E2B_API_KEY,
 * });
 *
 * // Use Claude agent
 * const result = await sandbox.claude({
 *   apiKey: process.env.ANTHROPIC_API_KEY,
 * }).run("Create a web app");
 *
 * // Native E2B methods still work
 * await sandbox.files.write("/app/test.js", "console.log('hello')");
 * ```
 *
 * @param config - Configuration for the sandbox
 * @returns E2B sandbox with agent capabilities
 */
export async function createSandbox(config: E2BConfig): Promise<E2BSandboxWithAgents> {
  const { apiKey, template = "base", ...opts } = config;

  // Create native E2B sandbox
  const sandbox = await E2BSandbox.create(template, {
    apiKey,
    timeoutMs: opts.timeoutMs ?? 3600000, // 1 hour default
    ...opts,
  });

  // Create adapted BaseSandbox for agents
  const baseSandbox = adaptToBaseSandbox(sandbox);

  // Attach agents using the adapted interface
  const sandboxWithAgents = attachAgents(baseSandbox);

  // Return the sandbox with both native methods and agents
  // We need to carefully merge the sandbox with the agents
  const result = Object.assign(sandbox, {
    claude: sandboxWithAgents.claude,
    codex: sandboxWithAgents.codex,
    gemini: sandboxWithAgents.gemini,
    grok: sandboxWithAgents.grok,
    opencode: sandboxWithAgents.opencode,
  }) as E2BSandboxWithAgents;

  return result;
}

// ============================================================================
// Re-exports
// ============================================================================

// Re-export types from core for convenience
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

// Re-export E2B types
export type { SandboxOpts } from "@e2b/code-interpreter";
export { Sandbox as E2BNativeSandbox } from "@e2b/code-interpreter";

// ============================================================================
// Legacy API (deprecated)
// ============================================================================

/**
 * @deprecated Use `createSandbox` instead. This function will be removed in a future version.
 */
export function createE2BProvider(config: { apiKey: string; templateId?: string }) {
  console.warn(
    "⚠️  createE2BProvider() is deprecated. Please use createSandbox() instead for the new v2 API."
  );

  return {
    async create(envs?: Record<string, string>, _agentType?: string, workingDirectory?: string) {
      const sandbox = await E2BSandbox.create(config.templateId ?? "base", {
        apiKey: config.apiKey,
        envs,
        timeoutMs: 3600000,
      });

      if (workingDirectory) {
        await sandbox.commands.run(`mkdir -p ${workingDirectory}`);
      }

      return {
        sandboxId: sandbox.sandboxId,
        commands: {
          async run(command: string, options?: { timeoutMs?: number; background?: boolean; onStdout?: (data: string) => void; onStderr?: (data: string) => void }) {
            if (options?.background) {
              await sandbox.commands.run(command, { background: true as const, timeoutMs: options.timeoutMs, onStdout: options.onStdout, onStderr: options.onStderr });
              return { exitCode: 0, stdout: "Background command started", stderr: "" };
            }
            return sandbox.commands.run(command, { timeoutMs: options?.timeoutMs, onStdout: options?.onStdout, onStderr: options?.onStderr });
          },
        },
        async kill() {
          await sandbox.kill();
        },
        async pause() {
          await sandbox.pause();
        },
        async getHost(port: number) {
          return sandbox.getHost(port);
        },
      };
    },

    async resume(sandboxId: string) {
      const sandbox = await E2BSandbox.resume(sandboxId, {
        apiKey: config.apiKey,
        timeoutMs: 3600000,
      });

      return {
        sandboxId: sandbox.sandboxId,
        commands: {
          async run(command: string, options?: { timeoutMs?: number; background?: boolean; onStdout?: (data: string) => void; onStderr?: (data: string) => void }) {
            if (options?.background) {
              await sandbox.commands.run(command, { background: true as const, timeoutMs: options.timeoutMs, onStdout: options.onStdout, onStderr: options.onStderr });
              return { exitCode: 0, stdout: "Background command started", stderr: "" };
            }
            return sandbox.commands.run(command, { timeoutMs: options?.timeoutMs, onStdout: options?.onStdout, onStderr: options?.onStderr });
          },
        },
        async kill() {
          await sandbox.kill();
        },
        async pause() {
          await sandbox.pause();
        },
        async getHost(port: number) {
          return sandbox.getHost(port);
        },
      };
    },
  };
}
