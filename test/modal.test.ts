/**
 * Integration Tests for Modal Sandbox Provider
 *
 * Tests the new createSandbox() API for the Modal sandbox provider.
 * Requires Modal CLI authentication (modal token set).
 */

import { describe, it, expect, afterEach } from "vitest";
import { createSandbox, type ModalSandboxWithAgents } from "../packages/modal/dist/index.js";
import { skipIfNoModalKeys, skipTest } from "./helpers/test-utils.js";

describe("Modal Sandbox", () => {
  let sandbox: ModalSandboxWithAgents | null = null;

  afterEach(async () => {
    if (sandbox) {
      await sandbox.close();
      sandbox = null;
    }
  });

  it("should create a sandbox with createSandbox()", async () => {
    if (skipIfNoModalKeys()) {
      return skipTest();
    }

    sandbox = await createSandbox({
      image: "ubuntu:22.04",
    });

    expect(sandbox).toBeDefined();
    expect(sandbox.sandboxId).toBeDefined();
    expect(typeof sandbox.close).toBe("function");
  }, 120000);

  it("should have agent methods attached", async () => {
    if (skipIfNoModalKeys()) {
      return skipTest();
    }

    sandbox = await createSandbox({});

    expect(typeof sandbox.claude).toBe("function");
    expect(typeof sandbox.codex).toBe("function");
    expect(typeof sandbox.gemini).toBe("function");
    expect(typeof sandbox.grok).toBe("function");
    expect(typeof sandbox.opencode).toBe("function");
  }, 120000);

  it("should execute commands via native Modal methods", async () => {
    if (skipIfNoModalKeys()) {
      return skipTest();
    }

    sandbox = await createSandbox({});

    const proc = await sandbox.exec(["bash", "-c", "echo 'Hello from Modal'"], {
      stdout: "pipe",
    });

    let stdout = "";
    if (proc.stdout) {
      for await (const chunk of proc.stdout as AsyncIterable<Uint8Array | string>) {
        stdout += typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
      }
    }

    const exitCode = await proc.wait();

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Hello from Modal");
  }, 120000);

  it("should support custom configuration options", async () => {
    if (skipIfNoModalKeys()) {
      return skipTest();
    }

    sandbox = await createSandbox({
      image: "python:3.11",
      encryptedPorts: [3000, 8080],
      envs: {
        TEST_VAR: "test_value",
      },
    });

    expect(sandbox).toBeDefined();
    expect(sandbox.sandboxId).toBeDefined();
  }, 120000);

  it("should get tunnel URLs for exposed ports", async () => {
    if (skipIfNoModalKeys()) {
      return skipTest();
    }

    sandbox = await createSandbox({
      encryptedPorts: [3000],
    });

    const tunnels = await sandbox.tunnels();

    expect(tunnels).toBeDefined();
  }, 120000);

  it("should clean up with close()", async () => {
    if (skipIfNoModalKeys()) {
      return skipTest();
    }

    const tempSandbox = await createSandbox({});

    expect(tempSandbox).toBeDefined();
    await expect(tempSandbox.close()).resolves.not.toThrow();
  }, 120000);
});
