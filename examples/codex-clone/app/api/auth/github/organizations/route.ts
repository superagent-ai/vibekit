import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    // Get the access token from the httpOnly cookie
    const accessToken = request.cookies.get("github_access_token")?.value;

    console.log("[Organizations API] Auth check:", {
      hasToken: !!accessToken,
      cookies: request.cookies.getAll().map(c => ({ name: c.name, hasValue: !!c.value }))
    });

    if (!accessToken) {
      return NextResponse.json({
        error: "Not authenticated",
        message: "Please complete GitHub OAuth login to continue"
      }, { status: 401 });
    }

    // First get user info to get their personal account
    const userResponse = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `token ${accessToken}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "codex-clone-App",
      },
    });

    if (!userResponse.ok) {
      const errorText = await userResponse.text();
      console.error("[Organizations API] GitHub API error:", {
        status: userResponse.status,
        statusText: userResponse.statusText,
        error: errorText
      });
      return NextResponse.json({
        error: `GitHub API error: ${userResponse.status} ${userResponse.statusText}`,
        details: errorText
      }, { status: userResponse.status });
    }

    const user = await userResponse.json();

    // Get user's organizations
    const orgsResponse = await fetch("https://api.github.com/user/orgs", {
      headers: {
        Authorization: `token ${accessToken}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "codex-clone-App",
      },
    });

    const organizations = orgsResponse.ok ? await orgsResponse.json() : [];

    // Build the complete organizations list (user + orgs)
    const allOrganizations = [
      {
        login: user.login,
        type: "User",
        avatar_url: user.avatar_url,
        id: user.id
      },
      ...organizations.map((org: any) => ({
        login: org.login,
        type: "Organization",
        avatar_url: org.avatar_url,
        id: org.id
      }))
    ];

    return NextResponse.json({
      organizations: allOrganizations
    });
  } catch (error) {
    console.error("Error fetching organizations:", error);
    return NextResponse.json(
      { error: "Failed to fetch organizations" },
      { status: 500 }
    );
  }
}