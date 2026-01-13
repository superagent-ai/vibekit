import { expect } from "vitest";

/**
 * Helper to check if required API keys are missing
 */
export const skipIfNoAPIKeys = (requiredKeys: string[] = ["E2B_API_KEY"]) => {
  const missingKeys = requiredKeys.filter((key) => !process.env[key]);

  if (missingKeys.length > 0) {
    console.log(`Skipping test - Missing API keys: ${missingKeys.join(", ")}`);
    return true;
  }

  return false;
};

/**
 * Helper to create a mock test that passes when skipped
 */
export const skipTest = () => {
  expect(true).toBe(true);
  return;
};

// ============================================================================
// Sandbox Provider Skip Helpers
// ============================================================================

/**
 * Skip if Beam API keys are missing
 */
export const skipIfNoBeamKeys = () =>
  skipIfNoAPIKeys(["BEAM_API_KEY", "BEAM_WORKSPACE_ID"]);

/**
 * Skip if Blaxel API keys are missing
 */
export const skipIfNoBlaxelKeys = () =>
  skipIfNoAPIKeys(["BL_API_KEY", "BL_WORKSPACE"]);

/**
 * Skip if Cloudflare environment is not available
 * Note: Cloudflare tests require a Workers environment
 */
export const skipIfNoCloudflareEnv = () => {
  // Cloudflare tests are typically run in a Workers environment
  // For now, always skip in Node.js environment
  console.log("Skipping test - Cloudflare tests require Workers environment");
  return true;
};

/**
 * Skip if Daytona API keys are missing
 */
export const skipIfNoDaytonaKeys = () =>
  skipIfNoAPIKeys(["DAYTONA_API_KEY"]);

/**
 * Skip if E2B API keys are missing
 */
export const skipIfNoE2BKeys = () =>
  skipIfNoAPIKeys(["E2B_API_KEY"]);

/**
 * Skip if Modal is not authenticated
 * Modal uses CLI authentication rather than API keys
 */
export const skipIfNoModalKeys = () => {
  // Modal authentication is handled via CLI (modal token set)
  // Check if MODAL_TOKEN_ID and MODAL_TOKEN_SECRET are set for programmatic auth
  const hasTokenAuth = process.env.MODAL_TOKEN_ID && process.env.MODAL_TOKEN_SECRET;
  
  if (!hasTokenAuth) {
    console.log("Skipping test - Modal authentication not configured");
    return true;
  }
  
  return false;
};

// ============================================================================
// Agent Skip Helpers (for tests that require both sandbox and agent keys)
// ============================================================================

/**
 * Skip if Claude agent keys are missing (E2B + Anthropic)
 */
export const skipIfNoClaudeKeys = () =>
  skipIfNoAPIKeys(["E2B_API_KEY", "ANTHROPIC_API_KEY"]);

/**
 * Skip if Codex agent keys are missing (E2B + OpenAI)
 */
export const skipIfNoCodexKeys = () =>
  skipIfNoAPIKeys(["E2B_API_KEY", "OPENAI_API_KEY"]);

/**
 * Skip if Gemini agent keys are missing (E2B + Google)
 */
export const skipIfNoGeminiKeys = () =>
  skipIfNoAPIKeys(["E2B_API_KEY", "GEMINI_API_KEY"]);

/**
 * Skip if Grok agent keys are missing (E2B + xAI)
 */
export const skipIfNoGrokKeys = () =>
  skipIfNoAPIKeys(["E2B_API_KEY", "GROK_API_KEY"]);

/**
 * Skip if Opencode agent keys are missing (E2B + Anthropic)
 */
export const skipIfNoOpenCodeKeys = () =>
  skipIfNoAPIKeys(["E2B_API_KEY", "ANTHROPIC_API_KEY"]);

// ============================================================================
// Integration Test Helpers
// ============================================================================

/**
 * Skip integration tests in CI unless explicitly enabled
 */
export const skipIntegrationTest = () => {
  const isCI = process.env.CI;
  const runIntegration = process.env.RUN_INTEGRATION_TESTS;

  if (isCI && !runIntegration) {
    console.log(
      "Skipping integration test in CI - Set RUN_INTEGRATION_TESTS=true to run"
    );
    return true;
  }

  return false;
};

/**
 * Skip if VibeKit SDK keys are missing
 */
export const skipIfNoVibeKitKeys = () =>
  skipIfNoAPIKeys(["E2B_API_KEY", "ANTHROPIC_API_KEY", "GH_TOKEN"]);
