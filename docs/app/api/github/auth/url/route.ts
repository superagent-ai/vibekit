import { NextResponse } from "next/server";
import { fetchQuery } from "convex/nextjs";

import { getGithubAuth } from "@/lib/github";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

// CORS headers for GitHub auth endpoint
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// Handle preflight requests
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders,
  });
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get("agentId");
    const agent = await fetchQuery(api.agents.getAgent, {
      id: agentId as Id<"agent">,
    });

    if (!agentId) {
      return NextResponse.json(
        { error: "agentId is required" },
        { status: 400, headers: corsHeaders }
      );
    }

    const project = await fetchQuery(api.projects.getProject, {
      id: agent?.projectId as Id<"project">,
    });

    const authUrl = getGithubAuth(
      project?.githubClientId,
      project?.githubClientSecret
    ).getAuthUrl(agentId);

    return NextResponse.json({ url: authUrl }, { headers: corsHeaders });
  } catch (error) {
    console.error("Error generating auth URL:", error);
    return NextResponse.json(
      { error: "Failed to generate auth URL" },
      { status: 500, headers: corsHeaders }
    );
  }
}
