"use server";
import { VibeKit } from "@vibe-kit/sdk";
import { createE2BProvider } from "@vibe-kit/e2b";
import { fetchMutation } from "convex/nextjs";

import { api } from "@/convex/_generated/api";
import { inngest } from "@/lib/inngest";
import { auth } from "@/lib/auth";
import { Id } from "@/convex/_generated/dataModel";
import { Template } from "@/config";

export async function runAgentAction({
  sessionId,
  id,
  message,
  template,
  repository,
  token,
}: {
  sessionId: string;
  id: string;
  message: string;
  template?: Template;
  token: string;
  repository?: string;
}) {
  await inngest.send({
    name: "vibe0/run.agent",
    data: {
      sessionId,
      id,
      message,
      template,
      repository,
      token,
    },
  });
}

export async function createSessionAction({
  sessionId,
  message,
  repository,
  template,
}: {
  sessionId: string;
  message?: string;
  repository?: string;
  template?: Template;
}) {
  const session = await auth();
  await inngest.send({
    name: "vibe0/create.session",
    data: {
      sessionId,
      message,
      repository,
      token: session?.accessToken,
      template,
    },
  });
}

export async function deleteSessionAction(sessionId: string) {
  const e2bProvider = createE2BProvider({
    apiKey: process.env.E2B_API_KEY!,
    templateId: "vibekit-claude",
  });

  const vibekit = new VibeKit()
    .withAgent({
      type: "claude",
      provider: "anthropic",
      apiKey: process.env.ANTHROPIC_API_KEY!,
      model: "claude-sonnet-4-20250514",
    })
    .withSandbox(e2bProvider);

  await vibekit.setSession(sessionId);
  await vibekit.kill();
}

export const createPullRequestAction = async ({
  id,
  sessionId,
  repository,
}: {
  id: Id<"sessions">;
  sessionId: string;
  repository: string;
}) => {
  const session = await auth();

  if (!session?.accessToken) {
    throw new Error("No GitHub token found. Please authenticate first.");
  }

  const e2bProvider = createE2BProvider({
    apiKey: process.env.E2B_API_KEY!,
    templateId: "vibekit-claude",
  });

  const vibekit = new VibeKit()
    .withAgent({
      type: "claude",
      provider: "anthropic",
      apiKey: process.env.ANTHROPIC_API_KEY!,
      model: "claude-sonnet-4-20250514",
    })
    .withSandbox(e2bProvider)
    .withGithub({
      token: session?.accessToken,
      repository,
    });

  await vibekit.setSession(sessionId);

  const pr = await vibekit.createPullRequest(
    {
      name: "🖖 vibe0",
      color: "42460b",
      description: "Pull request created by vibe0",
    },
    "vibe0"
  );

  await fetchMutation(api.sessions.update, {
    id,
    pullRequest: pr,
  });
};
