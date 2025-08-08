// Slim core export with dynamic imports
export { VibeKit } from "./core/vibekit";

// Constants exports
export * from "./constants";

// Type exports for user consumption
export type {
  AgentType,
  AgentMode,
  ModelProvider,
  AgentModel,
  E2BConfig,
  DaytonaConfig,
  NorthflankConfig,
  EnvironmentConfig,
  GithubConfig,
  SecretsConfig,
  VibeKitConfig,
  Conversation,
  LabelOptions,
  CodexStreamCallbacks,
  ClaudeStreamCallbacks,
  OpenCodeStreamCallbacks,
  GeminiStreamCallbacks,
  GrokStreamCallbacks,
  CodexConfig,
  CodexResponse,
  ClaudeConfig,
  ClaudeResponse,
  OpenCodeConfig,
  OpenCodeResponse,
  GeminiConfig,
  GeminiResponse,
  GrokConfig,
  GrokResponse,
  SandboxExecutionResult,
  SandboxCommandOptions,
  SandboxCommands,
  SandboxInstance,
  SandboxConfig,
  SandboxProvider,
} from "./types";

// Optional exports with dynamic imports
export const createClaudeAgent = async () => {
  const { ClaudeAgent } = await import("./agents/claude");
  return ClaudeAgent;
};

export const createCodexAgent = async () => {
  const { CodexAgent } = await import("./agents/codex");
  return CodexAgent;
};

export const createOpenCodeAgent = async () => {
  const { OpenCodeAgent } = await import("./agents/opencode");
  return OpenCodeAgent;
};

export const createGeminiAgent = async () => {
  const { GeminiAgent } = await import("./agents/gemini");
  return GeminiAgent;
};

export const createGrokAgent = async () => {
  const { GrokAgent } = await import("./agents/grok");
  return GrokAgent;
};

// Authentication is handled separately via @vibe-kit/auth package
// Users should get tokens from auth package and pass them as API keys

// Additional type exports from agent base
export type { 
  BaseAgentConfig, 
  PullRequestResult,
  AgentResponse,
  ExecuteCommandOptions,
  StreamCallbacks
} from "./agents/base";
