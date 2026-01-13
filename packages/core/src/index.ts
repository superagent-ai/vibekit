/**
 * @vibe-kit/core
 *
 * Core package for VibeKit SDK v2 - Agent implementations and shared utilities.
 *
 * This package provides:
 * - Type definitions for sandboxes, agents, and events
 * - The `attachAgents` utility to add agent capabilities to any sandbox
 * - Individual agent implementations (Claude, Codex, Gemini, Grok, Opencode)
 *
 * @example Basic usage with attachAgents
 * ```typescript
 * import { attachAgents } from "@vibe-kit/core";
 *
 * // Attach agents to any sandbox that implements BaseSandbox
 * const sandboxWithAgents = attachAgents(sandbox);
 *
 * // Use agents
 * const result = await sandboxWithAgents.claude({
 *   apiKey: process.env.ANTHROPIC_API_KEY,
 *   model: "claude-sonnet-4-20250514",
 * }).run("Create a REST API with Express");
 *
 * // Stream events
 * for await (const event of result) {
 *   if (event.type === "text") console.log(event.content);
 * }
 * ```
 *
 * @example Using with provider packages
 * ```typescript
 * // Provider packages like @vibe-kit/e2b already have agents attached
 * import { createSandbox } from "@vibe-kit/e2b";
 *
 * const sandbox = await createSandbox({ apiKey: E2B_API_KEY });
 * await sandbox.claude({ apiKey }).run("Build an app");
 * ```
 *
 * @packageDocumentation
 */

// Export the main attachAgents utility
export { attachAgents } from "./attach-agents.js";

// Export all types
export type {
  // Base sandbox types
  BaseSandbox,
  ProcessOpts,
  ProcessHandle,
  ProcessResult,

  // Agent configuration types
  ClaudeConfig,
  CodexConfig,
  GeminiConfig,
  GrokConfig,
  OpencodeConfig,

  // Agent types
  Agent,
  Agents,
  AgentResult,
  SandboxWithAgents,
  AgentType,

  // Event types
  AgentEvent,
  TextEvent,
  ToolUseEvent,
  ToolResultEvent,
  ErrorEvent,
  DoneEvent,
  RawEvent,

  // Result types
  FinalResult,
} from "./types.js";

// Export agent creators for advanced usage
export {
  createClaudeAgent,
  createCodexAgent,
  createGeminiAgent,
  createGrokAgent,
  createOpencodeAgent,
  createAgentResult,
} from "./agents/index.js";
