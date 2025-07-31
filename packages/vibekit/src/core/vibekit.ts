import { EventEmitter } from "events";
import type {
  AgentType,
  AgentMode,
  ModelProvider,
  SandboxProvider,
  Conversation,
  LabelOptions,
  TelemetryConfig,
} from "../types";
import { AgentResponse, ExecuteCommandOptions } from "../agents/base";
import { VibeKitTelemetryAdapter } from "../adapters/TelemetryAdapter.js";

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
  telemetry?: {
    enabled: boolean;
    sessionId?: string;
    localStore?: {
      isEnabled?: boolean;
      path?: string;
      streamBatchSize?: number;
      streamFlushIntervalMs?: number;
    };
    endpoint?: string;
    headers?: Record<string, string>;
  };
  workingDirectory?: string;
  secrets?: Record<string, string>;
  sandboxId?: string;
}

export class VibeKit extends EventEmitter {
  private options: Partial<VibeKitOptions> = {};
  private agent?: any;
  private telemetryService?: VibeKitTelemetryAdapter;

  constructor() {
    super();
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

  withTelemetry(config: { 
    enabled: boolean; 
    sessionId?: string;
    localStore?: {
      isEnabled?: boolean;
      path?: string;
      streamBatchSize?: number;
      streamFlushIntervalMs?: number;
    };
    endpoint?: string;
    headers?: Record<string, string>;
  }): this {
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
      throw new Error("Agent configuration is required");
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
        throw new Error(`Unsupported agent type: ${type}`);
    }

    // Check if sandbox provider is configured
    if (!this.options.sandbox) {
      throw new Error(
        "Sandbox provider is required. Use withSandbox() to configure a provider."
      );
    }

    // Initialize telemetry service if enabled
    if (this.options.telemetry?.enabled) {
      const telemetryConfig: TelemetryConfig = {
        isEnabled: true,
        localStore: {
          isEnabled: true,
          path: this.options.telemetry.localStore?.path || '.vibekit/telemetry.db',
          streamBatchSize: this.options.telemetry.localStore?.streamBatchSize || 50,
          streamFlushIntervalMs: this.options.telemetry.localStore?.streamFlushIntervalMs || 1000,
        },
        endpoint: this.options.telemetry.endpoint,
        headers: this.options.telemetry.headers,
        serviceName: 'vibekit',
        serviceVersion: '1.0.0',
      };

      this.telemetryService = new VibeKitTelemetryAdapter({
        ...telemetryConfig,
        serviceVersion: '1.0.0', // TODO: Get from package.json
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
      telemetry: this.options.telemetry?.enabled
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

    // Track telemetry start event
    if (this.telemetryService) {
      try {
        await this.telemetryService.trackStart(agentType, mode, prompt, {
          branch,
          repoUrl: this.options.github?.repository,
          provider: this.options.agent!.provider,
          model: this.options.agent!.model,
        });
      } catch (error) {
        console.warn('Failed to track telemetry start:', error);
      }
    }

    const callbacks = {
      onUpdate: (data: string) => {
        this.emit("update", data);
        
        // Track stream events for telemetry
        if (this.telemetryService) {
          try {
            this.telemetryService.trackStream(agentType, mode, prompt, data, undefined, this.options.github?.repository, {
              branch,
              timestamp: Date.now(),
            }).catch(error => {
              console.warn('Failed to track telemetry stream:', error);
            });
          } catch (error) {
            console.warn('Failed to track telemetry stream:', error);
          }
        }
      },
      onError: (error: string) => {
        this.emit("error", error);
        
        // Track error events for telemetry
        if (this.telemetryService) {
          try {
            this.telemetryService.trackError(agentType, mode, prompt, error, {
              branch,
              repoUrl: this.options.github?.repository,
              timestamp: Date.now(),
            }).catch(err => {
              console.warn('Failed to track telemetry error:', err);
            });
          } catch (err) {
            console.warn('Failed to track telemetry error:', err);
          }
        }
      },
    };

    try {
      const result = await this.agent.generateCode(prompt, mode, branch, history, callbacks);

      // Track telemetry end event
      if (this.telemetryService) {
        try {
          await this.telemetryService.trackEnd(agentType, mode, prompt, result.sandboxId, this.options.github?.repository, {
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
      if (this.telemetryService) {
        try {
          await this.telemetryService.trackError(agentType, mode, prompt, error instanceof Error ? error.message : String(error), {
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
  ): Promise<any> {
    if (!this.agent) {
      await this.initializeAgent();
    }

    const startTime = Date.now();
    const agentType = this.options.agent!.type;

    // Track telemetry start event for PR creation
    if (this.telemetryService) {
      try {
        await this.telemetryService.trackStart(agentType, 'code', 'create_pull_request', {
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
      if (this.telemetryService) {
        try {
          await this.telemetryService.trackEnd(agentType, 'code', 'create_pull_request', undefined, this.options.github?.repository, {
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
      if (this.telemetryService) {
        try {
          await this.telemetryService.trackError(agentType, 'code', 'create_pull_request', error instanceof Error ? error.message : String(error), {
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

  async runTests(): Promise<any> {
    if (!this.agent) {
      await this.initializeAgent();
    }

    const agentType = this.options.agent!.type;
    const startTime = Date.now();

    // Track telemetry start event for test execution
    if (this.telemetryService) {
      try {
        await this.telemetryService.trackStart(agentType, 'code', 'run_tests', {
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
            this.telemetryService.trackStream(agentType, 'code', 'run_tests', data, undefined, this.options.github?.repository, {
              timestamp: Date.now(),
            }).catch(error => {
              console.warn('Failed to track telemetry stream for tests:', error);
            });
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
            this.telemetryService.trackError(agentType, 'code', 'run_tests', error, {
              repoUrl: this.options.github?.repository,
              timestamp: Date.now(),
            }).catch(err => {
              console.warn('Failed to track telemetry error for tests:', err);
            });
          } catch (err) {
            console.warn('Failed to track telemetry error for tests:', err);
          }
        }
      },
    };

    try {
      const result = await this.agent.runTests(undefined, undefined, callbacks);

      // Track telemetry end event
      if (this.telemetryService) {
        try {
          await this.telemetryService.trackEnd(agentType, 'code', 'run_tests', result?.sandboxId, this.options.github?.repository, {
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
      if (this.telemetryService) {
        try {
          await this.telemetryService.trackError(agentType, 'code', 'run_tests', error instanceof Error ? error.message : String(error), {
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

    // Track telemetry start event for command execution
    if (this.telemetryService) {
      try {
        await this.telemetryService.trackStart(agentType, 'code', command, {
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
            this.telemetryService.trackStream(agentType, 'code', command, data, undefined, this.options.github?.repository, {
              timestamp: Date.now(),
              commandType: 'execute_command',
            }).catch(error => {
              console.warn('Failed to track telemetry stream for command:', error);
            });
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
            this.telemetryService.trackError(agentType, 'code', command, error, {
              repoUrl: this.options.github?.repository,
              timestamp: Date.now(),
              commandType: 'execute_command',
            }).catch(err => {
              console.warn('Failed to track telemetry error for command:', err);
            });
          } catch (err) {
            console.warn('Failed to track telemetry error for command:', err);
          }
        }
      },
    };

    try {
      const result = await this.agent.executeCommand(command, { ...options, callbacks });

      // Track telemetry end event
      if (this.telemetryService) {
        try {
          await this.telemetryService.trackEnd(agentType, 'code', command, result?.sandboxId, this.options.github?.repository, {
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
      if (this.telemetryService) {
        try {
          await this.telemetryService.trackError(agentType, 'code', command, error instanceof Error ? error.message : String(error), {
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
  getTelemetryService(): TelemetryService | undefined {
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
