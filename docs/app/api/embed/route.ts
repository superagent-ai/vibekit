import { fetchQuery } from "convex/nextjs";
import { NextRequest, NextResponse } from "next/server";

import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

// CORS headers for embed endpoint
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

export async function GET(request: NextRequest) {
  // Get the agent ID from query parameters
  const { searchParams } = new URL(request.url);
  const agentId = searchParams.get("agentId");

  // Validate that agentId is provided
  if (!agentId) {
    return NextResponse.json(
      { error: "Agent ID is required" },
      { status: 400, headers: corsHeaders }
    );
  }

  // Fetch the agent by ID
  const agent = await fetchQuery(api.agents.getAgent, {
    id: agentId as Id<"agent">,
  });

  // Check if agent exists
  if (!agent) {
    return NextResponse.json(
      { error: "Agent not found" },
      { status: 404, headers: corsHeaders }
    );
  }

  // Fetch the associated project using the agent's projectId
  const project = await fetchQuery(api.projects.getProject, {
    id: agent.projectId,
  });

  // Check if project exists
  if (!project) {
    return NextResponse.json(
      { error: "Project not found" },
      { status: 404, headers: corsHeaders }
    );
  }

  // Return both agent and project with CORS headers
  return NextResponse.json(
    {
      agent,
      project,
    },
    { headers: corsHeaders }
  );
}
