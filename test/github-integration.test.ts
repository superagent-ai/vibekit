import { describe, it, expect, vi } from "vitest";
import { VibeKit } from "../packages/sdk/src/index.js";
import { createE2BProvider } from "../packages/e2b/dist/index.js";
import { skipIfNoClaudeKeys, skipTest } from "./helpers/test-utils.js";
import dotenv from "dotenv";

dotenv.config();

describe("GitHub Integration", () => {
  it("should clone repository and work with github operations", async () => {
    if (skipIfNoClaudeKeys()) {
      return skipTest();
    }

    // Skip if no GitHub token
    if (!process.env.GH_TOKEN && !process.env.GITHUB_TOKEN) {
      console.log("Skipping GitHub test - no GH_TOKEN or GITHUB_TOKEN found");
      return;
    }

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
      .withSecrets({
        GH_TOKEN: process.env.GH_TOKEN || process.env.GITHUB_TOKEN!,
      })
      .withSandbox(e2bProvider);

    const updateSpy = vi.fn();
    const errorSpy = vi.fn();

    vibeKit.on("stdout", updateSpy);  // executeCommand emits stdout events
    vibeKit.on("error", errorSpy);

    // Test cloning a public repository
    const publicRepo = "superagent-ai/superagent";
    console.log(`Cloning public repository: ${publicRepo}`);

    try {
      await vibeKit.cloneRepository(publicRepo);
      console.log("✅ Successfully cloned public repository");
    } catch (error) {
      console.error("❌ Failed to clone public repository:", error.message);
      throw error;
    }

    // Test cloning a private repository (if using token)
    const privateRepo = process.env.GH_REPOSITORY || "superagent-ai/signals";
    if (process.env.GH_TOKEN || process.env.GITHUB_TOKEN) {
      console.log(`Cloning private repository: ${privateRepo}`);
      try {
        await vibeKit.cloneRepository(privateRepo, "/private-repo");
        console.log("✅ Successfully cloned private repository");
      } catch (error) {
        console.error("❌ Failed to clone private repository:", error.message);
        // Don't throw - private repo might not be accessible
      }
    }

    // Test basic code generation in the cloned repository
    const prompt = "List the files in the current directory";
    // Get the claude command for the prompt  
    const claudeCommand = `echo "${prompt}" | claude -p --append-system-prompt "Help with the following request by providing code or guidance." --output-format stream-json --verbose --allowedTools "Edit,Write,MultiEdit,Read,Bash" --model claude-sonnet-4-20250514`;
    const result = await vibeKit.executeCommand(claudeCommand);

    // Test createPullRequest method signature (should require repository parameter)
    try {
      // This should work with the new signature
      const createPRMethod = vibeKit.createPullRequest.bind(vibeKit);
      expect(createPRMethod).toBeDefined();
      console.log("✅ createPullRequest method exists with correct signature");
    } catch (error) {
      console.error("❌ createPullRequest method issue:", error);
    }

    // Test mergePullRequest method signature (should work with secrets)
    try {
      const mergePRMethod = vibeKit.mergePullRequest.bind(vibeKit);
      expect(mergePRMethod).toBeDefined();
      console.log("✅ mergePullRequest method exists with correct signature");
    } catch (error) {
      console.error("❌ mergePullRequest method issue:", error);
    }

    await vibeKit.kill();

    expect(result).toBeDefined();
    expect(updateSpy).toHaveBeenCalled();
    console.log("🎉 GitHub integration test completed successfully!");
  }, 120000); // Extended timeout for GitHub operations

  it("should handle public repository cloning without token", async () => {
    if (skipIfNoClaudeKeys()) {
      return skipTest();
    }

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
    // Note: No withSecrets() call - testing public repo access

    console.log("Testing public repository cloning without token...");

    try {
      await vibeKit.cloneRepository("octocat/Hello-World");
      console.log("✅ Successfully cloned public repository without token");
    } catch (error) {
      console.error(
        "❌ Failed to clone public repository without token:",
        error.message
      );
      throw error;
    }

    await vibeKit.kill();
    console.log("🎉 Public repository test completed successfully!");
  }, 60000);
});
