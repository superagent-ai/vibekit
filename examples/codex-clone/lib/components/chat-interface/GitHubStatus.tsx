"use client";

import React, { useState } from "react";
import { useGitHubAuth } from "@/hooks/use-github-auth";
import { GitHubConnectionButton } from "@/components/ui/github-connection-button";
import { RepositorySelector } from "@/components/ui/repository-selector";
import { Button } from "@/components/ui/button";
import { GitBranch, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import type { GitHubStatusProps } from "./types";

export function GitHubStatus({
  showChangeButton = true,
  compact = false,
  className,
  repository,
  onRepositoryChange,
}: GitHubStatusProps) {
  const { isAuthenticated, isLoading } = useGitHubAuth();
  const [showRepoSelector, setShowRepoSelector] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState(repository || {
    organization: "",
    repository: "",
    branch: "main",
  });

  const handleRepoChange = (repo: any) => {
    console.log('[GitHubStatus] Repository changed:', repo);
    setSelectedRepo(repo);
    setShowRepoSelector(false);
    onRepositoryChange?.(repo);
  };

  if (!isAuthenticated || isLoading) {
    return <GitHubConnectionButton />;
  }

  return (
    <AnimatePresence mode="wait">
      {showRepoSelector && showChangeButton ? (
        <motion.div
          key="repo-selector"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
          className={cn("overflow-hidden", className)}
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Select Repository</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowRepoSelector(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <RepositorySelector
              value={selectedRepo}
              onChange={handleRepoChange}
              onCancel={() => setShowRepoSelector(false)}
            />
          </div>
        </motion.div>
      ) : (
        <motion.div
          key="repo-status"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.2 }}
          className={cn(
            "flex items-center gap-3",
            compact ? "text-sm" : "text-base",
            className
          )}
        >
          {(() => {
            const hasRepo = selectedRepo.organization && selectedRepo.repository;
            return (
              <AnimatePresence mode="wait">
            {hasRepo ? (
              <motion.div
                key="repo-info"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.15 }}
                className="flex items-center gap-2 text-muted-foreground"
              >
                <GitBranch className={compact ? "h-3 w-3" : "h-4 w-4"} />
                <span>
                  {selectedRepo.organization}/{selectedRepo.repository}
                </span>
                <span className="text-muted-foreground/50">•</span>
                <span>{selectedRepo.branch}</span>
              </motion.div>
            ) : (
              <motion.span
                key="no-repo"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="text-muted-foreground"
              >
                No repository selected
              </motion.span>
            )}
              </AnimatePresence>
            );
          })()}

          {showChangeButton && (
            <Button
              variant="ghost"
              size={compact ? "sm" : "default"}
              onClick={() => setShowRepoSelector(true)}
              className="ml-auto transition-all duration-200 hover:scale-105"
            >
              {selectedRepo.repository ? "Change" : "Select Repository"}
            </Button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}