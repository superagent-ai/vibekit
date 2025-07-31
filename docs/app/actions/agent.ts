"use server";

import { inngest } from "@/lib/inngest";

export const createAgent = async ({
  repository,
  instructions,
  prompt,
  githubToken,
  logId,
}: {
  repository: string;
  instructions: string;
  prompt: string;
  githubToken: string;
  logId: string;
}) => {
  await inngest.send({
    name: "app/run.agent",
    data: {
      repository,
      instructions,
      prompt,
      githubToken,
      logId,
    },
  });
};
