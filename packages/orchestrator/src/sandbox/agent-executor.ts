/**
 * AgentExecutor - Thin wrapper for agent command execution
 * 
 * Provides agent command execution without any git/repository assumptions,
 * enabling clean separation between orchestration and agent logic.
 */

import { EventEmitter } from 'events';

export interface AgentExecutionConfig {
  prompt: string;
  mode?: 'code' | 'ask';
  agentType: 'claude' | 'codex' | 'opencode' | 'gemini' | 'grok';
  workingDirectory: string;
  timeoutMs?: number;
  environment?: Record<string, string>;
}

export interface AgentExecutionResult {
  sandboxId: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
}

export interface AgentCredentials {
  anthropicApiKey?: string;
  openaiApiKey?: string;
  geminiApiKey?: string;
  grokApiKey?: string;
  oauthToken?: string;
}

export interface SandboxProvider {
  create: (envVars?: Record<string, string>, agentType?: string, workingDir?: string) => Promise<any>;
  resume: (sandboxId: string, envVars?: Record<string, string>) => Promise<any>;
}

/**
 * Executes agent commands without repository assumptions
 */
export interface AgentExecutorConfig {
  useSharedSandbox?: boolean;
}

export class AgentExecutor extends EventEmitter {
  private sandboxProvider: SandboxProvider;
  private credentials: AgentCredentials;
  private activeSandboxes = new Map<string, any>();
  private config: AgentExecutorConfig;
  private sharedSandbox: any = null;
  private isCleanedUp = false;

  constructor(
    sandboxProvider: SandboxProvider,
    credentials: AgentCredentials,
    config: AgentExecutorConfig = {}
  ) {
    super();
    this.sandboxProvider = sandboxProvider;
    this.credentials = credentials;
    this.config = config;
  }

  /**
   * Execute an agent command in the specified working directory
   */
  async execute(config: AgentExecutionConfig): Promise<AgentExecutionResult> {
    const startTime = Date.now();
    const { prompt, mode = 'code', agentType, workingDirectory, timeoutMs = 600000, environment = {} } = config;

    this.emit('executionStarted', { agentType, workingDirectory, prompt: prompt.substring(0, 100) });

    try {
      // Get or create sandbox instance
      const sandbox = await this.getSandbox(agentType, workingDirectory, environment);

      // Build agent command based on type
      const agentCommand = this.buildAgentCommand(agentType, prompt, mode);

      // Execute the command in the working directory context
      const executeCommand = `cd ${workingDirectory} && ${agentCommand}`;

      const result = await sandbox.commands.run(executeCommand, {
        timeoutMs,
        background: false,
        onStdout: (data: string) => this.emit('stdout', data),
        onStderr: (data: string) => this.emit('stderr', data)
      });

      const executionResult: AgentExecutionResult = {
        sandboxId: sandbox.sandboxId,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        duration: Date.now() - startTime
      };

      this.emit('executionCompleted', { agentType, result: executionResult });
      return executionResult;

    } catch (error) {
      const errorResult: AgentExecutionResult = {
        sandboxId: this.sharedSandbox?.sandboxId || '',
        exitCode: 1,
        stdout: '',
        stderr: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime
      };

      this.emit('executionFailed', { agentType, error });
      throw error;
    }
  }


  /**
   * Get or create a sandbox instance for the agent
   */
  private async getSandbox(agentType: string, workingDirectory: string, environment: Record<string, string>): Promise<any> {
    // If using shared sandbox mode, create one sandbox for all worktrees
    if (this.config.useSharedSandbox) {
      const sharedKey = `shared-${agentType}`;
      
      if (this.activeSandboxes.has(sharedKey)) {
        return this.activeSandboxes.get(sharedKey);
      }

      // Build environment variables for the shared agent
      const envVars = {
        ...this.getAgentEnvironmentVariables(agentType),
        ...environment,
        WORKING_DIR: '/workspace' // Use base workspace for shared sandbox
      };

      // Create shared sandbox instance
      const sandbox = await this.sandboxProvider.create(envVars, agentType, '/workspace');
      this.activeSandboxes.set(sharedKey, sandbox);
      this.sharedSandbox = sandbox;

      return sandbox;
    }

    // Original behavior: create separate sandbox per working directory
    const sandboxKey = `${agentType}-${workingDirectory}`;
    
    if (this.activeSandboxes.has(sandboxKey)) {
      return this.activeSandboxes.get(sandboxKey);
    }

    // Build environment variables for the agent
    const envVars = {
      ...this.getAgentEnvironmentVariables(agentType),
      ...environment,
      WORKING_DIR: workingDirectory
    };

    // Create new sandbox instance
    const sandbox = await this.sandboxProvider.create(envVars, agentType, workingDirectory);
    this.activeSandboxes.set(sandboxKey, sandbox);

    return sandbox;
  }

  /**
   * Build the agent-specific command
   */
  private buildAgentCommand(agentType: string, prompt: string, mode: string): string {
    // Escape prompt for shell execution
    const escapedPrompt = this.escapeShellString(prompt);

    switch (agentType) {
      case 'claude':
        return `claude ${mode === 'ask' ? 'ask' : 'code'} "${escapedPrompt}"`;

      case 'codex':
        return `codex ${mode === 'ask' ? 'ask' : 'code'} "${escapedPrompt}"`;

      case 'opencode':
        return `opencode ${mode === 'ask' ? 'ask' : 'code'} "${escapedPrompt}"`;

      case 'gemini':
        return `gemini ${mode === 'ask' ? 'ask' : 'code'} "${escapedPrompt}"`;

      case 'grok':
        return `grok ${mode === 'ask' ? 'ask' : 'code'} "${escapedPrompt}"`;

      default:
        throw new Error(`Unsupported agent type: ${agentType}`);
    }
  }

  /**
   * Get environment variables for specific agent types
   */
  private getAgentEnvironmentVariables(agentType: string): Record<string, string> {
    const envVars: Record<string, string> = {};

    switch (agentType) {
      case 'claude':
        if (this.credentials.anthropicApiKey) {
          envVars.ANTHROPIC_API_KEY = this.credentials.anthropicApiKey;
        }
        if (this.credentials.oauthToken) {
          envVars.CLAUDE_CODE_OAUTH_TOKEN = this.credentials.oauthToken;
        }
        break;

      case 'codex':
      case 'opencode':
        if (this.credentials.openaiApiKey) {
          envVars.OPENAI_API_KEY = this.credentials.openaiApiKey;
        }
        break;

      case 'gemini':
        if (this.credentials.geminiApiKey) {
          envVars.GEMINI_API_KEY = this.credentials.geminiApiKey;
        }
        break;

      case 'grok':
        if (this.credentials.grokApiKey) {
          envVars.GROK_API_KEY = this.credentials.grokApiKey;
        }
        break;
    }

    return envVars;
  }

  /**
   * Execute a raw command in a specific working directory
   */
  async executeRawCommand(
    command: string,
    workingDirectory: string,
    environment: Record<string, string> = {},
    timeoutMs: number = 60000
  ): Promise<AgentExecutionResult> {
    const startTime = Date.now();

    try {
      // For shared sandbox mode, always use the same sandbox regardless of working directory
      // This ensures we only create one sandbox total for all operations
      const effectiveWorkDir = this.config.useSharedSandbox ? '/workspace' : workingDirectory;
      const sandbox = await this.getSandbox('claude', effectiveWorkDir, environment);

      const executeCommand = `cd ${workingDirectory} && ${command}`;

      const result = await sandbox.commands.run(executeCommand, {
        timeoutMs,
        background: false,
        onStdout: (data: string) => this.emit('stdout', data),
        onStderr: (data: string) => this.emit('stderr', data)
      });

      return {
        sandboxId: sandbox.sandboxId,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        duration: Date.now() - startTime
      };

    } catch (error) {
      throw new Error(`Raw command execution failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Kill all active sandboxes
   */
  async killAllSandboxes(): Promise<void> {
    if (this.isCleanedUp) {
      return;
    }

    console.log(`[AgentExecutor] Killing ${this.activeSandboxes.size} active sandboxes...`);
    
    const promises = Array.from(this.activeSandboxes.entries()).map(async ([key, sandbox]) => {
      console.log(`[AgentExecutor] Killing sandbox: ${key} (${sandbox.sandboxId})`);
      try {
        await sandbox.kill();
        console.log(`[AgentExecutor] Successfully killed sandbox: ${sandbox.sandboxId}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn(`[AgentExecutor] Failed to kill sandbox ${sandbox.sandboxId}:`, errorMessage);
      }
    });

    await Promise.allSettled(promises);
    this.activeSandboxes.clear();
    this.sharedSandbox = null;
    this.isCleanedUp = true;
    
    console.log(`[AgentExecutor] Completed killing all sandboxes`);
    this.emit('allSandboxesKilled');
  }

  /**
   * Get status of active sandboxes
   */
  getActiveSandboxes(): Array<{
    key: string;
    sandboxId: string;
    agentType: string;
    workingDirectory: string;
  }> {
    return Array.from(this.activeSandboxes.entries()).map(([key, sandbox]) => {
      const [agentType, workingDirectory] = key.split('-', 2);
      return {
        key,
        sandboxId: sandbox.sandboxId || 'unknown',
        agentType,
        workingDirectory
      };
    });
  }

  /**
   * Pause a specific sandbox
   */
  async pauseSandbox(sandboxKey: string): Promise<void> {
    const sandbox = this.activeSandboxes.get(sandboxKey);
    if (sandbox && sandbox.pause) {
      await sandbox.pause();
      this.emit('sandboxPaused', { sandboxKey });
    }
  }

  /**
   * Resume a specific sandbox
   */
  async resumeSandbox(sandboxKey: string): Promise<void> {
    const sandbox = this.activeSandboxes.get(sandboxKey);
    if (sandbox && sandbox.resume) {
      await sandbox.resume();
      this.emit('sandboxResumed', { sandboxKey });
    }
  }

  /**
   * Escape a string for safe shell execution
   */
  private escapeShellString(str: string): string {
    // Handle undefined/null
    if (str === undefined || str === null) {
      return '';
    }

    // Ensure string
    if (typeof str !== 'string') {
      str = String(str);
    }

    // Comprehensive escaping for shell execution
    return str
      .replace(/\\/g, '\\\\')    // Escape backslashes first
      .replace(/"/g, '\\"')      // Escape double quotes
      .replace(/'/g, "\\'")      // Escape single quotes
      .replace(/`/g, '\\`')      // Escape backticks
      .replace(/\$/g, '\\$')     // Escape dollar signs
      .replace(/\n/g, '\\n')     // Escape newlines
      .replace(/\r/g, '\\r')     // Escape carriage returns
      .replace(/\t/g, '\\t');    // Escape tabs
  }
}