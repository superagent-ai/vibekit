import { describe, it, expect, vi } from "vitest";
import { VibeKit } from "../packages/vibekit/src/index.js";
import { createDaytonaProvider } from "../packages/daytona/dist/index.js";
import { skipIfNoDaytonaKeys, skipTest } from "./helpers/test-utils.js";
import dotenv from "dotenv";

dotenv.config();

describe("Daytona Sandbox", () => {
  it("should generate code with daytona sandbox", async () => {
    if (skipIfNoDaytonaKeys()) {
      return skipTest();
    }

    const prompt = "Hi there";

    const daytonaProvider = createDaytonaProvider({
      apiUrl: process.env.DAYTONA_SERVER_URL!,
      apiKey: process.env.DAYTONA_SERVER_API_KEY!,
      targetId: process.env.DAYTONA_TARGET_ID!,
    });

    const vibeKit = new VibeKit()
      .withAgent({
        type: "claude",
        provider: "anthropic",
        apiKey: process.env.ANTHROPIC_API_KEY!,
        model: "claude-sonnet-4-20250514",
      })
      .withSandbox(daytonaProvider);

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
