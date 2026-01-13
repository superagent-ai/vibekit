/**
 * @vibe-kit/daytona
 *
 * Daytona sandbox provider for VibeKit SDK v2.
 *
 * @example
 * ```typescript
 * import { createSandbox } from "@vibe-kit/daytona";
 *
 * const sandbox = await createSandbox({
 *   apiKey: process.env.DAYTONA_API_KEY,
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

import { Daytona, DaytonaConfig as DaytonaSDKConfig, Sandbox } from "@daytonaio/sdk";
import { attachAgents, type BaseSandbox, type Agents, type ProcessHandle } from "@vibe-kit/core";

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Configuration for creating a Daytona sandbox
 */
export interface DaytonaConfig {
  /**
   * Daytona API key
   */
  apiKey: string;

  /**
   * Docker image to use
   */
  image?: string;

  /**
   * Server URL (defaults to https://app.daytona.io/api)
   */
  serverUrl?: string;

  /**
   * Environment variables
   */
  envs?: Record<string, string>;
}

// ============================================================================
// Sandbox Type
// ============================================================================

/**
 * Daytona Sandbox with agents attached
 */
export type DaytonaSandboxWithAgents = Sandbox & Agents & {
  sandboxId: string;
  close(): Promise<void>;
};

// ============================================================================
// Adapter to make Daytona compatible with BaseSandbox interface
// ============================================================================

function adaptToBaseSandbox(workspace: Sandbox): BaseSandbox {
  return {
    process: {
      async start(cmd, opts): Promise<ProcessHandle> {
        const session = await workspace.process.getSession(workspace.id);
        
        const response = await workspace.process.executeSessionCommand(
          session.sessionId,
          { command: cmd, runAsync: true },
          undefined
        );

        let stdoutData = "";
        let stderrData = "";

        // Get logs with callbacks
        const logsPromise = workspace.process.getSessionCommandLogs(
          session.sessionId,
          response.cmdId!,
          (stdout: string) => {
            stdoutData += stdout;
            if (opts?.onStdout) opts.onStdout(stdout);
          },
          (stderr: string) => {
            stderrData += stderr;
            if (opts?.onStderr) opts.onStderr(stderr);
          }
        );

        return {
          pid: response.cmdId || String(Date.now()),
          async wait() {
            await logsPromise;
            return { exitCode: 0, stdout: stdoutData, stderr: stderrData };
          },
          async kill() {
            // Daytona doesn't have direct kill
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
        const session = await workspace.process.getSession(workspace.id);
        
        const response = await workspace.process.executeSessionCommand(
          session.sessionId,
          { command: cmd, runAsync: false },
          undefined
        );

        let stdoutData = "";
        let stderrData = "";

        await workspace.process.getSessionCommandLogs(
          session.sessionId,
          response.cmdId!,
          (stdout: string) => {
            stdoutData += stdout;
            if (opts?.onStdout) opts.onStdout(stdout);
          },
          (stderr: string) => {
            stderrData += stderr;
            if (opts?.onStderr) opts.onStderr(stderr);
          }
        );

        return { exitCode: 0, stdout: stdoutData, stderr: stderrData };
      },
    },

    files: {
      async write(path, content) {
        await workspace.fs.uploadFile(path, content);
      },

      async read(path) {
        const buffer = await workspace.fs.downloadFile(path);
        return buffer.toString("utf-8");
      },
    },
  };
}

// ============================================================================
// Main API
// ============================================================================

/**
 * Create a Daytona sandbox with agents attached.
 *
 * @param config - Configuration for the sandbox
 * @returns Daytona sandbox with agent capabilities
 */
export async function createSandbox(config: DaytonaConfig): Promise<DaytonaSandboxWithAgents> {
  const { apiKey, image = "ubuntu:22.04", serverUrl = "https://app.daytona.io/api", envs = {} } = config;

  const daytonaConfig: DaytonaSDKConfig = {
    apiKey,
    apiUrl: serverUrl,
  };

  const daytona = new Daytona(daytonaConfig);

  const workspace = await daytona.create({
    image,
    envVars: envs,
  });

  await workspace.process.createSession(workspace.id);

  // Create adapted BaseSandbox for agents
  const baseSandbox = adaptToBaseSandbox(workspace);
  const sandboxWithAgents = attachAgents(baseSandbox);

  // Create result with both native methods and agents
  const result = Object.assign(workspace, {
    sandboxId: workspace.id,
    claude: sandboxWithAgents.claude,
    codex: sandboxWithAgents.codex,
    gemini: sandboxWithAgents.gemini,
    grok: sandboxWithAgents.grok,
    opencode: sandboxWithAgents.opencode,
    close: async () => {
      await daytona.delete(workspace);
    },
  }) as DaytonaSandboxWithAgents;

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
export function createDaytonaProvider(config: { apiKey: string; image?: string; serverUrl?: string }) {
  console.warn("⚠️  createDaytonaProvider() is deprecated. Please use createSandbox() instead.");
  
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
        async pause() { console.log("Pause not supported for Daytona"); },
        async getHost(port: number) {
          const preview = await sandbox.getPreviewLink(port);
          return preview.url;
        },
      };
    },
    async resume(sandboxId: string) {
      const daytonaConfig: DaytonaSDKConfig = {
        apiKey: config.apiKey,
        apiUrl: config.serverUrl || "https://app.daytona.io/api",
      };
      const daytona = new Daytona(daytonaConfig);
      const workspace = await daytona.get(sandboxId);
      const baseSandbox = adaptToBaseSandbox(workspace);
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
        async kill() { await daytona.delete(workspace); },
        async pause() { console.log("Pause not supported for Daytona"); },
        async getHost(port: number) {
          const preview = await workspace.getPreviewLink(port);
          return preview.url;
        },
      };
    },
  };
}
