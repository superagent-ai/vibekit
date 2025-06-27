"use client"

import { Button } from "@/components/ui/button"
import { Play, Pause, Square, RotateCcw, ExternalLink, Power, AlertCircle } from "lucide-react"
import { Task } from "@/stores/tasks"
import { useState } from "react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface TaskControlButtonsProps {
  task: Task
  onTaskControl: (action: "pause" | "resume" | "stop" | "rerun" | "reactivate") => void
}

export function TaskControlButtons({ task, onTaskControl }: TaskControlButtonsProps) {
  const [isProcessing, setIsProcessing] = useState(false)
  
  // Determine what actions are possible based on current state
  const getAvailableActions = () => {
    const actions = {
      pause: false,
      resume: false,
      stop: false,
      rerun: true, // Always allow rerun
      reactivate: false,
      inngest: !!task.runId,
    }
    
    // Check sandbox state
    const hasSandbox = !!task.sessionId
    const hasActiveContainer = !!task.containerConnections
    const sandboxExpired = hasSandbox && !hasActiveContainer
    
    // Task is running
    if (task.status === "IN_PROGRESS") {
      actions.pause = !!task.runId // Can only pause if we have a run ID
      actions.stop = !!task.runId // Can only stop if we have a run ID
    }
    
    // Task is paused
    if (task.status === "PAUSED") {
      actions.resume = true
      actions.stop = true
    }
    
    // Sandbox management
    if (sandboxExpired) {
      actions.reactivate = true
    }
    
    return { actions, hasSandbox, hasActiveContainer, sandboxExpired }
  }
  
  const { actions, sandboxExpired } = getAvailableActions()
  
  const handleAction = async (action: string) => {
    setIsProcessing(true)
    try {
      await onTaskControl(action as ("pause" | "resume" | "stop" | "rerun" | "reactivate"))
    } finally {
      setIsProcessing(false)
    }
  }
  
  return (
    <TooltipProvider>
      <div className="flex items-center gap-1 flex-wrap">
        {/* Running state controls */}
        {task.status === "IN_PROGRESS" && (
          <>
            {actions.pause ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleAction("pause")}
                disabled={isProcessing}
                className="h-7 px-2 text-xs"
              >
                <Pause className="h-3 w-3 mr-1" />
                Pause
              </Button>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled
                    className="h-7 px-2 text-xs opacity-50"
                  >
                    <Pause className="h-3 w-3 mr-1" />
                    Pause
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Cannot pause - no active run ID</p>
                </TooltipContent>
              </Tooltip>
            )}
            
            {actions.stop ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleAction("stop")}
                disabled={isProcessing}
                className="h-7 px-2 text-xs text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground"
              >
                <Square className="h-3 w-3 mr-1" />
                Stop
              </Button>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled
                    className="h-7 px-2 text-xs opacity-50"
                  >
                    <Square className="h-3 w-3 mr-1" />
                    Stop
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Cannot stop - no active run ID</p>
                </TooltipContent>
              </Tooltip>
            )}
          </>
        )}
        
        {/* Paused state controls */}
        {task.status === "PAUSED" && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleAction("resume")}
              disabled={isProcessing}
              className="h-7 px-2 text-xs"
            >
              <Play className="h-3 w-3 mr-1" />
              Resume
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleAction("stop")}
              disabled={isProcessing}
              className="h-7 px-2 text-xs text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground"
            >
              <Square className="h-3 w-3 mr-1" />
              Stop
            </Button>
          </>
        )}
        
        {/* Completed/Stopped state controls */}
        {(task.status === "DONE" || task.status === "STOPPED") && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleAction("rerun")}
              disabled={isProcessing}
              className="h-7 px-2 text-xs font-bold text-blue-600 border-blue-600/30 hover:bg-blue-600/20"
            >
              <RotateCcw className="h-3 w-3 mr-1" />
              RUN AGAIN
            </Button>
            
            {/* Wake up button - only if sandbox expired */}
            {sandboxExpired && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleAction("reactivate")}
                    disabled={isProcessing}
                    className="h-7 px-2 text-xs font-bold text-green-600 border-green-600/30 hover:bg-green-600/20"
                  >
                    <Power className="h-3 w-3 mr-1" />
                    WAKE UP
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Reactivate expired sandbox (1 hour extension)</p>
                </TooltipContent>
              </Tooltip>
            )}
            
            {/* Inngest link */}
            {actions.inngest && (
              <Button
                variant="outline"
                size="sm"
                asChild
                className="h-7 px-2 text-xs"
              >
                <a
                  href={`${process.env.NEXT_PUBLIC_INNGEST_URL || 'http://localhost:8288'}/runs/${task.runId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="h-3 w-3 mr-1" />
                  Inngest
                </a>
              </Button>
            )}
          </>
        )}
        
        {/* Warning for missing sandbox */}
        {!task.sessionId && task.status === "DONE" && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400">
                <AlertCircle className="h-3 w-3" />
                <span>No sandbox available</span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>This task completed without creating a sandbox</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  )
}