"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { FileText, FolderOpen, Hash, Zap, Command } from "lucide-react";
import { cn } from "@/lib/utils";
import { slashCommands } from "@/lib/slash-commands";

export interface CommandItem {
  id: string;
  type: "file" | "folder" | "prompt" | "workflow" | "command";
  name: string;
  path?: string;
  description?: string;
  content?: string;
}

interface CommandPaletteProps {
  trigger: "@" | "/" | null;
  searchTerm: string;
  onSelect: (item: CommandItem) => void;
  onClose: () => void;
  position: { top: number; left: number };
  repository?: string;
}

// Mock data for prompts - in real implementation, these would come from .codex-clone/.prompts
const MOCK_PROMPTS: CommandItem[] = [
  {
    id: "1",
    type: "prompt",
    name: "explain",
    description: "Explain the codebase structure",
    content: "Explain the codebase to a newcomer. What is the general structure, what are the important things to know, and what are some pointers for things to learn next?"
  },
  {
    id: "2",
    type: "prompt",
    name: "debug",
    description: "Find and fix bugs",
    content: "Pick a part of the codebase that seems important and find and fix a bug."
  },
  {
    id: "3",
    type: "prompt",
    name: "refactor",
    description: "Refactor code for better quality",
    content: "Identify code that could benefit from refactoring and improve its structure, readability, and maintainability."
  },
  {
    id: "4",
    type: "workflow",
    name: "test-coverage",
    description: "Improve test coverage",
    content: "Analyze the current test coverage and write tests for untested critical paths."
  },
  {
    id: "5",
    type: "workflow",
    name: "performance",
    description: "Optimize performance",
    content: "Profile the application, identify performance bottlenecks, and implement optimizations."
  }
];

// Mock file structure - in real implementation, this would come from the repository
const MOCK_FILES: CommandItem[] = [
  { id: "f1", type: "file", name: "README.md", path: "/README.md" },
  { id: "f2", type: "file", name: "package.json", path: "/package.json" },
  { id: "f3", type: "folder", name: "src", path: "/src" },
  { id: "f4", type: "file", name: "index.ts", path: "/src/index.ts" },
  { id: "f5", type: "file", name: "app.tsx", path: "/src/app.tsx" },
  { id: "f6", type: "folder", name: "components", path: "/src/components" },
  { id: "f7", type: "file", name: "button.tsx", path: "/src/components/button.tsx" },
  { id: "f8", type: "file", name: "navbar.tsx", path: "/src/components/navbar.tsx" },
];

export function CommandPalette({
  trigger,
  searchTerm,
  onSelect,
  onClose,
  position,
  repository
}: CommandPaletteProps) {
  const [items, setItems] = useState<CommandItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!trigger) return;

    let filteredItems: CommandItem[] = [];

    if (trigger === "@") {
      // Filter files based on search term
      filteredItems = MOCK_FILES.filter(item =>
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.path?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    } else if (trigger === "/") {
      // First add slash commands
      const slashCommandItems = slashCommands
        .filter(cmd => 
          cmd.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (cmd.description?.toLowerCase() || '').includes(searchTerm.toLowerCase())
        )
        .map(cmd => ({
          id: cmd.name,
          type: "command" as const,
          name: cmd.name,
          description: cmd.description,
          content: cmd.name
        }));
      
      // Then add prompts/workflows
      const promptItems = MOCK_PROMPTS.filter(item =>
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.description?.toLowerCase().includes(searchTerm.toLowerCase())
      );
      
      // Combine slash commands and prompts, with slash commands first
      filteredItems = [...slashCommandItems, ...promptItems];
    }

    setItems(filteredItems.slice(0, 10)); // Limit to 10 items
    setSelectedIndex(0);
  }, [trigger, searchTerm]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!trigger) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % items.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + items.length) % items.length);
        break;
      case "Enter":
        e.preventDefault();
        if (items[selectedIndex]) {
          onSelect(items[selectedIndex]);
        }
        break;
      case "Escape":
        e.preventDefault();
        onClose();
        break;
    }
  }, [trigger, items, selectedIndex, onSelect, onClose]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (!trigger || items.length === 0) return null;

  const getIcon = (item: CommandItem) => {
    switch (item.type) {
      case "file":
        return <FileText className="h-4 w-4" />;
      case "folder":
        return <FolderOpen className="h-4 w-4" />;
      case "prompt":
        return <Hash className="h-4 w-4" />;
      case "workflow":
        return <Zap className="h-4 w-4" />;
      case "command":
        return <Command className="h-4 w-4" />;
    }
  };

  return (
    <div
      className="fixed z-[100] w-80 bg-popover border rounded-lg shadow-lg overflow-hidden"
      style={{
        top: position.top,
        left: position.left,
        maxHeight: "300px"
      }}
    >
      <div className="p-2 border-b bg-muted/50">
        <p className="text-xs text-muted-foreground">
          {trigger === "@" ? "Reference a file" : "Use a prompt or workflow"}
        </p>
      </div>
      <div ref={listRef} className="overflow-y-auto max-h-[250px]">
        {items.map((item, index) => (
          <button
            key={item.id}
            className={cn(
              "w-full flex items-start gap-3 p-3 hover:bg-accent transition-colors text-left",
              selectedIndex === index && "bg-accent"
            )}
            onMouseEnter={() => setSelectedIndex(index)}
            onClick={() => onSelect(item)}
          >
            <span className="text-muted-foreground mt-0.5">
              {getIcon(item)}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{item.name}</span>
                {item.type === "folder" && (
                  <span className="text-xs text-muted-foreground">/</span>
                )}
              </div>
              {item.description && (
                <p className="text-xs text-muted-foreground truncate">
                  {item.description}
                </p>
              )}
              {item.path && trigger === "@" && (
                <p className="text-xs text-muted-foreground truncate">
                  {item.path}
                </p>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}