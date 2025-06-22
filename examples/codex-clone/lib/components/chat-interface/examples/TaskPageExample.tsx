"use client";

import React from "react";
import { ChatInterface } from "../ChatInterface";
import type { ChatSubmitParams } from "../types";

interface TaskPageChatInterfaceProps {
  taskId: string;
  repository?: {
    organization: string;
    repository: string;
    branch: string;
  };
  onFollowUp: (message: string, mode: "ask" | "code") => void;
}

/**
 * Example: Limited chat interface for task pages
 * Repository is fixed, but mode and model can be changed
 */
export function TaskPageChatInterface({
  repository,
  onFollowUp,
}: TaskPageChatInterfaceProps) {
  const handleSubmit = async (params: ChatSubmitParams) => {
    onFollowUp(params.message, params.mode);
  };

  return (
    <ChatInterface
      onSubmit={handleSubmit}
      defaultRepository={repository}
      config={{
        // Limited features for task page
        features: {
          repositorySelector: false, // Can't change repo in task
          branchSelector: false,    // Can't change branch in task
          modeSelector: true,       // Can change mode
          modelSelector: true,      // Can change model
          environmentSelector: false, // Environment is fixed
          desktopToggle: false,
          commandPalette: true,
        },
        behaviors: {
          allowRepositoryChange: false,
          allowBranchChange: false,
          allowModeChange: true,
          allowModelChange: true,
          allowEnvironmentChange: false,
          showGitHubStatus: true, // Show status but no change button
          autoResizeInput: true,
        },
        ui: {
          placeholder: "Ask a follow-up question or request changes...",
          showAnimatedBorder: true,
          compactMode: true,
          minHeight: "60px",
        },
      }}
    />
  );
}