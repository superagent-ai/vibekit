"use client";

import React, { useState, useCallback, useMemo, useEffect } from "react";
import { cn } from "@/lib/utils";
import { ChatInput } from "./ChatInput";
import { ChatControls } from "./ChatControls";
import { GitHubStatus } from "./GitHubStatus";
import { Button } from "@/components/ui/button";
import { Send, Loader2, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { ChatInterfaceConfig, ChatInterfaceProps } from "./types";

const defaultConfig: ChatInterfaceConfig = {
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
    submitButtonText: "",
    showAnimatedBorder: true,
    compactMode: false,
  },
};

export function ChatInterface({
  config: userConfig,
  onSubmit,
  isLoading = false,
  className,
  defaultMode = "ask",
  defaultRepository,
  onRepositoryChange,
}: ChatInterfaceProps) {
  // Merge user config with defaults
  const config = useMemo(() => ({
    features: { ...defaultConfig.features, ...userConfig?.features },
    behaviors: { ...defaultConfig.behaviors, ...userConfig?.behaviors },
    ui: { ...defaultConfig.ui, ...userConfig?.ui },
  }), [userConfig]);

  // State management
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<"ask" | "code">(defaultMode);
  const [model, setModel] = useState("lfg-1");
  const [environment, setEnvironment] = useState("");
  const [useDesktop] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Clear error when repository changes
  useEffect(() => {
    if (defaultRepository?.repository && error) {
      setError(null);
    }
  }, [defaultRepository, error]);

  const handleSubmit = useCallback(() => {
    if (!message.trim() || isLoading) return;

    console.log('[ChatInterface] handleSubmit - defaultRepository:', defaultRepository);
    console.log('[ChatInterface] config.features.repositorySelector:', config.features.repositorySelector);
    
    // Check if repository is required and not selected
    // Only validate repository if the selector is enabled AND we allow repository changes
    // Skip validation if an environment is selected (as it may contain a repository)
    if (config.features.repositorySelector && config.behaviors.allowRepositoryChange && !defaultRepository?.repository && !environment) {
      console.log('[ChatInterface] Repository validation failed - no repository and no environment');
      setError("Please select a repository or environment before creating a task");
      return;
    }

    setError(null);
    onSubmit({
      message: message.trim(),
      mode,
      model,
      environment,
      useDesktop,
      repository: defaultRepository,
    });

    // Clear message after submit
    setMessage("");
  }, [message, mode, model, environment, useDesktop, defaultRepository, isLoading, onSubmit, config.features.repositorySelector]);

  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  return (
    <div className={cn("w-full space-y-4", className)}>
      {/* GitHub Status Bar */}
      {config.behaviors.showGitHubStatus && (
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            <GitHubStatus
              showChangeButton={config.behaviors.allowRepositoryChange}
              compact={config.ui.compactMode}
              repository={defaultRepository}
              onRepositoryChange={onRepositoryChange}
            />
          </motion.div>
        </AnimatePresence>
      )}

      {/* Error Message */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-destructive/10 text-destructive text-sm rounded-lg px-4 py-2 flex items-center gap-2"
        >
          <AlertCircle className="h-4 w-4" />
          {error}
        </motion.div>
      )}

      {/* Main Chat Interface */}
      <div className="relative">
        {/* Animated Border Effect */}
        {config.ui.showAnimatedBorder && (
          <div className="absolute -inset-0.5 rounded-4xl animate-gradient-border" />
        )}

        {/* Content Container */}
        <div className={cn(
          "relative bg-background rounded-4xl shadow-lg",
          config.ui.showAnimatedBorder && "p-1"
        )}>
          <div className="space-y-4 p-4">
            {/* Controls Bar */}
            <ChatControls
              mode={mode}
              onModeChange={config.behaviors.allowModeChange ? setMode : () => {}}
              model={model}
              onModelChange={config.behaviors.allowModelChange ? setModel : () => {}}
              environment={environment}
              onEnvironmentChange={config.behaviors.allowEnvironmentChange ? setEnvironment : () => {}}
              showModeSelector={config.features.modeSelector}
              showModelSelector={config.features.modelSelector}
              showEnvironmentSelector={config.features.environmentSelector}
              isLoading={isLoading}
            />

            {/* Input Area */}
            <div className="flex gap-3">
              <div className="flex-1">
                <ChatInput
                  value={message}
                  onChange={(value) => {
                    setMessage(value);
                    if (error) setError(null);
                  }}
                  onSubmit={handleSubmit}
                  placeholder={config.ui.placeholder}
                  autoResize={config.behaviors.autoResizeInput}
                  enableCommandPalette={config.features.commandPalette}
                  isLoading={isLoading}
                  className="w-full"
                  minHeight={config.ui.minHeight}
                />
              </div>

              {/* Submit Button */}
              <Button
                onClick={handleSubmit}
                disabled={!message.trim() || isLoading}
                size="icon"
                className={cn(
                  "h-10 w-10 rounded-full transition-all",
                  message.trim() && !isLoading && "shadow-lg"
                )}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  config.ui.submitButtonIcon || <Send className="h-4 w-4" />
                )}
                {config.ui.submitButtonText && (
                  <span className="ml-2">{config.ui.submitButtonText}</span>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}