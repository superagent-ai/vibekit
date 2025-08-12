/**
 * VibeKit Dagger Local Sandbox Provider
 *
 * Implements the sandbox provider interface using Dagger for local containerized
 * development environments with ARM64 agent images.
 */

import { connect } from "@dagger.io/dagger";
import type { Client, Directory } from "@dagger.io/dagger";
import { exec } from "child_process";
import { promisify } from "util";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { EventEmitter } from "events";
import { homedir } from "os";

const execAsync = promisify(exec);

// Logger interface for structured logging
interface Logger {
  debug(message: string, meta?: any): void;
  info(message: string, meta?: any): void;
  warn(message: string, meta?: any): void;
  error(message: string, error?: Error | any, meta?: any): void;
}

// Default console logger implementation
class ConsoleLogger implements Logger {
  private context: string;
  
  constructor(context: string = "VibeKitDagger") {
    this.context = context;
  }

  private log(level: string, message: string, meta?: any): void {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level}] [${this.context}] ${message}`;
    
    if (meta) {
      console.log(logMessage, meta);
    } else {
      console.log(logMessage);
    }
  }

  debug(message: string, meta?: any): void {
    if (process.env.VIBEKIT_LOG_LEVEL === "debug") {
      this.log("DEBUG", message, meta);
    }
  }

  info(message: string, meta?: any): void {
    this.log("INFO", message, meta);
  }

  warn(message: string, meta?: any): void {
    this.log("WARN", message, meta);
  }

  error(message: string, error?: Error | any, meta?: any): void {
    const errorMeta = error instanceof Error ? {
      ...meta,
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name
      }
    } : meta;
    
    this.log("ERROR", message, errorMeta);
  }
}

// Custom error types for specific failure scenarios
export class VibeKitError extends Error {
  constructor(message: string, public code: string, public cause?: Error) {
    super(message);
    this.name = "VibeKitError";
  }
}

export class ContainerExecutionError extends VibeKitError {
  constructor(message: string, public exitCode: number, cause?: Error) {
    super(message, "CONTAINER_EXECUTION_ERROR", cause);
    this.name = "ContainerExecutionError";
  }
}

// Environment interface for provider methods
interface Environment {
  id: string;
  name: string;
  status: "running" | "stopped" | "pending" | "error";
  agentType?: string;
  createdAt?: Date;
  lastUsed?: Date;
  branch?: string;
  environment?: {
    VIBEKIT_AGENT_TYPE?: string;
    AGENT_TYPE?: string;
    [key: string]: string | undefined;
  };
}

// Interface definitions matching E2B/Northflank patterns
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
  // EventEmitter methods for VibeKit streaming compatibility
  on(event: string, listener: (...args: any[]) => void): this;
  emit(event: string, ...args: any[]): boolean;
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

export interface LocalConfig {
  preferRegistryImages?: boolean;
  dockerHubUser?: string;
  pushImages?: boolean;
  privateRegistry?: string;
  autoInstall?: boolean;
  logger?: Logger;
  retryAttempts?: number;
  retryDelayMs?: number;
  connectionTimeout?: number;
  configPath?: string;
}

// Configuration with environment variable support
export class Configuration {
  private static instance: Configuration;
  private config: LocalConfig;
  private logger: Logger;

  private constructor(config: LocalConfig = {}) {
    this.config = {
      preferRegistryImages: this.getEnvBoolean("VIBEKIT_PREFER_REGISTRY", config.preferRegistryImages ?? true),
      dockerHubUser: process.env.VIBEKIT_DOCKER_USER || config.dockerHubUser,
      pushImages: this.getEnvBoolean("VIBEKIT_PUSH_IMAGES", config.pushImages ?? true),
      privateRegistry: process.env.VIBEKIT_REGISTRY || config.privateRegistry,
      autoInstall: this.getEnvBoolean("VIBEKIT_AUTO_INSTALL", config.autoInstall ?? false),
      retryAttempts: this.getEnvNumber("VIBEKIT_RETRY_ATTEMPTS", config.retryAttempts ?? 3),
      retryDelayMs: this.getEnvNumber("VIBEKIT_RETRY_DELAY", config.retryDelayMs ?? 1000),
      connectionTimeout: this.getEnvNumber("VIBEKIT_CONNECTION_TIMEOUT", config.connectionTimeout ?? 30000),
      configPath: process.env.VIBEKIT_CONFIG_PATH || config.configPath || join(homedir(), ".vibekit"),
      logger: config.logger || new ConsoleLogger()
    };
    this.logger = this.config.logger!;
  }

  static getInstance(config?: LocalConfig): Configuration {
    if (!Configuration.instance) {
      Configuration.instance = new Configuration(config);
    }
    return Configuration.instance;
  }

  private getEnvBoolean(key: string, defaultValue: boolean): boolean {
    const value = process.env[key];
    if (value === undefined) return defaultValue;
    return value.toLowerCase() === "true";
  }

  private getEnvNumber(key: string, defaultValue: number): number {
    const value = process.env[key];
    if (value === undefined) return defaultValue;
    const num = parseInt(value, 10);
    return isNaN(num) ? defaultValue : num;
  }

  get(): LocalConfig {
    return this.config;
  }

  getLogger(): Logger {
    return this.logger;
  }
}

// Validates and sanitizes command input to prevent injection
function sanitizeCommand(command: string): string {
  // For Dagger, we're already running in an isolated container
  // and using sh -c, so we can be less restrictive
  // Still prevent some obvious injection patterns
  
  // Check for obvious command injection attempts
  const veryDangerous = [
    "rm -rf /",
    "rm -rf /*",
    ":(){ :|:& };:", // Fork bomb
    "dd if=/dev/zero", // Disk fill
  ];
  
  for (const pattern of veryDangerous) {
    if (command.includes(pattern)) {
      throw new Error(`Command contains dangerous pattern: ${pattern}`);
    }
  }
  
  // Allow common shell operators since we're in a sandboxed environment
  // The container isolation provides the security boundary
  return command;
}

// Image resolution using shared infrastructure
class ImageResolver {
  private sharedResolver: any;
  private config: LocalConfig;

  constructor(config: LocalConfig, logger: Logger) {
    this.config = config;
    // Import and use the shared ImageResolver
    const sharedConfig = {
      preferRegistryImages: config.preferRegistryImages,
      pushImages: config.pushImages,
      privateRegistry: config.privateRegistry,
      retryAttempts: config.retryAttempts,
      retryDelayMs: config.retryDelayMs,
      logger,
    };

    // Use dynamic import to avoid circular dependencies
    this.initializeSharedResolver(sharedConfig);
  }

  private async initializeSharedResolver(config: any) {
    try {
      const modulePath = '@vibe-kit/sdk/registry';
      const registryModule = await import(modulePath).catch(() => null);
      if (!registryModule) {
        config.logger.warn("Registry module not available, using fallback image resolution");
        return;
      }
      
      const { ImageResolver: SharedImageResolver, RegistryManager, DockerHubRegistry } = registryModule;
      
      // Create registry manager with Docker Hub
      const dockerHubRegistry = new DockerHubRegistry({ logger: config.logger });
      const registryManager = new RegistryManager({
        defaultRegistry: 'dockerhub',
        logger: config.logger,
      });
      registryManager.registerRegistry('dockerhub', dockerHubRegistry);

      this.sharedResolver = new SharedImageResolver(config, registryManager);
    } catch (error) {
      config.logger.warn("Failed to initialize shared resolver:", error);
    }
  }

  async resolveImage(agentType?: AgentType): Promise<string> {
    if (!this.sharedResolver) {
      // Fallback if shared resolver not initialized yet
      if (agentType && this.config.dockerHubUser) {
        return `${this.config.dockerHubUser}/vibekit-${agentType}:latest`;
      }
      return agentType ? `vibekit-${agentType}:latest` : "ubuntu:24.04";
    }
    
    return await this.sharedResolver.resolveImage(agentType);
  }
}

// Local Dagger sandbox instance implementation
class LocalSandboxInstance extends EventEmitter implements SandboxInstance {
  private isRunning = true;
  private workspaceDirectory: Directory | null = null;
  private logger: Logger;
  private imageResolver: ImageResolver;
  private config: LocalConfig;

  constructor(
    public sandboxId: string,
    private envs?: Record<string, string>,
    private workDir?: string,
    private agentType?: AgentType,
    config?: LocalConfig
  ) {
    super();
    this.config = Configuration.getInstance(config).get();
    this.logger = Configuration.getInstance().getLogger();
    this.imageResolver = new ImageResolver(this.config, this.logger);
  }

  get commands(): SandboxCommands {
    return {
      run: async (
        command: string,
        options?: SandboxCommandOptions
      ): Promise<SandboxExecutionResult> => {
        if (!this.isRunning) {
          throw new ContainerExecutionError("Sandbox instance is not running", -1);
        }

        // Validate and sanitize command
        let sanitizedCommand: string;
        try {
          sanitizedCommand = sanitizeCommand(command);
        } catch (error) {
          throw new ContainerExecutionError(
            `Invalid command: ${error instanceof Error ? error.message : String(error)}`,
            -1
          );
        }

        // Emit start event
        this.emit("update", JSON.stringify({
          type: "start",
          command: sanitizedCommand,
          timestamp: Date.now(),
        }));

        try {
          return await this.executeCommand(sanitizedCommand, options);
        } catch (error) {
          // Emit error event
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.emit("error", errorMessage);
          
          if (error instanceof ContainerExecutionError) {
            throw error;
          }
          
          throw new ContainerExecutionError(
            `Command execution failed: ${errorMessage}`,
            -1,
            error instanceof Error ? error : undefined
          );
        } finally {
          // Emit end event
          this.emit("update", JSON.stringify({
            type: "end",
            command: sanitizedCommand,
            timestamp: Date.now(),
          }));
        }
      },
    };
  }

  private async executeCommand(
    command: string,
    options?: SandboxCommandOptions
  ): Promise<SandboxExecutionResult> {
    // Use direct connect instead of connection pool to avoid GraphQL sync issues
    let result: SandboxExecutionResult | null = null;
    
    await connect(async (client) => {
      // Resolve the image
      const image = await this.imageResolver.resolveImage(this.agentType);
      
      // Create container
      let container = client.container()
        .from(image)
        .withWorkdir(this.workDir || "/vibe0");

      // Add environment variables
      if (this.envs) {
        for (const [key, value] of Object.entries(this.envs)) {
          container = container.withEnvVariable(key, value);
        }
      }

      // Restore workspace if exists
      if (this.workspaceDirectory) {
        container = container.withDirectory(
          this.workDir || "/vibe0",
          this.workspaceDirectory
        );
      }

      // Execute command
      if (options?.background) {
        // Background execution
        container = container.withExec(["sh", "-c", command], {
          experimentalPrivilegedNesting: true,
        });

        // Save workspace state - await the directory call
        this.workspaceDirectory = await container.directory(this.workDir || "/vibe0");

        result = {
          exitCode: 0,
          stdout: `Background process started: ${command}`,
          stderr: "",
        };
      } else {
        // Foreground execution with timeout
        const timeout = options?.timeoutMs || 120000; // 2 minutes default
        const execContainer = container.withExec(["sh", "-c", command]);

        try {
          const [stdout, stderr, exitCode] = await Promise.race([
            Promise.all([
              execContainer.stdout(),
              execContainer.stderr(),
              execContainer.exitCode()
            ]),
            new Promise<never>((_, reject) => 
              setTimeout(() => reject(new Error("Command execution timeout")), timeout)
            )
          ]);

          // Save workspace state - await the directory call
          this.workspaceDirectory = await execContainer.directory(this.workDir || "/vibe0");

          // Handle output callbacks
          if (stdout && options?.onStdout) {
            this.emitOutput("stdout", stdout, options.onStdout);
          }
          if (stderr && options?.onStderr) {
            this.emitOutput("stderr", stderr, options.onStderr);
          }

          result = { exitCode, stdout, stderr };
        } catch (error) {
          if (error instanceof Error && error.message === "Command execution timeout") {
            throw new ContainerExecutionError("Command execution timeout", -1, error);
          }
          throw error;
        }
      }
    });

    if (!result) {
      throw new ContainerExecutionError("Command execution failed - no result returned", -1);
    }
    
    return result;
  }

  private emitOutput(
    type: "stdout" | "stderr",
    output: string,
    callback?: (data: string) => void
  ): void {
    const lines = output.split("\n").filter(line => line.trim());
    for (const line of lines) {
      this.emit("update", `${type.toUpperCase()}: ${line}`);
      if (callback) callback(line);
    }
  }

  async kill(): Promise<void> {
    this.isRunning = false;
    this.workspaceDirectory = null;
    this.logger.debug(`Killed sandbox instance: ${this.sandboxId}`);
  }

  async pause(): Promise<void> {
    // Not applicable for Dagger containers
    this.logger.debug(`Pause requested for sandbox: ${this.sandboxId} (no-op)`);
  }

  async getHost(_port: number): Promise<string> {
    return "localhost";
  }
}

export class LocalSandboxProvider implements SandboxProvider {
  private logger: Logger;
  private config: LocalConfig;

  constructor(config: LocalConfig = {}) {
    this.config = Configuration.getInstance(config).get();
    this.logger = Configuration.getInstance().getLogger();
  }

  async create(
    envs?: Record<string, string>,
    agentType?: AgentType,
    workingDirectory?: string
  ): Promise<SandboxInstance> {
    const sandboxId = `dagger-${agentType || "default"}-${Date.now().toString(36)}`;
    const workDir = workingDirectory || "/vibe0";

    this.logger.info(`Creating sandbox instance`, { sandboxId, agentType, workDir });

    const instance = new LocalSandboxInstance(
      sandboxId,
      envs,
      workDir,
      agentType,
      this.config
    );

    return instance;
  }

  async resume(sandboxId: string): Promise<SandboxInstance> {
    this.logger.info(`Resuming sandbox instance: ${sandboxId}`);
    return await this.create();
  }

  async listEnvironments(): Promise<Environment[]> {
    return [];
  }
}

export function createLocalProvider(
  config: LocalConfig = {}
): LocalSandboxProvider {
  return new LocalSandboxProvider(config);
}

// Pre-cache agent images for faster startup
export async function prebuildAgentImages(
  selectedAgents?: AgentType[]
): Promise<{
  success: boolean;
  results: Array<{
    agentType: AgentType;
    success: boolean;
    error?: string;
    source: "registry" | "dockerfile" | "cached";
  }>;
}> {
  const config = Configuration.getInstance().get();
  const logger = Configuration.getInstance().getLogger();
  
  // Try to use shared ImageResolver for pre-building
  try {
    const modulePath = '@vibe-kit/sdk/registry';
    const registryModule = await import(modulePath).catch(() => null);
    if (registryModule) {
      const { ImageResolver: SharedImageResolver, RegistryManager, DockerHubRegistry } = registryModule;
      
      const dockerHubRegistry = new DockerHubRegistry({ logger });
      const registryManager = new RegistryManager({
        defaultRegistry: 'dockerhub',
        logger,
      });
      registryManager.registerRegistry('dockerhub', dockerHubRegistry);

      const imageResolver = new SharedImageResolver({
        preferRegistryImages: config.preferRegistryImages,
        pushImages: config.pushImages,
        privateRegistry: config.privateRegistry,
        retryAttempts: config.retryAttempts,
        retryDelayMs: config.retryDelayMs,
        logger,
      }, registryManager);

      return await imageResolver.prebuildImages(selectedAgents);
    }
  } catch (error) {
    logger.warn("Failed to use shared image resolver, falling back to basic prebuilding:", error);
  }

  // Fallback to basic image resolution
  const allAgentTypes: AgentType[] = ["claude", "codex", "opencode", "gemini", "grok"];
  const agentTypes = selectedAgents?.length ? selectedAgents : allAgentTypes;
  const results: Array<{
    agentType: AgentType;
    success: boolean;
    error?: string;
    source: "registry" | "dockerfile" | "cached";
  }> = [];

  logger.info("Pre-caching agent images for faster startup (fallback mode)");

  for (const agentType of agentTypes) {
    try {
      const imageResolver = new ImageResolver(config, logger);
      await imageResolver.resolveImage(agentType);
      results.push({ agentType, success: true, source: "cached" });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to cache image for ${agentType}`, error);
      results.push({ agentType, success: false, error: errorMessage, source: "dockerfile" });
    }
  }

  const successCount = results.filter(r => r.success).length;
  logger.info(`Pre-cache complete: ${successCount}/${agentTypes.length} images ready`);

  return {
    success: successCount > 0,
    results,
  };
}

// Re-export types for backward compatibility
export type DockerLoginInfo = {
  isLoggedIn: boolean;
  username?: string | null;
  registry?: string;
};

export type VibeKitConfig = {
  dockerHubUser?: string;
  lastImageBuild?: string;
  registryImages?: Partial<Record<AgentType, string>>;
  privateRegistry?: string;
  preferRegistryImages?: boolean;
  pushImages?: boolean;
  [key: string]: any;
};

// Re-export functions for backward compatibility
export { checkDockerLogin } from "./registry-integration";
export { getVibeKitConfig, saveVibeKitConfig } from "./registry-integration";  
export { uploadImagesToUserAccount, setupUserDockerRegistry } from "./registry-integration";