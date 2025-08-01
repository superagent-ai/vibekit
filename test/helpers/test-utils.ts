import { expect } from "vitest";

// Helper to check if required API keys are missing
export const skipIfNoAPIKeys = (requiredKeys: string[] = ['E2B_API_KEY']) => {
  const missingKeys = requiredKeys.filter(key => !process.env[key]);
  
  if (missingKeys.length > 0) {
    console.log(`Skipping test - Missing API keys: ${missingKeys.join(', ')}`);
    return true;
  }
  
  return false;
};

// Helper to create a mock test that passes when skipped
export const skipTest = () => {
  expect(true).toBe(true);
  return;
};

// Agent-specific skip helpers
export const skipIfNoClaudeKeys = () => skipIfNoAPIKeys(['E2B_API_KEY', 'ANTHROPIC_API_KEY']);
export const skipIfNoCodexKeys = () => skipIfNoAPIKeys(['E2B_API_KEY', 'OPENAI_API_KEY']);
export const skipIfNoGeminiKeys = () => skipIfNoAPIKeys(['E2B_API_KEY', 'GEMINI_API_KEY']);
export const skipIfNoGrokKeys = () => skipIfNoAPIKeys(['E2B_API_KEY', 'GROK_API_KEY']);
export const skipIfNoOpenCodeKeys = () => skipIfNoAPIKeys(['E2B_API_KEY', 'ANTHROPIC_API_KEY']);
export const skipIfNoDaytonaKeys = () => skipIfNoAPIKeys(['DAYTONA_SERVER_URL', 'DAYTONA_SERVER_API_KEY', 'DAYTONA_TARGET_ID', 'ANTHROPIC_API_KEY']);
export const skipIfNoVibeKitKeys = () => skipIfNoAPIKeys(['E2B_API_KEY', 'ANTHROPIC_API_KEY', 'GH_TOKEN']);

// Skip integration tests in CI unless explicitly enabled
export const skipIntegrationTest = () => {
  const isCI = process.env.CI;
  const runIntegration = process.env.RUN_INTEGRATION_TESTS;
  
  if (isCI && !runIntegration) {
    console.log('Skipping integration test in CI - Set RUN_INTEGRATION_TESTS=true to run');
    return true;
  }
  
  return false;
};
