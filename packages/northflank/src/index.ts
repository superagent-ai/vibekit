import {
  ApiClient,
  ApiClientInMemoryContextProvider,
  GetServicePortsResult,
} from "@northflank/js-client";

// Define the interfaces we need from the SDK
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
    agentType?: "codex" | "claude" | "opencode" | "gemini" | "grok",
    workingDirectory?: string
  ): Promise<SandboxInstance>;
  resume(sandboxId: string): Promise<SandboxInstance>;
}

export type AgentType = "codex" | "claude" | "opencode" | "gemini" | "grok";

export interface NorthflankConfig {
  apiKey: string;
  image?: string;
  projectId: string;
  billingPlan?: string;
  persistentVolumeStorage?: number;
  workingDirectory?: string;
}

// Helper function to get Docker image based on agent type
const getDockerImageFromAgentType = (agentType?: AgentType) => {
  if (agentType === "codex") {
    return "superagentai/vibekit-codex:1.0";
  } else if (agentType === "claude") {
    return "superagentai/vibekit-claude:1.0";
  } else if (agentType === "opencode") {
    return "superagentai/vibekit-opencode:1.0";
  } else if (agentType === "gemini") {
    return "superagentai/vibekit-gemini:1.0";
  } else if (agentType === "grok") {
    return "superagentai/vibekit-grok-cli:1.0";
  }
  return "ubuntu:22.04";
};

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

  constructor(private config: NorthflankConfig) {}

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
    envs?: Record<string, string>,
    agentType?: AgentType,
    workingDirectory?: string
  ): Promise<SandboxInstance> {
    if (!this.config.projectId || !this.config.apiKey) {
      throw new Error(
        "Northflank sandbox configuration missing one of required parameters: projectId, apiKey"
      );
    }

    const apiClient = await this.buildAPIClient(
      this.config.projectId,
      this.config.apiKey
    );

    const sandboxId = this.generateSandboxId();

    // Use the working directory from the method parameter or config
    const finalWorkingDirectory =
      workingDirectory ||
      this.config.workingDirectory ||
      NorthflankSandboxProvider.DefaultPersistentVolume;

    await apiClient.create.service.deployment({
      parameters: {
        projectId: this.config.projectId,
      },
      data: {
        name: sandboxId,
        billing: {
          deploymentPlan:
            this.config.billingPlan ||
            NorthflankSandboxProvider.DefaultBillingPlan,
        },
        deployment: {
          instances: 0,
          external: {
            imagePath:
              this.config.image || getDockerImageFromAgentType(agentType),
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
        projectId: this.config.projectId,
      },
      data: {
        name: `Data-${sandboxId}`,
        mounts: [
          {
            containerMountPath: finalWorkingDirectory,
          },
        ],
        spec: {
          accessMode: "ReadWriteMany",
          storageClassName: "ssd",
          storageSize:
            this.config.persistentVolumeStorage ??
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
        projectId: this.config.projectId,
        serviceId: sandboxId,
      },
      data: {
        instances: 1,
      },
    });

    await this.waitForSandbox(apiClient, sandboxId, this.config.projectId);

    return new NorthflankSandboxInstance(
      apiClient,
      sandboxId,
      this.config.projectId,
      finalWorkingDirectory
    );
  }

  async resume(sandboxId: string): Promise<SandboxInstance> {
    if (!this.config.projectId || !this.config.apiKey) {
      throw new Error(
        "Northflank sandbox configuration missing one of required parameters: projectId, apiKey"
      );
    }

    const apiClient = await this.buildAPIClient(
      this.config.projectId,
      this.config.apiKey
    );
    await apiClient.scale.service({
      parameters: {
        projectId: this.config.projectId,
        serviceId: sandboxId,
      },
      data: {
        instances: 1,
      },
    });

    // Wait for the service to be ready before returning the instance
    await this.waitForSandbox(apiClient, sandboxId, this.config.projectId);

    return new NorthflankSandboxInstance(
      apiClient,
      sandboxId,
      this.config.projectId,
      this.config.workingDirectory ||
        NorthflankSandboxProvider.DefaultPersistentVolume
    );
  }
}

export function createNorthflankProvider(
  config: NorthflankConfig
): NorthflankSandboxProvider {
  return new NorthflankSandboxProvider(config);
}
