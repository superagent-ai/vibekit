import * as oauth from "oauth4webapi";
import type { OAuthToken } from "./oauth.js";

// Re-export OAuthToken for convenience
export type { OAuthToken };

// OAuth configuration
const OAUTH_CONFIG = {
  clientId: "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
  authorizationUrl: "https://claude.ai/oauth/authorize",
  tokenUrl: "https://console.anthropic.com/v1/oauth/token",
  redirectUri: "https://console.anthropic.com/oauth/code/callback",
  scope: "org:create_api_key user:profile user:inference",
  betaHeader: "oauth-2025-04-20",
};

/**
 * Token storage interface for web applications
 * Implementations can use cookies, localStorage, sessionStorage, or server-side sessions
 */
export interface TokenStorage {
  get(): Promise<OAuthToken | null>;
  set(token: OAuthToken): Promise<void>;
  remove(): Promise<void>;
}

/**
 * In-memory token storage (for server-side use)
 */
export class MemoryTokenStorage implements TokenStorage {
  private tokens = new Map<string, OAuthToken>();

  constructor(private sessionId: string) {}

  async get(): Promise<OAuthToken | null> {
    return this.tokens.get(this.sessionId) || null;
  }

  async set(token: OAuthToken): Promise<void> {
    this.tokens.set(this.sessionId, token);
  }

  async remove(): Promise<void> {
    this.tokens.delete(this.sessionId);
  }
}

/**
 * Web OAuth authentication helper
 * Designed for use in web applications with manual code input (like CLI)
 */
export class ClaudeWebAuth {
  private storage: TokenStorage;

  constructor(storage: TokenStorage) {
    this.storage = storage;
  }

  /**
   * Generate PKCE code verifier and challenge
   */
  static async generatePKCE() {
    const codeVerifier = oauth.generateRandomCodeVerifier();
    const codeChallenge = await oauth.calculatePKCECodeChallenge(codeVerifier);

    return { codeVerifier, codeChallenge };
  }

  /**
   * Generate random state for OAuth flow
   */
  static generateState() {
    return oauth.generateRandomState();
  }

  /**
   * Create authorization URL with ?code=true for manual code copying
   * @returns Authorization URL, state, and PKCE verifier
   */
  static async createAuthorizationUrl(): Promise<{
    url: string;
    state: string;
    codeVerifier: string;
    codeChallenge: string;
  }> {
    // Generate PKCE and state
    const { codeVerifier, codeChallenge } = await ClaudeWebAuth.generatePKCE();
    const state = ClaudeWebAuth.generateState();

    // Build authorization URL with ?code=true (like CLI)
    const authUrl = new URL(OAUTH_CONFIG.authorizationUrl);
    authUrl.searchParams.set("code", "true");
    authUrl.searchParams.set("client_id", OAUTH_CONFIG.clientId);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", OAUTH_CONFIG.scope);
    authUrl.searchParams.set("redirect_uri", OAUTH_CONFIG.redirectUri);
    authUrl.searchParams.set("code_challenge", codeChallenge);
    authUrl.searchParams.set("code_challenge_method", "S256");
    authUrl.searchParams.set("state", state);

    return {
      url: authUrl.toString(),
      state,
      codeVerifier,
      codeChallenge,
    };
  }

  /**
   * Exchange authorization code for access token
   * @param authCode - Authorization code in format "code#state" from Claude
   * @param codeVerifier - PKCE code verifier
   * @param expectedState - Expected state for validation
   */
  static async exchangeCodeForToken(
    authCode: string,
    codeVerifier: string,
    expectedState: string
  ): Promise<OAuthToken> {
    // Parse code and state from pasted string (format: code#state)
    const [code, pastedState] = authCode.split("#");

    if (!code || !pastedState) {
      throw new Error(
        "Invalid authentication code format. Expected: code#state"
      );
    }

    if (pastedState !== expectedState) {
      throw new Error("State mismatch. Authentication failed.");
    }

    const body = {
      grant_type: "authorization_code",
      code,
      state: pastedState,
      code_verifier: codeVerifier,
      redirect_uri: OAUTH_CONFIG.redirectUri,
      client_id: OAUTH_CONFIG.clientId,
    };

    const response = await fetch(OAUTH_CONFIG.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "anthropic-beta": OAUTH_CONFIG.betaHeader,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to exchange code for token: ${error}`);
    }

    const tokenData = (await response.json()) as any;
    return {
      ...tokenData,
      created_at: Date.now(),
    } as OAuthToken;
  }

  /**
   * Refresh access token using refresh token
   * @param refreshToken - The refresh token
   */
  static async refreshAccessToken(refreshToken: string): Promise<OAuthToken> {
    const response = await fetch(OAUTH_CONFIG.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "anthropic-beta": OAUTH_CONFIG.betaHeader,
      },
      body: JSON.stringify({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: OAUTH_CONFIG.clientId,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to refresh token: ${error}`);
    }

    const tokenData = (await response.json()) as any;
    return {
      ...tokenData,
      created_at: Date.now(),
      // Keep the refresh token if not provided in response
      refresh_token: tokenData.refresh_token || refreshToken,
    } as OAuthToken;
  }

  /**
   * Authenticate with OAuth using manual code input
   * @param authCode - Authorization code in format "code#state" from Claude
   * @param codeVerifier - PKCE verifier from createAuthorizationUrl
   * @param expectedState - Expected state from createAuthorizationUrl
   */
  async authenticate(
    authCode: string,
    codeVerifier: string,
    expectedState: string
  ): Promise<OAuthToken> {
    // Exchange code for token
    const token = await ClaudeWebAuth.exchangeCodeForToken(
      authCode,
      codeVerifier,
      expectedState
    );

    // Store token
    await this.storage.set(token);

    return token;
  }

  /**
   * Get current token from storage
   */
  async getToken(): Promise<OAuthToken | null> {
    return this.storage.get();
  }

  /**
   * Get valid access token (refresh if needed)
   */
  async getValidToken(): Promise<string | null> {
    const token = await this.storage.get();

    if (!token) {
      return null;
    }

    // Check if expired (with 1 hour buffer)
    if (token.expires_in && token.created_at) {
      const expiresAt = token.created_at + token.expires_in * 1000;
      const isExpired = Date.now() > expiresAt - 60 * 60 * 1000;

      if (isExpired && token.refresh_token) {
        try {
          const newToken = await ClaudeWebAuth.refreshAccessToken(
            token.refresh_token
          );
          await this.storage.set(newToken);
          return newToken.access_token;
        } catch (error) {
          console.error("Failed to refresh token:", error);
          return null;
        }
      }
    }

    return token.access_token;
  }

  /**
   * Check if currently authenticated
   */
  async isAuthenticated(): Promise<boolean> {
    const token = await this.getValidToken();
    return token !== null;
  }

  /**
   * Clear stored token (logout)
   */
  async logout(): Promise<void> {
    await this.storage.remove();
  }

  /**
   * Verify token with API call
   */
  async verify(): Promise<boolean> {
    const accessToken = await this.getValidToken();
    if (!accessToken) {
      return false;
    }

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "anthropic-version": "2023-06-01",
          "anthropic-beta": "oauth-2025-04-20",
          Authorization: `Bearer ${accessToken}`,
          "X-API-Key": "",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 10,
          system: "You are Claude Code, Anthropic's official CLI for Claude.",
          messages: [
            {
              role: "user",
              content: "Reply with OK only.",
            },
          ],
        }),
      });

      return response.ok;
    } catch {
      return false;
    }
  }
}

/**
 * Browser localStorage token storage
 * Only use this for non-sensitive applications or with additional security measures
 */
export class LocalStorageTokenStorage implements TokenStorage {
  constructor(private key: string = "claude_oauth_token") {}

  async get(): Promise<OAuthToken | null> {
    if (typeof window === "undefined" || !window.localStorage) {
      return null;
    }

    const data = localStorage.getItem(this.key);
    if (!data) return null;

    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  async set(token: OAuthToken): Promise<void> {
    if (typeof window === "undefined" || !window.localStorage) {
      throw new Error("localStorage not available");
    }

    window.localStorage.setItem(this.key, JSON.stringify(token));
  }

  async remove(): Promise<void> {
    if (typeof window === "undefined" || !window.localStorage) {
      return;
    }

    window.localStorage.removeItem(this.key);
  }
}

/**
 * Cookie-based token storage (for server-side rendering)
 * Note: This is a basic implementation. In production, use secure, httpOnly cookies
 */
export class CookieTokenStorage implements TokenStorage {
  constructor(
    private getCookie: (name: string) => string | undefined,
    private setCookie: (name: string, value: string, options?: any) => void,
    private removeCookie: (name: string) => void,
    private cookieName: string = "claude_oauth_token"
  ) {}

  async get(): Promise<OAuthToken | null> {
    const data = this.getCookie(this.cookieName);
    if (!data) return null;

    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  async set(token: OAuthToken): Promise<void> {
    this.setCookie(this.cookieName, JSON.stringify(token), {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });
  }

  async remove(): Promise<void> {
    this.removeCookie(this.cookieName);
  }
}
