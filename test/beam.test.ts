/**
 * Integration Tests for Beam Sandbox Provider
 *
 * Tests the new createSandbox() API for the Beam sandbox provider.
 * Requires BEAM_TOKEN and BEAM_WORKSPACE_ID environment variables.
 */

import { describe, it, expect, afterEach } from "vitest";
import { createSandbox, type BeamSandboxWithAgents } from "../packages/beam/dist/index.js";
import { skipIfNoBeamKeys, skipTest } from "./helpers/test-utils.js";

describe("Beam Sandbox", () => {
  let sandbox: BeamSandboxWithAgents | null = null;

  afterEach(async () => {
    if (sandbox) {
      await sandbox.close();
      sandbox = null;
    }
  });

  it("should create a sandbox with createSandbox()", async () => {
    if (skipIfNoBeamKeys()) {
      return skipTest();
    }

    sandbox = await createSandbox({
      token: process.env.BEAM_API_KEY!,
      workspaceId: process.env.BEAM_WORKSPACE_ID!,
    });

    expect(sandbox).toBeDefined();
    expect(typeof sandbox.close).toBe("function");
  }, 60000);

  it("should have agent methods attached", async () => {
    if (skipIfNoBeamKeys()) {
      return skipTest();
    }

    sandbox = await createSandbox({
      token: process.env.BEAM_API_KEY!,
      workspaceId: process.env.BEAM_WORKSPACE_ID!,
    });

    expect(typeof sandbox.claude).toBe("function");
    expect(typeof sandbox.codex).toBe("function");
    expect(typeof sandbox.gemini).toBe("function");
    expect(typeof sandbox.grok).toBe("function");
    expect(typeof sandbox.opencode).toBe("function");
  }, 60000);

  it("should execute commands with process.startAndWait()", async () => {
    if (skipIfNoBeamKeys()) {
      return skipTest();
    }

    sandbox = await createSandbox({
      token: process.env.BEAM_API_KEY!,
      workspaceId: process.env.BEAM_WORKSPACE_ID!,
    });

    const result = await sandbox.exec("bash", "-c", "echo 'Hello from Beam'");
    const exitCode = await result.wait();
    const stdout = await result.stdout.read();

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Hello from Beam");
  }, 60000);

  it("should support custom configuration options", async () => {
    if (skipIfNoBeamKeys()) {
      return skipTest();
    }

    sandbox = await createSandbox({
      token: process.env.BEAM_TOKEN!,
      workspaceId: process.env.BEAM_WORKSPACE_ID!,
      cpu: 2,
      memory: "1Gi",
      keepWarmSeconds: 300,
      envs: {
        TEST_VAR: "test_value",
      },
    });

    expect(sandbox).toBeDefined();
  }, 60000);

  it("should clean up with close()", async () => {
    if (skipIfNoBeamKeys()) {
      return skipTest();
    }

    const tempSandbox = await createSandbox({
      token: process.env.BEAM_API_KEY!,
      workspaceId: process.env.BEAM_WORKSPACE_ID!,
    });

    expect(tempSandbox).toBeDefined();
    await expect(tempSandbox.close()).resolves.not.toThrow();
  }, 60000);
});
