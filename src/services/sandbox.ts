import { Sandbox as E2BSandbox } from "@e2b/code-interpreter";
import { Daytona, DaytonaConfig } from "@daytonaio/sdk";
import Docker from "dockerode";

import {
  SandboxInstance,
  SandboxConfig,
  SandboxProvider,
  SandboxCommands,
  SandboxCommandOptions,
  SandboxExecutionResult,
  AgentType,
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
    private workspace: any, // Daytona workspace object
    private daytona: any, // Daytona client
    public sandboxId: string,
    private envs?: Record<string, string> // Store environment variables
  ) {}

  get commands(): SandboxCommands {
    return {
      run: async (command: string, options?: SandboxCommandOptions) => {
        // Check if background execution is requested - not supported in Daytona
        if (options?.background) {
          const response = await this.workspace.process.executSessionCommand(
            command,
            undefined, // cwd - use default working directory
            this.envs, // env - use instance environment variables
            options?.timeoutMs || 3600000 // timeout in seconds, default 60 minutes
          );

          return {
            exitCode: response.exitCode || 0,
            stdout: response.result || "",
            stderr: response.stderr || "",
          };
        }

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

  async getHost(port: number): Promise<string> {
    throw new Error("getHost is not implemented for Daytona sandboxes");
  }
}

export class DaytonaSandboxProvider implements SandboxProvider {
  async create(
    config: SandboxConfig,
    envs?: Record<string, string>,
    agentType?: AgentType
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
        } else if (agentType === "opencode") {
          image = "superagentai/vibekit-opencode:1.0";
        } else if (agentType === "gemini") {
          image = "superagentai/vibekit-gemini:1.0";
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

// Docker implementation
class DockerSandboxInstance implements SandboxInstance {
  constructor(
    private container: Docker.Container,
    private docker: Docker,
    private envs?: Record<string, string>
  ) {}

  get sandboxId(): string {
    return this.container.id;
  }

  get commands(): SandboxCommands {
    return {
      run: async (command: string, options?: SandboxCommandOptions) => {
        
        try {
          // Create exec instance
          const execOptions = {
            Cmd: ['/bin/bash', '-c', command],
            AttachStdin: false,
            AttachStdout: true,
            AttachStderr: true,
            Env: this.envs ? Object.entries(this.envs).map(([k, v]) => `${k}=${v}`) : undefined,
          };
          
          const exec = await this.container.exec(execOptions);

          // Start exec
          const stream = await exec.start({
            hijack: false,
            stdin: false,
          });

          let stdout = '';
          let stderr = '';

          // Handle background execution
          if (options?.background) {
            // For background execution, return immediately
            return {
              exitCode: 0,
              stdout: "Background command started successfully",
              stderr: "",
            };
          }

          // Collect output
          return new Promise<SandboxExecutionResult>((resolve, reject) => {
            const timeout = options?.timeoutMs ? setTimeout(() => {
              reject(new Error(`Command timeout after ${options.timeoutMs}ms`));
            }, options.timeoutMs) : null;

            stream.on('data', (chunk: Buffer) => {
              const data = chunk.toString();
              // Docker may multiplex streams, but we'll treat all as stdout for simplicity
              stdout += data;
              if (options?.onStdout) {
                options.onStdout(data);
              }
            });

            stream.on('end', async () => {
              if (timeout) clearTimeout(timeout);
              
              try {
                // Get exit code
                const inspectResult = await exec.inspect();
                resolve({
                  exitCode: inspectResult.ExitCode || 0,
                  stdout,
                  stderr,
                });
              } catch (error) {
                reject(error);
              }
            });

            stream.on('error', (error: Error) => {
              if (timeout) clearTimeout(timeout);
              if (options?.onStderr) {
                options.onStderr(error.message);
              }
              reject(error);
            });
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
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
    try {
      await this.container.kill();
      await this.container.remove();
    } catch (error) {
      console.warn('Failed to kill/remove container:', error);
    }
  }

  async pause(): Promise<void> {
    try {
      await this.container.pause();
    } catch (error) {
      console.warn('Failed to pause container:', error);
    }
  }
}

export class DockerSandboxProvider implements SandboxProvider {
  async create(
    config: SandboxConfig,
    envs?: Record<string, string>,
    agentType?: "codex" | "claude" | "opencode"
  ): Promise<SandboxInstance> {
    
    try {
      // Initialize Docker client
      const dockerOptions: Docker.DockerOptions = {};
      
      if (config.socketPath) {
        dockerOptions.socketPath = config.socketPath;
      } else if (config.host) {
        dockerOptions.host = config.host;
        dockerOptions.port = config.port || 2375;
        dockerOptions.protocol = config.protocol || 'http';
        
        // Add TLS configuration if provided
        if (config.ca || config.cert || config.key) {
          dockerOptions.ca = config.ca;
          dockerOptions.cert = config.cert;
          dockerOptions.key = config.key;
        }
      } else {
        // Default to local socket
        dockerOptions.socketPath = '/var/run/docker.sock';
      }

      const docker = new Docker(dockerOptions);

      // Test Docker connection
      try {
        await docker.info();
      } catch (connectionError) {
        throw connectionError;
      }

      // Determine default image based on agent type if not specified in config
      let image = config.image;
      if (!image) {
        if (agentType === "codex") {
          image = "superagentai/vibekit-codex:1.0";
        } else if (agentType === "claude") {
          image = "superagentai/vibekit-claude:1.0";
        } else if (agentType === "opencode") {
          image = "superagentai/vibekit-opencode:1.0";
        } else {
          // Default to Ubuntu if no agent type or custom image specified
          image = "ubuntu:22.04";
        }
      }
      // Check if image exists locally, if not try to pull it
      try {
        await docker.getImage(image).inspect();
      } catch (error) {
        try {
          await new Promise<void>((resolve, reject) => {
            docker.pull(image, (err: any, stream: any) => {
              if (err) {
                reject(err);
                return;
              }
              
              docker.modem.followProgress(stream, (err: any) => {
                if (err) {
                  reject(err);
                } else {
                  resolve();
                }
              });
            });
          });
        } catch (pullError) {
          throw new Error(`Failed to pull Docker image ${image}: ${pullError instanceof Error ? pullError.message : String(pullError)}`);
        }
      }

      // Generate UTC timestamp for both container name and label
      const createdAt = new Date();
      const createdAtISO = createdAt.toISOString();
      const timestamp = createdAt.getTime();
      const containerName = `vibekit-sandbox-${agentType || 'default'}-${timestamp}`;
      
      // Create container
      const containerOptions = {
        Image: image,
        name: containerName,
        Cmd: [],
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        Tty: true,
        OpenStdin: true,
        StdinOnce: false,
        Env: envs ? Object.entries(envs).map(([k, v]) => `${k}=${v}`) : undefined,
        WorkingDir: '/workspace',
        Labels: {
          'sh.vibekit.managed': 'true',
          'sh.vibekit.type': 'sandbox',
          'sh.vibekit.agent-type': agentType || 'default',
          'sh.vibekit.created': createdAtISO,
          'sh.vibekit.group': 'vibekit-sandboxes'
        },
        HostConfig: {
          AutoRemove: false, // We'll manage removal manually
        },
      };
      
      const container = await docker.createContainer(containerOptions);

      // Start the container
      await container.start();

      const dockerInstance = new DockerSandboxInstance(container, docker, envs);
      
      return dockerInstance;
    } catch (error) {
      throw new Error(
        `Failed to create Docker sandbox: ${
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
      // Initialize Docker client with same options as create
      const dockerOptions: Docker.DockerOptions = {};
      
      if (config.socketPath) {
        dockerOptions.socketPath = config.socketPath;
      } else if (config.host) {
        dockerOptions.host = config.host;
        dockerOptions.port = config.port || 2375;
        dockerOptions.protocol = config.protocol || 'http';
        
        if (config.ca || config.cert || config.key) {
          dockerOptions.ca = config.ca;
          dockerOptions.cert = config.cert;
          dockerOptions.key = config.key;
        }
      } else {
        dockerOptions.socketPath = '/var/run/docker.sock';
      }

      const docker = new Docker(dockerOptions);
      const container = docker.getContainer(sandboxId);

      // Check if container exists and get its state
      const containerInfo = await container.inspect();
      
      // Start the container if it's not running
      if (!containerInfo.State.Running) {
        await container.start();
      }

      return new DockerSandboxInstance(container, docker, undefined);
    } catch (error) {
      throw new Error(
        `Failed to resume Docker sandbox: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
}

// Factory function to create appropriate sandbox provider
export function createSandboxProvider(
  type: "e2b" | "daytona" | "docker"
): SandboxProvider {
  switch (type) {
    case "e2b":
      return new E2BSandboxProvider();
    case "daytona":
      return new DaytonaSandboxProvider();
    case "docker":
      return new DockerSandboxProvider();
    default:
      throw new Error(`Unsupported sandbox type: ${type}`);
  }
}

// Helper function to create SandboxConfig from VibeKitConfig environment
export function createSandboxConfigFromEnvironment(
  environment: any,
  agentType?: AgentType
): SandboxConfig {
  // Try Docker first if configured
  if (environment.docker) {
    // Determine default image based on agent type
    let defaultImage = "ubuntu:22.04"; // fallback
    if (agentType === "codex") {
      defaultImage = "superagentai/vibekit-codex:1.0";
    } else if (agentType === "claude") {
      defaultImage = "superagentai/vibekit-claude:1.0";
    } else if (agentType === "opencode") {
      defaultImage = "superagentai/vibekit-opencode:1.0";
    }

    return {
      type: "docker",
      image: environment.docker.image || defaultImage,
      socketPath: environment.docker.socketPath,
      host: environment.docker.host,
      port: environment.docker.port,
      protocol: environment.docker.protocol,
      ca: environment.docker.ca,
      cert: environment.docker.cert,
      key: environment.docker.key,
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
    } else if (agentType === "opencode") {
      defaultImage = "superagentai/vibekit-opencode:1.0";
    } else if (agentType === "gemini") {
      defaultImage = "superagentai/vibekit-gemini:1.0";
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
