"use client";
import { useCopyToClipboard } from "usehooks-ts";
import { useState } from "react";
import { useParams } from "next/navigation";
import { Copy, Trash2, Check, Pen, Eye } from "lucide-react";
import { useQuery, useMutation } from "convex/react";
import { useSession } from "next-auth/react";

import { api } from "@/convex/_generated/api";
import { Id, Doc } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Markdown } from "../markdown";
import { cn } from "@/lib/utils";
import { Avatar, AvatarImage, AvatarFallback } from "@radix-ui/react-avatar";

export default function Message({
  message,
  showAvatar = true,
}: {
  message: Doc<"messages">;
  showAvatar?: boolean;
}) {
  const { data: authSession } = useSession();
  const params = useParams();
  const sessionId = params.id as string;
  const session = useQuery(api.sessions.getById, {
    id: sessionId as Id<"sessions">,
  });
  const deleteMessage = useMutation(api.messages.remove);
  const [, copy] = useCopyToClipboard();
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = async () => {
    const success = await copy(message.content);
    if (success) {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  const handleDelete = async () => {
    if (session) {
      await deleteMessage({
        id: message._id as Id<"messages">,
        sessionId: session.id as Id<"sessions">,
      });
    }
  };

  if (message.role === "user") {
    return (
      <div className="group relative rounded-lg cursor-pointer hover:bg-muted">
        <div className="flex items-start gap-x-2">
          {showAvatar ? (
            <div className="size-8 rounded-lg border bg-muted flex items-center justify-center">
              <Avatar>
                <AvatarImage
                  src={authSession?.user?.image || ""}
                  className="rounded-md"
                />
                <AvatarFallback>
                  {authSession?.user?.name?.charAt(0)}
                </AvatarFallback>
              </Avatar>
            </div>
          ) : (
            <div className="size-8" />
          )}
          <div className="flex flex-col gap-y-1 flex-1">
            <p className="text-sm">
              {message.content.length > 250
                ? message.content.slice(0, 250) + "..."
                : message.content}
            </p>
          </div>
        </div>
        <div className="absolute border rounded-lg p-1 bg-background top-2 right-2 flex opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            aria-label="Copied!"
            onClick={handleCopy}
          >
            {isCopied ? (
              <Check className="size-4 text-green-600" />
            ) : (
              <Copy className="size-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDelete}
            className="size-6"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
    );
  }

  if (message.edits) {
    return (
      <div className="pl-10">
        <p className="text-xs flex items-center gap-x-2">
          <span className="font-medium text-muted-foreground flex items-center gap-x-1">
            <Pen className="size-3" />
            Updated:
          </span>
          <span className="text-muted-foreground truncate max-w-[250px]">
            {message.edits.filePath}
          </span>
        </p>
      </div>
    );
  }

  if (message.read) {
    return (
      <div className="pl-10">
        <p className="text-xs flex items-center gap-x-2">
          <span className="font-medium text-muted-foreground flex items-center gap-x-1">
            <Eye className="size-3" />
            Read:
          </span>
          <span className="text-muted-foreground truncate max-w-[270px]">
            {message.read.filePath}
          </span>
        </p>
      </div>
    );
  }

  return (
    <div className="group relative rounded-lg cursor-pointer hover:bg-muted">
      <div className="flex items-start gap-x-2">
        {showAvatar ? (
          <div className="size-8 rounded-lg bg-background border flex items-center justify-center -mt-1.5">
            <span role="img" aria-label="spock emoji">
              🖖
            </span>
          </div>
        ) : (
          <div className="size-8" />
        )}
        <div className={cn("flex flex-col gap-y-1 flex-1")}>
          <Markdown>{message.content}</Markdown>
        </div>
      </div>
      <div className="absolute border rounded-lg p-1 bg-background top-2 right-2 flex opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          aria-label="Copied!"
          onClick={handleCopy}
        >
          {isCopied ? (
            <Check className="size-4 text-green-600" />
          ) : (
            <Copy className="size-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
