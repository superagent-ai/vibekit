import { EventEmitter } from "events";
import type {
  AgentType,
  AgentMode,
  ModelProvider,
  SandboxProvider,
  Conversation,
  LabelOptions,
} from "../types";
import { AgentResponse } from "../agents/base";

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
    apiKey: string;
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
  };
  workingDirectory?: string;
  secrets?: Record<string, string>;
  sandboxId?: string;
}

export class VibeKit extends EventEmitter {
  private options: Partial<VibeKitOptions> = {};
  private agent?: any;
  private telemetryService?: any;

  constructor() {
    super();
  }

  withAgent(config: {
    type: AgentType;
    provider: ModelProvider;
    apiKey: string;
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

  withTelemetry(config: { enabled: boolean; sessionId?: string }): this {
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

    const { type, provider, apiKey, model } = this.options.agent;

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

    // Initialize telemetry if enabled
    if (this.options.telemetry?.enabled) {
      const { TelemetryService } = await import("../services/telemetry");
      this.telemetryService = new TelemetryService(
        { isEnabled: true },
        this.options.telemetry.sessionId
      );
    }
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
  ): Promise<any> {
    if (!this.agent) {
      await this.initializeAgent();
    }

    return this.agent.createPullRequest(labelOptions, branchPrefix);
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

  async executeCommand(command: string): Promise<any> {
    if (!this.agent) {
      await this.initializeAgent();
    }

    const callbacks = {
      onUpdate: (data: string) => this.emit("stdout", data),
      onError: (error: string) => this.emit("stderr", error),
    };

    return this.agent.executeCommand(command, { callbacks });
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
