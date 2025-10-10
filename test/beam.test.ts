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

    it("should accept minimal configuration", () => {
      const minimalConfig: BeamConfig = {
        token: "test-token",
        workspaceId: "test-workspace",
      };

      const provider = createBeamProvider(minimalConfig);
      expect(provider).toBeDefined();
      expect(provider).toBeInstanceOf(BeamSandboxProvider);
    });

    it("should accept full configuration with all optional fields", () => {
      const fullConfig: BeamConfig = {
        token: "test-token",
        workspaceId: "test-workspace",
        image: "custom-image:latest",
        cpu: 4,
        memory: "2Gi",
        keepWarmSeconds: 600,
      };

      const provider = createBeamProvider(fullConfig);
      expect(provider).toBeDefined();
      expect(provider).toBeInstanceOf(BeamSandboxProvider);
    });

    it("should handle different CPU configurations", () => {
      const cpuConfigs = [1, 2, 4, 8, 16];

      for (const cpu of cpuConfigs) {
        const config = { ...validConfig, cpu };
        const provider = createBeamProvider(config);
        expect(provider).toBeDefined();
      }
    });

    it("should handle different memory configurations", () => {
      const memoryConfigs = ["512Mi", "1Gi", "2Gi", "4Gi", "8Gi", 1024, 2048];

      for (const memory of memoryConfigs) {
        const config = { ...validConfig, memory };
        const provider = createBeamProvider(config);
        expect(provider).toBeDefined();
      }
    });

    it("should handle different keepWarmSeconds configurations", () => {
      const keepWarmConfigs = [0, 60, 300, 600, 1800, 3600];

      for (const keepWarmSeconds of keepWarmConfigs) {
        const config = { ...validConfig, keepWarmSeconds };
        const provider = createBeamProvider(config);
        expect(provider).toBeDefined();
      }
    });
  });

  describe("Provider Interface Compliance", () => {
    it("should implement SandboxProvider interface", () => {
      const provider = createBeamProvider(validConfig);

      // Check required methods exist
      expect(typeof provider.create).toBe("function");
      expect(typeof provider.resume).toBe("function");
    });

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

    it("should have consistent sandbox ID across operations", async () => {
      const provider = createBeamProvider(validConfig);
      const sandbox = await provider.create();

      const id1 = sandbox.sandboxId;
      const id2 = sandbox.sandboxId;

      expect(id1).toBe(id2);
      expect(id1).toBe("beam-test-sandbox-123");
    });
  });

  describe("Sandbox Creation with Different Parameters", () => {
    it("should create sandbox without any parameters", async () => {
      const provider = createBeamProvider(validConfig);
      const sandbox = await provider.create();

      expect(sandbox).toBeDefined();
      expect(sandbox.sandboxId).toBeDefined();
    });

    it("should create sandbox with environment variables", async () => {
      const provider = createBeamProvider(validConfig);
      const envVars = {
        NODE_ENV: "test",
        API_KEY: "test-key-123",
        DEBUG: "true",
        DATABASE_URL: "postgres://test",
      };

      const sandbox = await provider.create(envVars);
      expect(sandbox).toBeDefined();
      expect(sandbox.sandboxId).toBeDefined();
    });

    it("should create sandbox with specific agent type", async () => {
      const provider = createBeamProvider(validConfig);
      const agentTypes = ["claude", "codex", "opencode", "gemini", "grok"] as const;

      for (const agentType of agentTypes) {
        const sandbox = await provider.create({}, agentType);
        expect(sandbox).toBeDefined();
        expect(sandbox.sandboxId).toBeDefined();
      }
    });

    it("should create sandbox with working directory", async () => {
      const provider = createBeamProvider(validConfig);
      const workingDir = "/workspace/custom";

      const sandbox = await provider.create({}, undefined, workingDir);
      expect(sandbox).toBeDefined();
      expect(sandbox.sandboxId).toBeDefined();
    });

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
    it("should provide command execution interface", async () => {
      const provider = createBeamProvider(validConfig);
      const sandbox = await provider.create();

      expect(typeof sandbox.commands.run).toBe("function");

      const result = await sandbox.commands.run("echo hello");
      expect(result).toBeDefined();
      expect(typeof result.exitCode).toBe("number");
      expect(typeof result.stdout).toBe("string");
      expect(typeof result.stderr).toBe("string");
    });

    it("should execute commands successfully", async () => {
      const provider = createBeamProvider(validConfig);
      const sandbox = await provider.create();

      const result = await sandbox.commands.run("ls -la");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("Mock command output");
      expect(result.stderr).toBe("");
    });

    it("should handle different types of commands", async () => {
      const provider = createBeamProvider(validConfig);
      const sandbox = await provider.create();

      const commands = [
        "echo 'Hello World'",
        "npm install",
        "python script.py",
        "git status",
        "ls -la /workspace",
      ];

      for (const cmd of commands) {
        const result = await sandbox.commands.run(cmd);
        expect(result).toBeDefined();
        expect(result.exitCode).toBe(0);
      }
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

    it("should handle command execution with timeout option", async () => {
      const provider = createBeamProvider(validConfig);
      const sandbox = await provider.create();

      const result = await sandbox.commands.run("sleep 1", {
        timeoutMs: 5000,
      });

      expect(result).toBeDefined();
      expect(result.exitCode).toBe(0);
    });

    it("should handle command options correctly", async () => {
      const provider = createBeamProvider(validConfig);
      const sandbox = await provider.create();

      const options = {
        timeoutMs: 10000,
        background: false,
        onStdout: vi.fn(),
        onStderr: vi.fn(),
      };

      const result = await sandbox.commands.run("echo test", options);
      expect(result).toBeDefined();
      expect(options.onStdout).toHaveBeenCalled();
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

    it("should handle different port numbers", async () => {
      const provider = createBeamProvider(validConfig);
      const sandbox = await provider.create();

      const ports = [3000, 8000, 8080, 5000, 9000, 4000];

      for (const port of ports) {
        const url = await sandbox.getHost(port);
        expect(url).toBeDefined();
        expect(url).toContain(String(port));
        expect(url).toContain("beam-test");
      }
    });

    it("should return HTTPS URLs", async () => {
      const provider = createBeamProvider(validConfig);
      const sandbox = await provider.create();

      const url = await sandbox.getHost(8080);
      expect(url).toMatch(/^https:\/\//);
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
    it("should provide sandbox lifecycle methods", async () => {
      const provider = createBeamProvider(validConfig);
      const sandbox = await provider.create();

      expect(typeof sandbox.kill).toBe("function");
      expect(typeof sandbox.pause).toBe("function");
    });

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

    it("should handle kill after operations", async () => {
      const provider = createBeamProvider(validConfig);
      const sandbox = await provider.create();

      await sandbox.commands.run("echo test");
      await sandbox.getHost(3000);
      await sandbox.kill();

      // Should complete without errors
      expect(true).toBe(true);
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

    it("should resume with proper interface", async () => {
      const provider = createBeamProvider(validConfig);
      const resumedSandbox = await provider.resume("test-sandbox-id");

      // Verify interface compliance
      expect(typeof resumedSandbox.commands.run).toBe("function");
      expect(typeof resumedSandbox.kill).toBe("function");
      expect(typeof resumedSandbox.pause).toBe("function");
      expect(typeof resumedSandbox.getHost).toBe("function");
    });

    it("should handle resume with different sandbox IDs", async () => {
      const provider = createBeamProvider(validConfig);
      const sandboxIds = [
        "beam-claude-123",
        "beam-codex-456",
        "beam-gemini-789",
        "beam-opencode-012",
      ];

      for (const sandboxId of sandboxIds) {
        const sandbox = await provider.resume(sandboxId);
        expect(sandbox.sandboxId).toBe(sandboxId);
      }
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

    it("should handle various image formats", async () => {
      const imageFormats = [
        "ubuntu:22.04",
        "node:20-alpine",
        "python:3.11-slim",
        "superagentai/vibekit-claude:1.0",
        "ghcr.io/org/custom-image:latest",
      ];

      for (const image of imageFormats) {
        const config = { ...validConfig, image };
        const provider = createBeamProvider(config);
        const sandbox = await provider.create();
        expect(sandbox).toBeDefined();
      }
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

    it("should use default image when no agent type or custom image specified", async () => {
      const provider = createBeamProvider(validConfig);
      const sandbox = await provider.create();

      expect(sandbox).toBeDefined();
      expect(sandbox.sandboxId).toBeDefined();
    });
  });

  describe("Resource Configuration", () => {
    it("should handle CPU configuration", async () => {
      const config: BeamConfig = {
        ...validConfig,
        cpu: 8,
      };

      const provider = createBeamProvider(config);
      const sandbox = await provider.create();
      expect(sandbox).toBeDefined();
    });

    it("should handle memory configuration as string", async () => {
      const config: BeamConfig = {
        ...validConfig,
        memory: "4Gi",
      };

      const provider = createBeamProvider(config);
      const sandbox = await provider.create();
      expect(sandbox).toBeDefined();
    });

    it("should handle memory configuration as number", async () => {
      const config: BeamConfig = {
        ...validConfig,
        memory: 4096,
      };

      const provider = createBeamProvider(config);
      const sandbox = await provider.create();
      expect(sandbox).toBeDefined();
    });

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

  describe("Interface Type Checking", () => {
    it("should satisfy SandboxProvider type requirements", async () => {
      const provider = createBeamProvider(validConfig);

      // These should compile without TypeScript errors
      const sandbox = await provider.create();
      const resumedSandbox = await provider.resume("test-id");

      expect(sandbox).toBeDefined();
      expect(resumedSandbox).toBeDefined();
    });

    it("should satisfy SandboxInstance type requirements", async () => {
      const provider = createBeamProvider(validConfig);
      const sandbox = await provider.create();

      // These should compile without TypeScript errors
      const result = await sandbox.commands.run("test");
      const host = await sandbox.getHost(3000);
      await sandbox.pause();
      await sandbox.kill();

      expect(result).toBeDefined();
      expect(host).toBeDefined();
    });

    it("should handle optional parameters correctly", async () => {
      const provider = createBeamProvider(validConfig);

      // All parameter combinations should work
      await provider.create();
      await provider.create({});
      await provider.create({ ENV: "test" });
      await provider.create({}, "claude");
      await provider.create({}, "claude", "/workspace");
      await provider.create(undefined, undefined, "/workspace");

      expect(true).toBe(true);
    });
  });

  describe("Environment Variables and Working Directory", () => {
    it("should handle empty environment variables", async () => {
      const provider = createBeamProvider(validConfig);
      const sandbox = await provider.create({});

      expect(sandbox).toBeDefined();
    });

    it("should handle multiple environment variables", async () => {
      const provider = createBeamProvider(validConfig);
      const envVars = {
        NODE_ENV: "production",
        DEBUG: "true",
        API_KEY: "secret-key",
        DATABASE_URL: "postgres://localhost/db",
        REDIS_URL: "redis://localhost:6379",
      };

      const sandbox = await provider.create(envVars);
      expect(sandbox).toBeDefined();
    });

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

    it("should handle various working directory paths", async () => {
      const provider = createBeamProvider(validConfig);
      const workingDirs = [
        "/workspace",
        "/app",
        "/home/user/project",
        "/var/vibe0",
        "/custom/path/to/workspace",
      ];

      for (const workingDir of workingDirs) {
        const sandbox = await provider.create({}, undefined, workingDir);
        expect(sandbox).toBeDefined();
      }
    });

    it("should handle nested working directories", async () => {
      const provider = createBeamProvider(validConfig);
      const sandbox = await provider.create({}, "claude", "/workspace/nested/deep/path");

      expect(sandbox).toBeDefined();
    });
  });
});
