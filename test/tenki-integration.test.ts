import { describe, it, expect } from "vitest";
import { createTenkiProvider } from "../packages/tenki/dist/index.js";
import {
  skipIfNoTenkiKeys,
  skipIntegrationTest,
  skipTest,
} from "./helpers/test-utils.js";
import dotenv from "dotenv";

dotenv.config();

describe("Tenki Sandbox", () => {
  it("runs commands, streams output, exposes a port, and tears down", async () => {
    if (skipIntegrationTest() || skipIfNoTenkiKeys()) {
      return skipTest();
    }

    // `installAgent: false` keeps this a fast, self-contained test of the
    // provider contract against a live sandbox — no agent CLI install needed.
    const provider = createTenkiProvider({
      apiKey: process.env.TENKI_AUTH_TOKEN,
      installAgent: false,
    });

    const sandbox = await provider.create();

    try {
      expect(sandbox.sandboxId).toBeTruthy();

      // Success: exit code 0 and stdout captured.
      const ok = await sandbox.commands.run("echo hello-tenki");
      expect(ok.exitCode).toBe(0);
      expect(ok.stdout).toContain("hello-tenki");

      // Failure: non-zero exit code propagates.
      const failed = await sandbox.commands.run("exit 3");
      expect(failed.exitCode).toBe(3);

      // Shell semantics work (pipe + &&).
      const piped = await sandbox.commands.run(
        "printf 'a\\nb\\nc\\n' | grep -c ."
      );
      expect(piped.exitCode).toBe(0);
      expect(piped.stdout.trim()).toBe("3");

      // Streaming callback receives stdout.
      let streamed = "";
      await sandbox.commands.run("echo streamed-output", {
        onStdout: (data) => {
          streamed += data;
        },
      });
      expect(streamed).toContain("streamed-output");

      // Exposing a port returns a preview URL.
      const host = await sandbox.getHost(3000);
      expect(host).toMatch(/^https?:\/\//);
    } finally {
      await sandbox.kill();
    }
  }, 120000);

  it("installs and runs the requested agent CLI on the default image", async () => {
    if (skipIntegrationTest() || skipIfNoTenkiKeys()) {
      return skipTest();
    }

    // installAgent defaults to true, so this exercises the *real* create() path:
    // boot the default base image, `npm i -g` the agent CLI, then invoke it.
    const provider = createTenkiProvider({
      apiKey: process.env.TENKI_AUTH_TOKEN,
    });
    const sandbox = await provider.create({}, "claude");

    try {
      // The CLI was installed and is on the PATH.
      const which = await sandbox.commands.run("command -v claude");
      expect(which.exitCode).toBe(0);
      expect(which.stdout).toContain("claude");

      // ...and it actually runs.
      const version = await sandbox.commands.run("claude --version");
      expect(version.exitCode).toBe(0);
    } finally {
      await sandbox.kill();
    }
  }, 240000);

  it("creates a root-owned working directory on the non-root default image", async () => {
    if (skipIntegrationTest() || skipIfNoTenkiKeys()) {
      return skipTest();
    }

    // "/vibe0" (VibeKit's default working dir) is root-owned, and Tenki runs as
    // a non-root user — so the provider must sudo-create + chown it. Verify the
    // directory ends up writable by us.
    const provider = createTenkiProvider({ installAgent: false });
    const sandbox = await provider.create({}, undefined, "/vibe0");

    try {
      const check = await sandbox.commands.run(
        "test -w /vibe0 && touch /vibe0/.probe && echo WRITABLE"
      );
      expect(check.exitCode).toBe(0);
      expect(check.stdout).toContain("WRITABLE");
    } finally {
      await sandbox.kill();
    }
  }, 120000);
});
