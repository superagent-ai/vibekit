"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation } from "convex/react";
import { useSession } from "next-auth/react";
import Link from "next/link";

import { api } from "@/convex/_generated/api";

import ChatForm from "@/components/chat/chat-form";
import TemplatesSection from "@/components/templates-section";
import LoginDialog from "@/components/login-dialog";
import { createSessionAction } from "../actions/vibekit";
import { Repo } from "../actions/github";
import { templates } from "@/config";

export default function ClientPage() {
  const { data: session } = useSession();
  const [isLoginDialogOpen, setIsLoginDialogOpen] = useState(false);
  const router = useRouter();
  const createSession = useMutation(api.sessions.create);
  const addMessage = useMutation(api.messages.add);

  const handleChatSubmit = async (message: string, repository?: Repo) => {
    if (!session) {
      setIsLoginDialogOpen(true);
      return;
    }

    const sessionParams = {
      name: "Untitled",
      status: "IN_PROGRESS" as const,
      createdBy: session?.githubId?.toString(),
      templateId: "nextjs",
      ...(repository && { repository: repository.full_name }),
    };

    const sessionId = await createSession(sessionParams);

    const actionParams = {
      sessionId,
      message,
      ...(repository
        ? { repository: repository.full_name }
        : { template: templates.find((t) => t.id === "nextjs") }),
    };

    await createSessionAction(actionParams);

    await addMessage({
      sessionId,
      role: "user",
      content: message,
    });

    router.push(`/session/${sessionId}`);
  };

  const handleTemplateSelect = async (id: string) => {
    const template = templates.find((t) => t.id === id);

    if (template) {
      const sessionId = await createSession({
        name: "Untitled",
        status: "IN_PROGRESS",
        repository: template.repository,
        templateId: id,
        createdBy: session?.githubId?.toString(),
      });

      await createSessionAction({
        sessionId,
        template: template,
      });

      router.push(`/session/${sessionId}`);
    }
  };

  return (
    <>
      <LoginDialog
        open={isLoginDialogOpen}
        onOpenChange={setIsLoginDialogOpen}
      />
      <div className="flex flex-col gap-y-[100px] h-screen bg-background border rounded-lg mb-2">
        <div className="w-full md:max-w-2xl mx-auto md:px-10 px-4 flex flex-col gap-y-10 justify-center mt-[90px]">
          <div className="flex items-center justify-center gap-2">
            <h1 className="text-3xl md:text-4xl font-bold text-center">
              What can I help you ship?
            </h1>
          </div>
          <ChatForm
            onSubmit={handleChatSubmit}
            showRepositories={Boolean(session)}
          />
        </div>
        <div className="flex flex-col gap-y-8">
          <TemplatesSection onSelect={handleTemplateSelect} />
        </div>
        <footer className="mt-auto py-8 text-center justify-end">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            <Link href="/sessions" className="hover:underline">
              Sessions{" "}
            </Link>
            •{" "}
            <Link href="/settings" className="hover:underline">
              Settings{" "}
            </Link>
            •{" "}
            <a href="/billing" className="hover:underline">
              Billing
            </a>{" "}
            •{" "}
            <a
              href="https://vibekit.sh/privacy-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
            >
              Privacy
            </a>{" "}
            •{" "}
            <a
              href="https://vibekit.sh/terms-of-service"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
            >
              Terms
            </a>{" "}
            •{" "}
            <a
              href="https://x.com/vibekit_sh"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
            >
              X
            </a>{" "}
            •{" "}
            <a
              href="https://github.com/superagent-ai/vibekit/tree/main/templates/v0-clone"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
            >
              GitHub
            </a>
          </p>
        </footer>
      </div>
    </>
  );
}
