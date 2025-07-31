import { NextRequest, NextResponse } from "next/server";
import { generateClient } from "@/lib/vibekit";

export const maxDuration = 800;

// Add CORS headers to the response
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

// Handle OPTIONS request for CORS preflight
export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

export async function POST(req: NextRequest) {
  try {
    const { repository, instructions, prompt, githubToken } = await req.json();

    if (!githubToken) {
      return NextResponse.json(
        {
          success: false,
          message: "No GitHub token found. Please authenticate first.",
        },
        {
          status: 401,
          headers: corsHeaders(),
        }
      );
    }

    const client = generateClient(githubToken, repository);

    await client.generateCode({
      prompt:
        `## GOAL\nYour goal is to implement the below instructions into the users project.\n` +
        "The user's instructions are based on the provided documentation." +
        " Always reference and follow the documentation when implementing these instructions.\n\n" +
        `#DOCUMENTATION\n${prompt}\n\n#USER INSTRUCTIONS\n${instructions}`,
      mode: "code",
      callbacks: {
        onUpdate(message) {
          console.log(message);
        },
        onError(error) {
          console.error(error);
        },
      },
    });

    await client.createPullRequest();

    return NextResponse.json(
      {
        success: true,
        message: "Integration request submitted successfully!",
      },
      {
        headers: corsHeaders(),
      }
    );
  } catch (error) {
    console.error("Error in /api/vibekit:", error);
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Integration failed",
      },
      {
        status: 500,
        headers: corsHeaders(),
      }
    );
  }
}
