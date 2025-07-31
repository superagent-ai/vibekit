"use client";
import { Info, Copy, Check } from "lucide-react";
import { useCopyToClipboard } from "usehooks-ts";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Doc } from "@/convex/_generated/dataModel";
import { siteConfig } from "@/config";

interface Props {
  agent: Doc<"agent">;
}

export default function Preview({ agent }: Props) {
  const [, copy] = useCopyToClipboard();
  const [isCopied, setIsCopied] = useState(false);

  const agentUrl = `${siteConfig.baseUrl}/embed/${agent._id}`;

  const handleCopy = async () => {
    try {
      await copy(agentUrl);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000); // Reset after 2 seconds
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  return (
    <div className=" w-full mx-auto flex flex-col items-center justify-center h-full">
      <div className="w-full bg-background overflow-hidden mb-4 relative">
        <iframe
          src={agentUrl}
          className="w-full h-[800px] border-0"
          title="Widget Preview"
          sandbox="allow-scripts allow-same-origin allow-forms"
        />
      </div>
      <div className="w-full max-w-lg bg-background border rounded-lg py-3 px-3 mb-4 relative flex items-center justify-between">
        <p className="text-muted-foreground text-sm">{agentUrl}</p>
        <Button
          variant="outline"
          size="icon"
          onClick={handleCopy}
          className="ml-2 absolute right-1"
        >
          {isCopied ? (
            <Check className="w-4 h-4 text-green-500" />
          ) : (
            <Copy className="w-4 h-4" />
          )}
        </Button>
      </div>
      <div className="flex items-center gap-2 mt-10">
        <Info className="w-4 h-4 text-muted-foreground" />
        <p className="text-center text-sm text-muted-foreground">
          Embed this url into an iframe or use the direct link.
        </p>
      </div>
    </div>
  );
}
