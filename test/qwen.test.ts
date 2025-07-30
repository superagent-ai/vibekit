import { describe, it, expect, vi } from "vitest";
import { VibeKit } from "../packages/vibekit/src/index.js";
import { createE2BProvider } from "../packages/e2b/dist/index.js";
import { skipIfNoQwenKeys, skipTest } from "./helpers/test-utils.js";
import dotenv from "dotenv";

dotenv.config();

describe("Qwen Code CLI", () => {
  it("should generate code with qwen cli", async () => {
    if (skipIfNoQwenKeys()) {
      return skipTest();
    }

    const prompt = "Hi there, write a simple hello world function in Python";

    const e2bProvider = createE2BProvider({
      apiKey: process.env.E2B_API_KEY!,
      templateId: "vibekit-qwen",
    });

    const vibeKit = new VibeKit()
      .withAgent({
        type: "qwen",
        provider: "openai", // Qwen uses OpenAI-compatible API
        apiKey: process.env.OPENROUTER_API_KEY!,
        model: "qwen/qwen3-coder",
        baseUrl: "https://api.openrouter.ai/v1",
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
