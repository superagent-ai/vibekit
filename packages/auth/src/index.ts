/**
 * OAuth authentication utilities for VibeKit
 * 
 * @example Node.js usage:
 * ```typescript
 * import { ClaudeAuth } from '@vibe-kit/auth/node';
 * 
 * // Authenticate and get token
 * const token = await ClaudeAuth.authenticate();
 * 
 * // Check if authenticated
 * const isAuthenticated = await ClaudeAuth.isAuthenticated();
 * ```
 * 
 * @example Browser usage:
 * ```typescript
 * import { ClaudeWebAuth, LocalStorageTokenStorage } from '@vibe-kit/auth/browser';
 * 
 * const storage = new LocalStorageTokenStorage();
 * const auth = new ClaudeWebAuth(storage);
 * 
 * // Create authorization URL
 * const { url, state, codeVerifier } = ClaudeWebAuth.createAuthorizationUrl();
 * 
 * // After user authorization, exchange code for token
 * const token = await auth.authenticate(authCode, codeVerifier, state);
 * ```
 */

// Default to browser-safe exports for maximum compatibility
// For Node.js specific functionality, import from '@vibe-kit/auth/node'
export type { OAuthToken, TokenStorage } from './oauth-web.js';
export { 
  ClaudeWebAuth, 
  MemoryTokenStorage, 
  LocalStorageTokenStorage, 
  CookieTokenStorage 
} from './oauth-web.js';

// Re-export ClaudeWebAuth as default ClaudeAuth for convenience
export { ClaudeWebAuth as ClaudeAuth } from './oauth-web.js';