// ===== Telemetry Opt-Out Feature =====
import { initTelemetry } from "./telemetry";

const telemetryEnabled = process.env.VIBEKIT_TELEMETRY !== 'false';

if (telemetryEnabled) {
  initTelemetry(); // Initializes telemetry
} else {
  console.log(
    "Vibekit telemetry is disabled by user via VIBEKIT_TELEMETRY=false"
  );
}

// ===== Core exports =====
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
  ModalConfig,
  NorthflankConfig,
  EnvironmentConfig,
  GithubConfig,
  SecretsConfig,
  VibeKitConfig,
  Conversation,
  LabelOptions,
  MergePullRequestOptions,
  MergePullRequestResult,
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

// Authentication handled separately
export type { 
  BaseAgentConfig, 
  PullRequestResult,
  AgentResponse,
  ExecuteCommandOptions,
  StreamCallbacks
} from "./agents/base";
