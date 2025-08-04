import { LocalStoreConfig } from "./types/telemetry-storage";

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
  /** Telemetry type - 'local' for local SQLite storage or 'remote' for OTLP export */
  type?: 'local' | 'remote';
  /** Enable or disable telemetry (deprecated - use type field instead) */
  isEnabled?: boolean;
  /** OTLP HTTP endpoint for traces (e.g., "https://api.honeycomb.io/v1/traces") - required for type: 'remote' */
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
  /** Local storage configuration for telemetry data (deprecated - use database field for type: 'local') */
  localStore?: LocalStoreConfig;
  
  // Local telemetry specific options (when type: 'local')
  /** Database configuration for local telemetry */
  database?: {
    /** Path to SQLite database file */
    path?: string;
    /** Days to retain data (0 = forever, default: 0) */
    retentionDays?: number;
    /** Enable WAL mode for better performance */
    enableWAL?: boolean;
    /** Event batch size for performance */
    batchSize?: number;
    /** Flush interval in milliseconds */
    flushInterval?: number;
    /** Maximum database size in MB */
    maxSizeMB?: number;
  };
  
  /** API server configuration for local telemetry */
  api?: {
    /** Enable HTTP API server */
    enabled?: boolean;
    /** Port for API server */
    port?: number;
    /** Host to bind API server */
    host?: string;
    /** Enable integrated dashboard */
    dashboard?: boolean;
    /** CORS configuration */
    cors?: boolean | object;
  };
  
  /** Analytics configuration for local telemetry */
  analytics?: {
    /** Enable analytics processing */
    enabled?: boolean;
    /** Enable real-time analytics */
    realtime?: boolean;
    /** Enable anomaly detection */
    anomalyDetection?: boolean;
    /** Enable metrics collection */
    metrics?: boolean;
    /** Analytics data retention (days) */
    retention?: number;
  };
  /** Production-ready configuration options */
  production?: {
    /** Enable PII detection and scrubbing */
    piiDetection?: {
      enabled: boolean;
      customPatterns?: Array<{ name: string; regex: string; replacement: string }>;
    };
    /** Rate limiting configuration */
    rateLimiting?: {
      enabled: boolean;
      requestsPerMinute?: number;
      streamRequestsPerMinute?: number;
    };
    /** Circuit breaker configuration */
    circuitBreaker?: {
      enabled: boolean;
      failureThreshold?: number;
      timeoutMs?: number;
    };
    /** Alerting configuration */
    alerting?: {
      enabled: boolean;
      errorRateThreshold?: number;
      channels?: Array<'console' | 'webhook' | 'email'>;
      webhookUrl?: string;
    };
    /** Health check configuration */
    healthChecks?: {
      enabled: boolean;
      intervalMs?: number;
      timeoutMs?: number;
    };
    /** Metrics configuration */
    metrics?: {
      enabled: boolean;
      retentionDays?: number;
      aggregationIntervalMs?: number;
    };
  };
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
  type: "e2b" | "daytona" | "northflank";
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
    agentType?: "codex" | "claude" | "opencode" | "gemini" | "grok",
    workingDirectory?: string
  ): Promise<SandboxInstance>;
  resume(sandboxId: string): Promise<SandboxInstance>;
}
