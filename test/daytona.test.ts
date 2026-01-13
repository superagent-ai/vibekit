/**
 * Integration Tests for Daytona Sandbox Provider
 *
 * Tests the new createSandbox() API for the Daytona sandbox provider.
 * Requires DAYTONA_API_KEY environment variable.
 */

import { describe, it, expect, afterEach } from "vitest";
import {
  createSandbox,
  type DaytonaSandboxWithAgents,
} from "../packages/daytona/dist/index.js";
import { skipIfNoDaytonaKeys, skipTest } from "./helpers/test-utils.js";

describe("Daytona Sandbox", () => {
  let sandbox: DaytonaSandboxWithAgents | null = null;

  afterEach(async () => {
    if (sandbox) {
      await sandbox.close();
      sandbox = null;
    }
  });

  it("should create a sandbox with createSandbox()", async () => {
    if (skipIfNoDaytonaKeys()) {
      return skipTest();
    }

    sandbox = await createSandbox({
      apiKey: process.env.DAYTONA_API_KEY!,
    });

    expect(sandbox).toBeDefined();
    expect(sandbox.sandboxId).toBeDefined();
    expect(typeof sandbox.close).toBe("function");
  }, 120000);

  it("should have agent methods attached", async () => {
    if (skipIfNoDaytonaKeys()) {
      return skipTest();
    }

    sandbox = await createSandbox({
      apiKey: process.env.DAYTONA_API_KEY!,
    });

    expect(typeof sandbox.claude).toBe("function");
    expect(typeof sandbox.codex).toBe("function");
    expect(typeof sandbox.gemini).toBe("function");
    expect(typeof sandbox.grok).toBe("function");
    expect(typeof sandbox.opencode).toBe("function");
  }, 120000);

  it("should support custom configuration options", async () => {
    if (skipIfNoDaytonaKeys()) {
      return skipTest();
    }

    sandbox = await createSandbox({
      apiKey: process.env.DAYTONA_API_KEY!,
      image: "ubuntu:22.04",
      serverUrl: process.env.DAYTONA_SERVER_URL || "https://app.daytona.io/api",
      envs: {
        TEST_VAR: "test_value",
      },
    });

    expect(sandbox).toBeDefined();
    expect(sandbox.sandboxId).toBeDefined();
  }, 120000);

  it("should execute commands via native workspace methods", async () => {
    if (skipIfNoDaytonaKeys()) {
      return skipTest();
    }

    sandbox = await createSandbox({
      apiKey: process.env.DAYTONA_API_KEY!,
    });

    // Daytona uses the workspace.process interface from the SDK
    expect(sandbox.process).toBeDefined();
  }, 120000);

  it("should handle file operations", async () => {
    if (skipIfNoDaytonaKeys()) {
      return skipTest();
    }

    sandbox = await createSandbox({
      apiKey: process.env.DAYTONA_API_KEY!,
    });

    // Daytona uses the workspace.fs interface from the SDK
    expect(sandbox.fs).toBeDefined();
  }, 120000);

  it("should clean up with close()", async () => {
    if (skipIfNoDaytonaKeys()) {
      return skipTest();
    }

    const tempSandbox = await createSandbox({
      apiKey: process.env.DAYTONA_API_KEY!,
    });

    expect(tempSandbox).toBeDefined();
    await expect(tempSandbox.close()).resolves.not.toThrow();
  }, 120000);
});
