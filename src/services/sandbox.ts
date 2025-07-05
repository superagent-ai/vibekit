import { Sandbox as E2BSandbox } from "@e2b/code-interpreter";
import { Daytona, DaytonaConfig, Sandbox, Workspace } from "@daytonaio/sdk";

import {
  AgentType,
  SandboxCommandOptions,
  SandboxCommands,
  SandboxConfig,
  SandboxInstance,
  SandboxProvider,
} from "../types";
import {
  ApiClient,
  ApiClientInMemoryContextProvider,
  GetServicePortsResult,
} from "@northflank/js-client";
import { toolingManager } from "./tooling";

// E2B implementation
export class E2BSandboxInstance implements SandboxInstance {
  constructor(private sandbox: E2BSandbox) {}

  get sandboxId(): string {
    return this.sandbox.sandboxId;
  }

  get commands(): SandboxCommands {
    return {
      run: async (command: string, options?: SandboxCommandOptions) => {
        // Extract our custom options and pass the rest to E2B
        const { background, ...e2bOptions } = options || {};

        // E2B has specific overloads for background vs non-background execution
        if (background) {
          // For background execution, E2B returns a CommandHandle, not a CommandResult
          const handle = await this.sandbox.commands.run(command, {
            ...e2bOptions,
            background: true,
            onStdout: (data) => console.log("stdout", data),
            onStderr: (data) => console.log("stderr", data),
          });
          // Since we need to return SandboxExecutionResult consistently,
          // return a placeholder result for background commands

          return {
            exitCode: 0,
            stdout: "Background command started successfully",
            stderr: "",
          };
        } else {
          // For non-background execution, E2B returns a CommandResult
          return await this.sandbox.commands.run(command, e2bOptions);
        }
      },
    };
  }

  async kill(): Promise<void> {
    await this.sandbox.kill();
  }

  async pause(): Promise<void> {
    await this.sandbox.pause();
  }

  async getHost(port: number): Promise<string> {
    return await this.sandbox.getHost(port);
  }
}

export class E2BSandboxProvider implements SandboxProvider {
  async create(
    config: SandboxConfig,
    envs?: Record<string, string>,
    agentType?: AgentType
  ): Promise<SandboxInstance> {
    // Inject tools before sandbox creation
    await toolingManager.injectTools(config);
    // Determine default template based on agent type if not specified in config
    let templateId = config.templateId;
    if (!templateId) {
      if (agentType === "claude") {
        templateId = "vibekit-claude";
      } else if (agentType === "opencode") {
        templateId = "vibekit-opencode";
      } else if (agentType === "gemini") {
        templateId = "vibekit-gemini";
      } else {
        templateId = "vibekit-codex";
      }
    }

    const sandbox = await E2BSandbox.create(templateId, {
      envs,
      apiKey: config.apiKey,
      timeoutMs: 86400000, // 24 hours in milliseconds
    });
    return new E2BSandboxInstance(sandbox);
  }

  async resume(
    sandboxId: string,
    config: SandboxConfig
  ): Promise<SandboxInstance> {
    const sandbox = await E2BSandbox.resume(sandboxId, {
      timeoutMs: 3600000,
      apiKey: config.apiKey,
    });
    return new E2BSandboxInstance(sandbox);
  }
}

// Daytona implementation
class DaytonaSandboxInstance implements SandboxInstance {
  constructor(
    private workspace: Sandbox, // Daytona workspace object
    private daytona: Daytona, // Daytona client
    public sandboxId: string,
    private envs?: Record<string, string> // Store environment variables
  ) {}

  get commands(): SandboxCommands {
    return {
      run: async (command: string, options?: SandboxCommandOptions) => {
        const session = await this.workspace.process.getSession(this.sandboxId);
        // Check if background execution is requested - not supported in Daytona
        if (options?.background) {
          const response = await this.workspace.process.executeSessionCommand(
            session.sessionId, // sessionId - using a default session name
            {
              command: command,
              runAsync: true, // run asynchronously for background execution
            },
            undefined // timeout - use default working directory
          );

          // Set up logging for the background command
          this.workspace.process.getSessionCommandLogs(
            session.sessionId,
            response.cmdId!,
            (chunk) => {
              options?.onStdout?.(chunk);
            }
          );

          // Wait for the command to complete
          while (true) {
            const commandInfo = await this.workspace.process.getSessionCommand(
              session.sessionId,
              response.cmdId!
            );

            const exitCode = commandInfo.exitCode;
            if (exitCode !== null && exitCode !== undefined) {
              return {
                exitCode: exitCode,
                stdout: "Background command started successfully",
                stderr: "", // SessionExecuteResponse doesn't have stderr
              };
            }

            // Wait before checking again
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        }

        try {
          // Execute command using Daytona's process execution API
          // Format: executeCommand(command, cwd?, env?, timeout?)
          const response = await this.workspace.process.executeSessionCommand(
            session.sessionId, // sessionId - using a default session name
            {
              command: command,
              runAsync: false,
            },
            undefined // timeout - use default working directory
          );

          return {
            exitCode: response.exitCode || 0,
            stdout: response.output || "",
            stderr: "", // ExecuteResponse doesn't have stderr
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

  async getHost(port: number): Promise<string> {
    const previewLink = await this.workspace.getPreviewLink(port);
    return previewLink.url;
  }
}

export class DaytonaSandboxProvider implements SandboxProvider {
  async create(
    config: SandboxConfig,
    envs?: Record<string, string>,
    agentType?: AgentType
  ): Promise<SandboxInstance> {
    // Inject tools before sandbox creation
    await toolingManager.injectTools(config);
    try {
      // Dynamic import to avoid dependency issues if daytona-sdk is not installed
      const daytonaConfig: DaytonaConfig = {
        apiKey: config.apiKey,
        apiUrl: config.serverUrl || "https://app.daytona.io",
      };

      const daytona = new Daytona(daytonaConfig);

      // Determine default image based on agent type if not specified in config
      let image = config.image || getDockerImageFromAgentType(agentType);

      // Create workspace with specified image or default and environment variables
      const workspace = await daytona.create({
        image,
        envVars: envs || {},
      });

      await workspace.process.createSession(workspace.id);

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

export class NorthflankSandboxInstance implements SandboxInstance {
  constructor(
    private apiClient: ApiClient,
    public sandboxId: string,
    private projectId: string,
    private workingDirectory: string
  ) {}

  get commands(): SandboxCommands {
    return {
      run: async (command: string, options?: SandboxCommandOptions) => {
        if (options?.background) {
          const handle = await this.apiClient.exec.execServiceSession(
            {
              projectId: this.projectId,
              serviceId: this.sandboxId,
            },
            {
              shell: `bash -c`,
              command,
            }
          );

          handle.stdErr.on("data", (data) =>
            options.onStderr?.(data.toString())
          );
          handle.stdOut.on("data", (data) =>
            options.onStdout?.(data.toString())
          );

          return {
            exitCode: 0,
            stdout: "Background command started successfully",
            stderr: "",
          };
        }

        const handle = await this.apiClient.exec.execServiceSession(
          {
            projectId: this.projectId,
            serviceId: this.sandboxId,
          },
          {
            shell: `bash -c`,
            command,
          }
        );

        const stdoutChunks: string[] = [];
        const stderrChunks: string[] = [];

        handle.stdOut.on("data", (data) => {
          const chunk = data.toString();
          stdoutChunks.push(chunk);
          options?.onStdout?.(chunk);
        });

        handle.stdErr.on("data", (data) => {
          const chunk = data.toString();
          stderrChunks.push(chunk);
          options?.onStderr?.(chunk);
        });

        const result = await handle.waitForCommandResult();

        const fullStdout = stdoutChunks.join("");
        const fullStderr = stderrChunks.join("");

        //TODO: handle streaming callbacks if provided

        return {
          exitCode: result.exitCode,
          stdout: fullStdout,
          stderr: fullStderr,
        };
      },
    };
  }

  async kill(): Promise<void> {
    if (this.apiClient && this.sandboxId) {
      await this.apiClient.delete.service({
        parameters: {
          projectId: this.projectId,
          serviceId: this.sandboxId,
        },
      });
    }
  }

  async pause(): Promise<void> {
    await this.apiClient.scale.service({
      parameters: {
        projectId: this.projectId,
        serviceId: this.sandboxId,
      },
      data: {
        instances: 0,
      },
    });
  }

  async getHost(port: number): Promise<string> {
    const existingPorts = await this.apiClient.get.service.ports({
      parameters: {
        projectId: this.projectId,
        serviceId: this.sandboxId,
      },
    });

    const existingPort = existingPorts.data.ports?.find(
      (p) => p.internalPort === port
    );
    if (existingPort) {
      const host = existingPort.dns;
      if (host) {
        return host;
      }
    }

    const input = [
      ...existingPorts.data.ports
        .filter((p) => p.internalPort === port)
        .map((port) => ({
          id: port.id,
          name: port.name,
          internalPort: port.internalPort,
          public: port.public,
          protocol: port.protocol,
          domains: port.domains.map((domain) => domain.name),
        })),
      {
        name: `p-${port}`,
        internalPort: port,
        public: true,
        protocol: "HTTP" as const,
      },
    ].filter(Boolean);

    await this.apiClient.update.service.ports({
      parameters: {
        projectId: this.projectId,
        serviceId: this.sandboxId,
      },
      data: {
        ports: input,
      },
    });

    const newPorts = await this.apiClient.get.service.ports({
      parameters: {
        projectId: this.projectId,
        serviceId: this.sandboxId,
      },
    });

    return (
      newPorts.data.ports?.find(
        (p: GetServicePortsResult["ports"][number]) => p.internalPort === port
      )?.dns || ""
    );
  }
}

export class NorthflankSandboxProvider implements SandboxProvider {
  private static readonly DefaultBillingPlan = "nf-compute-200";
  private static readonly DefaultPersistentVolume = "/var/vibe0";
  private static readonly DefaultPersistentVolumeStorage = 10240; // 10GiB
  private static readonly StatusPollInterval = 1_000; // 1 second
  private static readonly MaxPollTimeout = 300000; // 5 minutes

  private async buildAPIClient(projectId: string, apiKey: string) {
    const contextProvider = new ApiClientInMemoryContextProvider();
    await contextProvider.addContext({
      name: "vibekit",
      project: projectId,
      token: apiKey,
    });
    return new ApiClient(contextProvider, { throwErrorOnHttpErrorCode: true });
  }

  private async getServiceStatus(
    apiClient: ApiClient,
    sandboxId: string,
    projectId: string
  ) {
    const deployment = await apiClient.get.service({
      parameters: {
        projectId: projectId,
        serviceId: sandboxId,
      },
    });
    return deployment.data?.status?.deployment?.status;
  }

  private async waitForSandbox(
    apiClient: ApiClient,
    sandboxId: string,
    projectId: string
  ): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < NorthflankSandboxProvider.MaxPollTimeout) {
      const status = await this.getServiceStatus(
        apiClient,
        sandboxId,
        projectId
      );

      if (status === "COMPLETED") {
        return;
      }

      if (status === "FAILED") {
        throw new Error(`Sandbox deployment failed for ${sandboxId}`);
      }

      await new Promise((resolve) =>
        setTimeout(resolve, NorthflankSandboxProvider.StatusPollInterval)
      );
    }

    throw new Error(`Timeout waiting for sandbox ${sandboxId} to be ready`);
  }

  private generateSandboxId(): string {
    const uuid = crypto.randomUUID().split("-");
    return `sandbox-${uuid[4]}`;
  }

  async create(
    config: SandboxConfig,
    envs?: Record<string, string>,
    agentType?: AgentType
  ): Promise<SandboxInstance> {
    // Inject tools before sandbox creation
    await toolingManager.injectTools(config);
    if (!config.projectId || !config.apiKey) {
      throw new Error(
        "Northflank sandbox configuration missing one of required parameters: projectId, apiKey"
      );
    }

    const apiClient = await this.buildAPIClient(
      config.projectId,
      config.apiKey
    );

    const sandboxId = this.generateSandboxId();
    await apiClient.create.service.deployment({
      parameters: {
        projectId: config.projectId,
      },
      data: {
        name: sandboxId,
        billing: {
          deploymentPlan:
            config.billingPlan || NorthflankSandboxProvider.DefaultBillingPlan,
        },
        deployment: {
          instances: 0,
          external: {
            imagePath: config.image || getDockerImageFromAgentType(agentType),
          },
          storage: {
            ephemeralStorage: {
              storageSize: 2048,
            },
          },
        },
        runtimeEnvironment: envs || {},
      },
    });

    await apiClient.create.volume({
      parameters: {
        projectId: config.projectId,
      },
      data: {
        name: `Data-${sandboxId}`,
        mounts: [
          {
            containerMountPath:
              config.workingDirectory ||
              NorthflankSandboxProvider.DefaultPersistentVolume,
          },
        ],
        spec: {
          accessMode: "ReadWriteMany",
          storageClassName: "ssd",
          storageSize:
            config.persistentVolumeStorage ??
            NorthflankSandboxProvider.DefaultPersistentVolumeStorage,
        },
        attachedObjects: [
          {
            id: sandboxId,
            type: "service",
          },
        ],
      },
    });

    await apiClient.scale.service({
      parameters: {
        projectId: config.projectId,
        serviceId: sandboxId,
      },
      data: {
        instances: 1,
      },
    });

    await this.waitForSandbox(apiClient, sandboxId, config.projectId);

    return new NorthflankSandboxInstance(
      apiClient,
      sandboxId,
      config.projectId,
      config.workingDirectory ||
        NorthflankSandboxProvider.DefaultPersistentVolume
    );
  }

  async resume(
    sandboxId: string,
    config: SandboxConfig
  ): Promise<SandboxInstance> {
    if (!config.projectId || !config.apiKey) {
      throw new Error(
        "Northflank sandbox configuration missing one of required parameters: projectId, apiKey"
      );
    }

    const apiClient = await this.buildAPIClient(
      config.projectId,
      config.apiKey
    );
    await apiClient.scale.service({
      parameters: {
        projectId: config.projectId,
        serviceId: sandboxId,
      },
      data: {
        instances: 1,
      },
    });

    // Wait for the service to be ready before returning the instance
    await this.waitForSandbox(apiClient, sandboxId, config.projectId);

    return new NorthflankSandboxInstance(
      apiClient,
      sandboxId,
      config.projectId,
      config.workingDirectory ||
        NorthflankSandboxProvider.DefaultPersistentVolume
    );
  }
}

// Factory function to create appropriate sandbox provider
export function createSandboxProvider(
  type: "e2b" | "daytona" | "northflank"
): SandboxProvider {
  switch (type) {
    case "e2b":
      return new E2BSandboxProvider();
    case "daytona":
      return new DaytonaSandboxProvider();
    case "northflank":
      return new NorthflankSandboxProvider();
    default:
      throw new Error(`Unsupported sandbox type: ${type}`);
  }
}

// Helper function to create SandboxConfig from VibeKitConfig environment
export function createSandboxConfigFromEnvironment(
  environment: any,
  agentType?: AgentType,
  workingDirectory?: string
): SandboxConfig {
  const defaultImage = getDockerImageFromAgentType(agentType);
  if (environment.northflank) {
    return {
      type: "northflank",
      apiKey: environment.northflank.apiKey,
      image: environment.northflank.image || defaultImage,
      serverUrl: environment.northflank.serverUrl,
      projectId: environment.northflank.projectId,
      billingPlan: environment.northflank.billingPlan,
      persistentVolume: environment.northflank.persistentVolume,
      workingDirectory: workingDirectory || "/var/vibe0",
    };
  }

  // Try Daytona first if configured
  if (environment.daytona) {
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
    } else if (agentType === "opencode") {
      defaultTemplate = "vibekit-opencode";
    }

    return {
      type: "e2b",
      apiKey: environment.e2b.apiKey,
      templateId: environment.e2b.templateId || defaultTemplate,
    };
  }

  throw new Error("No sandbox configuration found in environment config");
}

const getDockerImageFromAgentType = (agentType?: AgentType) => {
  if (agentType === "codex") {
    return "superagentai/vibekit-codex:1.0";
  } else if (agentType === "claude") {
    return "superagentai/vibekit-claude:1.0";
  } else if (agentType === "opencode") {
    return "superagentai/vibekit-opencode:1.0";
  } else if (agentType === "gemini") {
    return "superagentai/vibekit-gemini:1.0";
  }
  return "ubuntu:22.04";
};
