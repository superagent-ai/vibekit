/**
 * Browser-specific OAuth authentication utilities for VibeKit
 * This module is safe for browser environments and excludes Node.js specific modules
 */

// Re-export all web-compatible exports
export {
  ClaudeWebAuth,
  type TokenStorage,
  MemoryTokenStorage,
  LocalStorageTokenStorage,
  CookieTokenStorage,
  type OAuthToken
} from './oauth-web.js';

// For convenience, re-export the main web auth class as ClaudeAuth as well
export { ClaudeWebAuth as ClaudeAuth } from './oauth-web.js';