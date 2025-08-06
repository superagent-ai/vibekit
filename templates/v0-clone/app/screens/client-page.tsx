"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation } from "convex/react";
import { useSession } from "next-auth/react";

import { api } from "@/convex/_generated/api";

import ChatForm from "@/components/chat/chat-form";
import TemplatesSection from "@/components/templates-section";
import LoginDialog from "@/components/login-dialog";
import { Footer } from "@/components/footer";
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
        <Footer />
      </div>
    </>
  );
}
