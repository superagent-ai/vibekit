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
});
