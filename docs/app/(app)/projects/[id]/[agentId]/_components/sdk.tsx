"use client";
import { Check, Copy } from "lucide-react";
import { useCopyToClipboard } from "usehooks-ts";
import { useState } from "react";

import { Doc } from "@/convex/_generated/dataModel";
import {
  CodeBlock,
  CodeBlockGroup,
  CodeBlockCode,
} from "@/components/code-block";
import { Button } from "@/components/ui/button";

export default function SDK({ agent }: { agent: Doc<"agent"> }) {
  const [, copy] = useCopyToClipboard();
  const [copiedText, setCopiedText] = useState<boolean>(false);

  const copyToClipboard = (text: string) => {
    copy(text);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  const code = `// npm i @vibe-kit/onboard

import { VibeKitButton } from "@vibe-kit/onboard";

export default function App() {
  return (
    <div>
      <h1>Welcome to My App</h1>
      <VibeKitButton token="${agent._id}" />
    </div>
  );
}`;

  return (
    <div className="flex flex-col gap-y-4">
      <CodeBlock>
        <CodeBlockGroup className="border-border border-b py-2 pr-2 pl-4">
          <div className="flex items-center gap-2">app.tsx</div>
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
        <CodeBlockCode code={code} language="tsx" />
      </CodeBlock>
    </div>
  );
}
