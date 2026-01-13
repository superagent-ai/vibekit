/**
 * Integration Tests for E2B Sandbox Provider
 *
 * Tests the new createSandbox() API for the E2B sandbox provider.
 * Requires E2B_API_KEY environment variable.
 */

import { describe, it, expect, afterEach } from "vitest";
import {
  createSandbox,
  type E2BSandboxWithAgents,
} from "../packages/e2b/dist/index.js";
import { skipIfNoAPIKeys, skipTest } from "./helpers/test-utils.js";

describe("E2B Sandbox", () => {
  let sandbox: E2BSandboxWithAgents | null = null;

  afterEach(async () => {
    if (sandbox) {
      await sandbox.kill();
      sandbox = null;
    }
  });

  it("should create a sandbox with createSandbox()", async () => {
    if (skipIfNoAPIKeys(["E2B_API_KEY"])) {
      return skipTest();
    }

    sandbox = await createSandbox({
      apiKey: process.env.E2B_API_KEY!,
    });

    expect(sandbox).toBeDefined();
    expect(sandbox.sandboxId).toBeDefined();
  }, 60000);

  it("should have agent methods attached", async () => {
    if (skipIfNoAPIKeys(["E2B_API_KEY"])) {
      return skipTest();
    }

    sandbox = await createSandbox({
      apiKey: process.env.E2B_API_KEY!,
    });

    expect(typeof sandbox.claude).toBe("function");
    expect(typeof sandbox.codex).toBe("function");
    expect(typeof sandbox.gemini).toBe("function");
    expect(typeof sandbox.grok).toBe("function");
    expect(typeof sandbox.opencode).toBe("function");
  }, 60000);

  it("should execute commands with native E2B methods", async () => {
    if (skipIfNoAPIKeys(["E2B_API_KEY"])) {
      return skipTest();
    }

    sandbox = await createSandbox({
      apiKey: process.env.E2B_API_KEY!,
    });

    const result = await sandbox.commands.run("echo 'Hello from E2B'");

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Hello from E2B");
  }, 60000);

  it("should handle file operations with native E2B methods", async () => {
    if (skipIfNoAPIKeys(["E2B_API_KEY"])) {
      return skipTest();
    }

    sandbox = await createSandbox({
      apiKey: process.env.E2B_API_KEY!,
    });

    const testContent = "Hello, E2B!";
    const testPath = "/tmp/test-file.txt";

    await sandbox.files.write(testPath, testContent);
    const content = await sandbox.files.read(testPath);

    expect(content).toBe(testContent);
  }, 60000);

  it("should support custom configuration options", async () => {
    if (skipIfNoAPIKeys(["E2B_API_KEY"])) {
      return skipTest();
    }

    sandbox = await createSandbox({
      apiKey: process.env.E2B_API_KEY!,
      template: "base",
      timeoutMs: 3600000,
    });

    expect(sandbox).toBeDefined();
    expect(sandbox.sandboxId).toBeDefined();
  }, 60000);

  it("should get host URL for ports", async () => {
    if (skipIfNoAPIKeys(["E2B_API_KEY"])) {
      return skipTest();
    }

    sandbox = await createSandbox({
      apiKey: process.env.E2B_API_KEY!,
    });

    const host = sandbox.getHost(3000);

    expect(host).toBeDefined();
    expect(typeof host).toBe("string");
  }, 60000);

  it("should clean up with kill()", async () => {
    if (skipIfNoAPIKeys(["E2B_API_KEY"])) {
      return skipTest();
    }

    const tempSandbox = await createSandbox({
      apiKey: process.env.E2B_API_KEY!,
    });

    expect(tempSandbox).toBeDefined();
    await expect(tempSandbox.kill()).resolves.not.toThrow();
  }, 60000);
});
