import { describe, it, expect, vi } from "vitest";
import { VibeKit } from "../packages/sdk/src/index.js";
import { createModalProvider } from "../packages/modal/dist/index.js";
import dotenv from "dotenv";

dotenv.config();

describe("Modal Sandbox", () => {
  it("should generate code with modal sandbox", async () => {
    const prompt = "Hi there";

    const modalProvider = createModalProvider({
      image: "superagentai/vibekit-claude:1.0",
      encryptedPorts: [3000],
    });

    const vibeKit = new VibeKit()
      .withAgent({
        type: "claude",
        provider: "anthropic",
        apiKey: process.env.ANTHROPIC_API_KEY!,
        model: "claude-sonnet-4-20250514",
      })
      .withSandbox(modalProvider)
      .withSecrets({
        GH_TOKEN: process.env.GH_TOKEN || process.env.GITHUB_TOKEN!,
      });

    const updateSpy = vi.fn();
    const errorSpy = vi.fn();

    vibeKit.on("stdout", updateSpy);
    vibeKit.on("stderr", errorSpy);

    // Clone repository first
    const repository = process.env.GH_REPOSITORY || "superagent-ai/superagent";
    await vibeKit.cloneRepository(repository);

    // Get the modal command for the prompt
    const modalCommand = `echo "${prompt}" | claude -p --append-system-prompt "Help with the following request by providing code or guidance." --disallowedTools "Edit" "Replace" "Write" --output-format stream-json --verbose --allowedTools "Edit,Write,MultiEdit,Read,Bash" --model claude-sonnet-4-20250514`;
    const result = await vibeKit.executeCommand(modalCommand);
    const host = await vibeKit.getHost(3000);

    await vibeKit.kill();

    expect(result).toBeDefined();
    expect(host).toBeDefined();
    expect(updateSpy).toHaveBeenCalled();
  }, 60000);
});
