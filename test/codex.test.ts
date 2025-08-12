import { describe, it, expect, vi } from "vitest";
import { VibeKit } from "../packages/sdk/src/index.js";
import { createE2BProvider } from "../packages/e2b/src/index.js";
import { skipIfNoCodexKeys, skipTest } from "./helpers/test-utils.js";
import dotenv from "dotenv";

dotenv.config();

describe("Codex CLI", () => {
  it("should generate code with codex cli", async () => {
    if (skipIfNoCodexKeys()) {
      return skipTest();
    }

    const prompt = "Replace the README with the text 'HELLO WORLD'";

    const e2bProvider = createE2BProvider({
      apiKey: process.env.E2B_API_KEY!,
      templateId: "vibekit-codex",
    });

    const vibeKit = new VibeKit()
      .withAgent({
        type: "codex",
        provider: "openai",
        apiKey: process.env.OPENAI_API_KEY!,
        model: "codex-mini-latest",
      })
      .withGithub({
        token: process.env.GH_TOKEN || process.env.GITHUB_TOKEN!,
        repository: process.env.GH_REPOSITORY || "superagent-ai/signals",
      })
      .withSandbox(e2bProvider);

    const updateSpy = vi.fn();
    const errorSpy = vi.fn();

    vibeKit.on("update", updateSpy);
    vibeKit.on("error", errorSpy);

    const result = await vibeKit.generateCode({ prompt, mode: "ask" });
    const host = await vibeKit.getHost(3000);

    await vibeKit.kill();

    expect(result).toBeDefined();
    expect(host).toBeDefined();
    expect(updateSpy).toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  }, 600000);
});
