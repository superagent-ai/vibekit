/**
 * @vibe-kit/core types
 *
 * Core types for the VibeKit SDK v2
 */

// ============================================================================
// Base Sandbox Interface
// ============================================================================

/**
 * Process options for running commands in a sandbox
 */
export interface ProcessOpts {
  timeoutMs?: number;
  cwd?: string;
  env?: Record<string, string>;
  onStdout?: (data: string) => void;
  onStderr?: (data: string) => void;
}

/**
 * Handle returned by process.start() for long-running processes
 */
export interface ProcessHandle {
  readonly pid: string;
  wait(): Promise<ProcessResult>;
  kill(): Promise<void>;
  readonly stdout: AsyncIterable<string>;
  readonly stderr: AsyncIterable<string>;
}

/**
 * Result of a completed process
 */
export interface ProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Base interface that all sandbox providers must satisfy
 * This is the minimum required for agents to work
 */
export interface BaseSandbox {
  process: {
    /**
     * Start a process and return a handle for streaming
     */
    start(cmd: string, opts?: ProcessOpts): Promise<ProcessHandle>;

    /**
     * Start a process and wait for it to complete
     */
    startAndWait(cmd: string, opts?: ProcessOpts): Promise<ProcessResult>;
  };

  files: {
    /**
     * Write content to a file
     */
    write(path: string, content: string): Promise<void>;

    /**
     * Read content from a file
     */
    read(path: string): Promise<string>;
  };
}

// ============================================================================
// Agent Configuration Types
// ============================================================================

/**
 * Configuration for Claude Code agent
 */
export interface ClaudeConfig {
  /**
   * Anthropic API key
   */
  apiKey: string;

  /**
   * Model to use (defaults to claude-sonnet-4-20250514)
   */
  model?: string;

  /**
   * Raw CLI flags passthrough
   * Reference: https://docs.anthropic.com/en/docs/claude-code
   */
  flags?: string[];
}

/**
 * Configuration for OpenAI Codex agent
 */
export interface CodexConfig {
  /**
   * OpenAI API key
   */
  apiKey: string;

  /**
   * Model to use
   */
  model?: string;

  /**
   * Raw CLI flags passthrough
   * Reference: https://github.com/openai/codex
   */
  flags?: string[];
}

/**
 * Configuration for Gemini CLI agent
 */
export interface GeminiConfig {
  /**
   * Google API key
   */
  apiKey: string;

  /**
   * Model to use
   */
  model?: string;

  /**
   * Raw CLI flags passthrough
   * Reference: https://github.com/google-gemini/gemini-cli
   */
  flags?: string[];
}

/**
 * Configuration for Grok CLI agent
 */
export interface GrokConfig {
  /**
   * xAI API key
   */
  apiKey: string;

  /**
   * Model to use
   */
  model?: string;

  /**
   * Raw CLI flags passthrough
   */
  flags?: string[];
}

/**
 * Configuration for Opencode agent
 */
export interface OpencodeConfig {
  /**
   * Provider to use (e.g., "anthropic", "openai")
   */
  provider: string;

  /**
   * API key for the provider
   */
  apiKey: string;

  /**
   * Model to use
   */
  model?: string;

  /**
   * Raw CLI flags passthrough
   * Reference: https://github.com/opencode-ai/opencode
   */
  flags?: string[];
}

// ============================================================================
// Agent Event Types (for streaming)
// ============================================================================

/**
 * Text output event from agent
 */
export interface TextEvent {
  type: "text";
  content: string;
}

/**
 * Tool use event - agent is using a tool
 */
export interface ToolUseEvent {
  type: "tool_use";
  tool: string;
  input: Record<string, unknown>;
}

/**
 * Tool result event - result from a tool execution
 */
export interface ToolResultEvent {
  type: "tool_result";
  tool: string;
  output: string;
}

/**
 * Error event
 */
export interface ErrorEvent {
  type: "error";
  message: string;
}

/**
 * Done event with final result
 */
export interface DoneEvent {
  type: "done";
  result: FinalResult;
}

/**
 * Raw event - unparsed output from agent
 */
export interface RawEvent {
  type: "raw";
  data: string;
}

/**
 * Union type of all agent events
 */
export type AgentEvent =
  | TextEvent
  | ToolUseEvent
  | ToolResultEvent
  | ErrorEvent
  | DoneEvent
  | RawEvent;

// ============================================================================
// Agent Result Types
// ============================================================================

/**
 * Final result after agent execution completes
 */
export interface FinalResult {
  success: boolean;
  output: string;
  errors: string[];
  exitCode: number;
}

/**
 * Agent result that supports both streaming and await patterns
 */
export interface AgentResult extends AsyncIterable<AgentEvent>, PromiseLike<FinalResult> {
  /**
   * Async iterator for streaming events
   */
  [Symbol.asyncIterator](): AsyncIterator<AgentEvent>;
}

// ============================================================================
// Agent Interface
// ============================================================================

/**
 * Agent instance that can run prompts
 */
export interface Agent {
  /**
   * Run a prompt with full capabilities (read/write)
   */
  run(prompt: string): AgentResult;

  /**
   * Ask a question (read-only mode where supported)
   */
  ask(question: string): AgentResult;
}

// ============================================================================
// Agents Interface (attached to sandbox)
// ============================================================================

/**
 * Agents interface that gets attached to sandboxes
 */
export interface Agents {
  /**
   * Create a Claude Code agent instance
   */
  claude(config: ClaudeConfig): Agent;

  /**
   * Create a Codex agent instance
   */
  codex(config: CodexConfig): Agent;

  /**
   * Create a Gemini CLI agent instance
   */
  gemini(config: GeminiConfig): Agent;

  /**
   * Create a Grok CLI agent instance
   */
  grok(config: GrokConfig): Agent;

  /**
   * Create an Opencode agent instance
   */
  opencode(config: OpencodeConfig): Agent;
}

// ============================================================================
// Sandbox with Agents Type
// ============================================================================

/**
 * Type helper for sandbox with agents attached
 */
export type SandboxWithAgents<T extends BaseSandbox> = T & Agents;

// ============================================================================
// Agent Type (for internal use)
// ============================================================================

export type AgentType = "claude" | "codex" | "gemini" | "grok" | "opencode";
