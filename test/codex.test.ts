import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CodexAgent } from "../src/agents/codex.js";
import { CodexConfig, CodexStreamCallbacks } from "../src/types";
import { Sandbox } from "@e2b/code-interpreter";
import { generatePRMetadata } from "../src/agents/utils.js";
import { trace } from "@opentelemetry/api";

// Mock dependencies
vi.mock("@e2b/code-interpreter");
vi.mock("@ai-sdk/openai");
vi.mock("../src/agents/utils.js");

const MockedSandbox = vi.mocked(Sandbox);

describe("CodexAgent", () => {
  let config: CodexConfig;
  let mockSandbox: any;
  let codexAgent: CodexAgent;

  beforeEach(() => {
    config = {
      openaiApiKey: "test-openai-key",
      githubToken: "test-github-token",
      repoUrl: "octocat/hello-world",
      e2bApiKey: "test-e2b-key",
      e2bTemplateId: "test-template-id",
      model: "gpt-4",
    };

    mockSandbox = {
      sandboxId: "test-sandbox-id",
      commands: {
        run: vi.fn(),
      },
      kill: vi.fn(),
      pause: vi.fn(),
    };

    MockedSandbox.create = vi.fn().mockResolvedValue(mockSandbox);
    MockedSandbox.resume = vi.fn().mockResolvedValue(mockSandbox);

    codexAgent = new CodexAgent(config);

    // Mock fetch globally
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("constructor", () => {
    it("should initialize with provided config", () => {
      expect(codexAgent).toBeInstanceOf(CodexAgent);
    });
  });

  describe("getSandbox", () => {
    it("should create a new sandbox when no sandboxId is provided", async () => {
      await codexAgent.generateCode("test prompt");

      expect(MockedSandbox.create).toHaveBeenCalledWith("test-template-id", {
        envs: {
          OPENAI_API_KEY: "test-openai-key",
        },
        apiKey: "test-e2b-key",
      });
    });

    it("should resume existing sandbox when sandboxId is provided", async () => {
      const configWithSandboxId = {
        ...config,
        sandboxId: "existing-sandbox-id",
      };
      const agentWithExistingSandbox = new CodexAgent(configWithSandboxId);

      await agentWithExistingSandbox.generateCode("test prompt");

      expect(MockedSandbox.resume).toHaveBeenCalledWith("existing-sandbox-id", {
        apiKey: "test-e2b-key",
      });
    });

    it("should reuse existing sandbox instance", async () => {
      await codexAgent.generateCode("test prompt 1");
      await codexAgent.generateCode("test prompt 2");

      expect(MockedSandbox.create).toHaveBeenCalledTimes(1);
    });
  });

  describe("killSandbox", () => {
    it("should kill the sandbox if it exists", async () => {
      await codexAgent.generateCode("test prompt");
      await codexAgent.killSandbox();

      expect(mockSandbox.kill).toHaveBeenCalled();
    });

    it("should not throw error if no sandbox exists", async () => {
      await expect(codexAgent.killSandbox()).resolves.not.toThrow();
    });
  });

  describe("pauseSandbox", () => {
    it("should pause the sandbox if it exists", async () => {
      await codexAgent.generateCode("test prompt");
      await codexAgent.pauseSandbox();

      expect(mockSandbox.pause).toHaveBeenCalled();
    });

    it("should not throw error if no sandbox exists", async () => {
      await expect(codexAgent.pauseSandbox()).resolves.not.toThrow();
    });
  });

  describe("resumeSandbox", () => {
    it("should resume the sandbox if it exists", async () => {
      await codexAgent.generateCode("test prompt");
      await codexAgent.resumeSandbox();

      expect(MockedSandbox.resume).toHaveBeenCalledWith("test-sandbox-id", {
        apiKey: "test-e2b-key",
      });
    });

    it("should not throw error if no sandbox exists", async () => {
      await expect(codexAgent.resumeSandbox()).resolves.not.toThrow();
    });
  });

  describe("generateCode", () => {
    beforeEach(() => {
      mockSandbox.commands.run.mockResolvedValue({
        exitCode: 0,
        stdout: "Code generated successfully",
        stderr: "",
      });
    });

    it("should generate code successfully with new sandbox", async () => {
      const result = await codexAgent.generateCode(
        "Create a hello world function"
      );

      expect(result).toEqual({
        sandboxId: "test-sandbox-id",
        exitCode: 0,
        stdout: "Code generated successfully",
        stderr: "",
      });
    });

    it("should clone repository for new sandbox", async () => {
      await codexAgent.generateCode("test prompt");

      expect(mockSandbox.commands.run).toHaveBeenCalledWith(
        "git clone https://x-access-token:test-github-token@github.com/octocat/hello-world.git",
        { timeoutMs: 3600000 }
      );
    });

    it("should configure git user for new sandbox", async () => {
      await codexAgent.generateCode("test prompt");

      expect(mockSandbox.commands.run).toHaveBeenCalledWith(
        'cd hello-world && git config user.name "github-actions[bot]" && git config user.email "github-actions[bot]@users.noreply.github.com"',
        { timeoutMs: 60000 }
      );
    });

    it("should run codex command with correct parameters", async () => {
      await codexAgent.generateCode("test prompt");

      expect(mockSandbox.commands.run).toHaveBeenCalledWith(
        'cd hello-world && codex --approval-mode auto-edit -m gpt-4 --quiet "Do the necessary changes to the codebase based on the users input.\nDon\'t ask any follow up questions.\n\nUser: test prompt"',
        expect.objectContaining({
          timeoutMs: 3600000,
        })
      );
    });

    it("should run codex command without model parameter when not specified", async () => {
      const configWithoutModel = { ...config };
      delete configWithoutModel.model;
      const agentWithoutModel = new CodexAgent(configWithoutModel);

      await agentWithoutModel.generateCode("test prompt");

      expect(mockSandbox.commands.run).toHaveBeenCalledWith(
        'cd hello-world && codex --approval-mode auto-edit --quiet "Do the necessary changes to the codebase based on the users input.\nDon\'t ask any follow up questions.\n\nUser: test prompt"',
        expect.objectContaining({
          timeoutMs: 3600000,
        })
      );
    });

    it("should call callbacks when provided", async () => {
      const callbacks: CodexStreamCallbacks = {
        onUpdate: vi.fn(),
        onError: vi.fn(),
      };

      await codexAgent.generateCode("test prompt", "code", [], callbacks);

      expect(callbacks.onUpdate).toHaveBeenCalledWith(
        '{"type": "start", "sandbox_id": "test-sandbox-id"}'
      );
      expect(callbacks.onUpdate).toHaveBeenCalledWith(
        '{"type": "git", "output": "Cloning repository: octocat/hello-world"}'
      );
      expect(callbacks.onUpdate).toHaveBeenCalledWith(
        expect.stringContaining('{"type": "end"')
      );
    });

    it("should handle existing sandbox correctly", async () => {
      const configWithSandboxId = {
        ...config,
        sandboxId: "existing-sandbox-id",
      };
      const agentWithExistingSandbox = new CodexAgent(configWithSandboxId);

      const callbacks: CodexStreamCallbacks = {
        onUpdate: vi.fn(),
      };

      await agentWithExistingSandbox.generateCode(
        "test prompt",
        "code",
        [],
        callbacks
      );

      expect(callbacks.onUpdate).toHaveBeenCalledWith(
        '{"type": "start", "sandbox_id": "existing-sandbox-id"}'
      );
      // Should not call git clone for existing sandbox
      expect(mockSandbox.commands.run).not.toHaveBeenCalledWith(
        expect.stringContaining("git clone"),
        expect.any(Object)
      );
    });

    it("should throw error when sandbox command fails", async () => {
      mockSandbox.commands.run.mockRejectedValue(new Error("Command failed"));

      await expect(codexAgent.generateCode("test prompt")).rejects.toThrow(
        "Failed to generate code: Command failed"
      );
    });

    it("should throw error when sandbox creation fails", async () => {
      MockedSandbox.create.mockRejectedValue(
        new Error("Sandbox creation failed")
      );

      await expect(codexAgent.generateCode("test prompt")).rejects.toThrow(
        "Failed to generate code: Sandbox creation failed"
      );
    });

    it("should instrument stream updates with opentelemetry spans", async () => {
      const mockSpan = { setAttribute: vi.fn(), end: vi.fn() };
      const mockTracer = { startActiveSpan: vi.fn((name, fn) => fn(mockSpan)) };
      const getTracerSpy = vi.spyOn(trace, "getTracer").mockReturnValue(
        mockTracer as any
      );

      const callbacks: CodexStreamCallbacks = { onUpdate: vi.fn() };
      mockSandbox.commands.run.mockImplementation(({ onStdout, onStderr }) => {
        onStdout("foo");
        onStderr("bar");
        return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
      });

      await codexAgent.generateCode("prompt", "code", [], callbacks);

      expect(getTracerSpy).toHaveBeenCalledWith("vibekit");
      expect(mockTracer.startActiveSpan).toHaveBeenCalledWith(
        "codex.stream.update",
        expect.any(Function)
      );
      expect(mockSpan.setAttribute).toHaveBeenCalledWith("message.length", 3);
      expect(mockSpan.end).toHaveBeenCalled();
      getTracerSpy.mockRestore();
    });

    it("should instrument errors with opentelemetry spans on error", async () => {
      const mockSpan = { setAttribute: vi.fn(), end: vi.fn() };
      const mockTracer = { startActiveSpan: vi.fn((name, fn) => fn(mockSpan)) };
      const getTracerSpy = vi.spyOn(trace, "getTracer").mockReturnValue(
        mockTracer as any
      );

      mockSandbox.commands.run.mockRejectedValue(new Error("fail"));
      const callbacks: CodexStreamCallbacks = { onError: vi.fn() };

      await expect(
        codexAgent.generateCode("prompt", "code", [], callbacks)
      ).rejects.toThrow("Failed to generate code: fail");

      expect(getTracerSpy).toHaveBeenCalledWith("vibekit");
      expect(mockTracer.startActiveSpan).toHaveBeenCalledWith(
        "codex.stream.error",
        expect.any(Function)
      );
      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        "error.message",
        "Failed to generate code: fail"
      );
      expect(callbacks.onError).toHaveBeenCalledWith(
        "Failed to generate code: fail"
      );
      getTracerSpy.mockRestore();
    });
  });
});
