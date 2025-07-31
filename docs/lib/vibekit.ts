import { VibeKit, VibeKitConfig } from "@vibe-kit/sdk";

export function generateClient(githubToken: string, repository: string) {
  const config: VibeKitConfig = {
    agent: {
      type: "claude",
      model: {
        apiKey: process.env.ANTHROPIC_API_KEY!,
      },
    },
    environment: {
      e2b: {
        apiKey: process.env.E2B_API_KEY!,
      },
    },
    github: {
      token: githubToken,
      repository: repository,
    },
  };

  const client = new VibeKit(config);

  return client;
}
