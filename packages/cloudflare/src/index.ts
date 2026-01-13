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
 *   hostname: "my-app.example.com",
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

import { getSandbox, Sandbox } from "@cloudflare/sandbox";
import { attachAgents, type BaseSandbox, type Agents, type ProcessHandle } from "@vibe-kit/core";

// ============================================================================
// Types from @cloudflare/sandbox (redefine for type safety)
// ============================================================================

interface ExecuteResponse {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  command: string;
  args: string[];
  timestamp: string;
}

interface ReadFileResponse {
  success: boolean;
  exitCode: number;
  path: string;
  content: string;
  timestamp: string;
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Environment type for Cloudflare Worker with Sandbox binding
 */
export interface SandboxEnv {
  Sandbox: {
    idFromName: (name: string) => { toString: () => string };
    get: (id: unknown) => unknown;
  };
}

/**
 * Configuration for creating a Cloudflare sandbox
 */
export interface CloudflareConfig {
  /**
   * Cloudflare environment with Sandbox binding
   */
  env: SandboxEnv;

  /**
   * Hostname for exposed ports (must be your custom domain, not .workers.dev)
   * Preview URLs use wildcard subdomains like https://3000-sandbox-id.example.com
   */
  hostname: string;

  /**
   * Optional sandbox ID (for resuming). Same ID always returns the same sandbox instance.
   */
  sandboxId?: string;

  /**
   * Environment variables to set in the sandbox
   */
  envs?: Record<string, string>;
}

// ============================================================================
// Sandbox Type
// ============================================================================

/**
 * Extended Sandbox interface matching the actual API
 */
interface SandboxInstance {
  exec(command: string, args: string[], options?: { stream?: boolean }): Promise<void | ExecuteResponse>;
  writeFile(path: string, content: string, options?: { encoding?: string; stream?: boolean }): Promise<void>;
  readFile(path: string, options?: { encoding?: string; stream?: boolean }): Promise<void | ReadFileResponse>;
  mkdir(path: string, options?: { recursive?: boolean; stream?: boolean }): Promise<void>;
}

/**
 * Cloudflare Sandbox with agents attached
 */
export type CloudflareSandboxWithAgents = SandboxInstance & Agents & {
  sandboxId: string;
  close(): Promise<void>;
  getHost(port: number): Promise<string>;
};

// ============================================================================
// Adapter to make Cloudflare compatible with BaseSandbox interface
// ============================================================================

function adaptToBaseSandbox(sandbox: SandboxInstance, hostname: string): BaseSandbox {
  return {
    process: {
      async start(cmd, opts): Promise<ProcessHandle> {
        // Parse command into command and args
        const parts = cmd.split(" ");
        const command = parts[0];
        
        // Start process in background using nohup
        await sandbox.exec("nohup", [...parts, "&"], { stream: false });
        
        // Return a handle (note: limited control in current API)
        return {
          pid: `${command}-${Date.now()}`,
          async wait() {
            // Background processes can't be waited on directly
            return { exitCode: 0, stdout: "", stderr: "" };
          },
          async kill() {
            // Kill by command name (best effort)
            await sandbox.exec("pkill", ["-f", command], { stream: false });
          },
          stdout: {
            async *[Symbol.asyncIterator]() {
              yield "";
            },
          },
          stderr: {
            async *[Symbol.asyncIterator]() {
              yield "";
            },
          },
        };
      },

      async startAndWait(cmd, opts) {
        // Parse command into command and args
        const parts = cmd.split(" ");
        const command = parts[0];
        const args = parts.slice(1);
        
        const response = await sandbox.exec(command, args, { 
          stream: false 
        });
        
        if (response) {
          return { 
            exitCode: response.exitCode, 
            stdout: response.stdout || "", 
            stderr: response.stderr || ""
          };
        }
        
        return { exitCode: 0, stdout: "", stderr: "" };
      },
    },

    files: {
      async write(path, content) {
        await sandbox.writeFile(path, content, { stream: false });
      },

      async read(path) {
        const result = await sandbox.readFile(path, { stream: false });
        return (result as ReadFileResponse | undefined)?.content || "";
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
  
  // getSandbox returns a DurableObjectStub - container starts lazily on first operation
  // Cast to any since the types don't fully match the runtime behavior
  const sandbox = getSandbox(env.Sandbox as any, id) as unknown as SandboxInstance;

  // Create adapted BaseSandbox for agents
  const baseSandbox = adaptToBaseSandbox(sandbox, hostname);
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
      // The current @cloudflare/sandbox package doesn't expose destroy()
      // Clean up by killing all processes
      try {
        await sandbox.exec("pkill", ["-9", "-f", "."], { stream: false });
      } catch {
        // Ignore errors on cleanup
      }
    },
    async getHost(port: number) {
      // Generate preview URL based on hostname pattern
      // Format: https://{port}-sandbox-{id}.{hostname}
      const sanitizedId = id.replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase();
      return `https://${port}-sandbox-${sanitizedId.substring(0, 8)}.${hostname}`;
    },
  }) as CloudflareSandboxWithAgents;

  // Set environment variables if provided
  if (Object.keys(envs).length > 0) {
    // Export environment variables
    for (const [key, value] of Object.entries(envs)) {
      const escapedValue = value.replace(/"/g, '\\"');
      await sandbox.exec("sh", ["-c", `export ${key}="${escapedValue}"`], { stream: false });
    }
  }

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

export { Sandbox } from "@cloudflare/sandbox";

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
      const baseSandbox = adaptToBaseSandbox(sandbox as unknown as SandboxInstance, config.hostname);
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
        async getHost(port: number) {
          return sandbox.getHost(port);
        },
      };
    },
    async resume(_sandboxId: string) {
      return this.create();
    },
  };
}
