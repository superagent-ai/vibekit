import type {
  Agent,
  Agents,
  BaseSandbox,
  ClaudeConfig,
  CodexConfig,
  GeminiConfig,
  GrokConfig,
  OpencodeConfig,
  SandboxWithAgents,
} from "./types.js";

import { createClaudeAgent } from "./agents/claude.js";
import { createCodexAgent } from "./agents/codex.js";
import { createGeminiAgent } from "./agents/gemini.js";
import { createGrokAgent } from "./agents/grok.js";
import { createOpencodeAgent } from "./agents/opencode.js";

/**
 * Attach agent capabilities to a sandbox instance.
 *
 * This function takes any sandbox that implements BaseSandbox and adds
 * agent methods (claude, codex, gemini, grok, opencode) to it.
 *
 * @example
 * ```typescript
 * import { attachAgents } from "@vibe-kit/core";
 *
 * const sandbox = await createNativeSandbox();
 * const sandboxWithAgents = attachAgents(sandbox);
 *
 * // Now you can use agents
 * const result = await sandboxWithAgents.claude({
 *   apiKey: process.env.ANTHROPIC_API_KEY,
 * }).run("Create a REST API");
 * ```
 *
 * @param sandbox - A sandbox instance that implements BaseSandbox
 * @returns The same sandbox with agent methods attached
 */
export function attachAgents<T extends BaseSandbox>(sandbox: T): SandboxWithAgents<T> {
  const agents: Agents = {
    claude(config: ClaudeConfig): Agent {
      return createClaudeAgent(sandbox, config);
    },

    codex(config: CodexConfig): Agent {
      return createCodexAgent(sandbox, config);
    },

    gemini(config: GeminiConfig): Agent {
      return createGeminiAgent(sandbox, config);
    },

    grok(config: GrokConfig): Agent {
      return createGrokAgent(sandbox, config);
    },

    opencode(config: OpencodeConfig): Agent {
      return createOpencodeAgent(sandbox, config);
    },
  };

  // Attach agents to sandbox using Object.assign
  return Object.assign(sandbox, agents) as SandboxWithAgents<T>;
}
