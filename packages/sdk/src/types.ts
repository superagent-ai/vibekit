import { ProviderType } from './constants/providers';
import { AgentType } from './constants/agents';

// AGENTS
export { AgentType };

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

export type ModalConfig = {
  image: string;
  encryptedPorts?: number[];
  h2Ports?: number[];

}

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
  modal?: ModalConfig;
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


export type VibeKitConfig = {
  agent: {
    type: AgentType;
    model: AgentModel;
  };
  environment: EnvironmentConfig;
  secrets?: SecretsConfig;
  github?: GithubConfig;
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

// MERGE PULL REQUEST OPTIONS
export interface MergePullRequestOptions {
  pullNumber: number;
  commitTitle?: string;
  commitMessage?: string;
  mergeMethod?: 'merge' | 'squash' | 'rebase';
}

export interface MergePullRequestResult {
  sha: string;
  merged: boolean;
  message: string;
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

// UNIFIED STREAMING OUTPUT TYPES
/**
 * Represents a structured message from agent streaming output.
 * Used to provide typed feedback during code generation and command execution.
 */
export interface StreamingOutputMessage {
  /** The type of streaming message */
  type: 'start' | 'git' | 'end' | 'tool_call' | 'tool_result' | 'text';
  /** The sandbox ID where the operation is running */
  sandbox_id?: string;
  /** Raw output from the operation (usually JSON stringified) */
  output?: string;
  /** Human-readable message describing the operation */
  message?: string;
  /** Unix timestamp when the message was generated */
  timestamp?: number;
}

// UNION TYPES FOR AGENT RESPONSES
/**
 * Union type representing the response from any coding agent.
 * Contains execution results including exit code, stdout, stderr, and metadata.
 * 
 * Note: The base AgentResponse interface is defined in agents/base.ts
 * This union type extends that for specific agent implementations.
 */
export type SpecificAgentResponse = 
  | CodexResponse 
  | ClaudeResponse 
  | OpenCodeResponse 
  | GeminiResponse 
  | GrokResponse;

/**
 * Union type for streaming callbacks across all agent types.
 * Provides typed onUpdate and onError handlers for real-time feedback.
 */
export type AgentStreamCallbacks = 
  | CodexStreamCallbacks 
  | ClaudeStreamCallbacks 
  | OpenCodeStreamCallbacks 
  | GeminiStreamCallbacks 
  | GrokStreamCallbacks;

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
  workingDirectory?: string;
  baseUrl?: string; // for custom xAI API endpoints
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
  encryptedPorts?: number[]; // for Modal
  h2Ports?: number[]; // for Modal
}

export interface SandboxProvider {
  create(
    envs?: Record<string, string>,
    agentType?: AgentType,
    workingDirectory?: string
  ): Promise<SandboxInstance>;
  resume(sandboxId: string): Promise<SandboxInstance>;
}

// TYPED COMMAND EXECUTION OPTIONS
/**
 * Options for executing commands with proper typing for streaming output.
 */
export interface TypedExecuteCommandOptions {
  /** Timeout in milliseconds (default: 3600000) */
  timeoutMs?: number;
  /** Whether to run the command in the background */
  background?: boolean;
  /** Typed callback handlers for streaming output */
  callbacks?: {
    /** Receives structured streaming messages or raw strings */
    onUpdate?: (message: StreamingOutputMessage | string) => void;
    /** Receives error messages */
    onError?: (error: string) => void;
  };
  /** Git branch to execute the command on */
  branch?: string;
}

// TYPED GENERATE CODE OPTIONS
/**
 * Options for generating code with proper typing for streaming output.
 */
export interface TypedGenerateCodeOptions {
  /** The prompt to send to the coding agent */
  prompt: string;
  /** Mode: 'ask' for questions only, 'code' for code generation (default: 'code') */
  mode?: 'ask' | 'code';
  /** Git branch to work on */
  branch?: string;
  /** Conversation history for context */
  history?: Conversation[];
  /** Typed callback handlers for streaming output */
  callbacks?: {
    /** Receives structured streaming messages or raw strings */
    onUpdate?: (message: StreamingOutputMessage | string) => void;
    /** Receives error messages */
    onError?: (error: string) => void;
  };
  /** Whether to run in the background */
  background?: boolean;
}
