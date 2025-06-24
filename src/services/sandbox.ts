import { Sandbox as E2BSandbox } from "@e2b/code-interpreter";
import { Daytona, DaytonaConfig } from "@daytonaio/sdk";
import { CodeSandbox } from "@codesandbox/sdk";

import {
  SandboxInstance,
  SandboxConfig,
  SandboxProvider,
  SandboxCommands,
  SandboxCommandOptions,
  SandboxExecutionResult,
} from "../types";

// E2B implementation
export class E2BSandboxInstance implements SandboxInstance {
  constructor(private sandbox: E2BSandbox) {}

  get sandboxId(): string {
    return this.sandbox.sandboxId;
  }

  get commands(): SandboxCommands {
    return {
      run: async (command: string, options?: SandboxCommandOptions) => {
        return await this.sandbox.commands.run(command, options);
      },
    };
  }

  async kill(): Promise<void> {
    await this.sandbox.kill();
  }

  async pause(): Promise<void> {
    await this.sandbox.pause();
  }
}

export class E2BSandboxProvider implements SandboxProvider {
  async create(
    config: SandboxConfig,
    envs?: Record<string, string>,
    agentType?: "codex" | "claude"
  ): Promise<SandboxInstance> {
    // Determine default template based on agent type if not specified in config
    let templateId = config.templateId;
    if (!templateId) {
      templateId = agentType === "claude" ? "vibekit-claude" : "vibekit-codex";
    }

    const sandbox = await E2BSandbox.create(templateId, {
      envs,
      apiKey: config.apiKey,
    });
    return new E2BSandboxInstance(sandbox);
  }

  async resume(
    sandboxId: string,
    config: SandboxConfig
  ): Promise<SandboxInstance> {
    const sandbox = await E2BSandbox.resume(sandboxId, {
      timeoutMs: 3600000,
    });
    return new E2BSandboxInstance(sandbox);
  }
}

// Daytona implementation
class DaytonaSandboxInstance implements SandboxInstance {
  constructor(
    private workspace: any, // Daytona workspace object
    private daytona: any, // Daytona client
    public sandboxId: string,
    private envs?: Record<string, string> // Store environment variables
  ) {}

  get commands(): SandboxCommands {
    return {
      run: async (command: string, options?: SandboxCommandOptions) => {
        try {
          // Execute command using Daytona's process execution API
          // Format: executeCommand(command, cwd?, env?, timeout?)
          const response = await this.workspace.process.executeCommand(
            command,
            undefined, // cwd - use default working directory
            this.envs, // env - use instance environment variables
            options?.timeoutMs || 3600000 // timeout in seconds, default 60 minutes
          );

          // Handle streaming callbacks if provided
          if (options?.onStdout && response.result) {
            options.onStdout(response.result);
          }
          if (options?.onStderr && response.stderr) {
            options.onStderr(response.stderr);
          }

          // Daytona returns: { exitCode, result, stderr, artifacts }
          return {
            exitCode: response.exitCode || 0,
            stdout: response.result || "",
            stderr: response.stderr || "",
          };
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          if (options?.onStderr) {
            options.onStderr(errorMessage);
          }
          return {
            exitCode: 1,
            stdout: "",
            stderr: errorMessage,
          };
        }
      },
    };
  }

  async kill(): Promise<void> {
    if (this.daytona && this.workspace) {
      await this.daytona.remove(this.workspace);
    }
  }

  async pause(): Promise<void> {
    // Daytona doesn't have a direct pause equivalent
    console.log(
      "Pause not directly supported for Daytona sandboxes - workspace remains active"
    );
  }
}

export class DaytonaSandboxProvider implements SandboxProvider {
  async create(
    config: SandboxConfig,
    envs?: Record<string, string>,
    agentType?: "codex" | "claude"
  ): Promise<SandboxInstance> {
    try {
      // Dynamic import to avoid dependency issues if daytona-sdk is not installed
      const daytonaConfig: DaytonaConfig = {
        apiKey: config.apiKey,
        apiUrl: config.serverUrl || "https://app.daytona.io",
      };

      const daytona = new Daytona(daytonaConfig);

      // Determine default image based on agent type if not specified in config
      let image = config.image;

      if (!image) {
        if (agentType === "codex") {
          image = "superagentai/vibekit-codex:1.0";
        } else if (agentType === "claude") {
          image = "superagentai/vibekit-claude:1.0";
        }
      }

      // Create workspace with specified image or default and environment variables
      const workspace = await daytona.create({
        image,
        envVars: envs || {},
      });

      return new DaytonaSandboxInstance(workspace, daytona, workspace.id, envs);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("Cannot resolve module")
      ) {
        throw new Error(
          "Daytona SDK not found. Please install daytona-sdk: npm install daytona-sdk"
        );
      }
      throw new Error(
        `Failed to create Daytona sandbox: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  async resume(
    sandboxId: string,
    config: SandboxConfig
  ): Promise<SandboxInstance> {
    try {
      const daytonaConfig: DaytonaConfig = {
        apiKey: config.apiKey,
        apiUrl: config.serverUrl || "https://app.daytona.io",
      };

      const daytona = new Daytona(daytonaConfig);

      // Resume workspace by ID
      const workspace = await daytona.get(sandboxId);

      return new DaytonaSandboxInstance(
        workspace,
        daytona,
        sandboxId,
        undefined
      );
    } catch (error) {
      throw new Error(
        `Failed to resume Daytona sandbox: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
}

// TogetherAI implementation
class TogetherAISandboxInstance implements SandboxInstance {
  constructor(
    private session: any, // TogetherAI session object
    private sandbox: any, // TogetherAI sandbox object
    public sandboxId: string
  ) {}

  get commands(): SandboxCommands {
    return {
      run: async (command: string, options?: SandboxCommandOptions) => {
        try {
          // Execute command using TogetherAI's session API
          const response = await this.session.commands.run(command);

          // Handle streaming callbacks if provided
          if (options?.onStdout && response.stdout) {
            options.onStdout(response.stdout);
          }
          if (options?.onStderr && response.stderr) {
            options.onStderr(response.stderr);
          }

          // TogetherAI returns: { exitCode, stdout, stderr }
          return {
            exitCode: response.exitCode || 0,
            stdout: response.stdout || "",
            stderr: response.stderr || "",
          };
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          if (options?.onStderr) {
            options.onStderr(errorMessage);
          }
          return {
            exitCode: 1,
            stdout: "",
            stderr: errorMessage,
          };
        }
      },
    };
  }

  async kill(): Promise<void> {
    if (this.sandbox) {
      await this.sandbox.kill();
    }
  }

  async pause(): Promise<void> {
    // TogetherAI doesn't have a direct pause equivalent
    console.log(
      "Pause not directly supported for TogetherAI sandboxes - sandbox remains active"
    );
  }
}

export class TogetherAISandboxProvider implements SandboxProvider {
  async create(
    config: SandboxConfig,
    envs?: Record<string, string>,
    agentType?: "codex" | "claude"
  ): Promise<SandboxInstance> {
    try {
      const sdk = new CodeSandbox(config.apiKey);

      // Create sandbox - the SDK might handle environment variables differently
      const sandbox = await sdk.sandboxes.create();

      // Connect to the sandbox to get a session
      const session = await sandbox.connect();
      console.log("Session connected");

      // Set environment variables if provided (may need to be done after connection)
      if (envs && Object.keys(envs).length > 0) {
        for (const [key, value] of Object.entries(envs)) {
          await session.commands.run(`export ${key}="${value}"`);
        }
      }

      return new TogetherAISandboxInstance(session, sandbox, sandbox.id);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("Cannot resolve module")
      ) {
        throw new Error(
          "TogetherAI SDK not found. Please install @codesandbox/sdk: npm install @codesandbox/sdk"
        );
      }
      throw new Error(
        `Failed to create TogetherAI sandbox: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  async resume(
    sandboxId: string,
    config: SandboxConfig
  ): Promise<SandboxInstance> {
    try {
      const sdk = new CodeSandbox(config.apiKey);

      // Resume existing sandbox by ID - assuming the SDK provides this functionality
      // If not available, we might need to store sandbox references differently
      const sandbox = await sdk.sandboxes.resume(sandboxId);

      // Connect to the sandbox to get a session
      const session = await sandbox.connect();

      return new TogetherAISandboxInstance(session, sandbox, sandboxId);
    } catch (error) {
      throw new Error(
        `Failed to resume TogetherAI sandbox: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
}

// Factory function to create appropriate sandbox provider
export function createSandboxProvider(
  type: "e2b" | "daytona" | "togetherai"
): SandboxProvider {
  switch (type) {
    case "e2b":
      return new E2BSandboxProvider();
    case "daytona":
      return new DaytonaSandboxProvider();
    case "togetherai":
      return new TogetherAISandboxProvider();
    default:
      throw new Error(`Unsupported sandbox type: ${type}`);
  }
}

// Helper function to create SandboxConfig from VibeKitConfig environment
export function createSandboxConfigFromEnvironment(
  environment: any,
  agentType?: "codex" | "claude"
): SandboxConfig {
  // Try TogetherAI first if configured
  if (environment.togetherai) {
    return {
      type: "togetherai",
      apiKey: environment.togetherai.apiKey,
      templateId: environment.togetherai.templateId,
    };
  }

  // Try Daytona if configured
  if (environment.daytona) {
    // Determine default image based on agent type
    let defaultImage = "ubuntu:22.04"; // fallback
    if (agentType === "codex") {
      defaultImage = "superagentai/vibekit-codex:1.0";
    } else if (agentType === "claude") {
      defaultImage = "superagentai/vibekit-claude:1.0";
    }

    return {
      type: "daytona",
      apiKey: environment.daytona.apiKey,
      image: environment.daytona.image || defaultImage,
      serverUrl: environment.daytona.serverUrl,
    };
  }

  // Fall back to E2B if configured
  if (environment.e2b) {
    // Determine default template based on agent type
    let defaultTemplate = "vibekit-codex"; // fallback
    if (agentType === "claude") {
      defaultTemplate = "vibekit-claude";
    }

    return {
      type: "e2b",
      apiKey: environment.e2b.apiKey,
      templateId: environment.e2b.templateId || defaultTemplate,
    };
  }

  throw new Error("No sandbox configuration found in environment config");
}
