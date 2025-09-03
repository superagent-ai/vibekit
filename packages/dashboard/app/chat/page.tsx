'use client';

import { ChatInterface } from '@vibe-kit/ai-chat';
import { SidebarTrigger } from "@/components/ui/sidebar";

export default function ChatPage() {
  return (
    <div className="flex flex-col h-screen">
      <div className="px-6">
        <div className="-mx-6 px-4 border-b flex h-12 items-center">
          <div className="flex items-center gap-2">
            <SidebarTrigger />
            <h1 className="text-lg font-bold">AI Chat</h1>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <ChatInterface className="h-full" />
      </div>
    </div>
  );
}