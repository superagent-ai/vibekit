// AGENTS
export type AgentType = "codex" | "claude";

export type AgentMode = "ask" | "code";

export type ModelProvider =
  | "openai"
  | "anthropic"
  | "openrouter"
  | "azure"
  | "gemini"
  | "ollama"
  | "mistral"
  | "deepseek"
  | "xai"
  | "groq"
  | "arceeai";

export type AgentModel = {
  name?: string;
  provider?: ModelProvider;
  apiKey: string;
};

export type E2BConfig = {
  apiKey: string;
  templateId?: string;
};

export type DaytonaConfig = {
  apiKey: string;
  image?: string;
  serverUrl?: string;
};

export type TogetherAIConfig = {
  apiKey: string;
  templateId?: string;
};

export type EnvironmentConfig = {
  e2b?: E2BConfig;
  daytona?: DaytonaConfig;
  togetherai?: TogetherAIConfig;
};

export type GithubConfig = {
  token: string;
  repository: string;
};

// SECRETS
export type SecretsConfig = {
  /** Environment variables to be passed to the sandbox */
  [key: string]: string;
};

// TELEMETRY
export type TelemetryConfig = {
  /** Enable or disable telemetry */
  isEnabled: boolean;
  /** OTLP HTTP endpoint for traces (e.g., "https://api.honeycomb.io/v1/traces") */
  endpoint?: string;
  /** Service name for resource attributes (defaults to "vibekit") */
  serviceName?: string;
  /** Service version for resource attributes (defaults to "1.0.0") */
  serviceVersion?: string;
  /** Additional headers for OTLP HTTP requests */
  headers?: Record<string, string>;
  /** Request timeout in milliseconds (defaults to 5000) */
  timeout?: number;
  /** Sampling ratio from 0.0 to 1.0 (defaults to 1.0 for 100% sampling) */
  samplingRatio?: number;
  /** Additional resource attributes to include in telemetry data */
  resourceAttributes?: Record<string, string>;
};

export type VibeKitConfig = {
  agent: {
    type: AgentType;
    model: AgentModel;
  };
  environment: EnvironmentConfig;
  secrets?: SecretsConfig;
  github?: GithubConfig;
  telemetry?: TelemetryConfig;
  sessionId?: string;
};

// CONVERSATION HISTORY
export type Conversation = {
  role: "user" | "assistant";
  content: string;
};

// STREAMING CALLBACKS
export interface CodexStreamCallbacks {
  onUpdate?: (message: string) => void;
  onError?: (error: string) => void;
}

export interface ClaudeStreamCallbacks {
  onUpdate?: (message: string) => void;
  onError?: (error: string) => void;
}

// CODEX CONFIG
export interface CodexConfig {
  providerApiKey?: string;
  provider?: ModelProvider;
  githubToken?: string;
  repoUrl?: string; // org/repo, e.g. "octocat/hello-world"
  e2bApiKey: string;
  e2bTemplateId?: string;
  sandboxConfig?: SandboxConfig; // New unified sandbox config
  secrets?: SecretsConfig;
  model?: string;
  sandboxId?: string;
  telemetry?: TelemetryConfig;
}

export interface CodexResponse {
  exitCode: number;
  stdout: string;
  stderr: string;
  sandboxId: string;
  patch?: string;
  patchApplyScript?: string;
  branchName?: string;
  commitSha?: string;
}

// CLAUDE CONFIG
export interface ClaudeConfig {
  providerApiKey: string;
  provider?: ModelProvider;
  githubToken?: string;
  repoUrl?: string; // org/repo, e.g. "octocat/hello-world"
  e2bApiKey: string;
  e2bTemplateId?: string;
  sandboxConfig?: SandboxConfig; // New unified sandbox config
  secrets?: SecretsConfig;
  model?: string;
  sandboxId?: string;
  telemetry?: TelemetryConfig;
}

export interface ClaudeResponse {
  exitCode: number;
  stdout: string;
  stderr: string;
  sandboxId: string;
  patch?: string;
  patchApplyScript?: string;
  branchName?: string;
  commitSha?: string;
}

// SANDBOX ABSTRACTION
export interface SandboxExecutionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface SandboxCommandOptions {
  timeoutMs?: number;
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
}

export interface SandboxConfig {
  type: "e2b" | "daytona" | "togetherai";
  apiKey: string;
  templateId?: string; // for E2B and TogetherAI
  image?: string; // for Daytona
  serverUrl?: string; // for Daytona
}

export interface SandboxProvider {
  create(
    config: SandboxConfig,
    envs?: Record<string, string>,
    agentType?: "codex" | "claude"
  ): Promise<SandboxInstance>;
  resume(sandboxId: string, config: SandboxConfig): Promise<SandboxInstance>;
}
