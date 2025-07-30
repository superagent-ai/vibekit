import { describe, it, expect, vi } from "vitest";
import { VibeKit } from "../packages/vibekit/src/index.js";
import { createE2BProvider } from "../packages/e2b/dist/index.js";
import { skipIfNoGeminiKeys, skipTest } from "./helpers/test-utils.js";
import dotenv from "dotenv";

dotenv.config();

describe("Gemini CLI", () => {
  it("should generate code with gemini cli", async () => {
    if (skipIfNoGeminiKeys()) {
      return skipTest();
    }

    const prompt = "Hi there";

    const e2bProvider = createE2BProvider({
      apiKey: process.env.E2B_API_KEY!,
      templateId: "vibekit-gemini",
    });

    const vibeKit = new VibeKit()
      .withAgent({
        type: "gemini",
        provider: "google",
        apiKey: process.env.GEMINI_API_KEY!,
        model: "gemini-2.5-pro",
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
