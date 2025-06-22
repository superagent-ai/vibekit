"use client";
import { useState } from "react";
import { ChevronRight, FileText } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface FileSummaryProps {
  files: Array<{
    filename: string;
    additions: number;
    deletions: number;
    messageIndex: number;
  }>;
  onFileClick: (fileIndex: number) => void;
}

export function FileSummary({ files, onFileClick }: FileSummaryProps) {
  if (files.length === 0) return null;

  return (
    <div className="mt-3 ml-11">
      <Collapsible>
        <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ChevronRight className="h-4 w-4 transition-transform data-[state=open]:rotate-90" />
          <FileText className="h-4 w-4" />
          <span>{files.length} file{files.length !== 1 ? 's' : ''} updated</span>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2">
          <div className="border rounded-lg p-2 bg-muted/30 space-y-1">
            {files.map((file, index) => (
              <button
                key={`${file.filename}-${index}`}
                onClick={() => onFileClick(index)}
                className="w-full text-left p-2 rounded hover:bg-muted transition-colors flex items-center justify-between group"
              >
                <div className="flex items-center gap-2">
                  <FileText className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs font-mono">{file.filename}</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-green-600">+{file.additions}</span>
                  <span className="text-red-600">-{file.deletions}</span>
                  <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </button>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}