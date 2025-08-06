"use client";

import { useQuery } from "convex/react";

import Chat from "@/components/chat";
import Preview from "@/components/preview";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

export default function ClientPage({ id }: { id: string }) {
  // Use Convex query to get session data
  const session = useQuery(api.sessions.getById, {
    id: id as Id<"sessions">,
  });

  return (
    <div className="flex h-screen overflow-hidden gap-x-2 pb-2">
      {session && <Chat session={session} />}
      {session && <Preview session={session} />}
    </div>
  );
}
