import { describe, it, expect, vi } from "vitest";
import dotenv from "dotenv";

import { VibeKit } from "../packages/sdk/src/index.js";
import { createE2BProvider } from "../packages/e2b/dist/index.js";
import { skipIfNoVibeKitKeys, skipTest } from "./helpers/test-utils.js";

// Type imports to verify they are properly exported
import type {
  AgentMode,
  ModelProvider,
  Conversation,
  PullRequestResult,
  AgentResponse,
  ExecuteCommandOptions,
} from "../packages/sdk/src/index.js";

dotenv.config();

describe("VibeKit SDK", () => {
  it("should have all types properly exported", () => {
    // Type checking test - these will fail at compile time if types are not exported
    // We're just verifying the types can be used, not testing runtime behavior
    type TestAgentMode = AgentMode;
    type TestProvider = ModelProvider;
    type TestConversation = Conversation;
    type TestAgentResponse = AgentResponse;
    type TestExecuteOptions = ExecuteCommandOptions;
    type TestPrResult = PullRequestResult;

    // Example usage to verify types work correctly
    const agentMode: TestAgentMode = "code";
    const provider: TestProvider = "anthropic";

    // If this test compiles and runs, all types are properly exported
    expect(agentMode).toBe("code");
    expect(provider).toBe("anthropic");
  });

  it("should create working directory", async () => {
    if (skipIfNoVibeKitKeys()) {
      return skipTest();
    }

    const dir = "/var/vibe0";

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
      .withSandbox(e2bProvider)
      .withWorkingDirectory(dir);

    const result = await vibeKit.executeCommand("pwd");

    const pwd = result.stdout.trim();

    await vibeKit.kill();

    expect(pwd).toBe(dir);
  }, 60000);

  it("should download repository", async () => {
    if (skipIfNoVibeKitKeys()) {
      return skipTest();
    }

    const dir = "/var/vibe0";

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
      .withSandbox(e2bProvider)
      .withGithub({
        token: process.env.GH_TOKEN || process.env.GITHUB_TOKEN!,
        repository: process.env.GH_REPOSITORY || "superagent-ai/signals",
      })
      .withWorkingDirectory(dir);

    let gitUpdateReceived = false;

    vibeKit.on("update", (data) => {
      try {
        const parsedData = JSON.parse(data);
        if (
          parsedData.type === "git" &&
          parsedData.output === "Cloning repository: superagent-ai/signals"
        ) {
          gitUpdateReceived = true;
        }
      } catch {}
    });

    await vibeKit.generateCode({ prompt: "Hi there" });

    await vibeKit.kill();

    expect(gitUpdateReceived).toBe(true);
  }, 60000);
  it("should set env variables", async () => {
    if (skipIfNoVibeKitKeys()) {
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
      .withSandbox(e2bProvider)
      .withGithub({
        token: process.env.GH_TOKEN || process.env.GITHUB_TOKEN!,
        repository: process.env.GH_REPOSITORY || "superagent-ai/signals",
      })
      .withSecrets({ MY_SECRET: "test" });

    const output = await vibeKit.executeCommand("echo $MY_SECRET");
    const secret = output.stdout.trim();

    expect(secret).toBe("test");
  }, 60000);

  it("should stream executeCommand output", async () => {
    if (skipIfNoVibeKitKeys()) {
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

    const streamedData: string[] = [];
    let tokensReceived = 0;

    vibeKit.on("stdout", (data) => {
      console.log("Received streaming data:", data);
      streamedData.push(data);
      tokensReceived++;
    });

    const result = await vibeKit.executeCommand("echo 'streaming test'");

    await vibeKit.kill();

    console.log(`Total streaming events received: ${tokensReceived}`);
    console.log(`Final result: ${result.stdout}`);

    expect(streamedData.length).toBeGreaterThan(0);
    expect(tokensReceived).toBeGreaterThan(0);
  }, 60000);
});
