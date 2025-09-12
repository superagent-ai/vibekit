import { describe, it, expect, vi } from "vitest";
import { VibeKit } from "../packages/sdk/src/index.js";
import { createE2BProvider } from "../packages/e2b/dist/index.js";
import { skipIfNoClaudeKeys, skipTest } from "./helpers/test-utils.js";
import dotenv from "dotenv";

dotenv.config();

describe("Worktree Functionality", () => {
  it("should configure worktree options correctly", () => {
    const vibeKit = new VibeKit()
      .withAgent({
        type: "claude",
        provider: "anthropic",
        apiKey: "test-key",
        model: "claude-sonnet-4-20250514",
      })
      .withWorktrees({
        root: "/custom/worktree/root",
        cleanup: true,
      });

    // Access private options for testing
    const options = (vibeKit as any).options;
    expect(options.worktrees).toEqual({
      enabled: true,
      root: "/custom/worktree/root",
      cleanup: true,
    });
  });

  it("should enable worktrees with default options", () => {
    const vibeKit = new VibeKit()
      .withAgent({
        type: "claude",
        provider: "anthropic",
        apiKey: "test-key",
        model: "claude-sonnet-4-20250514",
      })
      .withWorktrees();

    const options = (vibeKit as any).options;
    expect(options.worktrees).toEqual({
      enabled: true,
      root: undefined,
      cleanup: undefined,
    });
  });

  it("should create and use worktrees in git operations", async () => {
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
      .withSandbox(e2bProvider)
      .withWorktrees({
        root: "/tmp/test-worktrees",
        cleanup: false, // Don't cleanup for verification
      });

    const updateSpy = vi.fn();
    const errorSpy = vi.fn();

    vibeKit.on("stdout", updateSpy);
    vibeKit.on("stderr", errorSpy);

    await vibeKit.cloneRepository("superagent-ai/superagent");

    // Test creating a worktree through the agent
    const result = await vibeKit.executeCommand(
      "echo 'Test worktree creation' > test.txt",
      {
        branch: "feature/test-worktree",
      }
    );

    await vibeKit.kill();

    expect(result).toBeDefined();
    expect(updateSpy).toHaveBeenCalled();
  }, 90000);

  it("should cleanup worktrees when enabled", async () => {
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
      .withSandbox(e2bProvider)
      .withWorktrees({
        root: "/tmp/cleanup-test-worktrees",
        cleanup: true, // Enable cleanup
      });

    const updateSpy = vi.fn();

    vibeKit.on("stdout", updateSpy);

    await vibeKit.cloneRepository("superagent-ai/superagent");

    // Initialize repo and test cleanup behavior
    const result = await vibeKit.executeCommand(
      "echo 'Test cleanup' > cleanup-test.txt",
      {
        branch: "feature/cleanup-test",
      }
    );

    await vibeKit.kill();

    expect(result).toBeDefined();
    expect(updateSpy).toHaveBeenCalled();

    // Check that git-related messages appear in the output (worktree operations may be logged as "git")
    const allCalls = updateSpy.mock.calls.flat();
    const hasGitMessages = allCalls.some(
      (call: any) => typeof call === "string" && (call.includes("git") || call.includes("branch"))
    );
    expect(hasGitMessages).toBe(true);
  }, 90000);
});
