/**
 * @vibe-kit/beam
 *
 * Beam sandbox provider for VibeKit SDK v2.
 *
 * @example
 * ```typescript
 * import { createSandbox } from "@vibe-kit/beam";
 *
 * const sandbox = await createSandbox({
 *   token: process.env.BEAM_TOKEN,
 *   workspaceId: process.env.BEAM_WORKSPACE_ID,
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

import { beamOpts, Image, Sandbox as BeamSandbox, SandboxInstance as BeamSandboxInstance } from "@beamcloud/beam-js";
import { attachAgents, type BaseSandbox, type Agents } from "@vibe-kit/core";

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Configuration for creating a Beam sandbox
 */
export interface BeamConfig {
  /**
   * Beam API token
   */
  token: string;

  /**
   * Beam workspace ID
   */
  workspaceId: string;

  /**
   * Docker image to use
   */
  image?: string;

  /**
   * Number of CPUs
   */
  cpu?: number;

  /**
   * Memory allocation (e.g., "1Gi")
   */
  memory?: number | string;

  /**
   * Keep warm seconds
   */
  keepWarmSeconds?: number;

  /**
   * Environment variables
   */
  envs?: Record<string, string>;
}

// ============================================================================
// Sandbox Type
// ============================================================================

/**
 * Beam Sandbox with agents attached
 */
export type BeamSandboxWithAgents = BeamSandboxInstance & Agents & {
  close(): Promise<void>;
};

// ============================================================================
// Adapter to make Beam compatible with BaseSandbox interface
// ============================================================================

function adaptToBaseSandbox(instance: BeamSandboxInstance): BaseSandbox {
  return {
    process: {
      async start(cmd, opts) {
        const proc = await instance.exec("bash", "-c", cmd);
        
        let stdoutData = "";
        let stderrData = "";
        let processEnded = false;

        return {
          pid: String(Date.now()),
          async wait() {
            const [exitCode, stdout, stderr] = await Promise.all([
              proc.wait(),
              proc.stdout.read(),
              proc.stderr.read(),
            ]);
            processEnded = true;
            stdoutData = stdout;
            stderrData = stderr;
            opts?.onStdout?.(stdout);
            opts?.onStderr?.(stderr);
            return { exitCode, stdout, stderr };
          },
          async kill() {
            processEnded = true;
          },
          stdout: {
            [Symbol.asyncIterator]() {
              let done = false;
              return {
                async next(): Promise<IteratorResult<string>> {
                  if (done || processEnded) return { value: "", done: true };
                  done = true;
                  const data = await proc.stdout.read();
                  return { value: data, done: false };
                },
              };
            },
          },
          stderr: {
            [Symbol.asyncIterator]() {
              let done = false;
              return {
                async next(): Promise<IteratorResult<string>> {
                  if (done || processEnded) return { value: "", done: true };
                  done = true;
                  const data = await proc.stderr.read();
                  return { value: data, done: false };
                },
              };
            },
          },
        };
      },

      async startAndWait(cmd, opts) {
        const proc = await instance.exec("bash", "-c", cmd);
        const [exitCode, stdout, stderr] = await Promise.all([
          proc.wait(),
          proc.stdout.read(),
          proc.stderr.read(),
        ]);
        opts?.onStdout?.(stdout);
        opts?.onStderr?.(stderr);
        return { exitCode, stdout, stderr };
      },
    },

    files: {
      async write(path, content) {
        await instance.exec("bash", "-c", `cat > "${path}" << 'VIBEKIT_EOF'\n${content}\nVIBEKIT_EOF`);
      },

      async read(path) {
        const proc = await instance.exec("cat", path);
        await proc.wait();
        return proc.stdout.read();
      },
    },
  };
}

// ============================================================================
// Main API
// ============================================================================

/**
 * Create a Beam sandbox with agents attached.
 *
 * @param config - Configuration for the sandbox
 * @returns Beam sandbox with agent capabilities
 */
export async function createSandbox(config: BeamConfig): Promise<BeamSandboxWithAgents> {
  const {
    token,
    workspaceId,
    image = "ubuntu:22.04",
    cpu = 2,
    memory = "1Gi",
    keepWarmSeconds = 300,
    envs = {},
  } = config;

  // Configure Beam globally
  beamOpts.token = token;
  beamOpts.workspaceId = workspaceId;

  const beamImage = new Image({
    baseImage: image,
    envVars: Object.entries(envs).map(([key, value]) => `${key}=${value}`),
  });

  const sandbox = new BeamSandbox({
    name: `vibekit-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    image: beamImage,
    cpu,
    memory,
    keepWarmSeconds,
  });

  const instance = await sandbox.create();

  // Create adapted BaseSandbox for agents
  const baseSandbox = adaptToBaseSandbox(instance);
  const sandboxWithAgents = attachAgents(baseSandbox);

  // Create result with both native methods and agents
  const result = Object.assign(instance, {
    claude: sandboxWithAgents.claude,
    codex: sandboxWithAgents.codex,
    gemini: sandboxWithAgents.gemini,
    grok: sandboxWithAgents.grok,
    opencode: sandboxWithAgents.opencode,
    close: async () => {
      await instance.terminate();
    },
  }) as BeamSandboxWithAgents;

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
export function createBeamProvider(config: BeamConfig) {
  console.warn("⚠️  createBeamProvider() is deprecated. Please use createSandbox() instead.");
  
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
        async pause() { console.log("Pause not supported for Beam"); },
        async getHost(port: number) {
          return sandbox.exposePort(port);
        },
      };
    },
    async resume(sandboxId: string) {
      beamOpts.token = config.token;
      beamOpts.workspaceId = config.workspaceId;
      const instance = await BeamSandbox.connect(sandboxId);
      const baseSandbox = adaptToBaseSandbox(instance);
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
        async kill() { await instance.terminate(); },
        async pause() { console.log("Pause not supported for Beam"); },
        async getHost(port: number) {
          return instance.exposePort(port);
        },
      };
    },
  };
}
