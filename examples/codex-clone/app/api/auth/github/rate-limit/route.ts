import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    // Get the access token from the httpOnly cookie
    const accessToken = request.cookies.get("github_access_token")?.value;

    if (!accessToken) {
      return NextResponse.json({
        error: "Not authenticated",
        message: "Please complete GitHub OAuth login to continue"
      }, { status: 401 });
    }

    // Check rate limit status
    const response = await fetch("https://api.github.com/rate_limit", {
      headers: {
        Authorization: `token ${accessToken}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "codex-clone-App",
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to check rate limit" },
        { status: response.status }
      );
    }

    const data = await response.json();

    return NextResponse.json({
      resources: {
        core: {
          limit: data.resources.core.limit,
          remaining: data.resources.core.remaining,
          reset: data.resources.core.reset,
          used: data.resources.core.used,
          resource: data.resources.core.resource,
        },
        search: {
          limit: data.resources.search.limit,
          remaining: data.resources.search.remaining,
          reset: data.resources.search.reset,
          used: data.resources.search.used,
          resource: data.resources.search.resource,
        },
        graphql: {
          limit: data.resources.graphql.limit,
          remaining: data.resources.graphql.remaining,
          reset: data.resources.graphql.reset,
          used: data.resources.graphql.used,
          resource: data.resources.graphql.resource,
        },
        integration_manifest: {
          limit: data.resources.integration_manifest.limit,
          remaining: data.resources.integration_manifest.remaining,
          reset: data.resources.integration_manifest.reset,
          used: data.resources.integration_manifest.used,
          resource: data.resources.integration_manifest.resource,
        },
      },
      rate: {
        limit: data.rate.limit,
        remaining: data.rate.remaining,
        reset: data.rate.reset,
        used: data.rate.used,
        resource: data.rate.resource,
      },
      resetTime: new Date(data.resources.core.reset * 1000).toISOString(),
    });
  } catch (error) {
    console.error("Error checking rate limit:", error);
    return NextResponse.json(
      { error: "Failed to check rate limit" },
      { status: 500 }
    );
  }
}