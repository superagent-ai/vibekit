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

// UNIFIED STREAMING TYPES
export interface StreamingMessage {
  type: 'start' | 'git' | 'end';
  sandbox_id?: string;
  output?: string;
}

export interface StreamCallbacks {
  onUpdate?: (message: StreamingMessage | string) => void;
  onError?: (error: string) => void;
}

// AGENT-SPECIFIC STREAMING CALLBACKS (for backward compatibility)
export interface CodexStreamCallbacks extends StreamCallbacks {}
export interface ClaudeStreamCallbacks extends StreamCallbacks {}
export interface OpenCodeStreamCallbacks extends StreamCallbacks {}
export interface GeminiStreamCallbacks extends StreamCallbacks {}
export interface GrokStreamCallbacks extends StreamCallbacks {}

// UNIFIED AGENT RESPONSE TYPES
export interface AgentResponse {
  exitCode: number;
  stdout: string;
  stderr: string;
  sandboxId: string;
  patch?: string;
  patchApplyScript?: string;
  branchName?: string;
  commitSha?: string;
}

export interface ExecuteCommandResponse extends AgentResponse {}

// STREAM-JSON EXECUTE COMMAND RESPONSE
export interface StreamJsonExecuteCommandResponse extends AgentResponse {
  messages: StreamingMessage[];
  rawStdout: string;
}

// EXECUTE COMMAND OPTIONS
export interface ExecuteCommandOptions {
  timeoutMs?: number;
  background?: boolean;
  callbacks?: StreamCallbacks;
  branch?: string;
  outputFormat?: 'text' | 'stream-json';
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
  workingDirectory?: string;
}

export interface CodexResponse extends AgentResponse {}

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

export interface ClaudeResponse extends AgentResponse {}

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

export interface OpenCodeResponse extends AgentResponse {}

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

export interface GeminiResponse extends AgentResponse {}

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

export interface GrokResponse extends AgentResponse {}

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
