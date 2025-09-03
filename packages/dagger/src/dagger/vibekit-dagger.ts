/**
 * VibeKit Local Sandbox Provider
 *
 * Implements the sandbox provider interface using Docker for local containerized
 * development environments with streaming output and workspace persistence.
 */

import { spawn } from "child_process";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import { EventEmitter } from "events";
import { homedir, tmpdir } from "os";

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
  resume(sandboxId: string, envs?: Record<string, string>): Promise<SandboxInstance>;
}

export type AgentType = "codex" | "claude" | "opencode" | "gemini" | "grok";

export interface LocalConfig {
  preferRegistryImages?: boolean;
  dockerHubUser?: string;  // Deprecated - use registryUser
  registryUser?: string;    // Universal registry username
  registryName?: string;    // Registry type: 'dockerhub', 'ghcr', 'ecr', etc.
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
    // Support both registryUser and dockerHubUser for backward compatibility
    const registryUser = process.env.VIBEKIT_REGISTRY_USER || config.registryUser || 
                        process.env.VIBEKIT_DOCKER_USER || config.dockerHubUser;
    
    this.config = {
      preferRegistryImages: this.getEnvBoolean("VIBEKIT_PREFER_REGISTRY", config.preferRegistryImages ?? true),
      dockerHubUser: registryUser,  // Keep for backward compatibility
      registryUser: registryUser,
      registryName: process.env.VIBEKIT_REGISTRY_NAME || config.registryName || "dockerhub",
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
  // For Docker, we're already running in an isolated container
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

// Registry factory - creates appropriate registry based on config
async function createRegistryManager(config: LocalConfig, logger: any): Promise<any> {
  const modulePath = '@vibe-kit/sdk/registry';
  const registryModule = await import(modulePath).catch(() => null);
  
  if (!registryModule) {
    logger.warn("Registry module not available");
    return null;
  }
  
  const { RegistryManager, DockerHubRegistry, GitHubContainerRegistry, AWSECRRegistry } = registryModule;
  const registryName = config.registryName || 'dockerhub';
  
  const registryManager = new RegistryManager({
    defaultRegistry: registryName,
    logger,
  });
  
  // Register the appropriate registry based on configuration
  switch (registryName) {
    case 'ghcr':
      const ghcrRegistry = new GitHubContainerRegistry({ 
        logger,
        githubToken: process.env.GITHUB_TOKEN,
      });
      registryManager.registerRegistry('ghcr', ghcrRegistry);
      break;
      
    case 'ecr':
      const ecrRegistry = new AWSECRRegistry({ 
        logger,
        awsRegion: process.env.AWS_REGION,
        awsAccountId: process.env.AWS_ACCOUNT_ID,
      });
      registryManager.registerRegistry('ecr', ecrRegistry);
      break;
      
    case 'dockerhub':
    default:
      const dockerHubRegistry = new DockerHubRegistry({ logger });
      registryManager.registerRegistry('dockerhub', dockerHubRegistry);
      break;
  }
  
  return registryManager;
}

// Image resolution using shared infrastructure
class ImageResolver {
  private sharedResolver: any;
  private config: LocalConfig;

  constructor(config: LocalConfig, logger: Logger) {
    this.config = config;
    // Support both registryUser and dockerHubUser for backward compatibility
    const registryUser = config.registryUser || config.dockerHubUser;
    
    // Import and use the shared ImageResolver
    const sharedConfig = {
      preferRegistryImages: config.preferRegistryImages,
      pushImages: config.pushImages,
      privateRegistry: config.privateRegistry,
      dockerHubUser: registryUser,  // For backward compatibility
      registryUser: registryUser,
      registryName: config.registryName,
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
      
      const { ImageResolver: SharedImageResolver } = registryModule;
      
      // Use the factory to create registry manager with appropriate registry
      const registryManager = await createRegistryManager(this.config, config.logger);
      if (!registryManager) {
        config.logger.warn("Failed to create registry manager, using fallback");
        return;
      }

      this.sharedResolver = new SharedImageResolver(config, registryManager);
    } catch (error) {
      config.logger.warn("Failed to initialize shared resolver:", error);
    }
  }

  async resolveImage(agentType?: AgentType): Promise<string> {
    if (!this.sharedResolver) {
      // Fallback if shared resolver not initialized yet
      const registryUser = this.config.registryUser || this.config.dockerHubUser;
      if (agentType && registryUser) {
        return `${registryUser}/vibekit-${agentType}:latest`;
      }
      return agentType ? `vibekit-${agentType}:latest` : "ubuntu:24.04";
    }
    
    return await this.sharedResolver.resolveImage(agentType);
  }
}

// Local Docker sandbox instance implementation
class LocalSandboxInstance extends EventEmitter implements SandboxInstance {
  private isRunning = true;
  private hostWorkspaceDir: string | null = null;
  private containerName: string;
  private containerInitialized = false;
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
    this.containerName = `vibekit-${this.sandboxId}`;
    
    // Create a persistent host directory for workspace state
    const tempDir = tmpdir();
    this.hostWorkspaceDir = join(tempDir, 'vibekit-workspace', this.sandboxId);
    try {
      mkdirSync(this.hostWorkspaceDir, { recursive: true });
      this.logger.debug(`Created workspace directory: ${this.hostWorkspaceDir}`);
    } catch (error) {
      this.logger.warn(`Failed to create workspace directory: ${error}`);
      this.hostWorkspaceDir = null;
    }
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
          // Ensure container is initialized before first command
          await this.ensureContainerInitialized();
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

  private async ensureContainerInitialized(): Promise<void> {
    if (this.containerInitialized) {
      return;
    }

    const image = await this.imageResolver.resolveImage(this.agentType);
    
    // Remove any existing container with the same name
    try {
      await new Promise<void>((resolve, reject) => {
        const removeProcess = spawn('docker', ['rm', '-f', this.containerName], { stdio: 'pipe' });
        
        removeProcess.on('close', (exitCode) => {
          // Exit code 0 = success, exit code 1 = container doesn't exist (also fine)
          if (exitCode === 0 || exitCode === 1) {
            this.logger.debug(`Container removal completed: ${this.containerName}`);
            resolve();
          } else {
            this.logger.warn(`Container removal failed with exit code ${exitCode}, continuing anyway`);
            resolve(); // Continue anyway
          }
        });
        
        removeProcess.on('error', (error) => {
          this.logger.warn(`Container removal error: ${error.message}, continuing anyway`);
          resolve(); // Continue anyway
        });
        
        // Timeout after 5 seconds
        setTimeout(() => {
          removeProcess.kill();
          this.logger.warn(`Container removal timeout: ${this.containerName}, continuing anyway`);
          resolve(); // Continue anyway
        }, 5000);
      });
    } catch (error) {
      this.logger.warn(`Container removal failed: ${error}, continuing anyway`);
      // Container might not exist - that's fine, continue
    }

    // Build Docker run command for long-running container
    const dockerArgs = [
      'run',
      '-d', // Run in detached mode
      '--name', this.containerName,
      '--workdir', this.workDir || '/vibe0',
    ];

    // Add environment variables
    if (this.envs) {
      for (const [key, value] of Object.entries(this.envs)) {
        dockerArgs.push('--env', `${key}=${value}`);
      }
    }

    // Add volume mount for workspace persistence
    if (this.hostWorkspaceDir) {
      dockerArgs.push('--volume', `${this.hostWorkspaceDir}:${this.workDir || '/vibe0'}`);
      this.logger.debug(`Mounting workspace: ${this.hostWorkspaceDir} -> ${this.workDir || '/vibe0'}`);
    }
    
    // Keep container running with tail command
    dockerArgs.push(image, 'tail', '-f', '/dev/null');

    return new Promise<void>((resolve, reject) => {
      this.logger.debug('Creating long-running Docker container', { containerName: this.containerName, image });

      const dockerProcess = spawn('docker', dockerArgs, {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stderr = '';

      dockerProcess.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      dockerProcess.on('close', (exitCode) => {
        if (exitCode === 0) {
          this.containerInitialized = true;
          this.logger.debug('Long-running Docker container created successfully', { containerName: this.containerName });
          resolve();
        } else {
          this.logger.error('Failed to create Docker container', { containerName: this.containerName, exitCode, stderr });
          reject(new ContainerExecutionError(
            `Failed to create container ${this.containerName}: exit code ${exitCode}`,
            exitCode || -1
          ));
        }
      });

      dockerProcess.on('error', (error) => {
        this.logger.error('Docker container creation process failed', error);
        reject(new ContainerExecutionError(
          `Docker process failed: ${error.message}`,
          -1,
          error
        ));
      });
    });
  }

  private async executeCommand(
    command: string,
    options?: SandboxCommandOptions
  ): Promise<SandboxExecutionResult> {
    const opts = options || {};
    const timeout = opts.timeoutMs || 120000; // 2 minutes default

    // Build Docker exec command to run in existing container
    const dockerArgs = [
      'exec',
      this.containerName,
      'sh', '-c', command
    ];

    return new Promise<SandboxExecutionResult>((resolve, reject) => {
      this.logger.debug('Executing command in persistent container', { command, containerName: this.containerName });

      const dockerProcess = spawn('docker', dockerArgs, {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';
      let timeoutId: NodeJS.Timeout | null = null;

      // Set up timeout
      if (timeout > 0) {
        timeoutId = setTimeout(() => {
          dockerProcess.kill('SIGTERM');
          reject(new ContainerExecutionError("Command execution timeout", -1));
        }, timeout);
      }

      // Handle stdout streaming
      dockerProcess.stdout?.on('data', (data: Buffer) => {
        const chunk = data.toString();
        stdout += chunk;
        
        // Call streaming callback immediately
        if (opts.onStdout) {
          opts.onStdout(chunk);
        }
      });

      // Handle stderr streaming
      dockerProcess.stderr?.on('data', (data: Buffer) => {
        const chunk = data.toString();
        stderr += chunk;
        
        // Call streaming callback immediately
        if (opts.onStderr) {
          opts.onStderr(chunk);
        }
      });

      // Handle process completion
      dockerProcess.on('close', (exitCode) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        this.logger.debug('Docker exec completed', { 
          containerName: this.containerName,
          exitCode, 
          stdoutLength: stdout.length, 
          stderrLength: stderr.length 
        });

        resolve({
          exitCode: exitCode || 0,
          stdout,
          stderr
        });
      });

      // Handle process errors
      dockerProcess.on('error', (error) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        this.logger.error('Docker exec failed', error);
        reject(new ContainerExecutionError(
          `Docker exec failed: ${error.message}`,
          -1,
          error
        ));
      });
    });
  }


  async kill(): Promise<void> {
    this.isRunning = false;
    
    // Remove the long-running container
    if (this.containerInitialized) {
      try {
        const dockerProcess = spawn('docker', ['rm', '-f', this.containerName], {
          stdio: 'pipe'
        });
        
        await new Promise<void>((resolve) => {
          dockerProcess.on('close', () => {
            this.logger.debug(`Removed Docker container: ${this.containerName}`);
            this.containerInitialized = false;
            resolve();
          });
          
          dockerProcess.on('error', (error) => {
            this.logger.warn(`Failed to remove Docker container ${this.containerName}:`, error.message);
            this.containerInitialized = false;
            resolve();
          });
        });
      } catch (error) {
        this.logger.warn(`Error during container cleanup: ${error}`);
      }
    }
    
    // Clean up host workspace directory
    if (this.hostWorkspaceDir) {
      try {
        const { rmSync } = await import('fs');
        rmSync(this.hostWorkspaceDir, { recursive: true, force: true });
        this.logger.debug(`Cleaned up workspace directory: ${this.hostWorkspaceDir}`);
      } catch (error) {
        this.logger.warn(`Failed to cleanup workspace directory: ${error}`);
      }
      this.hostWorkspaceDir = null;
    }
    
    this.logger.debug(`Killed sandbox instance: ${this.sandboxId}`);
  }

  async pause(): Promise<void> {
    // Not applicable for streaming Docker containers
    this.logger.debug(`Pause requested for sandbox: ${this.sandboxId} (no-op)`);
  }

  async getHost(_port: number): Promise<string> {
    return "localhost";
  }
  
  /**
   * Get the agent type for this sandbox instance
   */
  getAgentType(): AgentType | undefined {
    return this.agentType;
  }
}

export class LocalSandboxProvider implements SandboxProvider {
  private logger: Logger;
  private config: LocalConfig;
  
  // Static container tracking for session persistence
  private static activeContainers = new Map<string, {
    instance: LocalSandboxInstance;
    createdAt: Date;
    lastUsed: Date;
  }>();

  constructor(config: LocalConfig = {}) {
    this.config = Configuration.getInstance(config).get();
    this.logger = Configuration.getInstance().getLogger();
  }

  async create(
    envs?: Record<string, string>,
    agentType?: AgentType,
    workingDirectory?: string
  ): Promise<SandboxInstance> {
    // Generate unique ID with timestamp + random suffix to avoid collisions
    const timestamp = Date.now().toString(36);
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const sandboxId = `docker-${agentType || "default"}-${timestamp}-${randomSuffix}`;
    const workDir = workingDirectory || "/vibe0";

    this.logger.info(`Creating sandbox instance`, { sandboxId, agentType, workDir });

    const instance = new LocalSandboxInstance(
      sandboxId,
      envs,
      workDir,
      agentType,
      this.config
    );
    
    // Track the container for resumption
    LocalSandboxProvider.activeContainers.set(sandboxId, {
      instance,
      createdAt: new Date(),
      lastUsed: new Date()
    });

    return instance;
  }
  
  /**
   * Check if a Docker container is healthy and running
   */
  private async isContainerHealthy(sandboxId: string): Promise<boolean> {
    const containerName = `vibekit-${sandboxId}`;
    
    return new Promise<boolean>((resolve) => {
      this.logger.debug(`Checking container health: ${containerName}`);
      
      const process = spawn('docker', ['inspect', '--format', '{{.State.Running}}', containerName], {
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      let stdout = '';
      let stderr = '';
      
      process.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });
      
      process.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });
      
      process.on('close', (exitCode) => {
        if (exitCode === 0 && stdout.trim() === 'true') {
          this.logger.debug(`Container ${containerName} is healthy and running`);
          resolve(true);
        } else {
          this.logger.debug(`Container ${containerName} is not healthy`, { exitCode, stdout, stderr });
          resolve(false);
        }
      });
      
      // Timeout after 5 seconds
      setTimeout(() => {
        this.logger.debug(`Container health check timeout: ${containerName}`);
        process.kill();
        resolve(false);
      }, 5000);
    });
  }

  async resume(sandboxId: string, envs?: Record<string, string>): Promise<SandboxInstance> {
    this.logger.info(`Resuming sandbox instance: ${sandboxId}`);
    
    // Check if we have a tracked container
    const tracked = LocalSandboxProvider.activeContainers.get(sandboxId);
    
    if (tracked) {
      // Verify the container is still healthy
      if (await this.isContainerHealthy(sandboxId)) {
        this.logger.info(`Resuming existing healthy container: ${sandboxId}`);
        
        // Update last used time
        tracked.lastUsed = new Date();
        LocalSandboxProvider.activeContainers.set(sandboxId, tracked);
        
        return tracked.instance;
      } else {
        this.logger.warn(`Tracked container ${sandboxId} is not healthy, cleaning up`);
        LocalSandboxProvider.activeContainers.delete(sandboxId);
        
        // Force remove any existing Docker container with this name
        try {
          const containerName = `vibekit-${sandboxId}`;
          await new Promise<void>((resolve) => {
            const removeProcess = spawn('docker', ['rm', '-f', containerName], { stdio: 'pipe' });
            removeProcess.on('close', () => {
              this.logger.debug(`Forced removal of unhealthy container: ${containerName}`);
              resolve();
            });
            removeProcess.on('error', () => resolve()); // Continue anyway
            setTimeout(() => {
              removeProcess.kill();
              resolve();
            }, 5000);
          });
        } catch (error) {
          this.logger.warn(`Failed to force remove container: ${error}`);
        }
      }
    }
    
    // Container doesn't exist or is unhealthy - parse the sandboxId to recreate with same parameters
    this.logger.info(`Creating new container for resumption: ${sandboxId}`);
    
    // Extract agent type from sandboxId (format: docker-{agentType}-{timestamp}-{random})
    // For custom session IDs, we'll use a default agent type
    const parts = sandboxId.split('-');
    let agentType: AgentType | undefined = undefined;
    
    // Check if the second part is a valid agent type
    const possibleAgentType = parts.length >= 2 ? parts[1] : undefined;
    const validAgentTypes: AgentType[] = ["codex", "claude", "opencode", "gemini", "grok"];
    
    if (possibleAgentType && validAgentTypes.includes(possibleAgentType as AgentType)) {
      agentType = possibleAgentType as AgentType;
    } else {
      // For custom session IDs (like persistent-session-*), default to claude
      agentType = "claude";
      this.logger.info(`Using default agent type 'claude' for session: ${sandboxId}`);
    }
    
    const workDir = "/vibe0"; // Default working directory
    
    // Build environment variables for the resumed container
    // Include common API keys from process.env if not provided
    const resumeEnvs = envs || {};
    
    // Auto-detect common API keys if not explicitly provided
    if (!resumeEnvs.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY) {
      resumeEnvs.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
      this.logger.debug('Auto-detected ANTHROPIC_API_KEY for container resumption');
    }
    
    if (!resumeEnvs.CLAUDE_CODE_OAUTH_TOKEN && process.env.CLAUDE_CODE_OAUTH_TOKEN) {
      resumeEnvs.CLAUDE_CODE_OAUTH_TOKEN = process.env.CLAUDE_CODE_OAUTH_TOKEN;
      this.logger.debug('Auto-detected CLAUDE_CODE_OAUTH_TOKEN for container resumption');
    }
    
    if (!resumeEnvs.OPENAI_API_KEY && process.env.OPENAI_API_KEY) {
      resumeEnvs.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
      this.logger.debug('Auto-detected OPENAI_API_KEY for container resumption');
    }
    
    if (!resumeEnvs.GEMINI_API_KEY && process.env.GEMINI_API_KEY) {
      resumeEnvs.GEMINI_API_KEY = process.env.GEMINI_API_KEY;
      this.logger.debug('Auto-detected GEMINI_API_KEY for container resumption');
    }
    
    if (!resumeEnvs.GROK_API_KEY && process.env.GROK_API_KEY) {
      resumeEnvs.GROK_API_KEY = process.env.GROK_API_KEY;
      this.logger.debug('Auto-detected GROK_API_KEY for container resumption');
    }
    
    if (!resumeEnvs.GITHUB_TOKEN && process.env.GITHUB_TOKEN) {
      resumeEnvs.GITHUB_TOKEN = process.env.GITHUB_TOKEN;
      this.logger.debug('Auto-detected GITHUB_TOKEN for container resumption');
    }
    
    this.logger.info(`Resuming container with environment variables`, {
      sandboxId,
      envVarCount: Object.keys(resumeEnvs).length,
      hasAnthropicKey: !!resumeEnvs.ANTHROPIC_API_KEY,
      hasClaudeOAuth: !!resumeEnvs.CLAUDE_CODE_OAUTH_TOKEN,
      hasGitHubToken: !!resumeEnvs.GITHUB_TOKEN
    });
    
    // Create new instance with the specific sandboxId and environment variables
    const instance = new LocalSandboxInstance(
      sandboxId,
      resumeEnvs, // Pass environment variables for resumed containers
      workDir,
      agentType,
      this.config
    );
    
    // Track the new container
    LocalSandboxProvider.activeContainers.set(sandboxId, {
      instance,
      createdAt: new Date(),
      lastUsed: new Date()
    });
    
    return instance;
  }

  async listEnvironments(): Promise<Environment[]> {
    const environments: Environment[] = [];
    
    for (const [sandboxId, tracked] of LocalSandboxProvider.activeContainers.entries()) {
      const isHealthy = await this.isContainerHealthy(sandboxId);
      
      environments.push({
        id: sandboxId,
        name: `Container ${sandboxId}`,
        status: isHealthy ? "running" : "stopped",
        agentType: tracked.instance.getAgentType(),
        createdAt: tracked.createdAt,
        lastUsed: tracked.lastUsed,
        environment: {
          VIBEKIT_AGENT_TYPE: tracked.instance.getAgentType(),
          AGENT_TYPE: tracked.instance.getAgentType()
        }
      });
    }
    
    return environments;
  }
  
  /**
   * Clean up inactive containers (utility method)
   */
  static async cleanup(maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<void> {
    const now = new Date();
    const toRemove: string[] = [];
    
    for (const [sandboxId, tracked] of LocalSandboxProvider.activeContainers.entries()) {
      const age = now.getTime() - tracked.lastUsed.getTime();
      if (age > maxAgeMs) {
        toRemove.push(sandboxId);
      }
    }
    
    for (const sandboxId of toRemove) {
      const tracked = LocalSandboxProvider.activeContainers.get(sandboxId);
      if (tracked) {
        try {
          await tracked.instance.kill();
        } catch (error) {
          // Ignore cleanup errors
        }
        LocalSandboxProvider.activeContainers.delete(sandboxId);
      }
    }
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
      const { ImageResolver: SharedImageResolver } = registryModule;
      
      // Use the factory to create registry manager with appropriate registry
      const registryManager = await createRegistryManager(config, logger);
      if (registryManager) {
        const registryUser = config.registryUser || config.dockerHubUser;
        
        const imageResolver = new SharedImageResolver({
          preferRegistryImages: config.preferRegistryImages,
          pushImages: config.pushImages,
          privateRegistry: config.privateRegistry,
          dockerHubUser: registryUser,  // For backward compatibility
          registryUser: registryUser,
          registryName: config.registryName,
          retryAttempts: config.retryAttempts,
          retryDelayMs: config.retryDelayMs,
          logger,
        }, registryManager);

        return await imageResolver.prebuildImages(selectedAgents);
      }
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