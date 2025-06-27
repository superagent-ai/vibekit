"use server";

import { cookies } from "next/headers";
import { VibeKit, VibeKitConfig } from "@vibe-kit/sdk";
import { Task } from "@/stores/tasks";

export const createPullRequestAction = async ({ task, isDraft = false }: { task: Task; isDraft?: boolean }) => {
  const cookieStore = await cookies();
  const githubToken = cookieStore.get("github_access_token")?.value;

  if (!githubToken) {
    throw new Error("No GitHub token found. Please authenticate first.");
  }

  const config: VibeKitConfig = {
    agent: {
      type: "codex",
      model: {
        apiKey: process.env.OPENAI_API_KEY!,
      },
    },
    environment: {
      e2b: {
        apiKey: process.env.E2B_API_KEY!,
      },
    },
    github: {
      token: githubToken,
      repository: task.repository,
    },
    sessionId: task.sessionId,
  };

  const vibekit = new VibeKit(config);

  const pr = await vibekit.createPullRequest({ draft: isDraft });

  return pr;
};
