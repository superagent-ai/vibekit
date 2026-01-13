/**
 * Integration Tests for Blaxel Sandbox Provider
 *
 * Tests the new createSandbox() API for the Blaxel sandbox provider.
 * Requires BL_API_KEY and BL_WORKSPACE environment variables.
 */

import { describe, it, expect, afterEach } from "vitest";
import { createSandbox, type BlaxelSandboxWithAgents } from "../packages/blaxel/dist/index.js";
import { skipIfNoBlaxelKeys, skipTest } from "./helpers/test-utils.js";

describe("Blaxel Sandbox", () => {
  let sandbox: BlaxelSandboxWithAgents | null = null;

  afterEach(async () => {
    if (sandbox) {
      await sandbox.close();
      sandbox = null;
    }
  });

  it("should create a sandbox with createSandbox()", async () => {
    if (skipIfNoBlaxelKeys()) {
      return skipTest();
    }

    sandbox = await createSandbox({
      workspace: process.env.BL_WORKSPACE,
      apiKey: process.env.BL_API_KEY,
      image: "blaxel/vibekit-codex",
    });

    expect(sandbox).toBeDefined();
    expect(sandbox.sandboxId).toBeDefined();
    expect(typeof sandbox.close).toBe("function");
  }, 60000);

  it("should have agent methods attached", async () => {
    if (skipIfNoBlaxelKeys()) {
      return skipTest();
    }

    sandbox = await createSandbox({
      workspace: process.env.BL_WORKSPACE,
      apiKey: process.env.BL_API_KEY,
    });

    expect(typeof sandbox.claude).toBe("function");
    expect(typeof sandbox.codex).toBe("function");
    expect(typeof sandbox.gemini).toBe("function");
    expect(typeof sandbox.grok).toBe("function");
    expect(typeof sandbox.opencode).toBe("function");
  }, 60000);

  it("should execute commands via process interface", async () => {
    if (skipIfNoBlaxelKeys()) {
      return skipTest();
    }

    sandbox = await createSandbox({
      workspace: process.env.BL_WORKSPACE,
      apiKey: process.env.BL_API_KEY,
    });

    const result = await sandbox.process.exec({
      command: "echo 'Hello from Blaxel'",
      waitForCompletion: true,
    });

    expect(result.exitCode).toBe(0);
  }, 60000);

  it("should support custom configuration options", async () => {
    if (skipIfNoBlaxelKeys()) {
      return skipTest();
    }

    sandbox = await createSandbox({
      workspace: process.env.BL_WORKSPACE,
      apiKey: process.env.BL_API_KEY,
      image: "blaxel/vibekit-claude",
      memory: 4096,
      ttl: "1h",
      envs: {
        TEST_VAR: "test_value",
      },
    });

    expect(sandbox).toBeDefined();
    expect(sandbox.sandboxId).toBeDefined();
  }, 60000);

  it("should clean up with close()", async () => {
    if (skipIfNoBlaxelKeys()) {
      return skipTest();
    }

    const tempSandbox = await createSandbox({
      workspace: process.env.BL_WORKSPACE,
      apiKey: process.env.BL_API_KEY,
    });

    expect(tempSandbox).toBeDefined();
    await expect(tempSandbox.close()).resolves.not.toThrow();
  }, 60000);
});
