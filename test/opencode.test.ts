import { describe, it, expect, vi } from "vitest";
import { VibeKit } from "../packages/sdk/src/index.js";
import { createE2BProvider } from "@vibe-kit/e2b";
import { skipIfNoOpenCodeKeys, skipTest } from "./helpers/test-utils.js";
import dotenv from "dotenv";

dotenv.config();

describe("Opencode CLI", () => {
  it("should generate code with opencode cli", async () => {
    if (skipIfNoOpenCodeKeys()) {
      return skipTest();
    }

    const prompt = "Hi there";

    const e2bProvider = createE2BProvider({
      apiKey: process.env.E2B_API_KEY!,
      templateId: "vibekit-opencode",
    });

    const vibeKit = new VibeKit()
      .withAgent({
        type: "opencode",
        provider: "anthropic",
        apiKey: process.env.ANTHROPIC_API_KEY!,
        model: "claude-sonnet-4-20250514",
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
  }, 60000);
});
