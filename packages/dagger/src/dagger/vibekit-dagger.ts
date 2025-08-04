/**
 * VibeKit Dagger Local Sandbox Provider
 *
 * Implements the sandbox provider interface using Dagger for local containerized
 * development environments with ARM64 agent images.
 */

import { connect } from "@dagger.io/dagger";
import type { Client, Container } from "@dagger.io/dagger";
import { CacheSharingMode } from "@dagger.io/dagger";
import { exec } from "child_process";
import { promisify } from "util";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { EventEmitter } from "events";
import { homedir } from "os";

// MCP integration imports
import { VibeKitMCPManager } from '@vibe-kit/sdk/mcp/manager';
import type { MCPConfig, MCPTool, MCPToolResult } from '@vibe-kit/sdk';

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
  mcpManager?: VibeKitMCPManager;
  kill(): Promise<void>;
  pause(): Promise<void>;
  getHost(port: number): Promise<string>;
  // EventEmitter methods for VibeKit streaming compatibility
  on(event: string, listener: (...args: any[]) => void): this;
  emit(event: string, ...args: any[]): boolean;
  // MCP integration methods
  initializeMCP?(mcpConfig: MCPConfig): Promise<void>;
  getAvailableTools?(): Promise<MCPTool[]>;
  executeMCPTool?(toolName: string, args: any): Promise<MCPToolResult>;
}

export interface SandboxProvider {
  create(
    envs?: Record<string, string>,
    agentType?: "codex" | "claude" | "opencode" | "gemini" | "grok",
    workingDirectory?: string,
    mcpConfig?: MCPConfig
  ): Promise<SandboxInstance>;
  resume(sandboxId: string, mcpConfig?: MCPConfig): Promise<SandboxInstance>;
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
  mcpConfig?: MCPConfig;
}

// Configuration with environment variable support
class Configuration {
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
      logger: config.logger || new ConsoleLogger(),
      mcpConfig: config.mcpConfig
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

// Image resolution strategy implementation
class ImageResolver {
  private logger: Logger;
  private config: LocalConfig;

  constructor(config: LocalConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  async resolveImage(agentType?: AgentType): Promise<string> {
    if (!agentType) {
      return "ubuntu:24.04";
    }

    const localTag = this.getLocalImageTag(agentType);
    const registryImage = await this.getRegistryImageName(agentType);

    // Step 1: Skip local cache check for Dagger compatibility
    // Dagger can't use local Docker images, must pull from registry
    // try {
    //   const localImage = await this.checkLocalImage(localTag);
    //   if (localImage) {
    //     this.logger.info(`Using cached local image: ${localTag}`);
    //     return localTag;
    //   }
    // } catch (error) {
    //   this.logger.debug(`Local image check failed: ${error}`);
    // }

    // Step 2: Try to pull from user's registry
    if (registryImage) {
      try {
        await this.pullImage(registryImage);
        this.logger.info(`Successfully pulled image from registry: ${registryImage}`);
        
        // Return the registry image directly for Dagger
        return registryImage;
      } catch (error) {
        this.logger.warn(`Failed to pull from registry: ${registryImage}`, error);
      }
    }

    // Step 3: Build locally and push to user's registry
    const dockerfilePath = getDockerfilePathFromAgentType(agentType);
    if (dockerfilePath && existsSync(dockerfilePath)) {
      try {
        // Build the image
        await this.buildImage(dockerfilePath, localTag);
        this.logger.info(`Built image locally: ${localTag}`);

        // Push to registry if configured
        if (this.config.pushImages && registryImage) {
          try {
            await this.tagImage(localTag, registryImage);
            await this.pushImage(registryImage);
            this.logger.info(`Pushed image to registry: ${registryImage}`);
          } catch (pushError) {
            this.logger.warn(`Failed to push to registry, continuing with local image`, pushError);
          }
        }

        return localTag;
      } catch (buildError) {
        this.logger.error(`Failed to build image from Dockerfile`, buildError);
        throw new ImageResolutionError(
          `Failed to resolve image for ${agentType}`,
          buildError instanceof Error ? buildError : undefined
        );
      }
    }

    // Final fallback
    this.logger.warn(`No image available for ${agentType}, using fallback`);
    return "ubuntu:24.04";
  }

  private getLocalImageTag(agentType: AgentType): string {
    return `vibekit-${agentType}:latest`;
  }

  private async getRegistryImageName(agentType: AgentType): Promise<string | null> {
    // First check config file for custom images
    try {
      const config = await this.loadVibeKitConfig();
      if (config.registryImages?.[agentType]) {
        return config.registryImages[agentType]!;
      }
    } catch {
      // Ignore config errors
    }

    // Use superagentai registry images by default
    const dockerInfo = await this.getDockerLoginInfo();
    
    // Always use a registry image - default to superagentai
    const user = this.config.dockerHubUser || dockerInfo.username || "superagentai";
    const registry = this.config.privateRegistry || "";
    const prefix = registry ? `${registry}/` : "";
    
    // Use tag 1.0 for superagentai images
    const tag = user === "superagentai" ? "1.0" : "latest";
    return `${prefix}${user}/vibekit-${agentType}:${tag}`;
  }

  private async checkLocalImage(tag: string): Promise<boolean> {
    try {
      const { stdout } = await execAsync(`docker images -q ${tag}`);
      return stdout.trim().length > 0;
    } catch {
      return false;
    }
  }

  private async pullImage(image: string): Promise<void> {
    await retryWithBackoff(
      async () => {
        await execAsync(`docker pull ${image}`);
      },
      {
        attempts: this.config.retryAttempts || 3,
        delayMs: this.config.retryDelayMs || 1000,
        logger: this.logger,
        context: `Pulling image ${image}`
      }
    );
  }

  private async buildImage(dockerfilePath: string, tag: string): Promise<void> {
    const buildCommand = `docker build -t ${tag} -f ${dockerfilePath} .`;
    await execAsync(buildCommand, { timeout: 600000 }); // 10 minute timeout
  }

  private async tagImage(source: string, target: string): Promise<void> {
    await execAsync(`docker tag ${source} ${target}`);
  }

  private async pushImage(image: string): Promise<void> {
    await retryWithBackoff(
      async () => {
        await execAsync(`docker push ${image}`);
      },
      {
        attempts: this.config.retryAttempts || 3,
        delayMs: this.config.retryDelayMs || 1000,
        logger: this.logger,
        context: `Pushing image ${image}`
      }
    );
  }

  private async getDockerLoginInfo(): Promise<{ username?: string }> {
    // Try docker login command to get current username
    try {
      // Run docker login with empty stdin to check existing credentials
      const { stdout, stderr } = await execAsync("echo '' | docker login 2>&1");
      const output = stdout + stderr;
      
      // Look for username in the output format: [Username: joedanziger]
      const usernameMatch = output.match(/\[Username:\s*([^\]]+)\]/);
      if (usernameMatch) {
        return { username: usernameMatch[1].trim() };
      }
      
      // Also check for older format: Username: xxx
      const oldFormatMatch = output.match(/Username:\s*(.+)/);
      if (oldFormatMatch) {
        return { username: oldFormatMatch[1].trim() };
      }
    } catch {
      // Ignore errors - docker login might fail
    }
    
    // Fallback: Try docker info (older Docker versions)
    try {
      const { stdout } = await execAsync("docker info");
      const match = stdout.match(/Username:\s*(.+)/);
      if (match) {
        return { username: match[1].trim() };
      }
    } catch {
      // Ignore errors
    }
    
    // Fallback: Check vibekit config for saved username
    try {
      const vibekitConfig = await this.loadVibeKitConfig();
      if (vibekitConfig.dockerHubUser) {
        return { username: vibekitConfig.dockerHubUser };
      }
    } catch {
      // Ignore errors
    }
    
    return {};
  }

  private async loadVibeKitConfig(): Promise<any> {
    const configPath = join(this.config.configPath || join(homedir(), ".vibekit"), "config.json");
    
    if (existsSync(configPath)) {
      const content = await readFile(configPath, "utf-8");
      return JSON.parse(content);
    }
    
    return {};
  }
}

// Local Dagger sandbox instance implementation
class LocalSandboxInstance extends EventEmitter implements SandboxInstance {
  private isRunning = true;
  private volumeName: string;
  private initializationPromise: Promise<void> | null = null;
  private client: Client | null = null;
  private workspaceContainer: Container | null = null;
  public mcpManager?: VibeKitMCPManager;
  private connectionPool: DaggerConnectionPool;
  private logger: Logger;
  private imageResolver: ImageResolver;
  private config: LocalConfig;

  constructor(
    public sandboxId: string,
    private envs?: Record<string, string>,
    private workDir?: string,
    private _dockerfilePath?: string, // Path to Dockerfile if building from source
    private agentType?: AgentType,
    mcpConfig?: MCPConfig,
    config?: LocalConfig
  ) {
    super(); // Call EventEmitter constructor
    this.config = Configuration.getInstance(config).get();
    this.logger = Configuration.getInstance().getLogger();
    this.connectionPool = DaggerConnectionPool.getInstance(this.logger);
    this.imageResolver = new ImageResolver(this.config, this.logger);
    // Create a unique volume name for this sandbox to persist state
    this.volumeName = `vibekit-${this.sandboxId}`;
    
    // Add a default error handler to prevent unhandled error exceptions
    this.on('error', (err) => {
      this.logger.error('Sandbox error:', err);
    });
    
    // Initialize MCP manager if config is provided
    if (mcpConfig) {
      this.initializeMCP(mcpConfig).catch(error => {
        this.logger.error('Failed to initialize MCP in Dagger sandbox', error);
      });
    }
  }

  async initializeMCP(mcpConfig: MCPConfig): Promise<void> {
    if (!mcpConfig) return;
    
    try {
      this.mcpManager = new VibeKitMCPManager();
      const servers = Array.isArray(mcpConfig.servers) ? mcpConfig.servers : [mcpConfig.servers];
      await this.mcpManager.initialize(servers);
      this.logger.info('MCP initialized successfully in Dagger sandbox');
    } catch (error) {
      this.logger.error('Failed to initialize MCP in Dagger sandbox', error);
      throw error;
    }
  }

  async getAvailableTools(): Promise<MCPTool[]> {
    if (!this.mcpManager) {
      return [];
    }
    return await this.mcpManager.listTools();
  }

  async executeMCPTool(toolName: string, args: any): Promise<MCPToolResult> {
    if (!this.mcpManager) {
      throw new Error('MCP manager not initialized. Call initializeMCP() first.');
    }
    return await this.mcpManager.executeTool(toolName, args);
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initializationPromise) {
      this.initializationPromise = this.initialize();
    }
    await this.initializationPromise;
  }

  private async initialize(): Promise<void> {
    // Create a single long-lived connection for the sandbox lifetime
    await new Promise<void>((resolve, reject) => {
      connect(async (client) => {
        try {
          this.client = client;
          
          // Create the workspace container once
          this.workspaceContainer = await this.createWorkspaceContainer(client);
          
          resolve();
          
          // Keep the connection alive until sandbox is killed
          while (this.isRunning) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } catch (error) {
          reject(error);
        }
      });
    });
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

        await this.ensureInitialized();

        // Emit start event for VibeKit streaming compatibility
        this.emit(
          "update",
          JSON.stringify({
            type: "start",
            command: command,
            timestamp: Date.now(),
          })
        );

        let result: SandboxExecutionResult = {
          exitCode: 1,
          stdout: "",
          stderr: "Command execution failed",
        };

        try {
          if (!this.client || !this.workspaceContainer) {
            throw new Error("Sandbox not initialized");
          }
            try {
              // Use the persistent workspace container
              let container = this.workspaceContainer;

              if (options?.background) {
                // Background execution: start and detach
                container = container.withExec(["sh", "-c", command], {
                  experimentalPrivilegedNesting: true,
                });

                // Force sync to execute the container
                await container.sync();

                // Update workspace container to persist state\n                this.workspaceContainer = container;

                result = {
                  exitCode: 0,
                  stdout: `Background process started: ${command}`,
                  stderr: "",
                };
              } else {
                // Foreground execution with output
                const execContainer = container.withExec(["sh", "-c", command]);

                try {
                  // Execute the command and get output using the standard pattern
                  const stdout = await execContainer.stdout();
                  const stderr = await execContainer.stderr();

                  // Update workspace container to persist state
                  this.workspaceContainer = execContainer;

                  // Simulate incremental streaming by splitting into lines and emitting with delays
                  const emitIncremental = async (
                    type: "stdout" | "stderr",
                    fullOutput: string,
                    callback?: (data: string) => void
                  ) => {
                    const lines = fullOutput
                      .split("\n")
                      .filter((line) => line.trim());
                    for (const [index, line] of lines.entries()) {
                      await new Promise((resolve) =>
                        setTimeout(resolve, 100 + index * 50)
                      ); // Progressive delay
                      const message = line; // Simple string as per docs
                      // Emit all output as update events - stderr is often just informational (e.g., git progress)
                      this.emit("update", message);
                      if (callback) callback(line);
                    }
                  };

                  // Handle stdout
                  if (stdout) {
                    await emitIncremental("stdout", stdout, options?.onStdout);
                  }

                  // Handle stderr (non-fatal: route to 'update' with flag)
                  if (stderr) {
                    await emitIncremental("stderr", stderr, options?.onStderr);
                    this.emit("update", `STDERR: ${stderr}`); // Docs-compatible update
                  }

                  result = {
                    exitCode: 0,
                    stdout: stdout,
                    stderr: stderr,
                  };
                } catch (execError) {
                  // Fatal error: emit 'error' as per docs
                  const errorMessage =
                    execError instanceof Error
                      ? execError.message
                      : String(execError);
                  this.emit("error", errorMessage);
                  // If the container execution failed, extract exit code and return proper result
                  const exitCode = errorMessage.includes("exit code")
                    ? parseInt(
                        errorMessage.match(/exit code (\d+)/)?.[1] || "1"
                      )
                    : 1;

                  // Return error result instead of throwing for better test compatibility
                  result = {
                    exitCode: exitCode,
                    stdout: "",
                    stderr: errorMessage,
                  };
                }
              }
            } catch (error) {
              const errorMessage =
                error instanceof Error ? error.message : String(error);
              const exitCode = errorMessage.includes("exit code")
                ? parseInt(errorMessage.match(/exit code (\d+)/)?.[1] || "1")
                : 1;

              // Emit error event for VibeKit compatibility
              this.emit("error", errorMessage);

              result = {
                exitCode: exitCode,
                stdout: "",
                stderr: errorMessage,
              };
            }
        } catch (connectError) {
          // Handle errors from the connect function itself
          const errorMessage =
            connectError instanceof Error
              ? connectError.message
              : String(connectError);
          const exitCode = errorMessage.includes("exit code")
            ? parseInt(errorMessage.match(/exit code (\d+)/)?.[1] || "1")
            : 1;

          // Log the error for debugging
          this.logger.debug('Command execution failed', connectError);

          // Emit error event for VibeKit compatibility
          this.emit("error", errorMessage);

          result = {
            exitCode: exitCode,
            stdout: "",
            stderr: errorMessage,
          };
        }

        // Emit end event
        this.emit("update", JSON.stringify({
          type: "end",
          command: command,
          timestamp: Date.now(),
        }));

        return result;
      },
    };
  }

  private async createWorkspaceContainer(
    client: Client
  ): Promise<Container> {
    // Create base container only once during initialization
    const baseContainer = await this.createBaseContainer(
      client,
      this._dockerfilePath,
      this.agentType
    );
    
    // Start with base container
    let container = baseContainer;

    // For Claude agent, skip cache volume to avoid permission issues
    // Claude container runs as root but switches to claude_user for Claude CLI execution
    if (this.agentType !== "claude") {
      // Mount a cache volume to persist the workspace across executions
      const cacheVolume = client.cacheVolume(this.volumeName);
      container = container.withMountedCache(this.workDir || "/vibe0", cacheVolume, {
        sharing: CacheSharingMode.Shared
      });
    }

    // Ensure we're in the working directory
    container = container.withWorkdir(this.workDir || "/vibe0");

    return container;
  }

  private async createBaseContainer(
    client: Client,
    _dockerfilePath?: string,
    agentType?: AgentType
  ): Promise<Container> {
    if (!agentType) {
      throw new Error(
        "Agent type is required for container creation. Cannot proceed without agent type."
      );
    }

    // Use the image resolver from main branch
    const image = await this.imageResolver.resolveImage(agentType);
    
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
    
    return container;
  }

  // File operations for git workflow
  async readFile(path: string): Promise<string> {
    await this.ensureInitialized();

    if (!this.client || !this.workspaceContainer) {
      throw new Error("Sandbox not initialized");
    }
    
    const content = await this.workspaceContainer.file(path).contents();
    return content;
  }

  async writeFile(path: string, content: string): Promise<void> {
    await this.ensureInitialized();

    if (!this.client || !this.workspaceContainer) {
      throw new Error("Sandbox not initialized");
    }
    
    // Update the workspace container with the new file
    this.workspaceContainer = this.workspaceContainer.withNewFile(path, content);
  }

  async kill(): Promise<void> {
    // Clean up MCP manager before destroying sandbox
    if (this.mcpManager) {
      try {
        await this.mcpManager.cleanup();
      } catch (error) {
        this.logger.error('Error cleaning up MCP manager', error);
      }
    }
    
    this.isRunning = false;
    this.workspaceContainer = null;
    this.client = null;
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
    workingDirectory?: string,
    mcpConfig?: MCPConfig
  ): Promise<SandboxInstance> {
    const finalMcpConfig = mcpConfig || this.config.mcpConfig;
    const sandboxId = `dagger-${agentType || "default"}-${Date.now().toString(36)}`;
    const workDir = workingDirectory || "/vibe0";

    this.logger.info(`Creating sandbox instance`, { sandboxId, agentType, workDir });

    // Determine dockerfile path if needed
    const dockerfilePath = getDockerfilePathFromAgentType(agentType);

    const instance = new LocalSandboxInstance(
      sandboxId,
      envs,
      workDir,
      dockerfilePath,
      agentType,
      finalMcpConfig,
      this.config
    );

    return instance;
  }

  async resume(sandboxId: string, mcpConfig?: MCPConfig): Promise<SandboxInstance> {
    // For Dagger, resume is the same as create since containers are ephemeral
    // The workspace state is maintained through the Directory persistence
    this.logger.info(`Resuming sandbox instance: ${sandboxId}`);
    const finalMcpConfig = mcpConfig || this.config.mcpConfig;
    return await this.create(undefined, undefined, undefined, finalMcpConfig);
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
  const imageResolver = new ImageResolver(config, logger);

  const allAgentTypes: AgentType[] = ["claude", "codex", "opencode", "gemini", "grok"];
  const agentTypes = selectedAgents?.length ? selectedAgents : allAgentTypes;
  const results: Array<{
    agentType: AgentType;
    success: boolean;
    error?: string;
    source: "registry" | "dockerfile" | "cached";
  }> = [];

  logger.info("Pre-caching agent images for faster startup");

  for (const agentType of agentTypes) {
    try {
      logger.info(`Processing ${agentType} agent...`);
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

// Docker login and configuration types
export interface DockerLoginInfo {
  isLoggedIn: boolean;
  username?: string;
  registry?: string;
}

export interface VibeKitConfig {
  dockerHubUser?: string;
  lastImageBuild?: string;
  registryImages?: Partial<Record<AgentType, string>>;
}

// Check if user is logged into Docker Hub
export async function checkDockerLogin(): Promise<DockerLoginInfo> {
  const logger = Configuration.getInstance().getLogger();
  
  // Try docker login command to get current username
  try {
    // Run docker login with empty stdin to check existing credentials
    const { stdout, stderr } = await execAsync("echo '' | docker login 2>&1");
    const output = stdout + stderr;
    
    // Look for username in the output format: [Username: joedanziger]
    const usernameMatch = output.match(/\[Username:\s*([^\]]+)\]/);
    if (usernameMatch) {
      return {
        isLoggedIn: true,
        username: usernameMatch[1].trim(),
        registry: "https://index.docker.io/v1/",
      };
    }
    
    // Also check for older format: Username: xxx
    const oldFormatMatch = output.match(/Username:\s*(.+)/);
    if (oldFormatMatch) {
      return {
        isLoggedIn: true,
        username: oldFormatMatch[1].trim(),
        registry: "https://index.docker.io/v1/",
      };
    }
  } catch (error) {
    logger.debug("Docker login check failed", error);
  }
  
  // Fallback: Try docker info (older Docker versions)
  try {
    const { stdout } = await execAsync("docker info");
    const usernameMatch = stdout.match(/Username:\s*(.+)/);
    if (usernameMatch) {
      return {
        isLoggedIn: true,
        username: usernameMatch[1].trim(),
        registry: "https://index.docker.io/v1/",
      };
    }
  } catch (error) {
    logger.debug("Docker info check failed", error);
  }
  
  // Fallback: Check Docker config file for auth
  try {
    const configPath = join(homedir(), ".docker", "config.json");
    const configContent = await readFile(configPath, "utf-8");
    const config = JSON.parse(configContent);
    
    // Check if there's auth for Docker Hub
    if (config.auths && (config.auths["https://index.docker.io/v1/"] || config.auths["index.docker.io"])) {
      // Check vibekit config for saved username
      const vibekitConfig = await getVibeKitConfig();
      if (vibekitConfig.dockerHubUser) {
        return {
          isLoggedIn: true,
          username: vibekitConfig.dockerHubUser,
          registry: "https://index.docker.io/v1/",
        };
      }
      
      // Auth exists but no username saved - still logged in
      return {
        isLoggedIn: true,
        registry: "https://index.docker.io/v1/",
      };
    }
  } catch (error) {
    logger.debug("Docker config check failed", error);
  }
  
  return { isLoggedIn: false };
}

// Get or create VibeKit configuration
export async function getVibeKitConfig(): Promise<VibeKitConfig> {
  const config = Configuration.getInstance().get();
  const configPath = join(config.configPath || join(homedir(), ".vibekit"), "config.json");

  if (existsSync(configPath)) {
    try {
      const content = await readFile(configPath, "utf-8");
      return JSON.parse(content);
    } catch {
      return {};
    }
  }

  return {};
}

// Save VibeKit configuration
export async function saveVibeKitConfig(config: VibeKitConfig): Promise<void> {
  const appConfig = Configuration.getInstance().get();
  const configPath = join(appConfig.configPath || join(homedir(), ".vibekit"), "config.json");
  const configDir = join(appConfig.configPath || join(homedir(), ".vibekit"));
  
  // Ensure directory exists
  if (!existsSync(configDir)) {
    const { mkdir } = await import("fs/promises");
    await mkdir(configDir, { recursive: true });
  }
  
  const { writeFile } = await import("fs/promises");
  await writeFile(configPath, JSON.stringify(config, null, 2));
}

// Upload images to user's Docker Hub account
export async function uploadImagesToUserAccount(
  dockerHubUser: string,
  selectedAgents?: AgentType[]
): Promise<{
  success: boolean;
  results: Array<{
    agentType: AgentType;
    success: boolean;
    error?: string;
    imageUrl?: string;
  }>;
}> {
  const logger = Configuration.getInstance().getLogger();
  const imageResolver = new ImageResolver(Configuration.getInstance().get(), logger);
  
  const defaultAgentTypes: AgentType[] = ["claude", "codex", "opencode", "gemini"];
  const agentTypes = selectedAgents?.length ? selectedAgents : defaultAgentTypes;
  const results: Array<{
    agentType: AgentType;
    success: boolean;
    error?: string;
    imageUrl?: string;
  }> = [];

  logger.info(`Uploading VibeKit images to ${dockerHubUser}'s Docker Hub account`);

  for (const agentType of agentTypes) {
    try {
      logger.info(`Processing ${agentType} agent`);

      // Ensure image exists locally first
      await imageResolver.resolveImage(agentType);
      
      // Tag for user's account
      const localTag = `vibekit-${agentType}:latest`;
      const userImageTag = `${dockerHubUser}/vibekit-${agentType}:latest`;
      
      await execAsync(`docker tag ${localTag} ${userImageTag}`);
      logger.info(`Tagged as ${userImageTag}`);

      // Push to user's Docker Hub
      logger.info(`Pushing ${userImageTag} to Docker Hub`);
      await retryWithBackoff(
        async () => {
          await execAsync(`docker push ${userImageTag}`);
        },
        {
          attempts: 3,
          delayMs: 1000,
          logger: logger,
          context: `Pushing image ${userImageTag}`
        }
      );
      
      logger.info(`Successfully pushed ${userImageTag}`);

      results.push({
        agentType,
        success: true,
        imageUrl: userImageTag,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to upload ${agentType} image`, error);
      results.push({ agentType, success: false, error: errorMessage });
    }
  }

  const successCount = results.filter(r => r.success).length;
  logger.info(`Upload complete: ${successCount}/${agentTypes.length} images uploaded`);

  return {
    success: successCount > 0,
    results,
  };
}

// Docker registry setup utilities
export async function setupUserDockerRegistry(
  selectedAgents?: AgentType[]
): Promise<{
  success: boolean;
  config?: VibeKitConfig;
  error?: string;
}> {
  const logger = Configuration.getInstance().getLogger();

  try {
    logger.info("Setting up VibeKit Docker Registry Integration");

    // Check Docker login
    const loginInfo = await checkDockerLogin();
    
    if (!loginInfo.isLoggedIn || !loginInfo.username) {
      return {
        success: false,
        error: 'Not logged into Docker Hub. Please run "docker login" first.',
      };
    }

    logger.info(`Logged in as: ${loginInfo.username}`);

    // Upload images to user's account
    const uploadResult = await uploadImagesToUserAccount(loginInfo.username, selectedAgents);

    if (!uploadResult.success) {
      return {
        success: false,
        error: "Failed to upload images to Docker Hub",
      };
    }

    // Update configuration
    const config: VibeKitConfig = {
      dockerHubUser: loginInfo.username,
      lastImageBuild: new Date().toISOString(),
      registryImages: {},
    };

    // Map successful uploads to registry images
    for (const result of uploadResult.results) {
      if (result.success && result.imageUrl) {
        config.registryImages![result.agentType] = result.imageUrl;
      }
    }

    await saveVibeKitConfig(config);
    logger.info("Configuration saved");

    return { success: true, config };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Failed to setup Docker registry", error);
    return { success: false, error: errorMessage };
  }
}