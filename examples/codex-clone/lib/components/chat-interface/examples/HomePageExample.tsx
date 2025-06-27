"use client";

import React, { useState } from "react";
import { ChatInterface } from "../ChatInterface";
import { useRouter } from "next/navigation";
import { useTaskStore } from "@/stores/tasks";
import { useEnvironmentStore } from "@/stores/environments";
import { createTaskAction } from "@/app/actions/inngest";
import type { ChatSubmitParams } from "../types";

/**
 * Example: Full-featured chat interface for the home page
 * All features enabled, allows changing everything
 */
export function HomePageChatInterface() {
  const router = useRouter();
  const { addTask } = useTaskStore();
  const [repository, setRepository] = useState<{
    organization?: string;
    repository?: string;
    branch?: string;
  }>({});
  
  const handleRepositoryChange = (newRepo: {
    organization?: string;
    repository?: string;
    branch?: string;
  }) => {
    console.log('[HomePageExample] Repository changed:', newRepo);
    setRepository(newRepo);
  };

  const handleSubmit = async (params: ChatSubmitParams) => {
    console.log('[HomePageExample] Submit params:', params);
    console.log('[HomePageExample] Current repository state:', repository);
    
    // Get environment if selected
    let finalRepository = params.repository;
    let environmentData;
    
    if (params.environment) {
      const { environments } = useEnvironmentStore.getState();
      const selectedEnv = environments.find(env => env.id === params.environment);
      if (selectedEnv) {
        environmentData = selectedEnv;
        // Use environment's repository if no repository is explicitly selected
        if (!finalRepository?.repository && selectedEnv.githubRepository) {
          finalRepository = {
            organization: selectedEnv.githubOrganization,
            repository: selectedEnv.githubRepository,
            branch: finalRepository?.branch || "main"
          };
          console.log('[HomePageExample] Using repository from environment:', finalRepository);
        }
      }
    }
    
    // Validate that we have a repository (either from selection or environment)
    if (!finalRepository?.repository) {
      console.error("[HomePageExample] No repository selected and no repository in environment");
      // Return early - the ChatInterface should handle showing an error
      return;
    }

    try {
      // Create the task with initial sessionId
      const initialSessionId = crypto.randomUUID();
      const task = addTask({
        title: params.message,
        description: params.message,
        mode: params.mode,
        repository: finalRepository.repository,
        branch: finalRepository.branch || "main",
        status: "IN_PROGRESS",
        messages: [],
        sessionId: initialSessionId,
        isArchived: false,
        hasChanges: false,
      });

      // Trigger the backend action and wait for sandbox creation
      const result = await createTaskAction({
        task,
        prompt: params.message,
        sessionId: task.sessionId,
        environment: environmentData,
      });

      // Update task with the actual sandbox ID if available
      if (result.success && result.sandboxId) {
        const { updateTask } = useTaskStore.getState();
        updateTask(task.id, { 
          sessionId: result.sandboxId,
          eventId: result.eventId,
        });
        console.log('[HomePageExample] Updated task with E2B sandbox ID:', result.sandboxId);
      }

      // Navigate to task page after ensuring sandbox is created
      router.push(`/task/${task.id}`);
    } catch (error) {
      console.error("Failed to create task:", error);
    }
  };

  return (
    <ChatInterface
      onSubmit={handleSubmit}
      defaultRepository={repository}
      onRepositoryChange={handleRepositoryChange}
      config={{
        // All features enabled for home page
        features: {
          repositorySelector: true,
          branchSelector: true,
          modeSelector: true,
          modelSelector: true,
          environmentSelector: true,
          desktopToggle: true,
          commandPalette: true,
        },
        behaviors: {
          allowRepositoryChange: true,
          allowBranchChange: true,
          allowModeChange: true,
          allowModelChange: true,
          allowEnvironmentChange: true,
          showGitHubStatus: true,
          autoResizeInput: true,
        },
        ui: {
          placeholder: "What would you like to build?",
          showAnimatedBorder: true,
          compactMode: false,
        },
      }}
    />
  );
}