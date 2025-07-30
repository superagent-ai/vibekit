"use client";

import Image from "next/image";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Copy, Check } from "lucide-react";
import { ClaudeWebAuth, LocalStorageTokenStorage } from "@vibe-kit/auth";
import { completeAuthentication } from "./actions/auth";

export default function AuthExample() {
  const [authUrl, setAuthUrl] = useState("");
  const [authCode, setAuthCode] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [authState, setAuthState] = useState("");
  const [codeVerifier, setCodeVerifier] = useState("");

  const startAuth = async () => {
    try {
      const {
        url,
        state,
        codeVerifier: verifier,
      } = await ClaudeWebAuth.createAuthorizationUrl();

      setAuthUrl(url);
      setAuthState(state);
      setCodeVerifier(verifier);

      // Open in new tab
      window.open(url, "_blank");
    } catch {
      alert(
        "Failed to start authentication. Make sure Web Crypto API is available."
      );
    }
  };

  const completeAuth = async () => {
    if (!authCode || !authState || !codeVerifier) return;

    setLoading(true);
    try {
      // Call the server action to complete authentication (avoids CORS issues)
      const result = await completeAuthentication(
        authCode,
        codeVerifier,
        authState
      );

      if (result.success && result.token) {
        // Store the token in localStorage on the client side
        const storage = new LocalStorageTokenStorage("claude_oauth_demo");
        await storage.set({
          access_token: result.token,
          token_type: "bearer",
          expires_in: 3600, // Default expiration
          refresh_token: "", // We'll handle refresh separately if needed
          created_at: Date.now(), // Required property for OAuthToken
        });

        setAccessToken(result.token);
      } else {
        alert(`Authentication failed: ${result.error || "Unknown error"}`);
      }
    } catch (error) {
      if (error instanceof Error) {
        alert(`Authentication failed: ${error.message}`);
      } else {
        alert("Authentication failed: Unknown error");
      }
    } finally {
      setLoading(false);
    }
  };

  const copyToken = () => {
    navigator.clipboard.writeText(accessToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const resetDemo = () => {
    setAuthUrl("");
    setAuthCode("");
    setAccessToken("");
    setAuthState("");
    setCodeVerifier("");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4">
      <div className="max-w-2xl mx-auto py-8 flex-col flex gap-y-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-2">
            VibeKit Auth Demo
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            Authenticate with your Claude MAX subscription using @vibe-kit/auth
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>How it works</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-600 dark:text-slate-400">
            <p>
              1. <strong>Start OAuth:</strong> Generate authorization URL and
              open Claude&apos;s auth page
            </p>
            <p>
              2. <strong>User Authorization:</strong> User clicks
              &quot;Authorize&quot; and copies the authentication code
            </p>
            <p>
              3. <strong>Token Exchange:</strong> Exchange the code for an
              access token using PKCE
            </p>
            <p>
              4. <strong>Use Token:</strong> Pass the token in Authorization
              header for Claude API calls
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Step 1: Start Authentication
              {!authUrl && <Badge variant="outline">Ready</Badge>}
              {authUrl && !accessToken && (
                <Badge variant="secondary">In Progress</Badge>
              )}
              {accessToken && <Badge variant="default">Complete</Badge>}
            </CardTitle>
            <CardDescription>
              Click the button below to start the OAuth flow with Claude
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!authUrl ? (
              <Button
                onClick={startAuth}
                className="w-full bg-[#d97757]"
                size="lg"
              >
                <Image
                  src="/claude.svg"
                  alt="Claude"
                  width={20}
                  height={20}
                  className="filter brightness-0 invert"
                />
                Login with Claude
              </Button>
            ) : (
              <div className="space-y-4">
                <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
                  <p className="text-sm text-blue-800 dark:text-blue-200 mb-2">
                    ✅ Authentication page opened in new tab
                  </p>
                  <p className="text-xs text-blue-600 dark:text-blue-400">
                    If the page didn&apos;t open,{" "}
                    <a href={authUrl} target="_blank" className="underline">
                      click here
                    </a>
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        {authUrl && !accessToken && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Step 2: Enter Authentication Code</CardTitle>
              <CardDescription>
                After clicking &quot;Authorize&quot; in Claude, copy and paste
                the authentication code below
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">
                  Authentication Code (format: code#state)
                </label>
                <Input
                  placeholder="Paste your authentication code here"
                  value={authCode}
                  onChange={(e) => setAuthCode(e.target.value)}
                  className="font-mono text-lg"
                />
              </div>
              <Button
                onClick={completeAuth}
                disabled={!authCode || loading}
                className="w-full bg-[#d97757]"
                size="lg"
              >
                <Image
                  src="/claude.svg"
                  alt="Claude"
                  width={20}
                  height={20}
                  className="filter brightness-0 invert"
                />
                {loading ? "Authenticating..." : "Complete Authentication"}
              </Button>
            </CardContent>
          </Card>
        )}
        {accessToken && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Success! 🎉
                <Badge variant="default">Authenticated</Badge>
              </CardTitle>
              <CardDescription>
                You&apos;re now authenticated with your Claude MAX subscription.
                Here&apos;s your access token:
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">
                  MAX Subscription Access Token
                </label>
                <div className="flex gap-2">
                  <Input
                    value={accessToken}
                    readOnly
                    type="password"
                    className="font-mono text-xs"
                  />
                  <Button variant="outline" size="icon" onClick={copyToken}>
                    {copied ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg">
                <h4 className="font-medium text-green-800 dark:text-green-200 mb-2">
                  Next Steps:
                </h4>
                <ul className="text-sm text-green-700 dark:text-green-300 space-y-1">
                  <li>
                    • Use this token to access your MAX subscription models
                  </li>
                  <li>• Higher rate limits than pay-per-use APIs</li>
                  <li>
                    • Access to latest Claude models with your subscription
                  </li>
                  <li>• Token auto-refreshes when needed</li>
                </ul>
              </div>

              <div className="border-t pt-4">
                <h4 className="font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Use with Claude Code CLI:
                </h4>
                <pre className="bg-slate-100 dark:bg-slate-800 p-3 rounded-lg text-xs overflow-x-auto">
                  {`export CLAUDE_CODE_OAUTH_TOKEN=${accessToken}
claude -p 'hi'`}
                </pre>
              </div>

              <Button onClick={resetDemo} variant="outline" className="w-full">
                Try Again
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
