import { describe, it, expect, beforeAll } from "vitest";
import { ClaudeAgent } from "../packages/vibekit/src/agents/claude";
import { getValidToken, loadToken } from "../packages/vibekit/dist/auth/oauth.js";
import { ClaudeAuth } from "../packages/vibekit/dist/index.js";
import type { ClaudeConfig } from "../packages/vibekit/src/types";
import dotenv from "dotenv";

dotenv.config();

describe("Claude OAuth Authentication", () => {
  let oauthToken: string | null = null;

  beforeAll(async () => {
    // Try to get OAuth token from saved credentials
    oauthToken = await getValidToken();
    if (!oauthToken && process.env.CLAUDE_CODE_OAUTH_TOKEN) {
      oauthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;
    }
  });

  describe("Agent Configuration", () => {
    it("should create Claude agent with OAuth token from config", () => {
      const config: ClaudeConfig = {
        oauthToken: "test-oauth-token",
        model: "claude-sonnet-4-20250514",
      };

      const agent = new ClaudeAgent(config);
      expect(agent).toBeDefined();
      expect(agent.getApiKey()).toBe("test-oauth-token");
    });

    it("should prioritize OAuth token from config over environment variable", () => {
      const originalToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;
      process.env.CLAUDE_CODE_OAUTH_TOKEN = "env-oauth-token";

      const config: ClaudeConfig = {
        oauthToken: "config-oauth-token",
        model: "claude-sonnet-4-20250514",
      };

      const agent = new ClaudeAgent(config);
      expect(agent.getApiKey()).toBe("config-oauth-token");

      // Restore
      if (originalToken) {
        process.env.CLAUDE_CODE_OAUTH_TOKEN = originalToken;
      } else {
        delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
      }
    });

    it("should use OAuth token from environment when not provided in config", () => {
      const originalToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;
      process.env.CLAUDE_CODE_OAUTH_TOKEN = "env-oauth-token";

      const config: ClaudeConfig = {
        model: "claude-sonnet-4-20250514",
      };

      const agent = new ClaudeAgent(config);
      expect(agent.getApiKey()).toBe("env-oauth-token");

      // Restore
      if (originalToken) {
        process.env.CLAUDE_CODE_OAUTH_TOKEN = originalToken;
      } else {
        delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
      }
    });

    it("should throw error when neither API key nor OAuth token is provided", async () => {
      const originalApiKey = process.env.ANTHROPIC_API_KEY;
      const originalToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;
      
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.CLAUDE_CODE_OAUTH_TOKEN;

      const config: ClaudeConfig = {
        model: "claude-sonnet-4-20250514",
      };

      const agent = new ClaudeAgent(config);
      
      // The error is thrown when the agent is used, not during construction
      await expect(agent.generateCode("test")).rejects.toThrow(
        "Claude agent requires either providerApiKey or oauthToken"
      );

      // Restore
      if (originalApiKey) process.env.ANTHROPIC_API_KEY = originalApiKey;
      if (originalToken) process.env.CLAUDE_CODE_OAUTH_TOKEN = originalToken;
    });
  });

  describe("API Integration", () => {
    it("should make successful API call with OAuth token", async () => {
      if (!oauthToken) {
        console.log("Skipping API test - No OAuth token available");
        console.log("Run 'vibekit auth login claude' to authenticate");
        return;
      }

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "anthropic-version": "2023-06-01",
          "anthropic-beta": "oauth-2025-04-20",
          "Authorization": `Bearer ${oauthToken}`,
          "X-API-Key": "",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 20,
          system: "You are Claude Code, Anthropic's official CLI for Claude.",
          messages: [{
            role: "user",
            content: "Reply with 'OAuth works!' only"
          }]
        }),
      });

      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data).toHaveProperty("content");
      expect(data.content[0].text).toContain("OAuth works!");
    }, 30000);

    it("should verify token details", async () => {
      const tokenData = await loadToken();
      
      if (!tokenData) {
        console.log("Skipping token details test - No saved token");
        return;
      }

      expect(tokenData).toHaveProperty("access_token");
      expect(tokenData).toHaveProperty("refresh_token");
      expect(tokenData).toHaveProperty("created_at");
      
      if (tokenData.expires_in) {
        const expiresAt = new Date(tokenData.created_at + tokenData.expires_in * 1000);
        const now = new Date();
        console.log(`Token expires at: ${expiresAt.toLocaleString()}`);
        console.log(`Time remaining: ${Math.round((expiresAt.getTime() - now.getTime()) / 1000 / 60)} minutes`);
      }
    });

    it("should fail with invalid OAuth token", async () => {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "anthropic-version": "2023-06-01",
          "anthropic-beta": "oauth-2025-04-20",
          "Authorization": "Bearer invalid-token-12345",
          "X-API-Key": "",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 10,
          system: "You are Claude Code, Anthropic's official CLI for Claude.",
          messages: [{ role: "user", content: "test" }]
        }),
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);
    });
  });

  describe("Library API", () => {
    it("should check authentication status", async () => {
      const isAuthenticated = await ClaudeAuth.isAuthenticated();
      expect(typeof isAuthenticated).toBe("boolean");
    });

    it("should get authentication status details", async () => {
      const status = await ClaudeAuth.getStatus();
      expect(status).toHaveProperty("authenticated");
      
      if (status.authenticated) {
        expect(status).toHaveProperty("tokenType");
        expect(status).toHaveProperty("scope");
        expect(status).toHaveProperty("hasRefreshToken");
      }
    });

    it("should export token when authenticated", async () => {
      const isAuthenticated = await ClaudeAuth.isAuthenticated();
      
      if (isAuthenticated) {
        const envExport = await ClaudeAuth.exportToken("env");
        expect(typeof envExport).toBe("string");
        expect(envExport).toContain("export CLAUDE_CODE_OAUTH_TOKEN=");
        
        const jsonExport = await ClaudeAuth.exportToken("json");
        expect(jsonExport).toHaveProperty("access_token");
      }
    });

    it("should handle verify method", async () => {
      const isVerified = await ClaudeAuth.verify();
      expect(typeof isVerified).toBe("boolean");
    });
  });
});