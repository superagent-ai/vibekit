"use client";

import React from "react";
import { ModeSelector } from "@/components/ui/mode-selector";
import { ModelSelector } from "./ModelSelector";
import { EnvironmentSelector } from "./EnvironmentSelector";
import type { ChatControlsProps } from "./types";

export function ChatControls({
  mode,
  onModeChange,
  model,
  onModelChange,
  environment,
  onEnvironmentChange,
  showModeSelector = true,
  showModelSelector = true,
  showEnvironmentSelector = true,
  isLoading = false,
}: ChatControlsProps) {
  const hasControls = showModeSelector || showModelSelector || showEnvironmentSelector;

  if (!hasControls) return null;

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* Mode Selector */}
      {showModeSelector && (
        <ModeSelector
          mode={mode}
          onModeChange={onModeChange}
          size="sm"
        />
      )}

      {/* Model Selector */}
      {showModelSelector && model && (
        <ModelSelector
          value={model}
          onChange={onModelChange}
          disabled={!onModelChange || isLoading}
        />
      )}

      {/* Environment Selector */}
      {showEnvironmentSelector && (
        <EnvironmentSelector
          value={environment}
          onChange={onEnvironmentChange}
          disabled={!onEnvironmentChange || isLoading}
        />
      )}
    </div>
  );
}