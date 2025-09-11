import { describe, it, expect, vi } from "vitest";
import { VibeKit } from "../packages/sdk/src/index.js";
import { createE2BProvider } from "../packages/e2b/dist/index.js";
import { skipIfNoClaudeKeys, skipTest } from "./helpers/test-utils.js";
import dotenv from "dotenv";

dotenv.config();

describe("Claude Code CLI", () => {
  it("should generate code with claude cli", async () => {
    if (skipIfNoClaudeKeys()) {
      return skipTest();
    }

    const prompt = "Hi there";

    const e2bProvider = createE2BProvider({
      apiKey: process.env.E2B_API_KEY!,
      templateId: "vibekit-claude",
    });

    const vibeKit = new VibeKit()
      .withAgent({
        type: "claude",
        provider: "anthropic",
        apiKey: process.env.ANTHROPIC_API_KEY!,
        model: "claude-sonnet-4-20250514",
      })
      .withSandbox(e2bProvider);

    const updateSpy = vi.fn();
    const errorSpy = vi.fn();

    vibeKit.on("stdout", updateSpy); // executeCommand emits stdout events
    vibeKit.on("stderr", errorSpy); // executeCommand emits stderr events

    // Get the claude command for the prompt
    const claudeCommand = `echo "${prompt}" | claude -p --append-system-prompt "Help with the following request by providing code or guidance." --disallowedTools "Edit" "Replace" "Write" --output-format stream-json --verbose --allowedTools "Edit,Write,MultiEdit,Read,Bash" --model claude-sonnet-4-20250514`;
    const result = await vibeKit.executeCommand(claudeCommand);
    const host = await vibeKit.getHost(3000);

    await vibeKit.kill();

    expect(result).toBeDefined();
    expect(host).toBeDefined();
    expect(updateSpy).toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  }, 60000);
});
