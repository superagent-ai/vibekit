"use client";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Palette, Settings2, Sparkles } from "lucide-react";
import Prompt from "./prompt";
import { Doc } from "@/convex/_generated/dataModel";
import Appearance from "./appearance";
import Settings from "./settings";
import { ScrollArea } from "@/components/ui/scroll-area";
import { generatePromptFromUrl } from "@/app/actions/prompt";

interface Props {
  agent: Doc<"agent">;
  project: Doc<"project">;
  onChange: ({ key, value }: { key: string; value: string | boolean }) => void;
}

export default function AgentDetails({ agent, project, onChange }: Props) {
  const [isImporting, setIsImporting] = useState(false);
  const [promptValue, setPromptValue] = useState(
    (agent.systemPrompt as string) || ""
  );

  const handleImportFromUrl = async (url: string) => {
    setIsImporting(true);
    try {
      const content = await generatePromptFromUrl(url);
      setPromptValue(content);
      onChange({ key: "systemPrompt", value: content });
    } catch (error) {
      console.error("Failed to import from URL:", error);
      // TODO: Add proper error handling/toast notification
    } finally {
      setIsImporting(false);
    }
  };

  const handlePromptChange = (value: string) => {
    setPromptValue(value);
    onChange({ key: "systemPrompt", value });
  };

  return (
    <Tabs defaultValue="prompt" className="w-full h-full">
      <TabsList>
        <TabsTrigger value="prompt" className="text-md flex items-center gap-1">
          <Sparkles className="w-4 h-4 text-muted-foreground" />
          Prompt
        </TabsTrigger>
        <TabsTrigger
          value="appearance"
          className="text-md flex items-center gap-1"
        >
          <Palette className="w-4 h-4 text-muted-foreground" />
          Appearance
        </TabsTrigger>
        <TabsTrigger value="github" className="text-md flex items-center gap-1">
          <Settings2 className="w-4 h-4 text-muted-foreground" />
          Settings
        </TabsTrigger>
      </TabsList>
      <TabsContent value="prompt" className="w-full h-full">
        <Prompt
          agent={agent}
          onChange={handlePromptChange}
          onImportFromUrl={handleImportFromUrl}
          isImporting={isImporting}
          promptValue={promptValue}
        />
      </TabsContent>
      <TabsContent value="appearance" className="w-full overflow-hidden">
        <ScrollArea className="h-full">
          <div className="h-[calc(100vh-250px)]">
            <Appearance agent={agent} project={project} onChange={onChange} />
          </div>
        </ScrollArea>
      </TabsContent>
      <TabsContent value="github" className="w-full h-full">
        <Settings agent={agent} project={project} onChange={onChange} />
      </TabsContent>
    </Tabs>
  );
}
