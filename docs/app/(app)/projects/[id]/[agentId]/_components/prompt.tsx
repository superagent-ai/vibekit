"use client";
import { useState, useEffect } from "react";
import { InfoIcon, Loader2, Sparkles } from "lucide-react";

import { MarkdownEditor } from "@/components/markdown-editor";
import { Doc } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Props {
  agent: Doc<"agent">;
  onChange: (value: string) => void;
  onImportFromUrl: (url: string) => Promise<void>;
  isImporting: boolean;
  promptValue: string;
}

export default function Prompt({
  agent,
  onChange,
  onImportFromUrl,
  isImporting,
  promptValue,
}: Props) {
  const [systemPrompt, setSystemPrompt] = useState(
    promptValue ||
      (agent.systemPrompt as string) ||
      `## ADD YOUR DOCUMENTATION AND OTHER INSTRUCTIONS HERE`
  );
  const [importUrl, setImportUrl] = useState("");

  useEffect(() => {
    if (promptValue) {
      setSystemPrompt(promptValue);
    } else if (agent.systemPrompt) {
      setSystemPrompt(agent.systemPrompt as string);
    }
  }, [agent.systemPrompt, promptValue]);

  const handleImportClick = async () => {
    if (!importUrl.trim()) return;

    await onImportFromUrl(importUrl);
    setImportUrl("");
  };

  return (
    <div className="flex flex-col h-full space-between space-y-4 pb-8 pt-4 max-h-[calc(100vh-290px)]">
      <div className="bg-muted border rounded-lg p-4 flex-shrink-0">
        <div className="flex items-start space-x-3">
          <InfoIcon className="size-4 mt-0.5 text-blue-600 flex-shrink-0" />
          <div>
            <p className="text-sm">
              Include comprehensive SDK/API documentation, authentication
              details, and usage examples.
            </p>
          </div>
        </div>
      </div>

      <div className="flex gap-2 flex-shrink-0">
        <Input
          placeholder="Import from URL..."
          value={importUrl}
          onChange={(e) => setImportUrl(e.target.value)}
          className="flex-1"
        />
        <Button
          onClick={handleImportClick}
          disabled={!importUrl.trim() || isImporting}
          variant="outline"
          size="default"
        >
          {isImporting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          Generate
        </Button>
      </div>

      <div className="flex flex-col flex-1 items-center rounded-lg border justify-between overflow-hidden">
        <MarkdownEditor
          value={systemPrompt}
          onChange={(value) => {
            setSystemPrompt(value);
            onChange(value);
          }}
          className="h-w-full h-full" // TODO: Implement system prompt update functionality
        />
      </div>
    </div>
  );
}
