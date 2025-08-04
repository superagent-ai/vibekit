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

export class ImageResolutionError extends VibeKitError {
  constructor(message: string, cause?: Error) {
    super(message, "IMAGE_RESOLUTION_ERROR", cause);
    this.name = "ImageResolutionError";
  }
}

export class ContainerExecutionError extends VibeKitError {
  constructor(message: string, public exitCode: number, cause?: Error) {
    super(message, "CONTAINER_EXECUTION_ERROR", cause);
    this.name = "ContainerExecutionError";
  }
}

export class ConfigurationError extends VibeKitError {
  constructor(message: string, cause?: Error) {
    super(message, "CONFIGURATION_ERROR", cause);
    this.name = "ConfigurationError";
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

// Connection pool for Dagger clients
class DaggerConnectionPool {
  private static instance: DaggerConnectionPool;
  private connections: Map<string, { client: Client; lastUsed: number }> = new Map();
  private maxConnections = 5;
  private connectionTTL = 300000; // 5 minutes
  private cleanupInterval: NodeJS.Timeout | null = null;
  private logger: Logger;

  private constructor(logger: Logger) {
    this.logger = logger;
    this.startCleanup();
  }

  static getInstance(logger: Logger): DaggerConnectionPool {
    if (!DaggerConnectionPool.instance) {
      DaggerConnectionPool.instance = new DaggerConnectionPool(logger);
    }
    return DaggerConnectionPool.instance;
  }

  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, conn] of this.connections.entries()) {
        if (now - conn.lastUsed > this.connectionTTL) {
          this.logger.debug(`Cleaning up stale connection: ${key}`);
          this.connections.delete(key);
        }
      }
    }, 60000); // Clean up every minute
  }

  async getConnection(key: string): Promise<Client> {
    const existing = this.connections.get(key);
    if (existing) {
      existing.lastUsed = Date.now();
      return existing.client;
    }

    if (this.connections.size >= this.maxConnections) {
      // Remove least recently used
      let oldestKey = "";
      let oldestTime = Date.now();
      for (const [k, v] of this.connections.entries()) {
        if (v.lastUsed < oldestTime) {
          oldestTime = v.lastUsed;
          oldestKey = k;
        }
      }
      if (oldestKey) {
        this.logger.debug(`Evicting LRU connection: ${oldestKey}`);
        this.connections.delete(oldestKey);
      }
    }

    // Create new connection
    let newClient: Client | null = null;
    await connect(async (client) => {
      newClient = client;
    });
    
    if (!newClient) {
      throw new Error("Failed to create Dagger client connection");
    }
    
    this.connections.set(key, { client: newClient, lastUsed: Date.now() });
    return newClient;
  }

  async close(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.connections.clear();
  }
}

// Retry utility with exponential backoff for transient failures
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: {
    attempts: number;
    delayMs: number;
    logger: Logger;
    context: string;
  }
): Promise<T> {
  let lastError: Error | undefined;
  
  for (let attempt = 1; attempt <= options.attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      options.logger.warn(
        `${options.context} failed (attempt ${attempt}/${options.attempts})`,
        lastError
      );
      
      if (attempt < options.attempts) {
        const delay = options.delayMs * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError || new Error(`${options.context} failed after ${options.attempts} attempts`);
}

// Validates and sanitizes command input to prevent injection
function sanitizeCommand(command: string): string {
  // Basic command injection prevention
  const dangerous = [";", "&&", "||", "|", "`", "$", "(", ")", "{", "}", "[", "]", "<", ">", "&"];
  let sanitized = command;
  
  // Only allow these characters in quoted strings
  const quotedRegex = /(["'])(?:(?=(\\?))\2.)*?\1/g;
  const quoted: string[] = [];
  sanitized = sanitized.replace(quotedRegex, (match) => {
    quoted.push(match);
    return `__QUOTE_${quoted.length - 1}__`;
  });
  
  // Check for dangerous characters outside quotes
  for (const char of dangerous) {
    if (sanitized.includes(char)) {
      throw new Error(`Command contains potentially dangerous character: ${char}`);
    }
  }
  
  // Restore quoted strings
  quoted.forEach((q, i) => {
    sanitized = sanitized.replace(`__QUOTE_${i}__`, q);
  });
  
  return sanitized;
}

// Helper function to get Dockerfile path based on agent type
const getDockerfilePathFromAgentType = (
  agentType?: AgentType
): string | undefined => {
  const dockerfileMap: Record<AgentType, string> = {
    claude: "assets/dockerfiles/Dockerfile.claude",
    codex: "assets/dockerfiles/Dockerfile.codex",
    opencode: "assets/dockerfiles/Dockerfile.opencode",
    gemini: "assets/dockerfiles/Dockerfile.gemini",
    grok: "assets/dockerfiles/Dockerfile.grok"
  };
  
  return agentType ? dockerfileMap[agentType] : undefined;
};

// Image resolution using shared infrastructure
class ImageResolver {
  private sharedResolver: any;

  constructor(config: LocalConfig, logger: Logger) {
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
      return agentType ? `vibekit-${agentType}:latest` : "ubuntu:24.04";
    }
    
    return await this.sharedResolver.resolveImage(agentType);
  }
}

// Local Dagger sandbox instance implementation
class LocalSandboxInstance extends EventEmitter implements SandboxInstance {
  private isRunning = true;
  private workspaceDirectory: Directory | null = null;
  private connectionPool: DaggerConnectionPool;
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
    this.connectionPool = DaggerConnectionPool.getInstance(this.logger);
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
    const connectionKey = `sandbox-${this.sandboxId}`;
    const client = await this.connectionPool.getConnection(connectionKey);

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

      // Save workspace state
      this.workspaceDirectory = container.directory(this.workDir || "/vibe0");

      return {
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

        // Save workspace state
        this.workspaceDirectory = execContainer.directory(this.workDir || "/vibe0");

        // Handle output callbacks
        if (stdout && options?.onStdout) {
          this.emitOutput("stdout", stdout, options.onStdout);
        }
        if (stderr && options?.onStderr) {
          this.emitOutput("stderr", stderr, options.onStderr);
        }

        return { exitCode, stdout, stderr };
      } catch (error) {
        if (error instanceof Error && error.message === "Command execution timeout") {
          throw new ContainerExecutionError("Command execution timeout", -1, error);
        }
        throw error;
      }
    }
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