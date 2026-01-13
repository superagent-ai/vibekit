import type {
  AgentEvent,
  AgentResult,
  FinalResult,
  ProcessHandle,
} from "../types.js";

/**
 * StreamingBuffer class to handle chunked JSON data from agent output
 */
class StreamingBuffer {
  private buffer = "";
  private onComplete: (data: string) => void;

  constructor(onComplete: (data: string) => void) {
    this.onComplete = onComplete;
  }

  append(chunk: string): void {
    // Filter out null bytes that can corrupt JSON parsing
    const cleanChunk = chunk.replace(/\0/g, "");
    this.buffer += cleanChunk;
    this.processBuffer();
  }

  private processBuffer(): void {
    let bracketCount = 0;
    let inString = false;
    let escaped = false;
    let start = 0;

    for (let i = 0; i < this.buffer.length; i++) {
      const char = this.buffer[i];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (inString) {
        continue;
      }

      if (char === "{") {
        bracketCount++;
      } else if (char === "}") {
        bracketCount--;

        if (bracketCount === 0) {
          // Found complete JSON object
          const jsonStr = this.buffer.slice(start, i + 1);
          try {
            // Validate JSON before calling callback
            JSON.parse(jsonStr);
            this.onComplete(jsonStr);
          } catch {
            // Invalid JSON, continue buffering
          }

          // Move to next potential JSON object
          start = i + 1;

          // If there's a newline after this JSON, skip it
          if (start < this.buffer.length && this.buffer[start] === "\n") {
            start++;
          }
        }
      }
    }

    // Keep only the remaining unparsed part
    this.buffer = this.buffer.slice(start);
  }

  flush(): void {
    if (this.buffer.trim()) {
      // If it's not JSON, pass it through as-is
      this.onComplete(this.buffer);
      this.buffer = "";
    }
  }
}

/**
 * Parse a JSON event from agent output into an AgentEvent
 */
function parseAgentEvent(data: string): AgentEvent | null {
  try {
    const parsed = JSON.parse(data);

    // Claude stream-json format
    if (parsed.type === "assistant") {
      if (parsed.message?.content) {
        // Extract text from content blocks
        const textBlocks = parsed.message.content.filter(
          (c: { type: string }) => c.type === "text"
        );
        if (textBlocks.length > 0) {
          return {
            type: "text",
            content: textBlocks.map((t: { text: string }) => t.text).join(""),
          };
        }
      }
    }

    // Tool use event
    if (parsed.type === "tool_use") {
      return {
        type: "tool_use",
        tool: parsed.name || parsed.tool || "unknown",
        input: parsed.input || parsed.args || {},
      };
    }

    // Tool result event
    if (parsed.type === "tool_result") {
      return {
        type: "tool_result",
        tool: parsed.name || parsed.tool || "unknown",
        output: typeof parsed.output === "string" ? parsed.output : JSON.stringify(parsed.output),
      };
    }

    // Content block delta (streaming text)
    if (parsed.type === "content_block_delta") {
      if (parsed.delta?.text) {
        return {
          type: "text",
          content: parsed.delta.text,
        };
      }
    }

    // Result/completion event
    if (parsed.type === "result" || parsed.type === "message_stop") {
      return {
        type: "done",
        result: {
          success: true,
          output: parsed.result || parsed.output || "",
          errors: [],
          exitCode: 0,
        },
      };
    }

    // Error event
    if (parsed.type === "error") {
      return {
        type: "error",
        message: parsed.error?.message || parsed.message || "Unknown error",
      };
    }

    // System messages with subtype
    if (parsed.type === "system" && parsed.subtype === "result") {
      return {
        type: "done",
        result: {
          success: parsed.result === "success" || parsed.is_error !== true,
          output: parsed.result || "",
          errors: parsed.is_error ? [parsed.result] : [],
          exitCode: parsed.is_error ? 1 : 0,
        },
      };
    }

    // Raw data that we couldn't parse into a known event
    return {
      type: "raw",
      data: data,
    };
  } catch {
    // Not valid JSON, return as raw
    return {
      type: "raw",
      data: data,
    };
  }
}

/**
 * Create an AgentResult from a process handle
 */
export function createAgentResult(process: ProcessHandle): AgentResult {
  // Collect output for final result
  let fullOutput = "";
  const errors: string[] = [];
  let hasCompleted = false;
  let completedResult: FinalResult | null = null;

  // Event queue for async iteration
  const eventQueue: AgentEvent[] = [];
  let resolveNext: ((value: IteratorResult<AgentEvent>) => void) | null = null;
  let rejectNext: ((error: Error) => void) | null = null;

  // Process the streams
  const processStreams = async () => {
    const buffer = new StreamingBuffer((jsonStr) => {
      const event = parseAgentEvent(jsonStr);
      if (event) {
        // Accumulate text output
        if (event.type === "text") {
          fullOutput += event.content;
        } else if (event.type === "error") {
          errors.push(event.message);
        } else if (event.type === "done") {
          completedResult = event.result;
        }

        // Add to queue or resolve waiting promise
        if (resolveNext) {
          resolveNext({ value: event, done: false });
          resolveNext = null;
          rejectNext = null;
        } else {
          eventQueue.push(event);
        }
      }
    });

    try {
      // Stream stdout
      for await (const chunk of process.stdout) {
        buffer.append(chunk);
      }

      // Flush remaining buffer
      buffer.flush();

      // Wait for process to complete
      const result = await process.wait();
      hasCompleted = true;

      // Create final result if not already received
      if (!completedResult) {
        completedResult = {
          success: result.exitCode === 0,
          output: fullOutput || result.stdout,
          errors: errors.length > 0 ? errors : result.stderr ? [result.stderr] : [],
          exitCode: result.exitCode,
        };
      }

      // Signal end of stream
      if (resolveNext) {
        resolveNext({ value: undefined as unknown as AgentEvent, done: true });
        resolveNext = null;
        rejectNext = null;
      }
    } catch (error) {
      hasCompleted = true;
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push(errorMessage);

      completedResult = {
        success: false,
        output: fullOutput,
        errors: errors,
        exitCode: 1,
      };

      if (rejectNext) {
        rejectNext(error instanceof Error ? error : new Error(errorMessage));
        resolveNext = null;
        rejectNext = null;
      }
    }
  };

  // Start processing streams
  const streamPromise = processStreams();

  // Create the AgentResult object
  const result: AgentResult = {
    [Symbol.asyncIterator](): AsyncIterator<AgentEvent> {
      return {
        async next(): Promise<IteratorResult<AgentEvent>> {
          // Return queued events first
          if (eventQueue.length > 0) {
            return { value: eventQueue.shift()!, done: false };
          }

          // If already completed, return done
          if (hasCompleted) {
            return { value: undefined as unknown as AgentEvent, done: true };
          }

          // Wait for next event
          return new Promise((resolve, reject) => {
            resolveNext = resolve;
            rejectNext = reject;
          });
        },
      };
    },

    then<TResult1 = FinalResult, TResult2 = never>(
      onfulfilled?: ((value: FinalResult) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ): Promise<TResult1 | TResult2> {
      return streamPromise
        .then(() => {
          if (completedResult) {
            return onfulfilled ? onfulfilled(completedResult) : (completedResult as unknown as TResult1);
          }
          // This shouldn't happen, but provide a fallback
          const fallbackResult: FinalResult = {
            success: false,
            output: fullOutput,
            errors: ["No result received"],
            exitCode: 1,
          };
          return onfulfilled ? onfulfilled(fallbackResult) : (fallbackResult as unknown as TResult1);
        })
        .catch((error) => {
          if (onrejected) {
            return onrejected(error);
          }
          throw error;
        });
    },
  };

  return result;
}
