import { describe, it, expect } from "vitest";

// Import types from core to verify they are properly exported
import type {
  BaseSandbox,
  Agent,
  AgentResult,
  AgentEvent,
  FinalResult,
  ClaudeConfig,
  CodexConfig,
  GeminiConfig,
  GrokConfig,
  OpencodeConfig,
  Agents,
  SandboxWithAgents,
} from "../packages/core/src/index.js";

import { attachAgents } from "../packages/core/src/index.js";

describe("@vibe-kit/core Types", () => {
  it("should have all types properly exported", () => {
    // Type checking test - these will fail at compile time if types are not exported
    type TestBaseSandbox = BaseSandbox;
    type TestAgent = Agent;
    type TestAgentResult = AgentResult;
    type TestAgentEvent = AgentEvent;
    type TestFinalResult = FinalResult;
    type TestClaudeConfig = ClaudeConfig;
    type TestCodexConfig = CodexConfig;
    type TestGeminiConfig = GeminiConfig;
    type TestGrokConfig = GrokConfig;
    type TestOpencodeConfig = OpencodeConfig;
    type TestAgents = Agents;
    type TestSandboxWithAgents<T extends BaseSandbox> = SandboxWithAgents<T>;

    // If this test compiles and runs, all types are properly exported
    expect(true).toBe(true);
  });

  it("should export attachAgents function", () => {
    expect(typeof attachAgents).toBe("function");
  });
});

describe("@vibe-kit/core attachAgents", () => {
  it("should attach agents to a mock sandbox", () => {
    // Create a mock sandbox that implements BaseSandbox
    const mockSandbox: BaseSandbox = {
      process: {
        async start(_cmd, _opts) {
          return {
            pid: "test-pid",
            async wait() {
              return { exitCode: 0, stdout: "test output", stderr: "" };
            },
            async kill() {},
            stdout: {
              async *[Symbol.asyncIterator]() {
                yield "test output";
              },
            },
            stderr: {
              async *[Symbol.asyncIterator]() {
                // Empty stderr
              },
            },
          };
        },
        async startAndWait(_cmd, _opts) {
          return { exitCode: 0, stdout: "test output", stderr: "" };
        },
      },
      files: {
        async write(_path, _content) {},
        async read(_path) {
          return "test content";
        },
      },
    };

    // Attach agents
    const sandboxWithAgents = attachAgents(mockSandbox);

    // Verify agents are attached
    expect(typeof sandboxWithAgents.claude).toBe("function");
    expect(typeof sandboxWithAgents.codex).toBe("function");
    expect(typeof sandboxWithAgents.gemini).toBe("function");
    expect(typeof sandboxWithAgents.grok).toBe("function");
    expect(typeof sandboxWithAgents.opencode).toBe("function");

    // Verify original methods still work
    expect(typeof sandboxWithAgents.process.start).toBe("function");
    expect(typeof sandboxWithAgents.process.startAndWait).toBe("function");
    expect(typeof sandboxWithAgents.files.write).toBe("function");
    expect(typeof sandboxWithAgents.files.read).toBe("function");
  });

  it("should create agent instances with config", () => {
    const mockSandbox: BaseSandbox = {
      process: {
        async start() {
          return {
            pid: "test-pid",
            async wait() { return { exitCode: 0, stdout: "", stderr: "" }; },
            async kill() {},
            stdout: { async *[Symbol.asyncIterator]() {} },
            stderr: { async *[Symbol.asyncIterator]() {} },
          };
        },
        async startAndWait() {
          return { exitCode: 0, stdout: "", stderr: "" };
        },
      },
      files: {
        async write() {},
        async read() { return ""; },
      },
    };

    const sandboxWithAgents = attachAgents(mockSandbox);

    // Create Claude agent
    const claudeAgent = sandboxWithAgents.claude({
      apiKey: "test-api-key",
      model: "claude-sonnet-4-20250514",
      flags: ["--verbose"],
    });

    expect(typeof claudeAgent.run).toBe("function");
    expect(typeof claudeAgent.ask).toBe("function");

    // Create Codex agent
    const codexAgent = sandboxWithAgents.codex({
      apiKey: "test-api-key",
    });

    expect(typeof codexAgent.run).toBe("function");
    expect(typeof codexAgent.ask).toBe("function");
  });
});

describe("AgentEvent types", () => {
  it("should support all event types", () => {
    // Test that all event types can be created
    const textEvent: AgentEvent = { type: "text", content: "Hello" };
    const toolUseEvent: AgentEvent = { type: "tool_use", tool: "bash", input: { cmd: "ls" } };
    const toolResultEvent: AgentEvent = { type: "tool_result", tool: "bash", output: "file.txt" };
    const errorEvent: AgentEvent = { type: "error", message: "Error occurred" };
    const doneEvent: AgentEvent = {
      type: "done",
      result: { success: true, output: "Done", errors: [], exitCode: 0 },
    };
    const rawEvent: AgentEvent = { type: "raw", data: '{"type":"unknown"}' };

    expect(textEvent.type).toBe("text");
    expect(toolUseEvent.type).toBe("tool_use");
    expect(toolResultEvent.type).toBe("tool_result");
    expect(errorEvent.type).toBe("error");
    expect(doneEvent.type).toBe("done");
    expect(rawEvent.type).toBe("raw");
  });
});
