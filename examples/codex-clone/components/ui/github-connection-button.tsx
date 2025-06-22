"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Github } from "lucide-react";

interface GitHubConnectionButtonProps {
  status: "connected" | "disconnected" | "connecting" | "error";
  repositoryName?: string;
  onClick?: () => void;
  className?: string;
}

const statusColors = {
  connected: "text-green-500 border-green-500/30 bg-green-500/10",
  disconnected: "text-gray-500 border-gray-500/30 bg-gray-500/10",
  connecting: "text-yellow-500 border-yellow-500/30 bg-yellow-500/10",
  error: "text-red-500 border-red-500/30 bg-red-500/10"
};

const indicatorColors = {
  connected: "bg-green-500",
  disconnected: "bg-gray-500",
  connecting: "bg-yellow-500",
  error: "bg-red-500"
};

export function GitHubConnectionButton({
  status,
  repositoryName,
  onClick,
  className
}: GitHubConnectionButtonProps) {
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    setIsAnimating(status === "connecting");
  }, [status]);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative inline-flex items-center gap-2 h-8 px-3 rounded-full border",
        "hover:opacity-80",
        statusColors[status],
        className
      )}
    >
      <div className="flex items-center gap-2">
        <Github className="h-4 w-4 flex-shrink-0" />
        
        {repositoryName && (
          <span className="font-medium text-sm overflow-hidden whitespace-nowrap">
            {repositoryName}
          </span>
        )}

        <div className="relative flex-shrink-0">
          <div 
            className={cn(
              "w-2 h-2 rounded-full transition-colors duration-300",
              indicatorColors[status]
            )}
          />
          {isAnimating && (
            <div 
              className={cn(
                "absolute inset-0 rounded-full animate-ping",
                indicatorColors[status]
              )}
            />
          )}
        </div>
      </div>
    </button>
  );
}