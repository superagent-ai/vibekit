"use client";
import { useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { FileIcon, ChevronDown, ChevronRight } from "lucide-react";

import { Doc } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import FileDiff from "../file-diff";

interface FileEditItemProps {
  message: {
    edits?: {
      filePath?: string;
      oldString?: string;
      newString?: string;
    };
  };
}

function calculateDiffStats(oldContent: string, newContent: string) {
  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");

  // Simple line-based diff calculation
  const oldSet = new Set(oldLines);
  const newSet = new Set(newLines);

  let insertions = 0;
  let deletions = 0;

  // Count insertions (lines in new but not in old)
  for (const line of newLines) {
    if (!oldSet.has(line)) {
      insertions++;
    }
  }

  // Count deletions (lines in old but not in new)
  for (const line of oldLines) {
    if (!newSet.has(line)) {
      deletions++;
    }
  }

  return { insertions, deletions };
}

function FileEditItem({ message }: FileEditItemProps) {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const filePath = message.edits?.filePath ?? "";

  const diffStats = useMemo(() => {
    const oldContent = message.edits?.oldString ?? "";
    const newContent = message.edits?.newString ?? "";
    return calculateDiffStats(oldContent, newContent);
  }, [message.edits?.oldString, message.edits?.newString]);

  const toggleExpanded = () => {
    setIsExpanded((prev) => !prev);
  };

  return (
    <div
      className="flex flex-col gap-0 bg-background border rounded-lg overflow-hidden mb-4"
      key={filePath}
    >
      <div
        className={cn(
          "flex items-center gap-2 h-10 px-4 cursor-pointer hover:bg-sidebar transition-colors",
          isExpanded && " border-b"
        )}
        onClick={toggleExpanded}
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-gray-500" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-500" />
        )}
        <FileIcon className="w-4 h-4" />
        <p className="text-sm flex-1">{filePath}</p>
        <div className="flex items-center gap-1 text-xs">
          <span className="text-green-600">+{diffStats.insertions}</span>
          <span className="text-red-600">-{diffStats.deletions}</span>
        </div>
      </div>
      {isExpanded && (
        <FileDiff
          oldContent={message.edits?.oldString ?? ""}
          newContent={message.edits?.newString ?? ""}
        />
      )}
    </div>
  );
}

export default function Files({ session }: { session: Doc<"sessions"> }) {
  const messages = useQuery(api.messages.getBySession, {
    sessionId: session._id,
  });

  const messageWithEdits = messages?.filter(
    (message) => message.role === "assistant" && message.edits
  );

  return (
    <div className="flex-1 h-full overflow-hidden relative">
      <div className="flex-1 h-full overflow-hidden relative p-4">
        {messageWithEdits?.map((message) => {
          const filePath = message.edits?.filePath ?? "";

          return <FileEditItem key={filePath} message={message} />;
        })}
      </div>
    </div>
  );
}
