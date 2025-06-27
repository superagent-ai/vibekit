"use client";

import { cn } from "@/lib/utils";

interface BackgroundEffectsProps {
  variant?: "default" | "subtle" | "vibrant";
  className?: string;
}

export function BackgroundEffects({ variant = "default", className }: BackgroundEffectsProps) {
  if (variant === "subtle") {
    return (
      <div className={cn("fixed inset-0 -z-10 overflow-hidden", className)}>
        {/* Subtle gradient orb */}
        <div className="absolute -top-40 -right-40 h-[500px] w-[500px] rounded-full bg-gradient-to-br from-blue-400/10 via-purple-400/10 to-transparent blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -left-40 h-[500px] w-[500px] rounded-full bg-gradient-to-tr from-cyan-400/10 via-blue-400/10 to-transparent blur-3xl animate-pulse" />
        
        {/* Subtle grid */}
        <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center opacity-[0.02] dark:opacity-[0.04]" />
      </div>
    );
  }

  if (variant === "vibrant") {
    return (
      <div className={cn("fixed inset-0 -z-10 overflow-hidden", className)}>
        {/* Vibrant animated gradient orbs */}
        <div className="absolute top-0 -left-1/4 h-[800px] w-[800px] rounded-full bg-gradient-to-br from-blue-500/20 via-purple-500/20 to-pink-500/10 blur-3xl animate-pulse" />
        <div className="absolute bottom-0 -right-1/4 h-[800px] w-[800px] rounded-full bg-gradient-to-tl from-cyan-500/20 via-blue-500/20 to-indigo-500/10 blur-3xl animate-pulse" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full bg-gradient-to-br from-violet-500/10 via-purple-500/10 to-fuchsia-500/10 blur-3xl animate-pulse" />
        
        {/* Grid pattern */}
        <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center opacity-[0.03] dark:opacity-[0.05]" />
      </div>
    );
  }

  // Default variant
  return (
    <div className={cn("fixed inset-0 -z-10 overflow-hidden", className)}>
      {/* Animated gradient orbs */}
      <div className="absolute -top-1/2 -right-1/2 h-[1000px] w-[1000px] rounded-full bg-gradient-to-br from-blue-400/[0.08] via-purple-400/[0.08] to-transparent blur-3xl animate-pulse" />
      <div className="absolute -bottom-1/2 -left-1/2 h-[1000px] w-[1000px] rounded-full bg-gradient-to-tr from-cyan-400/[0.08] via-blue-400/[0.08] to-transparent blur-3xl animate-pulse" />
      
      {/* Subtle grid pattern */}
      <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center opacity-[0.02] dark:opacity-[0.04]" />
    </div>
  );
}