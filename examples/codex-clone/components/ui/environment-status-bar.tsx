"use client"

import { ConnectionStatus, ConnectionStatusGroup, useGitHubConnectionStatus, useE2BConnectionStatus } from "./connection-status"
import { useEnvironmentStore } from "@/stores/environments"
import { useTaskStore } from "@/stores/tasks"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Clock, Zap, Settings } from "lucide-react"
import { formatDistanceToNow } from "date-fns"

interface EnvironmentStatusBarProps {
  taskId?: string
  className?: string
}

export function EnvironmentStatusBar({ taskId, className }: EnvironmentStatusBarProps) {
  const githubStatus = useGitHubConnectionStatus()
  const { getTaskById } = useTaskStore()
  const { environments } = useEnvironmentStore()
  
  const task = taskId ? getTaskById(taskId) : null
  const sandboxId = task?.sandboxId || task?.sessionId
  const e2bStatus = useE2BConnectionStatus(sandboxId)
  
  // Find the environment being used
  const currentEnvironment = task && environments.find(env => 
    env.githubRepository === task.repository
  )

  return (
    <Card className={`p-4 ${className}`}>
      <div className="space-y-3">
        {/* Connection Statuses */}
        <ConnectionStatusGroup>
          <ConnectionStatus 
            provider="github" 
            status={githubStatus}
          />
          {sandboxId && (
            <ConnectionStatus 
              provider="e2b" 
              status={e2bStatus}
              label={e2bStatus === "connected" ? "Sandbox Connected" : "Sandbox"}
            />
          )}
        </ConnectionStatusGroup>

        {/* Environment Info */}
        {currentEnvironment && (
          <div className="border-t pt-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Environment: {currentEnvironment.name}</span>
              </div>
              <Badge variant="outline" className="text-xs">
                {getSharingStrategyLabel(currentEnvironment.sharingStrategy)}
              </Badge>
            </div>
            
            {/* Expiry Info */}
            {currentEnvironment.expiresAt && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>
                  Expires {formatDistanceToNow(currentEnvironment.expiresAt, { addSuffix: true })}
                </span>
                {currentEnvironment.autoExtend && (
                  <Badge variant="secondary" className="text-xs">
                    <Zap className="h-3 w-3 mr-1" />
                    Auto-extend
                  </Badge>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}

function getSharingStrategyLabel(strategy: string): string {
  switch (strategy) {
    case "default": return "Default"
    case "per-repo": return "Per Repository"
    case "throwaway": return "Throwaway"
    case "manual": return "Manual"
    default: return strategy
  }
}

// Minimal version for navbar
export function ConnectionStatusBadge() {
  const githubStatus = useGitHubConnectionStatus()
  
  return (
    <ConnectionStatus 
      provider="github" 
      status={githubStatus}
      className="scale-90"
    />
  )
}