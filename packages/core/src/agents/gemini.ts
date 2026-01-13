import type { Agent, AgentEvent, AgentResult, BaseSandbox, GeminiConfig, FinalResult } from "../types.js";
import { createAgentResult } from "./agent-result.js";

/**
 * Ensure Gemini CLI is installed in the sandbox
 */
async function ensureGeminiInstalled(sandbox: BaseSandbox): Promise<void> {
  const result = await sandbox.process.startAndWait("which gemini || command -v gemini");
  if (result.exitCode !== 0) {
    console.log("Installing Gemini CLI...");
    const installResult = await sandbox.process.startAndWait(
      "npm install -g @google/generative-ai-cli || echo 'Gemini CLI not yet available'"
    );
    if (installResult.exitCode !== 0) {
      throw new Error(`Failed to install Gemini CLI: ${installResult.stderr}`);
    }
  }
}

/**
 * Build the Gemini CLI command
 */
function buildCommand(config: GeminiConfig, _mode: "run" | "ask"): string {
  const { model, flags = [] } = config;

  const args: string[] = ["gemini"];

  if (model) {
    args.push("--model", model);
  }

  // Add sandbox mode for safety
  args.push("--sandbox");

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
 * Create a Gemini agent instance
 */
export function createGeminiAgent(sandbox: BaseSandbox, config: GeminiConfig): Agent {
  const { apiKey } = config;

  const startExecution = async (prompt: string, mode: "run" | "ask"): Promise<AgentResultInternal> => {
    await ensureGeminiInstalled(sandbox);

    const cmd = buildCommand(config, mode);

    // Write prompt to file to avoid shell escaping issues
    const promptFile = `/tmp/prompt-${Date.now()}.txt`;
    await sandbox.files.write(promptFile, prompt);

    // Execute the command with API key set as environment variable
    const handle = await sandbox.process.start(
      `GOOGLE_API_KEY="${apiKey}" ${cmd} "$(cat "${promptFile}")"`,
      {
        env: {
          GOOGLE_API_KEY: apiKey,
        },
      }
    );

    return wrapAgentResult(createAgentResult(handle));
  };

  const createLazyResult = (prompt: string, mode: "run" | "ask"): AgentResult => {
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
