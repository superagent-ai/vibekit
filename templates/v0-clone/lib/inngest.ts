import { Inngest } from "inngest";
import { realtimeMiddleware, channel, topic } from "@inngest/realtime";
import { VibeKit } from "@vibe-kit/sdk";
import { createE2BProvider } from "@vibe-kit/e2b";
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
    const {
      sessionId,
      id,
      message,
      template,
    }: {
      sessionId: string;
      id: Id<"sessions">;
      message: string;
      template: Template;
    } = event.data;

    const e2bProvider = createE2BProvider({
      apiKey: process.env.E2B_API_KEY!,
      templateId: "vibekit-claude",
    });

    const result = await step.run("generate code", async () => {
      const vibekit = new VibeKit()
        .withAgent({
          type: "claude",
          provider: "anthropic",
          apiKey: process.env.ANTHROPIC_API_KEY!,
          model: "claude-sonnet-4-20250514",
        })
        .withSession(sessionId)
        .withSandbox(e2bProvider);

      await fetchMutation(api.sessions.update, {
        id,
        status: "CUSTOM",
        statusMessage: "Working on task",
      });

      vibekit.on("stdout", async (update) => {
        const data = JSON.parse(update);

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
                  // Add missing fields to each todo
                  const todosWithRequiredFields = data.message.content[0].input.todos.map((todo: { content: string; status: string; activeForm?: string }, index: number) => ({
                    content: todo.content,
                    id: `todo-${index + 1}`,
                    priority: "medium",
                    status: todo.status,
                  }));
                  
                  await fetchMutation(api.messages.add, {
                    sessionId: id,
                    role: "assistant",
                    content: "",
                    todos: todosWithRequiredFields,
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
      });

      const prompt =
        template?.systemPrompt ||
        "# GOAL\nYou are an helpful assistant that is tasked with helping the user build a NextJS app.\n" +
          "- The NextJS dev server is running on port 3000.\n" +
          "Do not run tests or restart the dev server.\n" +
          `Follow the users instructions:\n\n# INSTRUCTIONS\n${message}`;

      const response = await vibekit.executeCommand(
        `echo "${prompt}" | claude -p --output-format stream-json --verbose`
      );

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

    const e2bProvider = createE2BProvider({
      apiKey: process.env.E2B_API_KEY!,
      templateId: template?.image || "vibekit-claude",
    });

    const vibekit = new VibeKit()
      .withAgent({
        type: "claude",
        provider: "anthropic",
        apiKey: process.env.ANTHROPIC_API_KEY!,
        model: "claude-sonnet-4-20250514",
      })
      .withSandbox(e2bProvider)
      .withSecrets(template?.secrets || {});

    const data = await step.run("get tunnel url", async () => {
      const title = await generateSessionTitle(message);

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
          `cd /vibe0`,
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

        vibekit.on("update", (update) => {
          console.log(update);
        });

        for (const command of commands) {
          const { sandboxId: _sandboxId } =
            await vibekit.executeCommand(command);
          sandboxId = _sandboxId;
        }

        await fetchMutation(api.sessions.update, {
          id,
          repository: repository.full_name,
        });

        for await (const command of template.startCommands) {
          await fetchMutation(api.sessions.update, {
            id,
            status: command.status,
            sessionId: sandboxId,
          });

          await vibekit.executeCommand(command.command, {
            background: command.background,
          });
        }

        const host = await vibekit.getHost(3000);

        return {
          sandboxId: sandboxId,
          tunnelUrl: `https://${host}`,
        };
      } else {
        const { sandboxId: _sandboxId } = await vibekit.executeCommand(
          `git clone https://${token}@github.com/${repository}.git .`
        );

        sandboxId = _sandboxId;

        await fetchMutation(api.sessions.update, {
          id,
          status: "INSTALLING_DEPENDENCIES",
        });

        await vibekit.executeCommand("npm i");

        await fetchMutation(api.sessions.update, {
          id,
          status: "STARTING_DEV_SERVER",
        });

        await vibekit.executeCommand("npm run dev", {
          background: true,
        });

        await fetchMutation(api.sessions.update, {
          id,
          status: "CREATING_TUNNEL",
        });

        const host = await vibekit.getHost(3000);

        return {
          sandboxId: sandboxId,
          tunnelUrl: `https://${host}`,
        };
      }
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
        await runAgentAction({
          sessionId: data.sandboxId,
          id,
          message,
          template,
          repository,
          token,
        });
      });
    }

    return data;
  }
);
