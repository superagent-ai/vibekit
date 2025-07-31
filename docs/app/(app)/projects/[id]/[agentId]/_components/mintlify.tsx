"use client";
import { Check, Copy, Download } from "lucide-react";
import { useCopyToClipboard } from "usehooks-ts";
import { useState } from "react";

import { Doc } from "@/convex/_generated/dataModel";
import {
  CodeBlock,
  CodeBlockGroup,
  CodeBlockCode,
} from "@/components/code-block";
import { Button } from "@/components/ui/button";

export default function Mintlify({ agent }: { agent: Doc<"agent"> }) {
  const [, copy] = useCopyToClipboard();
  const [copiedText, setCopiedText] = useState<boolean>(false);

  const copyToClipboard = (text: string) => {
    copy(text);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  const handleDownload = () => {
    const link = document.createElement("a");
    link.href = "/vibekit.js";
    link.download = "vibekit.js";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const code = `// use className prop to style the button with tailwindcss

<div className="text-center flex justify-center">
  <button 
    id="vibekit-button" 
    data-vibekit-token="${agent._id}"
    className="bg-black text-white"
  >
    Add To My App
  </button>
</div>`;

  return (
    <div className="max-w-xl w-full mx-auto flex flex-col items-center justify-center h-full">
      <div className="max-w-lg w-full bg-background border rounded-2xl p-4 pb-4 mb-4 relative">
        <div>
          <h4 className="font-medium mb-2">Step 1.</h4>
          <p className="text-sm text-muted-foreground mb-3">
            Download and add vibekit.js in the root of your mintlify docs.
          </p>

          <Button variant="outline" onClick={handleDownload} className="w-full">
            <Download className="w-4 h-4" />
            Download vibekit.js
          </Button>
        </div>
      </div>

      <div className="max-w-lg w-full bg-background border rounded-2xl p-4 pb-4 mb-4 relative">
        <div>
          <h4 className="font-medium mb-2">Step 2.</h4>
          <p className="text-sm text-muted-foreground mb-3">
            Add the following code:
          </p>
          <CodeBlock>
            <CodeBlockGroup className="border-border border-b py-2 pr-2 pl-4">
              <div className="flex items-center gap-2">index.mdx</div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => copyToClipboard(code)}
              >
                {copiedText ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </CodeBlockGroup>
            <CodeBlockCode code={code} language="html" />
          </CodeBlock>
        </div>
      </div>
    </div>
  );
}
