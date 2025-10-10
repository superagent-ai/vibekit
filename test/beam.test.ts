/**
 * Unit Tests for Beam Sandbox Provider
 *
 * Unit tests that verify interface compliance, configuration handling,
 * and Beam-specific functionality using mocked dependencies.
 * These tests run without requiring actual Beam credentials.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the @beamcloud/beam-js module before importing our provider
vi.mock("@beamcloud/beam-js", () => {
  const createMockSandboxInstance = () => ({
    sandboxId: "beam-test-sandbox-123",
    exec: vi.fn().mockImplementation(async () => {
      return {
        wait: vi.fn().mockResolvedValue(0),
        stdout: {
          read: vi.fn().mockResolvedValue("Mock command output"),
        },
        stderr: {
          read: vi.fn().mockResolvedValue(""),
        },
        kill: vi.fn().mockResolvedValue(undefined),
        status: vi.fn().mockResolvedValue([0, "completed"]),
      };
    }),
    terminate: vi.fn().mockResolvedValue(true),
    exposePort: vi.fn().mockImplementation(async (port: number) => {
      return `https://beam-test-${port}.sandbox.beam.cloud`;
    }),
    updateTtl: vi.fn().mockResolvedValue(undefined),
    runCode: vi.fn().mockResolvedValue({ result: "Mock python output" }),
  });

  const MockSandbox = vi.fn().mockImplementation(() => ({
    create: vi.fn().mockResolvedValue(createMockSandboxInstance()),
  }));

  // Add static connect method directly to MockSandbox
  (MockSandbox as any).connect = vi.fn().mockImplementation(async (id: string) => ({
    ...createMockSandboxInstance(),
    sandboxId: id,
  }));

  const MockImage = vi.fn().mockImplementation(() => ({}));

  return {
    beamOpts: {
      token: "",
      workspaceId: "",
      gatewayUrl: "https://app.beam.cloud",
    },
    Sandbox: MockSandbox,
    Image: MockImage,
    SandboxInstance: vi.fn(),
  };
});

import {
  createBeamProvider,
  BeamSandboxProvider,
  type BeamConfig,
} from "../packages/beam/dist/index.js";

describe("Beam Sandbox Provider - Unit Tests", () => {
  const validConfig: BeamConfig = {
    token: "test-beam-token",
    workspaceId: "test-workspace-id",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Provider Creation and Configuration", () => {
    it("should create a beam provider instance", () => {
      const provider = createBeamProvider(validConfig);

      expect(provider).toBeDefined();
      expect(provider).toBeInstanceOf(BeamSandboxProvider);
      expect(typeof provider.create).toBe("function");
      expect(typeof provider.resume).toBe("function");
    });

    it("should support minimal and full configuration", () => {
      const minimalConfig: BeamConfig = {
        token: "test-token",
        workspaceId: "test-workspace",
      };
      const fullConfig: BeamConfig = {
        token: "test-token",
        workspaceId: "test-workspace",
        image: "custom-image:latest",
        cpu: 4,
        memory: "2Gi",
        keepWarmSeconds: 600,
      };

      const minimal = createBeamProvider(minimalConfig);
      const full = createBeamProvider(fullConfig);

      expect(minimal).toBeDefined();
      expect(full).toBeDefined();
      expect(minimal).toBeInstanceOf(BeamSandboxProvider);
      expect(full).toBeInstanceOf(BeamSandboxProvider);
    });
  });

  describe("Provider Interface Compliance", () => {
    it("should return sandbox instances with correct interface", async () => {
      const provider = createBeamProvider(validConfig);
      const sandbox = await provider.create();

      expect(sandbox).toBeDefined();
      expect(sandbox.sandboxId).toBeDefined();
      expect(typeof sandbox.sandboxId).toBe("string");
      expect(sandbox.sandboxId).toBe("beam-test-sandbox-123");

      // Check SandboxInstance interface compliance
      expect(typeof sandbox.commands.run).toBe("function");
      expect(typeof sandbox.kill).toBe("function");
      expect(typeof sandbox.pause).toBe("function");
      expect(typeof sandbox.getHost).toBe("function");
    });

  });

  describe("Sandbox Creation with Different Parameters", () => {
    it("should create sandbox with all parameters", async () => {
      const provider = createBeamProvider(validConfig);
      const envVars = { NODE_ENV: "production", API_KEY: "prod-key" };
      const agentType = "claude";
      const workingDir = "/app/workspace";

      const sandbox = await provider.create(envVars, agentType, workingDir);
      expect(sandbox).toBeDefined();
      expect(sandbox.sandboxId).toBeDefined();
    });
  });

  describe("Command Execution Interface", () => {
    it("should execute commands successfully", async () => {
      const provider = createBeamProvider(validConfig);
      const sandbox = await provider.create();

      const result = await sandbox.commands.run("ls -la");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("Mock command output");
      expect(result.stderr).toBe("");
    });

    it("should handle background command execution", async () => {
      const provider = createBeamProvider(validConfig);
      const sandbox = await provider.create();

      const result = await sandbox.commands.run("node server.js", {
        background: true,
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("Background command started successfully");
      expect(result.stderr).toBe("");
    });

    it("should support streaming callbacks for stdout", async () => {
      const provider = createBeamProvider(validConfig);
      const sandbox = await provider.create();

      const stdoutSpy = vi.fn();
      const stderrSpy = vi.fn();

      const result = await sandbox.commands.run("npm test", {
        onStdout: stdoutSpy,
        onStderr: stderrSpy,
      });

      expect(result).toBeDefined();
      expect(stdoutSpy).toHaveBeenCalled();
      expect(stdoutSpy).toHaveBeenCalledWith("Mock command output");
    });
  });

  describe("Port Exposure and URLs", () => {
    it("should expose ports and return URLs", async () => {
      const provider = createBeamProvider(validConfig);
      const sandbox = await provider.create();

      const url = await sandbox.getHost(3000);
      expect(url).toBeDefined();
      expect(typeof url).toBe("string");
      expect(url).toBe("https://beam-test-3000.sandbox.beam.cloud");
    });

    it("should handle sequential port exposures", async () => {
      const provider = createBeamProvider(validConfig);
      const sandbox = await provider.create();

      const url1 = await sandbox.getHost(3000);
      const url2 = await sandbox.getHost(8080);
      const url3 = await sandbox.getHost(5000);

      expect(url1).not.toBe(url2);
      expect(url2).not.toBe(url3);
      expect(url1).toContain("3000");
      expect(url2).toContain("8080");
      expect(url3).toContain("5000");
    });
  });

  describe("Lifecycle Management", () => {
    it("should terminate sandbox successfully", async () => {
      const provider = createBeamProvider(validConfig);
      const sandbox = await provider.create();

      await expect(sandbox.kill()).resolves.toBeUndefined();
    });

    it("should handle pause operation", async () => {
      const provider = createBeamProvider(validConfig);
      const sandbox = await provider.create();

      // Pause is not directly supported in Beam, but should not throw
      await expect(sandbox.pause()).resolves.toBeUndefined();
    });
  });

  describe("Resume Functionality", () => {
    it("should resume existing sandbox by ID", async () => {
      const provider = createBeamProvider(validConfig);
      const sandboxId = "existing-beam-sandbox-456";

      const resumedSandbox = await provider.resume(sandboxId);
      expect(resumedSandbox).toBeDefined();
      expect(resumedSandbox.sandboxId).toBe(sandboxId);
    });

    it("should allow operations on resumed sandbox", async () => {
      const provider = createBeamProvider(validConfig);
      const resumedSandbox = await provider.resume("test-resume-id");

      const result = await resumedSandbox.commands.run("ls");
      expect(result).toBeDefined();
      expect(result.exitCode).toBe(0);

      const url = await resumedSandbox.getHost(3000);
      expect(url).toBeDefined();
    });
  });

  describe("Error Handling", () => {
    it("should handle command execution errors gracefully", async () => {
      const provider = createBeamProvider(validConfig);
      const sandbox = await provider.create();

      // Mock an error scenario
      const mockError = new Error("Command execution failed");
      (sandbox as any).beamInstance.exec = vi.fn().mockRejectedValue(mockError);

      const result = await sandbox.commands.run("failing-command");
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Command execution failed");
    });

    it("should call error callbacks when provided", async () => {
      const provider = createBeamProvider(validConfig);
      const sandbox = await provider.create();

      const mockError = new Error("Test error");
      (sandbox as any).beamInstance.exec = vi.fn().mockRejectedValue(mockError);

      const stderrSpy = vi.fn();
      const result = await sandbox.commands.run("error-command", {
        onStderr: stderrSpy,
      });

      expect(result.exitCode).toBe(1);
      expect(stderrSpy).toHaveBeenCalled();
    });
  });

  describe("Custom Image Configuration", () => {
    it("should use custom image when specified", async () => {
      const customConfig: BeamConfig = {
        ...validConfig,
        image: "my-custom-image:v1.0.0",
      };

      const provider = createBeamProvider(customConfig);
      const sandbox = await provider.create();

      expect(sandbox).toBeDefined();
      expect(sandbox.sandboxId).toBeDefined();
    });

    it("should use agent-specific images when agent type provided", async () => {
      const provider = createBeamProvider(validConfig);
      const agentTypes: Array<"claude" | "codex" | "opencode" | "gemini" | "grok"> = [
        "claude",
        "codex",
        "opencode",
        "gemini",
        "grok",
      ];

      for (const agentType of agentTypes) {
        const sandbox = await provider.create({}, agentType);
        expect(sandbox).toBeDefined();
        expect(sandbox.sandboxId).toBeDefined();
      }
    });
  });

  describe("Resource Configuration", () => {
    it("should handle combined resource configuration", async () => {
      const config: BeamConfig = {
        ...validConfig,
        cpu: 4,
        memory: "2Gi",
        keepWarmSeconds: 600,
      };

      const provider = createBeamProvider(config);
      const sandbox = await provider.create();
      expect(sandbox).toBeDefined();
    });
  });

  // Runtime tests cannot validate TypeScript compile-time types; redundant block removed.

  describe("Environment Variables and Working Directory", () => {
    it("should handle environment variables with special characters", async () => {
      const provider = createBeamProvider(validConfig);
      const envVars = {
        API_KEY: "key-with-dashes-123",
        DB_URL: "postgres://user:pass@host:5432/db",
        PATH: "/usr/local/bin:/usr/bin:/bin",
      };

      const sandbox = await provider.create(envVars);
      expect(sandbox).toBeDefined();
    });

    it("should handle nested working directories", async () => {
      const provider = createBeamProvider(validConfig);
      const sandbox = await provider.create({}, "claude", "/workspace/nested/deep/path");

      expect(sandbox).toBeDefined();
    });
  });
});
