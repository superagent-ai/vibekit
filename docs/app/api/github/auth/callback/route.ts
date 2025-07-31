import { NextRequest, NextResponse } from "next/server";
import { getGithubAuth } from "@/lib/github";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Credentials": "true",
};

// Handle preflight OPTIONS requests
export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const agentId = searchParams.get("state");
  const agent = await fetchQuery(api.agents.getAgent, {
    id: agentId as Id<"agent">,
  });
  const project = await fetchQuery(api.projects.getProject, {
    id: agent?.projectId as Id<"project">,
  });

  const error = searchParams.get("error");

  // Handle OAuth errors
  if (error) {
    const response = NextResponse.redirect(
      new URL(`/?error=${error}`, request.url)
    );
    // Add CORS headers to error response
    Object.entries(corsHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
    return response;
  }

  if (!code) {
    const response = NextResponse.redirect(
      new URL("/?error=missing_code", request.url)
    );
    // Add CORS headers to error response
    Object.entries(corsHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
    return response;
  }

  try {
    // Exchange code for access token
    const accessToken = await getGithubAuth(
      project?.githubClientId,
      project?.githubClientSecret
    ).exchangeCodeForToken(code);

    // Get user info
    const user = await getGithubAuth(
      project?.githubClientId,
      project?.githubClientSecret
    ).getUser(accessToken);

    // Create the response with a redirect to close the popup
    const response = NextResponse.redirect(
      new URL("/auth/success", request.url)
    );

    // Add CORS headers
    Object.entries(corsHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    // Set the access token in an httpOnly cookie (secure)
    response.cookies.set("github_access_token", accessToken, {
      httpOnly: false,
      secure: true, // Required for sameSite: "none"
      sameSite: "none", // Allow cross-origin access for npm packages
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    // Set user info in a readable cookie for the frontend
    response.cookies.set(
      "github_user",
      JSON.stringify({
        id: user.id,
        login: user.login,
        avatar_url: user.avatar_url,
        name: user.name,
      }),
      {
        httpOnly: false,
        secure: true, // Required for sameSite: "none"
        sameSite: "none", // Allow cross-origin access for npm packages
        maxAge: 60 * 60 * 24 * 7, // 7 days
      }
    );

    return response;
  } catch (error) {
    console.error("GitHub OAuth error:", error);
    const response = NextResponse.redirect(
      new URL("/?error=oauth_failed", request.url)
    );
    // Add CORS headers to error response
    Object.entries(corsHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
    return response;
  }
}
