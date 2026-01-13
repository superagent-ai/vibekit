/**
 * @vibe-kit/sdk
 *
 * @deprecated This package is deprecated. Please migrate to the new v2 API:
 *
 * ```typescript
 * // OLD (deprecated):
 * import { VibeKit } from "@vibe-kit/sdk";
 * import { createE2BProvider } from "@vibe-kit/e2b";
 *
 * const e2bProvider = createE2BProvider({ apiKey, templateId: "vibekit-claude" });
 * const vibeKit = new VibeKit()
 *   .withAgent({ type: "claude", provider: "anthropic", apiKey, model })
 *   .withSandbox(e2bProvider);
 * await vibeKit.executeCommand("claude ...");
 *
 * // NEW (v2):
 * import { createSandbox } from "@vibe-kit/e2b";
 *
 * const sandbox = await createSandbox({ apiKey });
 * await sandbox.claude({ apiKey, model }).run("Create a web app");
 * ```
 *
 * See the migration guide at: https://github.com/superagent-ai/vibekit
 *
 * @packageDocumentation
 */

// Show deprecation warning on import
console.warn(
  `⚠️  @vibe-kit/sdk is deprecated and will be removed in a future version.\n` +
  `Please migrate to the new v2 API:\n\n` +
  `  // Instead of:\n` +
  `  import { VibeKit } from "@vibe-kit/sdk";\n` +
  `  const vibeKit = new VibeKit().withAgent(...).withSandbox(...);\n\n` +
  `  // Use:\n` +
  `  import { createSandbox } from "@vibe-kit/e2b";\n` +
  `  const sandbox = await createSandbox({ apiKey });\n` +
  `  await sandbox.claude({ apiKey }).run("prompt");\n\n` +
  `See: https://github.com/superagent-ai/vibekit for migration guide.`
);

// Re-export for backward compatibility
export { VibeKit } from "./core/vibekit.js";

// Constants exports
export * from "./constants/index.js";

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
} from "./types.js";

// Optional exports with dynamic imports
export const createClaudeAgent = async () => {
  const { ClaudeAgent } = await import("./agents/claude.js");
  return ClaudeAgent;
};

export const createCodexAgent = async () => {
  const { CodexAgent } = await import("./agents/codex.js");
  return CodexAgent;
};

export const createOpenCodeAgent = async () => {
  const { OpenCodeAgent } = await import("./agents/opencode.js");
  return OpenCodeAgent;
};

export const createGeminiAgent = async () => {
  const { GeminiAgent } = await import("./agents/gemini.js");
  return GeminiAgent;
};

export const createGrokAgent = async () => {
  const { GrokAgent } = await import("./agents/grok.js");
  return GrokAgent;
};

// Additional type exports from agent base
export type { 
  BaseAgentConfig, 
  PullRequestResult,
  AgentResponse,
  ExecuteCommandOptions,
  StreamCallbacks
} from "./agents/base.js";
