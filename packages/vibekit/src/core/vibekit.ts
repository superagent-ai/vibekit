import { EventEmitter } from "events";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import type {
  AgentType,
  AgentMode,
  ModelProvider,
  SandboxProvider,
  Conversation,
  LabelOptions,
  TelemetryConfig,
} from "../types";
import { AgentResponse, ExecuteCommandOptions, PullRequestResult } from "../agents/base";
import { VibeKitTelemetryAdapter } from "../adapters/TelemetryAdapter.js";
import { VibeKitError, AgentError, ValidationError } from "../errors/VibeKitError.js";
import { ErrorHandler } from "../errors/ErrorHandler.js";

export interface VibeKitEvents {
  stdout: (chunk: string) => void;
  stderr: (chunk: string) => void;
  update: (message: string) => void;
  error: (error: string) => void;
}

export interface VibeKitOptions {
  agent: {
    type: AgentType;
    provider?: ModelProvider;
    apiKey?: string; // Optional - can use OAuth token instead
    oauthToken?: string; // OAuth token for Claude
    model?: string;
  };
  sandbox?: SandboxProvider;
  github?: {
    token: string;
    repository: string;
  };
  telemetry?: TelemetryConfig;
  workingDirectory?: string;
  secrets?: Record<string, string>;
  sandboxId?: string;
}

/**
 * Get the package version from package.json
 */
function getPackageVersion(): string {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const packageJsonPath = join(__dirname, '../../package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    return packageJson.version || '1.0.0';
  } catch (error) {
    console.warn('Failed to read package version, using default:', error);
    return '1.0.0';
  }
}

export class VibeKit extends EventEmitter {
  private options: Partial<VibeKitOptions> = {};
  private agent?: any;
  private telemetryService?: VibeKitTelemetryAdapter;
  private errorHandler: ErrorHandler;

  constructor() {
    super();
    
    // Initialize error handler
    this.errorHandler = new ErrorHandler({
      onError: (error) => this.emit('error', error),
      onCriticalError: (error) => {
        console.error('Critical error in VibeKit:', error.toJSON());
        this.emit('critical-error', error);
      }
    });
  }

  withAgent(config: {
    type: AgentType;
    provider: ModelProvider;
    apiKey?: string; // Optional - can use OAuth token instead
    oauthToken?: string; // OAuth token for Claude
    model: string;
  }): this {
    this.options.agent = config;
    return this;
  }

  withSandbox(provider: SandboxProvider): this {
    this.options.sandbox = provider;
    return this;
  }

  withGithub(config: { token: string; repository: string }): this {
    this.options.github = config;
    return this;
  }

  withTelemetry(config: TelemetryConfig): this {
    this.options.telemetry = config;
    return this;
  }

  withWorkingDirectory(path: string): this {
    this.options.workingDirectory = path;
    return this;
  }

  withSecrets(secrets: Record<string, string>): this {
    this.options.secrets = secrets;
    return this;
  }

  withSession(sandboxId: string): this {
    this.options.sandboxId = sandboxId;
    return this;
  }

  private async initializeAgent(): Promise<void> {
    if (!this.options.agent) {
      throw new ValidationError("Agent configuration is required", "agent");
    }

    const { type, provider, apiKey, oauthToken, model } = this.options.agent;

    // Dynamic imports for different agents
    let AgentClass;
    switch (type) {
      case "claude":
        const { ClaudeAgent } = await import("../agents/claude");
        AgentClass = ClaudeAgent;
        break;
      case "codex":
        const { CodexAgent } = await import("../agents/codex");
        AgentClass = CodexAgent;
        break;
      case "opencode":
        const { OpenCodeAgent } = await import("../agents/opencode");
        AgentClass = OpenCodeAgent;
        break;
      case "gemini":
        const { GeminiAgent } = await import("../agents/gemini");
        AgentClass = GeminiAgent;
        break;
      case "grok":
        const { GrokAgent } = await import("../agents/grok");
        AgentClass = GrokAgent;
        break;
      default:
        throw new AgentError(`Unsupported agent type: ${type}`, type);
    }

    // Check if sandbox provider is configured
    if (!this.options.sandbox) {
      throw new ValidationError(
        "Sandbox provider is required. Use withSandbox() to configure a provider.",
        "sandbox"
      );
    }

    // Initialize telemetry service if configured
    if (this.options.telemetry && (this.options.telemetry.type || this.options.telemetry.enabled)) {
      this.telemetryService = new VibeKitTelemetryAdapter({
        ...this.options.telemetry,
        serviceVersion: getPackageVersion(),
      });
      await this.telemetryService.initialize();
    }

    // Initialize agent with configuration
    const agentConfig = {
      providerApiKey: apiKey,
      oauthToken: oauthToken,
      provider,
      model,
      githubToken: this.options.github?.token,
      repoUrl: this.options.github?.repository,
      sandboxProvider: this.options.sandbox,
      secrets: this.options.secrets,
      workingDirectory: this.options.workingDirectory,
      telemetry: (this.options.telemetry?.type || this.options.telemetry?.enabled)
        ? { isEnabled: true, sessionId: this.options.telemetry.sessionId }
        : undefined,
      sandboxId: this.options.sandboxId,
    };

    this.agent = new AgentClass(agentConfig);
  }

  async generateCode({
    prompt,
    mode = "code",
    branch,
    history,
  }: {
    prompt: string;
    mode?: AgentMode;
    branch?: string;
    history?: Conversation[];
  }): Promise<AgentResponse> {
    if (!this.agent) {
      await this.initializeAgent();
    }

    const agentType = this.options.agent!.type;
    const startTime = Date.now();
    let sessionId: string | undefined;

    // Track telemetry start event
    if (this.telemetryService) {
      try {
        sessionId = await this.telemetryService.trackStart(agentType, mode, prompt, {
          branch,
          repoUrl: this.options.github?.repository,
          provider: this.options.agent!.provider,
          model: this.options.agent!.model,
        });
      } catch (error) {
        // Handle telemetry errors gracefully - don't let them break the main flow
        const telemetryError = this.errorHandler.handle(error as Error, {
          category: 'telemetry',
          severity: 'low',
          retryable: false
        });
        console.warn('Failed to track telemetry start:', telemetryError.message);
      }
    }

    const callbacks = {
      onUpdate: (data: string) => {
        this.emit("update", data);
        
        // Track stream events for telemetry
        if (this.telemetryService) {
          try {
            if (sessionId) {
              this.telemetryService.trackStream(sessionId, agentType, mode, prompt, data, undefined, this.options.github?.repository, {
                branch,
                timestamp: Date.now(),
              }).catch(error => {
                const telemetryError = this.errorHandler.handle(error as Error, {
                  category: 'telemetry',
                  severity: 'low',
                  retryable: false
                });
                console.warn('Failed to track telemetry stream:', telemetryError.message);
              });
            }
          } catch (error) {
            const telemetryError = this.errorHandler.handle(error as Error, {
              category: 'telemetry',
              severity: 'low',
              retryable: false
            });
            console.warn('Failed to track telemetry stream:', telemetryError.message);
          }
        }
      },
      onError: (error: string) => {
        this.emit("error", error);
        
        // Track error events for telemetry
        if (this.telemetryService) {
          try {
            if (sessionId) {
              this.telemetryService.trackError(sessionId, error, {
                agentType,
                mode,
                prompt,
                branch,
                repoUrl: this.options.github?.repository,
                timestamp: Date.now(),
              }).catch(err => {
                const telemetryError = this.errorHandler.handle(err as Error, {
                  category: 'telemetry',
                  severity: 'low',
                  retryable: false
                });
                console.warn('Failed to track telemetry error:', telemetryError.message);
              });
            }
          } catch (err) {
            console.warn('Failed to track telemetry error:', err);
          }
        }
      },
    };

    try {
      const result = await this.agent.generateCode(prompt, mode, branch, history, callbacks);

      // Track telemetry end event
      if (this.telemetryService && sessionId) {
        try {
          await this.telemetryService.trackEnd(sessionId, agentType, mode, prompt, result.sandboxId, this.options.github?.repository, {
            branch,
            exitCode: result.exitCode,
            duration: Date.now() - startTime,
            stdout: result.stdout?.substring(0, 500), // Limit to first 500 chars
            stderr: result.stderr?.substring(0, 500),
          });
        } catch (error) {
          console.warn('Failed to track telemetry end:', error);
        }
      }

      return result;
    } catch (error) {
      // Track error event
      if (this.telemetryService && sessionId) {
        try {
          await this.telemetryService.trackError(sessionId, error instanceof Error ? error.message : String(error), {
            agentType,
            mode,
            prompt,
            branch,
            repoUrl: this.options.github?.repository,
            duration: Date.now() - startTime,
          });
        } catch (err) {
          console.warn('Failed to track telemetry error:', err);
        }
      }
      throw error;
    }
  }

  async createPullRequest(
    labelOptions?: LabelOptions,
    branchPrefix?: string
  ): Promise<PullRequestResult> {
    if (!this.agent) {
      await this.initializeAgent();
    }

    const startTime = Date.now();
    const agentType = this.options.agent!.type;
    let sessionId: string | undefined;

    // Track telemetry start event for PR creation
    if (this.telemetryService) {
      try {
        sessionId = await this.telemetryService.trackStart(agentType, 'code', 'create_pull_request', {
          repoUrl: this.options.github?.repository,
          labelOptions,
          branchPrefix,
        });
      } catch (error) {
        console.warn('Failed to track telemetry start for PR:', error);
      }
    }

    try {
      const result = await this.agent.createPullRequest(labelOptions, branchPrefix);

      // Track telemetry end event
      if (this.telemetryService && sessionId) {
        try {
          await this.telemetryService.trackEnd(sessionId, agentType, 'code', 'create_pull_request', undefined, this.options.github?.repository, {
            duration: Date.now() - startTime,
            prUrl: result?.url,
            prNumber: result?.number,
          });
        } catch (error) {
          console.warn('Failed to track telemetry end for PR:', error);
        }
      }

      return result;
    } catch (error) {
      // Track error event
      if (this.telemetryService && sessionId) {
        try {
          await this.telemetryService.trackError(sessionId, error instanceof Error ? error.message : String(error), {
            agentType,
            mode: 'code',
            prompt: 'create_pull_request',
            repoUrl: this.options.github?.repository,
            duration: Date.now() - startTime,
          });
        } catch (err) {
          console.warn('Failed to track telemetry error for PR:', err);
        }
      }
      throw error;
    }
  }

  async pushToBranch(branch?: string): Promise<void> {
    if (!this.agent) {
      await this.initializeAgent();
    }

    return this.agent.pushToBranch(branch);
  }

  async runTests(): Promise<any> {
    if (!this.agent) {
      await this.initializeAgent();
    }

    const agentType = this.options.agent!.type;
    const startTime = Date.now();
    let sessionId: string | undefined;

    // Track telemetry start event for test execution
    if (this.telemetryService) {
      try {
        sessionId = await this.telemetryService.trackStart(agentType, 'code', 'run_tests', {
          repoUrl: this.options.github?.repository,
        });
      } catch (error) {
        console.warn('Failed to track telemetry start for tests:', error);
      }
    }

    const callbacks = {
      onUpdate: (data: string) => {
        this.emit("update", data);
        
        // Track stream events for telemetry
        if (this.telemetryService) {
          try {
            if (sessionId) {
              this.telemetryService.trackStream(sessionId, agentType, 'code', 'run_tests', data, undefined, this.options.github?.repository, {
                timestamp: Date.now(),
              }).catch(error => {
                console.warn('Failed to track telemetry stream for tests:', error);
              });
            }
          } catch (error) {
            console.warn('Failed to track telemetry stream for tests:', error);
          }
        }
      },
      onError: (error: string) => {
        this.emit("error", error);
        
        // Track error events for telemetry
        if (this.telemetryService) {
          try {
            if (sessionId) {
              this.telemetryService.trackError(sessionId, error, {
                agentType,
                mode: 'code',
                prompt: 'run_tests',
                repoUrl: this.options.github?.repository,
                timestamp: Date.now(),
              }).catch(err => {
                console.warn('Failed to track telemetry error for tests:', err);
              });
            }
          } catch (err) {
            console.warn('Failed to track telemetry error for tests:', err);
          }
        }
      },
    };

    try {
      const result = await this.agent.runTests(undefined, undefined, callbacks);

      // Track telemetry end event
      if (this.telemetryService && sessionId) {
        try {
          await this.telemetryService.trackEnd(sessionId, agentType, 'code', 'run_tests', result?.sandboxId, this.options.github?.repository, {
            duration: Date.now() - startTime,
            exitCode: result?.exitCode,
            stdout: result?.stdout?.substring(0, 500),
            stderr: result?.stderr?.substring(0, 500),
          });
        } catch (error) {
          console.warn('Failed to track telemetry end for tests:', error);
        }
      }

      return result;
    } catch (error) {
      // Track error event
      if (this.telemetryService && sessionId) {
        try {
          await this.telemetryService.trackError(sessionId, error instanceof Error ? error.message : String(error), {
            agentType,
            mode: 'code',
            prompt: 'run_tests',
            repoUrl: this.options.github?.repository,
            duration: Date.now() - startTime,
          });
        } catch (err) {
          console.warn('Failed to track telemetry error for tests:', err);
        }
      }
      throw error;
    }
  }

  async executeCommand(
    command: string,
    options: Omit<ExecuteCommandOptions, "callbacks"> = {},
  ): Promise<any> {
    if (!this.agent) {
      await this.initializeAgent();
    }

    const agentType = this.options.agent!.type;
    const startTime = Date.now();
    let sessionId: string | undefined;

    // Track telemetry start event for command execution
    if (this.telemetryService) {
      try {
        sessionId = await this.telemetryService.trackStart(agentType, 'code', command, {
          repoUrl: this.options.github?.repository,
          commandType: 'execute_command',
        });
      } catch (error) {
        console.warn('Failed to track telemetry start for command:', error);
      }
    }

    const callbacks = {
      onUpdate: (data: string) => {
        this.emit("stdout", data);
        
        // Track stream events for telemetry
        if (this.telemetryService) {
          try {
            if (sessionId) {
              this.telemetryService.trackStream(sessionId, agentType, 'code', command, data, undefined, this.options.github?.repository, {
                timestamp: Date.now(),
                commandType: 'execute_command',
              }).catch(error => {
                console.warn('Failed to track telemetry stream for command:', error);
              });
            }
          } catch (error) {
            console.warn('Failed to track telemetry stream for command:', error);
          }
        }
      },
      onError: (error: string) => {
        this.emit("stderr", error);
        
        // Track error events for telemetry
        if (this.telemetryService) {
          try {
            if (sessionId) {
              this.telemetryService.trackError(sessionId, error, {
                agentType,
                mode: 'code',
                prompt: command,
                repoUrl: this.options.github?.repository,
                timestamp: Date.now(),
                commandType: 'execute_command',
              }).catch(err => {
                console.warn('Failed to track telemetry error for command:', err);
              });
            }
          } catch (err) {
            console.warn('Failed to track telemetry error for command:', err);
          }
        }
      },
    };

    try {
      const result = await this.agent.executeCommand(command, { ...options, callbacks });

      // Track telemetry end event
      if (this.telemetryService && sessionId) {
        try {
          await this.telemetryService.trackEnd(sessionId, agentType, 'code', command, result?.sandboxId, this.options.github?.repository, {
            duration: Date.now() - startTime,
            exitCode: result?.exitCode,
            stdout: result?.stdout?.substring(0, 500),
            stderr: result?.stderr?.substring(0, 500),
            commandType: 'execute_command',
          });
        } catch (error) {
          console.warn('Failed to track telemetry end for command:', error);
        }
      }

      return result;
    } catch (error) {
      // Track error event
      if (this.telemetryService && sessionId) {
        try {
          await this.telemetryService.trackError(sessionId, error instanceof Error ? error.message : String(error), {
            agentType,
            mode: 'code',
            prompt: command,
            repoUrl: this.options.github?.repository,
            duration: Date.now() - startTime,
            commandType: 'execute_command',
          });
        } catch (err) {
          console.warn('Failed to track telemetry error for command:', err);
        }
      }
      throw error;
    }
  }

  async kill(): Promise<void> {
    if (!this.agent) return;
    
    // Shutdown telemetry service
    if (this.telemetryService) {
      try {
        await this.telemetryService.shutdown();
      } catch (error) {
        console.warn('Failed to shutdown telemetry service:', error);
      }
    }
    
    return this.agent.killSandbox();
  }

  async pause(): Promise<void> {
    if (!this.agent) return;
    return this.agent.pauseSandbox();
  }

  async resume(): Promise<void> {
    if (!this.agent) return;
    return this.agent.resumeSandbox();
  }

  async getSession(): Promise<string | null> {
    if (!this.agent) return null;
    return this.agent.getSession();
  }

  async setSession(sessionId: string): Promise<void> {
    if (!this.agent) return;
    return this.agent.setSession(sessionId);
  }

  async getHost(port: number): Promise<string> {
    if (!this.agent) {
      await this.initializeAgent();
    }
    return this.agent.getHost(port);
  }

  /**
   * Get telemetry service instance for advanced analytics
   */
  getTelemetryService(): VibeKitTelemetryAdapter | undefined {
    return this.telemetryService;
  }

  /**
   * Get analytics dashboard data if telemetry is enabled
   */
  async getAnalyticsDashboard(timeWindow: 'hour' | 'day' | 'week' = 'day'): Promise<any> {
    if (!this.telemetryService) {
      throw new Error('Telemetry is not enabled. Use withTelemetry() to enable analytics.');
    }
    return this.telemetryService.getAnalyticsDashboard(timeWindow);
  }
}
