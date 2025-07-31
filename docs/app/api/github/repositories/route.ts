import { NextRequest, NextResponse } from "next/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { getGithubAuth } from "@/lib/github";

// CORS headers for GitHub repositories endpoint
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders,
  });
}

export async function GET(request: NextRequest) {
  try {
    // Get the access token from the search parameters
    const searchParams = request.nextUrl.searchParams;
    const accessToken = searchParams.get("token");
    const agentId = searchParams.get("agentId");
    const agent = await fetchQuery(api.agents.getAgent, {
      id: agentId as Id<"agent">,
    });
    const project = await fetchQuery(api.projects.getProject, {
      id: agent?.projectId as Id<"project">,
    });

    if (!accessToken) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401, headers: corsHeaders }
      );
    }

    // Fetch repositories
    const repositories = await getGithubAuth(
      project?.githubClientId,
      project?.githubClientSecret
    ).getUserRepositories(accessToken);

    // Filter to only include repositories the user has push access to
    const userRepos = repositories.filter(
      (repo) =>
        !repo.fork && // Exclude forks
        repo.permissions?.push !== false // Only repos with push access
    );

    return NextResponse.json(
      {
        repositories: userRepos.map((repo) => ({
          id: repo.id,
          name: repo.name,
          full_name: repo.full_name,
          private: repo.private,
          description: repo.description,
          html_url: repo.html_url,
          default_branch: repo.default_branch,
        })),
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error("Error fetching repositories:", error);
    return NextResponse.json(
      { error: "Failed to fetch repositories" },
      { status: 500, headers: corsHeaders }
    );
  }
}
