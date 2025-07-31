import { Inngest } from "inngest";

import { realtimeMiddleware, channel, topic } from "@inngest/realtime";
import { generateClient } from "@/lib/vibekit";

let app: Inngest | undefined;

// Create a client to send and receive events
export const inngest = new Inngest({
  id: "vibekit",
  middleware: [realtimeMiddleware()],
});

export const getInngestApp = () => {
  return (app ??= new Inngest({
    id: typeof window !== "undefined" ? "client" : "server",
    middleware: [realtimeMiddleware()],
  }));
};

export const agentChannel = channel("agents").addTopic(
  topic("status").type<{
    status:
      | "INITIALIZING"
      | "CLONING_REPO"
      | "IMPLEMENTING_CODE"
      | "CREATING_PR"
      | "DONE";
    logId: string;
  }>()
);
export const createAgent = inngest.createFunction(
  {
    id: "run-agent",
  },
  { event: "app/run.agent" },
  async ({ event, step, publish }) => {
    const { repository, instructions, prompt, githubToken, logId } = event.data;
    const client = generateClient(githubToken, repository);

    await publish(
      agentChannel().status({
        status: "INITIALIZING",
        logId,
      })
    );

    await step.run("generate code", async () => {
      await client.generateCode({
        prompt:
          `## GOAL\nYour goal is to implement the below instructions into the users project.\n` +
          "DO NOT install any dependencies.\n\n" +
          `#USER INSTRUCTIONS\n${instructions}\n\n#DOCUMENTATION\n${prompt}`,
        mode: "code",
        callbacks: {
          async onUpdate(message: string) {
            try {
              const _message = JSON.parse(message);
              console.log("message", message);
              if (_message.type === "start") {
                await publish(
                  agentChannel().status({
                    status: "INITIALIZING",
                    logId,
                  })
                );
              } else if (_message.type === "git") {
                await publish(
                  agentChannel().status({
                    status: "CLONING_REPO",
                    logId,
                  })
                );
              } else {
                await publish(
                  agentChannel().status({
                    status: "IMPLEMENTING_CODE",
                    logId,
                  })
                );
              }
            } catch {
              // Log non-JSON messages for debugging but don't crash
              console.log("Received non-JSON message:", message);
            }
          },
          onError(error) {
            console.error(error);
          },
        },
      });

      await publish(
        agentChannel().status({
          status: "CREATING_PR",
          logId,
        })
      );

      await client.createPullRequest();

      return { message: "Code generated" };
    });

    await publish(
      agentChannel().status({
        status: "DONE",
        logId,
      })
    );

    return { message: "Agent run completed" };
  }
);
