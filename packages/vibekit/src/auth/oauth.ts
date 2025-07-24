import crypto from "crypto";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import os from "os";
import readline from "readline";

const execAsync = promisify(exec);

// OAuth configuration
const OAUTH_CONFIG = {
  clientId: "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
  authorizationUrl: "https://claude.ai/oauth/authorize",
  tokenUrl: "https://console.anthropic.com/v1/oauth/token",
  redirectUri: "https://console.anthropic.com/oauth/code/callback",
  scope: "org:create_api_key user:profile user:inference",
  betaHeader: "oauth-2025-04-20",
};

// Token storage path
const TOKEN_PATH = path.join(os.homedir(), ".vibekit", "claude-oauth-token.json");

export interface OAuthToken {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  created_at: number;
}

/**
 * Generate PKCE code verifier and challenge
 */
function generatePKCE() {
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto
    .createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  
  return { codeVerifier, codeChallenge };
}

/**
 * Generate random state for OAuth flow
 */
function generateState() {
  return crypto.randomBytes(32).toString("base64url");
}

/**
 * Prompt user for authentication code
 */
async function promptForAuthCode(): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question("Authentication Code: ", (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

/**
 * Exchange authorization code for access token
 */
async function exchangeCodeForToken(code: string, codeVerifier: string, state: string): Promise<OAuthToken> {
  const body = JSON.stringify({
    grant_type: "authorization_code",
    code,
    state,
    code_verifier: codeVerifier,
    redirect_uri: OAUTH_CONFIG.redirectUri,
    client_id: OAUTH_CONFIG.clientId,
  });
  
  const response = await fetch(OAUTH_CONFIG.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "anthropic-beta": OAUTH_CONFIG.betaHeader,
    },
    body,
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to exchange code for token: ${error}`);
  }
  
  const tokenData = await response.json();
  return {
    ...tokenData,
    created_at: Date.now(),
  };
}

/**
 * Save token to disk
 */
export async function saveToken(token: OAuthToken): Promise<void> {
  const tokenDir = path.dirname(TOKEN_PATH);
  await fs.mkdir(tokenDir, { recursive: true });
  await fs.writeFile(TOKEN_PATH, JSON.stringify(token, null, 2));
  // Set restrictive permissions
  await fs.chmod(TOKEN_PATH, 0o600);
}

/**
 * Load token from disk
 */
export async function loadToken(): Promise<OAuthToken | null> {
  try {
    const tokenData = await fs.readFile(TOKEN_PATH, "utf-8");
    return JSON.parse(tokenData);
  } catch {
    return null;
  }
}

/**
 * Check if token is expired
 */
export function isTokenExpired(token: OAuthToken): boolean {
  if (!token.expires_in) return false;
  
  const expiresAt = token.created_at + token.expires_in * 1000;
  // Add 1 hour buffer (refresh an hour early)
  return Date.now() > expiresAt - 60 * 60 * 1000;
}

/**
 * Refresh access token
 */
export async function refreshToken(token: OAuthToken): Promise<OAuthToken> {
  if (!token.refresh_token) {
    throw new Error("No refresh token available");
  }
  
  const body = JSON.stringify({
    grant_type: "refresh_token",
    refresh_token: token.refresh_token,
    client_id: OAUTH_CONFIG.clientId,
  });
  
  const response = await fetch(OAUTH_CONFIG.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "anthropic-beta": OAUTH_CONFIG.betaHeader,
    },
    body,
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to refresh token: ${error}`);
  }
  
  const newTokenData = await response.json();
  const newToken: OAuthToken = {
    ...newTokenData,
    created_at: Date.now(),
    // Keep refresh token if not provided in response
    refresh_token: newTokenData.refresh_token || token.refresh_token,
  };
  
  await saveToken(newToken);
  return newToken;
}

/**
 * Authenticate with Claude using OAuth
 */
export async function authenticate(): Promise<OAuthToken> {
  console.log("🚀 Starting Claude OAuth authentication flow...");
  
  // Generate PKCE parameters
  const { codeVerifier, codeChallenge } = generatePKCE();
  const state = generateState();
  
  // Build authorization URL with ?code=true
  const authUrl = new URL(OAUTH_CONFIG.authorizationUrl);
  authUrl.searchParams.set("code", "true");
  authUrl.searchParams.set("client_id", OAUTH_CONFIG.clientId);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", OAUTH_CONFIG.scope);
  authUrl.searchParams.set("redirect_uri", OAUTH_CONFIG.redirectUri);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("state", state);
  
  // Open browser
  console.log("\n📂 Opening Claude authentication page in your browser...");
  const openCommand = process.platform === "darwin" 
    ? "open" 
    : process.platform === "win32" 
    ? "start" 
    : "xdg-open";
  
  try {
    await execAsync(`${openCommand} "${authUrl.toString()}"`);
  } catch (error) {
    console.error("Failed to open browser automatically.");
    console.log("Please open this URL manually:", authUrl.toString());
  }
  
  // Prompt user to paste authentication code
  console.log("\n📋 Click 'Authorize', copy the Authentication Code, then paste it below.");
  console.log("");
  
  const pastedCode = await promptForAuthCode();
  
  // Parse code and state from pasted string (format: code#state)
  const [code, pastedState] = pastedCode.split("#");
  
  if (!code || !pastedState) {
    throw new Error("Invalid authentication code format. Expected: code#state");
  }
  
  if (pastedState !== state) {
    throw new Error("State mismatch. Authentication failed.");
  }
  
  // Exchange code for token
  console.log("\n🔄 Exchanging code for access token...");
  const token = await exchangeCodeForToken(code, codeVerifier, state);
  
  // Save token
  await saveToken(token);
  
  console.log("✅ Authentication successful! Token saved.");
  return token;
}

/**
 * Get valid access token (refresh if needed)
 */
export async function getValidToken(): Promise<string | null> {
  const token = await loadToken();
  
  if (!token) {
    return null;
  }
  
  if (isTokenExpired(token)) {
    try {
      const newToken = await refreshToken(token);
      return newToken.access_token;
    } catch (error) {
      console.error("Failed to refresh token:", error);
      return null;
    }
  }
  
  return token.access_token;
}

/**
 * Clear saved token
 */
export async function clearToken(): Promise<void> {
  try {
    await fs.unlink(TOKEN_PATH);
    console.log("✅ OAuth token cleared.");
  } catch (error) {
    // Ignore if file doesn't exist
  }
}

/**
 * Exchange refresh token for new access token (for import)
 */
export async function refreshTokenToAccessToken(refreshTokenString: string): Promise<OAuthToken> {
  const body = JSON.stringify({
    grant_type: "refresh_token",
    refresh_token: refreshTokenString,
    client_id: OAUTH_CONFIG.clientId,
  });
  
  const response = await fetch(OAUTH_CONFIG.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "anthropic-beta": OAUTH_CONFIG.betaHeader,
    },
    body,
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to exchange refresh token: ${error}`);
  }
  
  const tokenData = await response.json();
  return {
    ...tokenData,
    created_at: Date.now(),
    refresh_token: tokenData.refresh_token || refreshTokenString,
  };
}