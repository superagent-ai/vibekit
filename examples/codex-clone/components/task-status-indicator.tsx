"use client"

import { Server, AlertCircle, CheckCircle, Loader2, Coffee, XCircle } from "lucide-react"
import { Task } from "@/stores/tasks"

interface TaskStatusIndicatorProps {
  task: Task
}

export function TaskStatusIndicator({ task }: TaskStatusIndicatorProps) {
  // Determine the actual state of the task and sandbox
  const getSandboxState = () => {
    if (!task.sessionId) {
      return { state: "no-sandbox", label: "No Sandbox", color: "gray" }
    }
    
    if (!task.containerConnections) {
      // Has session but no connections - sandbox is terminated or expired
      return { state: "terminated", label: "Sandbox Terminated", color: "red" }
    }
    
    // Check if sandbox is still accessible
    const createdAt = task.containerConnections.createdAt
    const hoursSinceCreation = createdAt 
      ? (() => {
          try {
            const date = new Date(createdAt);
            if (isNaN(date.getTime())) return 999; // Treat invalid dates as expired
            return (Date.now() - date.getTime()) / (1000 * 60 * 60);
          } catch (error) {
            return 999; // Treat error as expired
          }
        })()
      : 0
      
    if (hoursSinceCreation > 1) {
      // E2B sandboxes expire after 1 hour
      return { state: "expired", label: "Sandbox Expired", color: "orange" }
    }
    
    // Sandbox exists and should be active
    return { state: "active", label: "Sandbox Active", color: "green" }
  }
  
  const getTaskState = () => {
    switch (task.status) {
      case "IN_PROGRESS":
        return { icon: Loader2, label: "Running", color: "green", animate: true }
      case "PAUSED":
        return { icon: Coffee, label: "Paused", color: "yellow", animate: false }
      case "STOPPED":
        return { icon: XCircle, label: "Stopped", color: "red", animate: false }
      case "DONE":
        return { icon: CheckCircle, label: "Complete", color: "gray", animate: false }
      default:
        return { icon: AlertCircle, label: task.status, color: "gray", animate: false }
    }
  }
  
  const sandboxState = getSandboxState()
  const taskState = getTaskState()
  const TaskIcon = taskState.icon
  
  return (
    <div className="flex items-center gap-2 text-xs">
      {/* Task Status */}
      <div className={`flex items-center gap-1 px-2 py-1 rounded ${
        taskState.color === "green" ? "bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400" :
        taskState.color === "yellow" ? "bg-yellow-100 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400" :
        taskState.color === "red" ? "bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400" :
        "bg-gray-100 dark:bg-gray-900/20 text-gray-700 dark:text-gray-400"
      }`}>
        <TaskIcon className={`h-3 w-3 ${taskState.animate ? 'animate-spin' : ''}`} />
        <span>{taskState.label}</span>
      </div>
      
      {/* Sandbox Status */}
      {task.sessionId && (
        <div className={`flex items-center gap-1 px-2 py-1 rounded ${
          sandboxState.color === "green" ? "bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400" :
          sandboxState.color === "orange" ? "bg-orange-100 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400" :
          sandboxState.color === "red" ? "bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400" :
          "bg-gray-100 dark:bg-gray-900/20 text-gray-700 dark:text-gray-400"
        }`}>
          <Server className="h-3 w-3" />
          <span>{sandboxState.label}</span>
        </div>
      )}
      
      {/* Run ID if available */}
      {task.runId && (
        <span className="bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 px-2 py-1 rounded">
          Run: {task.runId.slice(-8)}
        </span>
      )}
    </div>
  )
}