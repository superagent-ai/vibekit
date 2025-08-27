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
import { AgentResponse, ExecuteCommandOptions, PullRequestResult } from "../agents/base";

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
  workingDirectory?: string;
  secrets?: Record<string, string>;
  sandboxId?: string;
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

  withGithub(config: { token: string; repository: string }): this {
    this.options.github = config;
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
      githubToken: this.options.github?.token,
      repoUrl: this.options.github?.repository,
      sandboxProvider: this.options.sandbox,
      secrets: this.options.secrets,
      workingDirectory: this.options.workingDirectory,
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

    const callbacks = {
      onUpdate: (data: string) => this.emit("update", data),
      onError: (error: string) => this.emit("error", error),
    };

    return this.agent.generateCode(prompt, mode, branch, history, callbacks);
  }

  async createPullRequest(
    labelOptions?: LabelOptions,
    branchPrefix?: string
  ): Promise<PullRequestResult> {
    if (!this.agent) {
      await this.initializeAgent();
    }

    return this.agent.createPullRequest(labelOptions, branchPrefix);
  }

  async pushToBranch(branch?: string): Promise<void> {
    if (!this.agent) {
      await this.initializeAgent();
    }

    return this.agent.pushToBranch(branch);
  }

  async mergePullRequest(
    options: MergePullRequestOptions
  ): Promise<MergePullRequestResult> {
    const { github } = this.options;

    if (!github?.token || !github?.repository) {
      throw new Error(
        "GitHub configuration is required for merging pull requests. Please use withGithub() to configure GitHub credentials."
      );
    }

    const { pullNumber, commitTitle, commitMessage, mergeMethod = 'merge' } = options;

    if (!pullNumber || typeof pullNumber !== 'number') {
      throw new Error("Pull request number is required and must be a number");
    }

    const [owner, repo] = github.repository?.split("/") || [];
    
    if (!owner || !repo) {
      throw new Error("Invalid repository URL format. Expected format: owner/repo");
    }

    // Merge the pull request using GitHub API directly
    const mergeResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/merge`,
      {
        method: "PUT",
        headers: {
          Authorization: `token ${github.token}`,
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
        throw new Error(`Pull request #${pullNumber} not found in ${github.repository}`);
      } else if (mergeResponse.status === 405) {
        throw new Error(`Pull request #${pullNumber} is not mergeable. It may have conflicts or failed status checks.`);
      } else if (mergeResponse.status === 422) {
        throw new Error(`Invalid merge parameters: ${responseData.message || 'Unknown validation error'}`);
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
    options: Omit<ExecuteCommandOptions, "callbacks"> = {},
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
}
