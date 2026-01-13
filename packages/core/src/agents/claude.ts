import type { Agent, AgentEvent, AgentResult, BaseSandbox, ClaudeConfig, FinalResult, ProcessHandle } from "../types.js";
import { createAgentResult } from "./agent-result.js";

const DEFAULT_MODEL = "claude-sonnet-4-20250514";

/**
 * Ensure Claude Code CLI is installed in the sandbox
 */
async function ensureClaudeInstalled(sandbox: BaseSandbox): Promise<void> {
  const result = await sandbox.process.startAndWait("which claude || command -v claude");
  if (result.exitCode !== 0) {
    console.log("Installing Claude Code CLI...");
    const installResult = await sandbox.process.startAndWait(
      "npm install -g @anthropic-ai/claude-code"
    );
    if (installResult.exitCode !== 0) {
      throw new Error(`Failed to install Claude Code CLI: ${installResult.stderr}`);
    }
  }
}

/**
 * Build the Claude CLI command
 */
function buildCommand(config: ClaudeConfig, mode: "run" | "ask"): string {
  const { model = DEFAULT_MODEL, flags = [] } = config;

  const args: string[] = [
    "claude",
    "-p",
    "--output-format", "stream-json",
    "--model", model,
  ];

  // For ask mode, disable write tools
  if (mode === "ask") {
    args.push("--disallowedTools", "Edit,Write,MultiEdit,Replace");
  }

  // Add any additional flags
  if (flags.length > 0) {
    args.push(...flags);
  }

  return args.join(" ");
}

// Internal type to avoid PromiseLike flattening issues
interface AgentResultInternal {
  iterate(): AsyncIterator<AgentEvent>;
  toFinalResult(): Promise<FinalResult>;
}

function wrapAgentResult(result: AgentResult): AgentResultInternal {
  return {
    iterate: () => result[Symbol.asyncIterator](),
    toFinalResult: () => new Promise<FinalResult>((resolve, reject) => {
      result.then(resolve, reject);
    }),
  };
}

/**
 * Create a Claude agent instance
 */
export function createClaudeAgent(sandbox: BaseSandbox, config: ClaudeConfig): Agent {
  const { apiKey } = config;

  const startExecution = async (prompt: string, mode: "run" | "ask"): Promise<AgentResultInternal> => {
    await ensureClaudeInstalled(sandbox);

    const cmd = buildCommand(config, mode);

    // Write prompt to file to avoid shell escaping issues
    const promptFile = `/tmp/prompt-${Date.now()}.txt`;
    await sandbox.files.write(promptFile, prompt);

    // Execute the command with API key set as environment variable
    const handle = await sandbox.process.start(
      `ANTHROPIC_API_KEY="${apiKey}" cat "${promptFile}" | ${cmd}`,
      {
        env: {
          ANTHROPIC_API_KEY: apiKey,
        },
      }
    );

    return wrapAgentResult(createAgentResult(handle));
  };

  const createLazyResult = (prompt: string, mode: "run" | "ask"): AgentResult => {
    // Promise that resolves to the wrapped result
    const executionPromise = startExecution(prompt, mode);

    return {
      [Symbol.asyncIterator](): AsyncIterator<AgentEvent> {
        let delegateIterator: AsyncIterator<AgentEvent> | null = null;

        return {
          async next(): Promise<IteratorResult<AgentEvent>> {
            if (delegateIterator === null) {
              const wrapped = await executionPromise;
              delegateIterator = wrapped.iterate();
            }
            return delegateIterator.next();
          },
        };
      },

      then<TResult1 = FinalResult, TResult2 = never>(
        onfulfilled?: ((value: FinalResult) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
      ): Promise<TResult1 | TResult2> {
        return executionPromise
          .then((wrapped) => wrapped.toFinalResult())
          .then(onfulfilled, onrejected);
      },
    };
  };

  return {
    run(prompt: string): AgentResult {
      return createLazyResult(prompt, "run");
    },

    ask(question: string): AgentResult {
      return createLazyResult(question, "ask");
    },
  };
}
