// Main exports
export { VibeKit } from "./core/vibekit";

// Type exports
export type {
  AgentResponse,
  VibeKitStreamCallbacks,
  PullRequestResponse,
} from "./core/vibekit";

export type {
  VibeKitConfig,
  AgentType,
  AgentMode,
  AgentModel,
  ModelProvider,
  E2BConfig,
  DaytonaConfig,
  TogetherAIConfig,
  EnvironmentConfig,
  GithubConfig,
  TelemetryConfig,
} from "./types";

// Agent function exports
export { CodexAgent } from "./agents/codex";
export { ClaudeAgent } from "./agents/claude";
export { OpenCodeAgent } from "./agents/opencode";
export { GeminiAgent } from "./agents/gemini";
export { BaseAgent } from "./agents/base";

// Agent config type exports
export type { CodexConfig, CodexResponse, CodexStreamCallbacks } from "./types";
export type {
  ClaudeConfig,
  ClaudeResponse,
  ClaudeStreamCallbacks,
} from "./types";
export type {
  OpenCodeConfig,
  OpenCodeResponse,
  OpenCodeStreamCallbacks,
} from "./types";
export type {
  StreamCallbacks,
  BaseAgentConfig,
  PullRequestResult,
} from "./agents/base";
export type {
  GeminiConfig,
  GeminiResponse,
  GeminiStreamCallbacks,
} from "./types";

// Telemetry exports
export { TelemetryService } from "./services/telemetry";
export type { TelemetryData } from "./services/telemetry";
