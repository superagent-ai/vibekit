import { EventEmitter } from "events";
import type {
  AgentType,
  AgentMode,
  ModelProvider,
  SandboxProvider,
  Conversation,
  LabelOptions,
  MergePullRequestOptions,
  MergePullRequestResult,
} from "../types";
import { AGENT_TYPES } from "../constants/agents";
import {
  AgentResponse,
  ExecuteCommandOptions,
  PullRequestResult,
} from "../agents/base";

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
  workingDirectory?: string;
  secrets?: Record<string, string>;
  sandboxId?: string;
  worktrees?: {
    enabled?: boolean;
    root?: string;
    cleanup?: boolean;
  };
}

export class VibeKit extends EventEmitter {
  private options: Partial<VibeKitOptions> = {};
  public agent?: any;

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

  withWorktrees(options: { root?: string; cleanup?: boolean } = {}): this {
    this.options.worktrees = {
      enabled: true,
      root: options.root,
      cleanup: options.cleanup,
    };
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
      case AGENT_TYPES.CLAUDE:
        const { ClaudeAgent } = await import("../agents/claude");
        AgentClass = ClaudeAgent;
        break;
      case AGENT_TYPES.CODEX:
        const { CodexAgent } = await import("../agents/codex");
        AgentClass = CodexAgent;
        break;
      case AGENT_TYPES.OPENCODE:
        const { OpenCodeAgent } = await import("../agents/opencode");
        AgentClass = OpenCodeAgent;
        break;
      case AGENT_TYPES.GEMINI:
        const { GeminiAgent } = await import("../agents/gemini");
        AgentClass = GeminiAgent;
        break;
      case AGENT_TYPES.GROK:
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

    // Initialize agent with configuration
    const agentConfig = {
      providerApiKey: apiKey,
      oauthToken: oauthToken,
      provider,
      model,
      sandboxProvider: this.options.sandbox,
      secrets: this.options.secrets,
      workingDirectory: this.options.workingDirectory,
      sandboxId: this.options.sandboxId,
      worktrees: this.options.worktrees,
    };

    this.agent = new AgentClass(agentConfig);
  }

  /**
   * @deprecated Use executeCommand instead. This method will be removed in a future version.
   */
  async generateCode({
    prompt,
    mode = "code",
    branch,
    history: _history, // Keep for backward compatibility but don't use
  }: {
    prompt: string;
    mode?: AgentMode;
    branch?: string;
    history?: Conversation[];
  }): Promise<AgentResponse> {
    // Deprecation warning
    console.warn(
      "⚠️  generateCode() is deprecated and will be removed in a future version. " +
        "Please use executeCommand() instead for better flexibility and control."
    );

    if (!this.agent) {
      await this.initializeAgent();
    }

    // Extract the command that would be generated and use executeCommand instead
    const commandConfig = (this.agent as any).getCommandConfig(prompt, mode);

    return this.executeCommand(commandConfig.command, {
      branch,
      background: false,
    });
  }

  async createPullRequest(
    repository: string,
    labelOptions?: LabelOptions,
    branchPrefix?: string
  ): Promise<PullRequestResult> {
    if (!this.agent) {
      await this.initializeAgent();
    }

    return this.agent.createPullRequest(repository, labelOptions, branchPrefix);
  }

  async pushToBranch(branch?: string): Promise<void> {
    if (!this.agent) {
      await this.initializeAgent();
    }

    return this.agent.pushToBranch(branch);
  }

  async mergePullRequest(
    options: MergePullRequestOptions & { repository: string }
  ): Promise<MergePullRequestResult> {
    const {
      pullNumber,
      commitTitle,
      commitMessage,
      mergeMethod = "merge",
      repository,
    } = options;

    const githubToken = this.options.secrets?.GH_TOKEN;
    if (!githubToken || !repository) {
      throw new Error(
        "GitHub token and repository are required for merging pull requests. Please provide GH_TOKEN in secrets using withSecrets()."
      );
    }

    if (!pullNumber || typeof pullNumber !== "number") {
      throw new Error("Pull request number is required and must be a number");
    }

    const [owner, repo] = repository?.split("/") || [];

    if (!owner || !repo) {
      throw new Error(
        "Invalid repository URL format. Expected format: owner/repo"
      );
    }

    // Merge the pull request using GitHub API directly
    const mergeResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/merge`,
      {
        method: "PUT",
        headers: {
          Authorization: `token ${githubToken}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          commit_title: commitTitle,
          commit_message: commitMessage,
          merge_method: mergeMethod,
        }),
      }
    );

    const responseData = await mergeResponse.json();

    if (!mergeResponse.ok) {
      // Handle specific error cases
      if (mergeResponse.status === 404) {
        throw new Error(
          `Pull request #${pullNumber} not found in ${repository}`
        );
      } else if (mergeResponse.status === 405) {
        throw new Error(
          `Pull request #${pullNumber} is not mergeable. It may have conflicts or failed status checks.`
        );
      } else if (mergeResponse.status === 422) {
        throw new Error(
          `Invalid merge parameters: ${responseData.message || "Unknown validation error"}`
        );
      } else {
        throw new Error(
          `Failed to merge pull request #${pullNumber}: ${mergeResponse.status} ${responseData.message || mergeResponse.statusText}`
        );
      }
    }

    return {
      sha: responseData.sha,
      merged: responseData.merged,
      message: responseData.message,
    };
  }

  async runTests(): Promise<any> {
    if (!this.agent) {
      await this.initializeAgent();
    }

    const callbacks = {
      onUpdate: (data: string) => this.emit("update", data),
      onError: (error: string) => this.emit("error", error),
    };

    return this.agent.runTests(undefined, undefined, callbacks);
  }

  async executeCommand(
    command: string,
    options: Omit<ExecuteCommandOptions, "callbacks"> = {}
  ): Promise<any> {
    if (!this.agent) {
      await this.initializeAgent();
    }

    const callbacks = {
      onUpdate: (data: string) => this.emit("stdout", data),
      onError: (error: string) => this.emit("stderr", error),
    };

    return this.agent.executeCommand(command, { ...options, callbacks });
  }

  async kill(): Promise<void> {
    if (!this.agent) return;
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

  async cloneRepository(repoId: string, directoryPath?: string): Promise<void> {
    const targetDirectory =
      directoryPath || this.options.workingDirectory || "/vibe0";
    const githubToken = this.options.secrets?.GH_TOKEN;

    // Get or create sandbox
    if (!this.agent) {
      await this.initializeAgent();
    }

    const sbx = await this.agent.getSandbox();

    // Create target directory
    await sbx.commands.run(`mkdir -p ${targetDirectory}`, {
      timeoutMs: 30000,
      background: false,
      onStdout: (data: string) => this.emit("stdout", data),
      onStderr: (data: string) => this.emit("stderr", data),
    });

    // Clone repository - use token if available, otherwise try public clone
    let cloneCommand: string;
    if (githubToken) {
      cloneCommand = `cd ${targetDirectory} && git clone https://x-access-token:${githubToken}@github.com/${repoId}.git .`;
    } else {
      cloneCommand = `cd ${targetDirectory} && git clone https://github.com/${repoId}.git .`;
    }

    try {
      this.emit("stdout", { type: "git", message: "Cloning repository..." });

      await sbx.commands.run(cloneCommand, {
        timeoutMs: 3600000,
        background: false,
        onStdout: (data: string) => this.emit("stdout", data),
        onStderr: (data: string) => this.emit("stderr", data),
      });
    } catch (error) {
      if (!githubToken) {
        throw new Error(
          `Failed to clone repository '${repoId}'. If this is a private repository, please provide GH_TOKEN in secrets using withSecrets().`
        );
      }
      throw error;
    }

    // Configure git user
    await sbx.commands.run(
      `cd ${targetDirectory} && git config user.name "github-actions[bot]" && git config user.email "github-actions[bot]@users.noreply.github.com"`,
      {
        timeoutMs: 60000,
        background: false,
        onStdout: (d: string) => this.emit("stdout", d),
        onStderr: (d: string) => this.emit("stderr", d),
      }
    );
  }
}
