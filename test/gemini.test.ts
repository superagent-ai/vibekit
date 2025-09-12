import { describe, it, expect, vi } from "vitest";
import { VibeKit } from "../packages/sdk/src/index.js";
import { createE2BProvider } from "../packages/e2b/dist/index.js";
import { skipIfNoGeminiKeys, skipTest } from "./helpers/test-utils.js";
import dotenv from "dotenv";

dotenv.config();

describe("Gemini CLI", () => {
  it("should generate code with gemini cli", async () => {
    if (skipIfNoGeminiKeys()) {
      skipTest();
      return;
    }

    const prompt = "Hi there";

    console.log("Creating E2B provider...");
    const e2bProvider = createE2BProvider({
      apiKey: process.env.E2B_API_KEY!,
      templateId: "vibekit-gemini",
    });

    console.log("Creating VibeKit instance...");
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

    vibeKit.on("stdout", updateSpy);  // executeCommand emits stdout events
    vibeKit.on("stderr", errorSpy);   // executeCommand emits stderr events

    console.log("Starting code generation...");
    // Get the gemini command for the prompt
    const geminiCommand = `echo "${prompt}" | gemini --model gemini-2.5-pro --yolo`;
    const result = await vibeKit.executeCommand(geminiCommand);
    console.log("Code generation completed, getting host...");
    const host = await vibeKit.getHost(3000);

    console.log("Killing vibekit...");
    await vibeKit.kill();

    expect(result).toBeDefined();
    expect(host).toBeDefined();
    expect(updateSpy).toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  }, 120000);
});
