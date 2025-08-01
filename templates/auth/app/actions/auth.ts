"use server";

import { ClaudeWebAuth } from "@vibe-kit/auth";

export async function completeAuthentication(
  authCode: string,
  codeVerifier: string,
  authState: string
): Promise<{ success: boolean; token?: string; error?: string }> {
  try {
    // Use the static method to exchange code for token (no storage needed on server)
    const result = await ClaudeWebAuth.exchangeCodeForToken(
      authCode,
      codeVerifier,
      authState
    );

    if (result.access_token) {
      return {
        success: true,
        token: result.access_token,
      };
    } else {
      return {
        success: false,
        error: "Failed to obtain access token",
      };
    }
  } catch (error) {
    console.error("Authentication error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}
