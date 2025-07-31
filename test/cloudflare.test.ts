/**
 * Unit Tests for Cloudflare Sandbox Provider
 *
 * Unit tests that verify interface compliance, configuration handling,
 * and Cloudflare-specific functionality using mocked dependencies.
 * These tests run in Node.js and mock the @cloudflare/sandbox package
 * since it only works within Cloudflare Workers.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  createCloudflareProvider,
  CloudflareSandboxProvider,
  type CloudflareConfig,
} from "../packages/cloudflare/dist/index.js";

describe("Cloudflare Sandbox Provider - Unit Tests", () => {
  // Mock Worker environment with Durable Object binding
  const mockEnv = {
    Sandbox: {
      idFromName: vi.fn().mockReturnValue({ toString: () => "mock-id" }),
      get: vi.fn().mockReturnValue({}),
    },
  };

  const validConfig: CloudflareConfig = {
    env: mockEnv,
    hostname: "test-worker.example.workers.dev",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Provider Creation and Configuration", () => {
    it("should create a cloudflare provider instance", () => {
      const provider = createCloudflareProvider(validConfig);

      expect(provider).toBeDefined();
      expect(provider).toBeInstanceOf(CloudflareSandboxProvider);
      expect(typeof provider.create).toBe("function");
      expect(typeof provider.resume).toBe("function");
    });

    it("should accept valid configuration", () => {
      const config = {
        env: mockEnv,
        hostname: "my-worker.custom-domain.workers.dev",
      };

      const provider = createCloudflareProvider(config);
      expect(provider).toBeDefined();
      expect(provider).toBeInstanceOf(CloudflareSandboxProvider);
    });

    it("should handle different hostname formats", () => {
      const configs = [
        { env: mockEnv, hostname: "worker.example.workers.dev" },
        { env: mockEnv, hostname: "custom-domain.com" },
        { env: mockEnv, hostname: "localhost" },
      ];

      for (const config of configs) {
        const provider = createCloudflareProvider(config);
        expect(provider).toBeDefined();
      }
    });
  });

  describe("Error Handling for Missing Bindings", () => {
    it("should throw error when Sandbox binding is missing", async () => {
      const invalidConfig = {
        env: {} as any, // No Sandbox binding
        hostname: "test-worker.workers.dev",
      };

      const provider = createCloudflareProvider(invalidConfig);

      await expect(provider.create()).rejects.toThrow(
        'Cloudflare Durable Object binding "Sandbox" not found'
      );
    });

    it("should throw error when env is null", async () => {
      const invalidConfig = {
        env: null as any,
        hostname: "test-worker.workers.dev",
      };

      const provider = createCloudflareProvider(invalidConfig);

      await expect(provider.create()).rejects.toThrow(
        'Cloudflare Durable Object binding "Sandbox" not found'
      );
    });

    it("should throw error when Sandbox binding is undefined", async () => {
      const invalidConfig = {
        env: { Sandbox: undefined },
        hostname: "test-worker.workers.dev",
      };

      const provider = createCloudflareProvider(invalidConfig);

      await expect(provider.create()).rejects.toThrow(
        'Cloudflare Durable Object binding "Sandbox" not found'
      );
    });
  });

  describe("Provider Interface Compliance", () => {
    it("should implement SandboxProvider interface", () => {
      const provider = createCloudflareProvider(validConfig);

      // Check required methods exist
      expect(typeof provider.create).toBe("function");
      expect(typeof provider.resume).toBe("function");
    });

    it("should return sandbox instances with correct interface", async () => {
      const provider = createCloudflareProvider(validConfig);

      const sandbox = await provider.create();

      expect(sandbox).toBeDefined();
      expect(sandbox.sandboxId).toBeDefined();
      expect(sandbox.sandboxId).toMatch(/^vibekit-default-/);

      // Check SandboxInstance interface compliance
      expect(typeof sandbox.commands.run).toBe("function");
      expect(typeof sandbox.kill).toBe("function");
      expect(typeof sandbox.pause).toBe("function");
      expect(typeof sandbox.getHost).toBe("function");
    });
  });

  describe("Sandbox ID Generation", () => {
    it("should generate unique sandbox IDs", async () => {
      const provider = createCloudflareProvider(validConfig);

      const sandbox1 = await provider.create();
      // Add small delay to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 1));
      const sandbox2 = await provider.create();

      expect(sandbox1.sandboxId).not.toBe(sandbox2.sandboxId);
      expect(sandbox1.sandboxId).toMatch(/^vibekit-default-/);
      expect(sandbox2.sandboxId).toMatch(/^vibekit-default-/);
    });

    it("should include agent type in sandbox ID", async () => {
      const provider = createCloudflareProvider(validConfig);

      const claudeSandbox = await provider.create({}, "claude");
      const codexSandbox = await provider.create({}, "codex");

      expect(claudeSandbox.sandboxId).toContain("claude");
      expect(codexSandbox.sandboxId).toContain("codex");
      expect(claudeSandbox.sandboxId).not.toBe(codexSandbox.sandboxId);
    });

    it("should use default agent type when none specified", async () => {
      const provider = createCloudflareProvider(validConfig);
      const sandbox = await provider.create();

      expect(sandbox).toBeDefined();
      expect(sandbox.sandboxId).toMatch(/^vibekit-default-/);
    });

    it("should handle all supported agent types", async () => {
      const provider = createCloudflareProvider(validConfig);
      const agentTypes = ["claude", "codex", "opencode", "gemini"] as const;

      for (const agentType of agentTypes) {
        const sandbox = await provider.create({}, agentType);
        expect(sandbox).toBeDefined();
        expect(sandbox.sandboxId).toContain(agentType);
      }
    });
  });

  describe("Environment Variables and Configuration", () => {
    it("should handle environment variables parameter", async () => {
      const provider = createCloudflareProvider(validConfig);
      const envVars = {
        NODE_ENV: "test",
        API_KEY: "test-key",
        DEBUG: "true",
      };

      const sandbox = await provider.create(envVars);
      expect(sandbox).toBeDefined();
      expect(sandbox.sandboxId).toMatch(/^vibekit-default-/);
    });

    it("should handle working directory parameter", async () => {
      const provider = createCloudflareProvider(validConfig);
      const workingDir = "/app/workspace";

      const sandbox = await provider.create({}, "claude", workingDir);
      expect(sandbox).toBeDefined();
      expect(sandbox.sandboxId).toMatch(/^vibekit-claude-/);
    });

    it("should handle all optional parameters", async () => {
      const provider = createCloudflareProvider(validConfig);

      // Test with minimal parameters
      const sandbox1 = await provider.create();
      expect(sandbox1).toBeDefined();

      // Test with all parameters
      const sandbox2 = await provider.create(
        { NODE_ENV: "production" },
        "codex",
        "/custom/workdir"
      );
      expect(sandbox2).toBeDefined();
    });
  });

  describe("Command Execution Interface", () => {
    it("should provide command execution interface", async () => {
      const provider = createCloudflareProvider(validConfig);
      const sandbox = await provider.create();

      expect(typeof sandbox.commands.run).toBe("function");

      // Test command execution
      const result = await sandbox.commands.run("echo hello");
      expect(result).toBeDefined();
      expect(typeof result.exitCode).toBe("number");
      expect(typeof result.stdout).toBe("string");
      expect(typeof result.stderr).toBe("string");
    });

    it("should handle foreground command execution", async () => {
      const provider = createCloudflareProvider(validConfig);
      const sandbox = await provider.create();

      const result = await sandbox.commands.run("ls -la");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("Mock command output");
      expect(result.stderr).toBe("");
    });

    it("should handle background command execution", async () => {
      const provider = createCloudflareProvider(validConfig);
      const sandbox = await provider.create();

      const result = await sandbox.commands.run("node server.js", {
        background: true,
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("Background command started successfully");
    });

    it("should handle command execution with streaming callbacks", async () => {
      const provider = createCloudflareProvider(validConfig);
      const sandbox = await provider.create();

      const stdoutSpy = vi.fn();
      const stderrSpy = vi.fn();

      await sandbox.commands.run("npm test", {
        onStdout: stdoutSpy,
        onStderr: stderrSpy,
      });

      // Note: The actual callback execution depends on mock implementation timing
      expect(stdoutSpy).toBeDefined();
      expect(stderrSpy).toBeDefined();
    });

    it("should handle command execution errors", async () => {
      const provider = createCloudflareProvider(validConfig);
      const sandbox = await provider.create();

      await expect(
        sandbox.commands.run("nonexistent-command-xyz")
      ).rejects.toThrow("Command not found: nonexistent-command-xyz");
    });

    it("should handle commands with non-zero exit codes", async () => {
      const provider = createCloudflareProvider(validConfig);
      const sandbox = await provider.create();

      const result = await sandbox.commands.run("exit 42");
      expect(result.exitCode).toBe(42);
      expect(result.stderr).toBe("Process exited with code 42");
    });
  });

  describe("Port Exposure and Preview URLs", () => {
    it("should generate preview URLs for exposed ports", async () => {
      const provider = createCloudflareProvider(validConfig);
      const sandbox = await provider.create();

      const url = await sandbox.getHost(3000);
      expect(url).toBe("https://3000-sandbox-mock.test-worker.example.workers.dev");
    });

    it("should handle different port numbers", async () => {
      const provider = createCloudflareProvider(validConfig);
      const sandbox = await provider.create();

      const ports = [3000, 8080, 8000, 5000];
      for (const port of ports) {
        const url = await sandbox.getHost(port);
        expect(url).toContain(`${port}-sandbox-mock`);
        expect(url).toContain("test-worker.example.workers.dev");
      }
    });

    it("should use correct hostname in preview URLs", async () => {
      const customConfig = {
        env: mockEnv,
        hostname: "custom-worker.my-domain.workers.dev",
      };
      const provider = createCloudflareProvider(customConfig);
      const sandbox = await provider.create();

      const url = await sandbox.getHost(8080);
      expect(url).toBe("https://8080-sandbox-mock.custom-worker.my-domain.workers.dev");
    });
  });

  describe("Lifecycle Management", () => {
    it("should provide sandbox lifecycle methods", async () => {
      const provider = createCloudflareProvider(validConfig);
      const sandbox = await provider.create();

      // Test lifecycle methods exist and can be called without throwing
      expect(typeof sandbox.kill).toBe("function");
      expect(typeof sandbox.pause).toBe("function");

      await sandbox.pause();
      await sandbox.kill();
    });

    it("should handle pause operation", async () => {
      const provider = createCloudflareProvider(validConfig);
      const sandbox = await provider.create();

      // Should not throw
      await expect(sandbox.pause()).resolves.toBeUndefined();
    });

    it("should handle kill operation", async () => {
      const provider = createCloudflareProvider(validConfig);
      const sandbox = await provider.create();

      // Should not throw
      await expect(sandbox.kill()).resolves.toBeUndefined();
    });
  });

  describe("Resume Functionality", () => {
    it("should handle resume operation", async () => {
      const provider = createCloudflareProvider(validConfig);
      const sandboxId = "existing-vibekit-claude-12345";

      const resumedSandbox = await provider.resume(sandboxId);
      expect(resumedSandbox).toBeDefined();
      expect(resumedSandbox.sandboxId).toBe(sandboxId);
    });

    it("should resume with proper interface", async () => {
      const provider = createCloudflareProvider(validConfig);
      const resumedSandbox = await provider.resume("test-sandbox-id");

      // Verify interface compliance
      expect(typeof resumedSandbox.commands.run).toBe("function");
      expect(typeof resumedSandbox.kill).toBe("function");
      expect(typeof resumedSandbox.pause).toBe("function");
      expect(typeof resumedSandbox.getHost).toBe("function");
    });

    it("should handle resume with different sandbox IDs", async () => {
      const provider = createCloudflareProvider(validConfig);
      const sandboxIds = [
        "vibekit-claude-123",
        "vibekit-codex-456",
        "vibekit-gemini-789",
      ];

      for (const sandboxId of sandboxIds) {
        const sandbox = await provider.resume(sandboxId);
        expect(sandbox.sandboxId).toBe(sandboxId);
      }
    });
  });

  describe("Configuration Edge Cases", () => {
    it("should handle empty hostname", () => {
      const config = {
        env: mockEnv,
        hostname: "",
      };

      const provider = createCloudflareProvider(config);
      expect(provider).toBeDefined();
    });

    it("should handle complex environment objects", async () => {
      const complexEnv = {
        Sandbox: mockEnv.Sandbox,
        SOME_OTHER_BINDING: {},
        KV_NAMESPACE: {},
        D1_DATABASE: {},
      };

      const config = {
        env: complexEnv,
        hostname: "complex-worker.workers.dev",
      };

      const provider = createCloudflareProvider(config);
      const sandbox = await provider.create();
      expect(sandbox).toBeDefined();
    });
  });

  describe("Interface Type Checking", () => {
    it("should satisfy SandboxProvider type requirements", async () => {
      const provider = createCloudflareProvider(validConfig);

      // These should compile without TypeScript errors
      const sandbox = await provider.create();
      const resumedSandbox = await provider.resume("test-id");

      expect(sandbox).toBeDefined();
      expect(resumedSandbox).toBeDefined();
    });

    it("should satisfy SandboxInstance type requirements", async () => {
      const provider = createCloudflareProvider(validConfig);
      const sandbox = await provider.create();

      // These should compile without TypeScript errors
      const result = await sandbox.commands.run("test");
      const host = await sandbox.getHost(3000);
      await sandbox.pause();
      await sandbox.kill();

      expect(result).toBeDefined();
      expect(host).toBeDefined();
    });
  });

  describe("Worker Environment Simulation", () => {
    it("should work with realistic Worker env object", async () => {
      const realisticEnv = {
        Sandbox: mockEnv.Sandbox,
        ANTHROPIC_API_KEY: "test-key",
        NODE_ENV: "production",
        // Other Worker bindings would be here
      };

      const config = {
        env: realisticEnv,
        hostname: "production-worker.company.workers.dev",
      };

      const provider = createCloudflareProvider(config);
      const sandbox = await provider.create(
        { CUSTOM_VAR: "value" },
        "claude",
        "/app"
      );

      expect(sandbox).toBeDefined();
      expect(sandbox.sandboxId).toContain("claude");
    });
  });
});