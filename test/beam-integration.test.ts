import { describe, it, expect, vi } from "vitest";
import { VibeKit } from "../packages/sdk/src/index.js";
import { createBeamProvider } from "../packages/beam/dist/index.js";
import { skipIfNoBeamKeys, skipTest } from "./helpers/test-utils.js";
import dotenv from "dotenv";

dotenv.config();

describe("Beam Sandbox", () => {
  it("should generate code with beam sandbox", async () => {
    if (skipIfNoBeamKeys()) {
      return skipTest();
    }

    const prompt = "Hi there";

    const beamProvider = createBeamProvider({
      token: process.env.BEAM_API_KEY!,
      workspaceId: process.env.BEAM_WORKSPACE_ID!,
      image: "superagentai/vibekit-claude:1.0",
    });

    const vibeKit = new VibeKit()
      .withAgent({
        type: "codex",
        provider: "openai",
        apiKey: process.env.OPENAI_API_KEY!,
        model: "gpt-4o",
      })
      .withSandbox(beamProvider)
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

    // Get the beam command for the prompt
    const beamCommand = `echo "${prompt}" | claude -p --append-system-prompt "Help with the following request by providing code or guidance." --disallowedTools "Edit" "Replace" "Write" --output-format stream-json --verbose --allowedTools "Edit,Write,MultiEdit,Read,Bash" --model gpt-4o`;
    const result = await vibeKit.executeCommand(beamCommand);
    const host = await vibeKit.getHost(3000);

    await vibeKit.kill();

    expect(result).toBeDefined();
    expect(host).toBeDefined();
    expect(updateSpy).toHaveBeenCalled();
  }, 120000);
});
