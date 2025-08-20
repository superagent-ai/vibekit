"use client";

import { useState } from "react";
import { Code2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface OpenInEditorButtonProps {
  projectId?: string;
  projectPath?: string;
  variant?: "default" | "ghost" | "outline";
  size?: "default" | "sm" | "lg";
  className?: string;
  showText?: boolean;
  text?: string;
  disabled?: boolean;
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

export function OpenInEditorButton({
  projectId,
  projectPath,
  variant = "ghost",
  size = "sm", 
  className,
  showText = false,
  text = "Open in Editor",
  disabled = false,
  onSuccess,
  onError
}: OpenInEditorButtonProps) {
  const [isOpening, setIsOpening] = useState(false);

  const handleOpenInEditor = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!projectId && !projectPath) {
      const error = "No project ID or path provided";
      console.error(error);
      onError?.(error);
      return;
    }

    setIsOpening(true);

    try {
      const response = await fetch('/api/projects/open-in-editor', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId,
          projectPath,
        }),
      });

      const result = await response.json();

      if (result.success) {
        onSuccess?.();
        console.log(`✅ ${result.message}`);
      } else {
        const error = result.error || 'Failed to open project in editor';
        console.error(`❌ ${error}`);
        onError?.(error);
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Failed to open project in editor:', errorMessage);
      onError?.(errorMessage);
    } finally {
      setIsOpening(false);
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={variant}
          size={size}
          onClick={handleOpenInEditor}
          disabled={disabled || isOpening}
          className={cn("flex items-center gap-1", className)}
        >
          {isOpening ? (
            <RefreshCw className="h-3 w-3 animate-spin" />
          ) : (
            <Code2 className="h-3 w-3" />
          )}
          {showText && (
            <span className="hidden sm:inline">
              {isOpening ? "Opening..." : text}
            </span>
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>Open project in your preferred editor</p>
      </TooltipContent>
    </Tooltip>
  );
}