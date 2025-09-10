import { describe, it, expect, vi } from "vitest";
import { VibeKit } from "../packages/sdk/src/index.js";
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
      apiKey: process.env.DAYTONA_SERVER_API_KEY!,
    });

    const vibeKit = new VibeKit()
      .withAgent({
        type: "claude",
        provider: "anthropic",
        apiKey: process.env.ANTHROPIC_API_KEY!,
        model: "claude-sonnet-4-20250514",
      })
      .withSandbox(daytonaProvider)
      .withSecrets({
        GH_TOKEN: process.env.GH_TOKEN || process.env.GITHUB_TOKEN!,
      });

    // Clone repository first
    const repository = process.env.GH_REPOSITORY || "superagent-ai/signals";
    await vibeKit.cloneRepository(repository);

    const updateSpy = vi.fn();
    const errorSpy = vi.fn();

    vibeKit.on("stdout", updateSpy);  // executeCommand emits stdout events
    vibeKit.on("stderr", errorSpy);   // executeCommand emits stderr events

    // Get the daytona command for the prompt
    const daytonaCommand = `echo "${prompt}" | claude -p --append-system-prompt "Help with the following request by providing code or guidance." --disallowedTools "Edit" "Replace" "Write" --output-format stream-json --verbose --allowedTools "Edit,Write,MultiEdit,Read,Bash" --model claude-sonnet-4-20250514`;
    const result = await vibeKit.executeCommand(daytonaCommand);
    const host = await vibeKit.getHost(3000);

    await vibeKit.kill();

    expect(result).toBeDefined();
    expect(host).toBeDefined();
    expect(updateSpy).toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  }, 60000);
});
