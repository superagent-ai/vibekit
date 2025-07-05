import { Inngest } from "inngest";
import { realtimeMiddleware, channel, topic } from "@inngest/realtime";
import { VibeKit, VibeKitConfig } from "@vibe-kit/sdk";
import { fetchMutation } from "convex/nextjs";

import { api } from "@/convex/_generated/api";
import { runAgentAction } from "@/app/actions/vibekit";
import { generateSessionTitle } from "@/app/actions/session";
import { createRepo } from "@/app/actions/github";
import { Template } from "@/config";
import { Id } from "@/convex/_generated/dataModel";

let app: Inngest | undefined;
// Create a client to send and receive events
export const inngest = new Inngest({
  id: "vibe0",
  middleware: [realtimeMiddleware()],
});

export const sessionChannel = channel("sessions")
  .addTopic(
    topic("status").type<{
      status:
        | "IN_PROGRESS"
        | "CLONING_REPO"
        | "INSTALLING_DEPENDENCIES"
        | "STARTING_DEV_SERVER"
        | "CREATING_TUNNEL"
        | "RUNNING";
      sessionId: string;
      id: string;
    }>()
  )
  .addTopic(
    topic("update").type<{
      sessionId: string;
      message: Record<string, unknown>;
    }>()
  );

export const getInngestApp = () => {
  return (app ??= new Inngest({
    id: typeof window !== "undefined" ? "client" : "server",
    middleware: [realtimeMiddleware()],
  }));
};

export const runAgent = inngest.createFunction(
  { id: "run-agent", retries: 0, concurrency: 100 },
  { event: "vibe0/run.agent" },
  async ({ event, step }) => {
    const { sessionId, id, message, template } = event.data;

    const config: VibeKitConfig = {
      agent: {
        type: "claude",
        model: {
          apiKey: process.env.ANTHROPIC_API_KEY!,
        },
      },
      environment: {
        northflank: {
          apiKey: process.env.NORTHFLANK_API_KEY!,
          projectId: process.env.NORTHFLANK_PROJECT_ID!,
        },
      },
      sessionId,
    };

    const result = await step.run("generate code", async () => {
      const vibekit = new VibeKit(config);

      if (sessionId) {
        await vibekit.setSession(sessionId);
      }

      await fetchMutation(api.sessions.update, {
        id,
        status: "CUSTOM",
        statusMessage: "Working on task",
      });

      const prompt =
        template.systemPrompt +
        "Do not run tests or restart the dev server.\n" +
        `Follow the users intructions:\n\n# INSTRUCTIONS\n${message}`;

      const response = await vibekit.generateCode({
        prompt: prompt,
        mode: "code",
        callbacks: {
          async onUpdate(message) {
            console.log("onUpdate", message);
            const data = JSON.parse(message);

            if (data.type === "user") {
              await fetchMutation(api.sessions.update, {
                id,
                status: "CUSTOM",
                statusMessage: data.message.content[0].content,
              });
            }

            if (data.type === "assistant") {
              await fetchMutation(api.sessions.update, {
                id,
                status: "CUSTOM",
                statusMessage: "Working on task",
              });

              switch (data.message.content[0].type) {
                case "text":
                  await fetchMutation(api.messages.add, {
                    sessionId: id,
                    content: data.message.content[0].text,
                    role: "assistant",
                  });
                  break;
                case "tool_use":
                  const toolName = data.message.content[0].name;

                  switch (toolName) {
                    case "TodoWrite":
                      await fetchMutation(api.messages.add, {
                        sessionId: id,
                        role: "assistant",
                        content: "",
                        todos: data.message.content[0].input.todos,
                      });
                      break;
                    case "Write":
                      await fetchMutation(api.messages.add, {
                        sessionId: id,
                        role: "assistant",
                        content: "",
                        edits: {
                          filePath: data.message.content[0].input.file_path,
                          oldString: "",
                          newString: data.message.content[0].input.content,
                        },
                      });
                      break;
                    case "Edit":
                      await fetchMutation(api.messages.add, {
                        sessionId: id,
                        role: "assistant",
                        content: "",
                        edits: {
                          filePath: data.message.content[0].input.file_path,
                          oldString: data.message.content[0].input.old_string,
                          newString: data.message.content[0].input.new_string,
                        },
                      });
                      break;
                    case "Read":
                      await fetchMutation(api.messages.add, {
                        sessionId: id,
                        role: "assistant",
                        content: "",
                        read: {
                          filePath: data.message.content[0].input.file_path,
                        },
                      });
                      break;
                    case "Write":
                      await fetchMutation(api.messages.add, {
                        sessionId: id,
                        role: "assistant",
                        content: "",
                        read: {
                          filePath: data.message.content[0].input.file_path,
                        },
                      });
                    default:
                      break;
                  }
                  break;
                default:
                  break;
              }
            }
          },
        },
      });

      // // Save checkpoint to database
      // if (checkpointBranch) {
      //   await fetchMutation(api.messages.add, {
      //     sessionId: id,
      //     role: "assistant",
      //     content: "",
      //     checkpoint: {
      //       branch: checkpointBranch,
      //       patch: patchContent.length > 0 ? patchContent : undefined,
      //     },
      //   });

      //   console.log("Checkpoint saved:", checkpointBranch);
      // }

      return response;
    });

    await step.run("update session", async () => {
      await fetchMutation(api.sessions.update, {
        id,
        status: "RUNNING",
      });
    });

    return result;
  }
);

export const createSession = inngest.createFunction(
  { id: "create-session", retries: 0, concurrency: 100 },
  { event: "vibe0/create.session" },

  async ({ event, step }) => {
    const {
      sessionId: id,
      message,
      repository,
      token,
      template,
    }: {
      sessionId: Id<"sessions">;
      message: string;
      repository: string;
      token: string;
      template: Template;
    } = event.data;

    let sandboxId: string;

    const config: VibeKitConfig = {
      agent: {
        type: "claude",
        model: {
          apiKey: process.env.ANTHROPIC_API_KEY!,
        },
      },
      environment: {
        northflank: {
          apiKey: process.env.NORTHFLANK_API_KEY!,
          projectId: process.env.NORTHFLANK_PROJECT_ID!,
          image: template.image ? template.image : undefined,
        },
      },
      secrets: template.secrets,
    };

    const vibekit = new VibeKit(config);

    const data = await step.run("get tunnel url", async () => {
      const title = await generateSessionTitle(message);

      if (template.id === "nextjs-supabase-auth") {
        await vibekit.executeCommand(
          `export SUPABASE_ACCESS_TOKEN=${process.env.SUPABASE_ACCESS_TOKEN}`,
          {
            callbacks: {
              onUpdate(message) {
                console.log(message);
              },
            },
          }
        );
      }
      await fetchMutation(api.sessions.update, {
        id,
        status: "CLONING_REPO",
        name: title,
      });

      if (!repository && template) {
        const repository = await createRepo({
          repoName: `vibe0-${template.repository.replace("https://github.com/", "").replace("/", "-")}-${Date.now().toString().slice(-6)}`,
          token,
        });

        // Handle both full GitHub URLs and repo paths
        const templateCloneUrl = template.repository.startsWith(
          "https://github.com/"
        )
          ? `${template.repository}.git`
          : `https://github.com/${template.repository}.git`;

        const commands = [
          // Clone the template repo directly to root
          `git clone ${templateCloneUrl} .`,
          // Configure git user for commits
          `git config --global user.email "vibe0@vibekit.sh"`,
          `git config --global user.name "Vibe0 Bot"`,
          // Remove the template's git history and set up new repo
          `rm -rf .git`,
          `git init`,
          `git checkout -b main`,
          `git remote add origin https://${token}@github.com/${repository.full_name}.git`,
          // Add, commit and push all files
          `git add . && git commit -m "Initial commit from template ${template}" && git push -u origin main`,
        ];

        for (const command of commands) {
          const { sandboxId: _sandboxId } = await vibekit.executeCommand(
            command,
            {
              callbacks: {
                onUpdate(message) {
                  console.log(message);
                },
              },
            }
          );

          sandboxId = _sandboxId;
        }

        await fetchMutation(api.sessions.update, {
          id,
          repository: repository.full_name,
        });
      } else {
        const { sandboxId: _sandboxId } = await vibekit.executeCommand(
          `git clone https://github.com/${repository}.git`
        );

        sandboxId = _sandboxId;
      }

      await vibekit.executeCommand(`ls -la`, {
        callbacks: {
          onUpdate(message) {
            console.log(message);
          },
        },
      });

      for await (const command of template.startCommands) {
        console.log("COMMAND", command);
        await fetchMutation(api.sessions.update, {
          id,
          status: command.status,
          sessionId: sandboxId,
          statusMessage: command.statusMessage,
        });

        await vibekit.executeCommand(command.command, {
          background: command.background,
          callbacks: {
            onUpdate(message) {
              console.log(message);
            },
          },
        });
      }

      const host = await vibekit.getHost(3000);

      return {
        sandboxId: sandboxId,
        tunnelUrl: `https://${host}`,
      };
    });

    await step.sleep("wait-with-ms", 2 * 1000);

    await step.run("update session", async () => {
      await fetchMutation(api.sessions.update, {
        id,
        status: "RUNNING",
        tunnelUrl: data.tunnelUrl,
      });
    });

    if (message) {
      await step.run("run agent", async () => {
        await runAgentAction(data.sandboxId, id, message, template);
      });
    }

    return data;
  }
);
