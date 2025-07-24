import { describe, it, expect, beforeAll } from "vitest";
import { VibeKit } from "../../packages/vibekit/src";
import { getValidToken } from "../../packages/vibekit/dist/auth/oauth.js";

describe("OAuth Integration", () => {
  let hasOAuthToken = false;

  beforeAll(async () => {
    const token = await getValidToken();
    hasOAuthToken = !!token;
    if (!hasOAuthToken) {
      console.log("⚠️  No OAuth token found. Run 'vibekit auth login claude' to test OAuth features.");
    }
  });

  it("should use OAuth token with VibeKit SDK", async () => {
    if (!hasOAuthToken) {
      console.log("Skipping: OAuth token required");
      return;
    }

    const vibeKit = new VibeKit()
      .withAgent({
        type: "claude",
        provider: "anthropic",
        model: "claude-sonnet-4-20250514",
        // OAuth token will be used automatically from env
      })
      .withSandbox("local");

    // Test that agent is configured correctly
    expect(vibeKit.agent).toBeDefined();
    expect(vibeKit.agent.type).toBe("claude");
  });

  it("should work without API key when OAuth token is available", async () => {
    if (!hasOAuthToken) {
      console.log("Skipping: OAuth token required");
      return;
    }

    // Temporarily remove API key
    const originalApiKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    try {
      const vibeKit = new VibeKit()
        .withAgent({
          type: "claude",
          provider: "anthropic",
          model: "claude-sonnet-4-20250514",
        })
        .withSandbox("local");

      expect(vibeKit.agent).toBeDefined();
      expect(vibeKit.agent.type).toBe("claude");
    } finally {
      // Restore API key
      if (originalApiKey) {
        process.env.ANTHROPIC_API_KEY = originalApiKey;
      }
    }
  });
});