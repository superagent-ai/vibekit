import { ProviderType } from './constants/providers';

// AGENTS
export type AgentType = "codex" | "claude" | "opencode" | "gemini" | "grok";

export type AgentMode = "ask" | "code";

export type ModelProvider =
  | "openai"
  | "anthropic"
  | "openrouter"
  | "azure"
  | "gemini"
  | "google"
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

export type NorthflankConfig = {
  apiKey: string;
  image?: string;
  projectId?: string;
  billingPlan?: string;
  persistentVolumeStorage?: number;
};

export type EnvironmentConfig = {
  e2b?: E2BConfig;
  daytona?: DaytonaConfig;
  northflank?: NorthflankConfig;
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
  /** Working directory inside the sandbox (defaults to "/var/vibe0") */
  workingDirectory?: string;
};

// CONVERSATION HISTORY
export type Conversation = {
  role: "user" | "assistant";
  content: string;
};

// PULL REQUEST LABELS
export interface LabelOptions {
  name: string;
  color: string;
  description: string;
}

// STREAMING CALLBACKS
export interface CodexStreamCallbacks {
  onUpdate?: (message: string) => void;
  onError?: (error: string) => void;
}

export interface ClaudeStreamCallbacks {
  onUpdate?: (message: string) => void;
  onError?: (error: string) => void;
}

export interface OpenCodeStreamCallbacks {
  onUpdate?: (message: string) => void;
  onError?: (error: string) => void;
}

export interface GeminiStreamCallbacks {
  onUpdate?: (message: string) => void;
  onError?: (error: string) => void;
}

export interface GrokStreamCallbacks {
  onUpdate?: (message: string) => void;
  onError?: (error: string) => void;
}

// CODEX CONFIG
export interface CodexConfig {
  providerApiKey?: string;
  provider?: ModelProvider;
  githubToken?: string;
  repoUrl?: string; // org/repo, e.g. "octocat/hello-world"
  sandboxProvider?: SandboxProvider;
  secrets?: SecretsConfig;
  model?: string;
  sandboxId?: string;
  telemetry?: TelemetryConfig;
  workingDirectory?: string;
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
  providerApiKey?: string; // Optional - can use OAuth token instead
  oauthToken?: string; // OAuth token from CLAUDE_CODE_OAUTH_TOKEN
  provider?: ModelProvider;
  githubToken?: string;
  repoUrl?: string; // org/repo, e.g. "octocat/hello-world"
  sandboxProvider?: SandboxProvider;
  secrets?: SecretsConfig;
  model?: string;
  sandboxId?: string;
  telemetry?: TelemetryConfig;
  workingDirectory?: string;
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

// OPENCODE CONFIG
export interface OpenCodeConfig {
  providerApiKey?: string;
  provider?: ModelProvider;
  githubToken?: string;
  repoUrl?: string; // org/repo, e.g. "octocat/hello-world"
  sandboxProvider?: SandboxProvider;
  secrets?: SecretsConfig;
  model?: string;
  sandboxId?: string;
  telemetry?: TelemetryConfig;
  workingDirectory?: string;
}

export interface OpenCodeResponse {
  exitCode: number;
  stdout: string;
  stderr: string;
  sandboxId: string;
  patch?: string;
  patchApplyScript?: string;
  branchName?: string;
  commitSha?: string;
}

// GEMINI CONFIG
export interface GeminiConfig {
  providerApiKey?: string;
  provider?: ModelProvider;
  githubToken?: string;
  repoUrl?: string; // org/repo, e.g. "octocat/hello-world"
  sandboxProvider?: SandboxProvider;
  secrets?: SecretsConfig;
  model?: string;
  sandboxId?: string;
  telemetry?: TelemetryConfig;
  workingDirectory?: string;
}

export interface GeminiResponse {
  exitCode: number;
  stdout: string;
  stderr: string;
  sandboxId: string;
  patch?: string;
  patchApplyScript?: string;
  branchName?: string;
  commitSha?: string;
}

// GROK CONFIG
export interface GrokConfig {
  providerApiKey?: string;
  provider?: ModelProvider;
  githubToken?: string;
  repoUrl?: string; // org/repo, e.g. "octocat/hello-world"
  sandboxProvider?: SandboxProvider;
  secrets?: SecretsConfig;
  model?: string;
  sandboxId?: string;
  telemetry?: TelemetryConfig;
  workingDirectory?: string;
  baseUrl?: string; // for custom xAI API endpoints
  localMCP?: {
    enabled: boolean;
    environment?: any;
    serverType?: "stdio" | "transport";
    autoStart?: boolean;
  };
}

export interface GrokResponse {
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
}

export interface SandboxConfig {
  type: ProviderType;
  apiKey: string;
  templateId?: string; // for E2B
  image?: string; // for Daytona
  serverUrl?: string; // for Daytona
  projectId?: string; // for Northflank
  billingPlan?: string; // for Northflank
  persistentVolume?: string; // for Northflank
  persistentVolumeStorage?: number; // for Northflank
  workingDirectory?: string; // for Nortflank
}

export interface SandboxProvider {
  create(
    envs?: Record<string, string>,
    agentType?: AgentType,
    workingDirectory?: string
  ): Promise<SandboxInstance>;
  resume(sandboxId: string): Promise<SandboxInstance>;
}
