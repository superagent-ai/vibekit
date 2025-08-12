"use client";

import { useEffect, useState } from "react";
import { ChatInterface } from '@vibe-kit/ai-chat';
import { 
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Folder } from "lucide-react";
import type { Project } from "@/lib/projects";

interface ChatSheetProps {
  project: Project | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChatSheet({ project, open, onOpenChange }: ChatSheetProps) {
  const [connectedMCPServers, setConnectedMCPServers] = useState<string[]>([]);
  const [isLoadingServers, setIsLoadingServers] = useState(false);

  // Get MCP servers enabled for this project
  useEffect(() => {
    if (open && project) {
      // Simply use the project's mcpServers settings
      // The chat handler will filter servers based on these IDs
      const enabledForProject = project.mcpServers || {};
      const enabledServerIds = Object.entries(enabledForProject)
        .filter(([_, isEnabled]) => isEnabled)
        .map(([serverId]) => serverId);
      
      setConnectedMCPServers(enabledServerIds);
      console.log('[ChatSheet] MCP servers enabled for project:', enabledServerIds);
      setIsLoadingServers(false);
    }
  }, [open, project]);

  if (!project) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl lg:max-w-4xl p-0 flex flex-col">
        <SheetHeader className="px-6 py-4 border-b">
          <SheetTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Project Chat
          </SheetTitle>
          <SheetDescription className="flex flex-col gap-1">
            <div className="font-medium text-foreground">{project.name}</div>
            <div className="flex items-center gap-1 text-xs">
              <Folder className="h-3 w-3" />
              <code className="text-xs">{project.projectRoot}</code>
            </div>
            {connectedMCPServers.length > 0 && (
              <div className="flex items-center gap-1 text-xs mt-1">
                <Badge variant="outline" className="text-xs">
                  {connectedMCPServers.length} MCP servers enabled
                </Badge>
              </div>
            )}
            {isLoadingServers && (
              <div className="flex items-center gap-1 text-xs mt-1">
                <Badge variant="secondary" className="text-xs">
                  Loading servers...
                </Badge>
              </div>
            )}
          </SheetDescription>
        </SheetHeader>
        
        <div className="flex-1 overflow-hidden">
          {open && (
            <ChatInterface 
              className="h-full" 
              projectId={project.id}
              projectRoot={project.projectRoot}
              projectName={project.name}
              mcpServerFilter={connectedMCPServers}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}