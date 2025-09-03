import { createAnthropic } from '@ai-sdk/anthropic';
import { AuthManager } from './auth';

/**
 * Creates an AI provider based on available authentication
 * Note: For OAuth tokens, we use Claude Code SDK directly instead of AI SDK
 * This function only creates Anthropic providers for API key authentication
 */
export function createAnthropicProvider(authManager?: AuthManager) {
  const auth = authManager || AuthManager.getInstance();
  
  const oauthToken = auth.getOAuthToken();
  const apiKey = auth.getApiKey();
  const authStatus = auth.getAuthStatus();
  
  console.log('[PROVIDER] Auth detection:', {
    hasOAuthToken: !!oauthToken,
    hasApiKey: !!apiKey,
    authMethod: authStatus.authMethod,
    claudeCodeMaxUser: authStatus.claudeCodeMaxUser
  });
  
  if (oauthToken) {
    console.log('[PROVIDER] ⚠️ OAuth token detected - should use Claude Code SDK directly');
    throw new Error('OAuth token detected - use Claude Code SDK streaming instead of AI provider');
  } else if (apiKey) {
    console.log('[PROVIDER] ✅ Using Anthropic API key provider');
    const anthropic = createAnthropic({ apiKey });
    return anthropic('claude-sonnet-4-20250514');
  }
  
  throw new Error('No authentication configured. Please run \'claude login\' or set CLAUDE_CODE_OAUTH_TOKEN environment variable, or set ANTHROPIC_API_KEY in your .env file.');
}

/**
 * Creates an Anthropic AI provider for a specific model
 * Only works with API keys - OAuth tokens should use Claude Code SDK directly
 */
export function createAnthropicProviderWithModel(model: string, authManager?: AuthManager) {
  const auth = authManager || AuthManager.getInstance();
  
  const oauthToken = auth.getOAuthToken();
  const apiKey = auth.getApiKey();
  
  if (oauthToken) {
    console.log(`[PROVIDER] ⚠️ OAuth token detected - should use Claude Code SDK directly for model: ${model}`);
    throw new Error('OAuth token detected - use Claude Code SDK streaming instead of AI provider');
  } else if (apiKey) {
    console.log(`[PROVIDER] ✅ Using Anthropic API key provider with model: ${model}`);
    const anthropic = createAnthropic({ apiKey });
    return anthropic(model);
  }
  
  throw new Error('No authentication configured. Please run \'claude login\' or set CLAUDE_CODE_OAUTH_TOKEN environment variable, or set ANTHROPIC_API_KEY in your .env file.');
}

/**
 * Get authentication status for logging/debugging
 */
export function getAuthInfo(authManager?: AuthManager) {
  const auth = authManager || AuthManager.getInstance();
  const oauthToken = auth.getOAuthToken();
  const apiKey = auth.getApiKey();
  
  return {
    hasOAuthToken: !!oauthToken,
    hasApiKey: !!apiKey,
    authMethod: auth.getAuthStatus().authMethod,
    isConfigured: auth.hasValidAuth()
  };
}

/**
 * Determine if we should use Claude Code SDK (OAuth) or AI SDK (API key)
 */
export function shouldUseClaudeCodeSDK(authManager?: AuthManager): boolean {
  const auth = authManager || AuthManager.getInstance();
  const oauthToken = auth.getOAuthToken();
  return !!oauthToken;
}

/**
 * Get the authentication method that should be used
 */
export function getAuthMethod(authManager?: AuthManager): 'claude-code-sdk' | 'anthropic-api' | 'none' {
  const auth = authManager || AuthManager.getInstance();
  const oauthToken = auth.getOAuthToken();
  const apiKey = auth.getApiKey();
  
  if (oauthToken) {
    return 'claude-code-sdk';
  } else if (apiKey) {
    return 'anthropic-api';
  } else {
    return 'none';
  }
}