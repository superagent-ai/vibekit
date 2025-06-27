import { NextRequest, NextResponse } from "next/server";

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  description: string | null;
  html_url: string;
  fork: boolean;
  created_at: string;
  updated_at: string;
  pushed_at: string;
  size: number;
  stargazers_count: number;
  watchers_count: number;
  language: string | null;
  default_branch: string;
  permissions?: {
    admin: boolean;
    push: boolean;
    pull: boolean;
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const org = searchParams.get("org");
    const search = searchParams.get("search") || "";

    if (!org) {
      return NextResponse.json({ error: "Organization required" }, { status: 400 });
    }

    // Get the access token from the httpOnly cookie
    const accessToken = request.cookies.get("github_access_token")?.value;

    if (!accessToken) {
      return NextResponse.json({
        error: "Not authenticated",
        message: "Please complete GitHub OAuth login to continue"
      }, { status: 401 });
    }

    // Fetch repos for the specific organization - get more repos to ensure we have a good selection
    // For personal repos, we need to check if the org is the user's login
    const userResponse = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `token ${accessToken}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "codex-clone-App",
      },
    });

    if (!userResponse.ok) {
      return NextResponse.json({ error: "Failed to fetch user" }, { status: userResponse.status });
    }

    const userData = await userResponse.json();
    const isPersonalAccount = org === userData.login;

    const reposUrl = isPersonalAccount
      ? `https://api.github.com/user/repos?sort=updated&per_page=100&affiliation=owner`
      : `https://api.github.com/orgs/${org}/repos?sort=updated&per_page=100&type=member`;

    const response = await fetch(reposUrl, {
      headers: {
        Authorization: `token ${accessToken}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "codex-clone-App",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Org-repos API] GitHub API error:", {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
        url: reposUrl
      });
      return NextResponse.json({
        error: `GitHub API error: ${response.status} ${response.statusText}`,
        details: errorText
      }, { status: response.status });
    }

    const allRepos = await response.json();

    // Filter repos by search term if provided
    let filteredRepos = allRepos;
    if (search) {
      filteredRepos = allRepos.filter((repo: GitHubRepo) =>
        repo.name.toLowerCase().includes(search.toLowerCase()) ||
        repo.full_name.toLowerCase().includes(search.toLowerCase()) ||
        (repo.description && repo.description.toLowerCase().includes(search.toLowerCase()))
      );
    }

    // Show more repos initially (30) or all if searching
    const limitedRepos = search ? filteredRepos : filteredRepos.slice(0, 30);

    // Filter and format the response - don't filter out forks or repos without push permissions
    const userRepos = limitedRepos
      .map((repo: GitHubRepo) => ({
        id: repo.id,
        name: repo.name,
        full_name: repo.full_name,
        private: repo.private,
        description: repo.description,
        html_url: repo.html_url,
        default_branch: repo.default_branch,
        language: repo.language,
        stargazers_count: repo.stargazers_count,
        forks_count: repo.forks_count,
        updated_at: repo.updated_at,
        created_at: repo.created_at,
        owner: {
          login: repo.owner.login,
          type: repo.owner.type,
          avatar_url: repo.owner.avatar_url,
        },
      }));

    return NextResponse.json({
      repositories: userRepos,
      total: filteredRepos.length,
      hasMore: search ? false : allRepos.length > 10
    });
  } catch (error) {
    console.error("Error fetching org repositories:", error);
    return NextResponse.json(
      { error: "Failed to fetch repositories" },
      { status: 500 }
    );
  }
}