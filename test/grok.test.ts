import { describe, it, expect, vi } from "vitest";
import { VibeKit } from "../packages/sdk/src/index.js";
import { createE2BProvider } from "@vibe-kit/e2b";
import { skipIfNoGrokKeys, skipTest } from "./helpers/test-utils.js";
import dotenv from "dotenv";

dotenv.config();

describe("Grok CLI", () => {
  it("should generate code with grok cli", async () => {
    if (skipIfNoGrokKeys()) {
      return skipTest();
    }

    const prompt = "Hi there";

    const e2bProvider = createE2BProvider({
      apiKey: process.env.E2B_API_KEY!,
      templateId: "vibekit-grok",
    });

    const vibeKit = new VibeKit()
      .withAgent({
        type: "grok",
        provider: "xai",
        apiKey: process.env.GROK_API_KEY!,
        model: "grok-beta",
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
