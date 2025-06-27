"use client"

import { cn } from "@/lib/utils"
import { Github, GitBranch, Cloud, Server, Database } from "lucide-react"
import { useEffect, useState } from "react"

interface ConnectionStatusProps {
  provider?: "github" | "e2b" | "database" | "server"
  status: "connected" | "disconnected" | "connecting" | "error"
  label?: string
  className?: string
  showPulse?: boolean
  compact?: boolean
}

const providerConfig = {
  github: {
    icon: Github,
    label: "GitHub",
    colors: {
      connected: "text-green-500 border-green-500/30 bg-green-500/10",
      disconnected: "text-gray-500 border-gray-500/30 bg-gray-500/10",
      connecting: "text-yellow-500 border-yellow-500/30 bg-yellow-500/10",
      error: "text-red-500 border-red-500/30 bg-red-500/10"
    }
  },
  e2b: {
    icon: Cloud,
    label: "E2B",
    colors: {
      connected: "text-green-500 border-green-500/30 bg-green-500/10",
      disconnected: "text-gray-500 border-gray-500/30 bg-gray-500/10",
      connecting: "text-blue-500 border-blue-500/30 bg-blue-500/10",
      error: "text-red-500 border-red-500/30 bg-red-500/10"
    }
  },
  database: {
    icon: Database,
    label: "Database",
    colors: {
      connected: "text-green-500 border-green-500/30 bg-green-500/10",
      disconnected: "text-gray-500 border-gray-500/30 bg-gray-500/10",
      connecting: "text-yellow-500 border-yellow-500/30 bg-yellow-500/10",
      error: "text-red-500 border-red-500/30 bg-red-500/10"
    }
  },
  server: {
    icon: Server,
    label: "Server",
    colors: {
      connected: "text-green-500 border-green-500/30 bg-green-500/10",
      disconnected: "text-gray-500 border-gray-500/30 bg-gray-500/10",
      connecting: "text-yellow-500 border-yellow-500/30 bg-yellow-500/10",
      error: "text-red-500 border-red-500/30 bg-red-500/10"
    }
  }
}

export function ConnectionStatus({
  provider = "github",
  status,
  label,
  className,
  showPulse = true,
  compact = false
}: ConnectionStatusProps) {
  const [isAnimating, setIsAnimating] = useState(false)
  const config = providerConfig[provider]
  const Icon = config.icon

  useEffect(() => {
    if (status === "connecting" && showPulse) {
      setIsAnimating(true)
    } else {
      setIsAnimating(false)
    }
  }, [status, showPulse])

  const statusLabel = label || (status === "connected" ? "Connected" : 
                               status === "disconnected" ? "Disconnected" :
                               status === "connecting" ? "Connecting..." : "Error")

  // Compact mode - just icon and indicator
  if (compact) {
    return (
      <div 
        className={cn(
          "inline-flex items-center gap-2 px-2.5 h-8 rounded-full border transition-all duration-300",
          config.colors[status],
          className
        )}
      >
        <Icon className="h-4 w-4" />
        <div className="relative">
          <div 
            className={cn(
              "w-2 h-2 rounded-full",
              status === "connected" && "bg-green-500",
              status === "disconnected" && "bg-gray-500",
              status === "connecting" && "bg-yellow-500",
              status === "error" && "bg-red-500"
            )}
          />
          {isAnimating && (
            <div 
              className={cn(
                "absolute inset-0 rounded-full animate-ping",
                status === "connecting" && "bg-yellow-500"
              )}
            />
          )}
        </div>
      </div>
    )
  }

  return (
    <div 
      className={cn(
        "inline-flex items-center gap-2 px-3 h-8 rounded-full border text-sm font-medium leading-none py-0 min-h-8 max-h-8",
        "transition-all duration-500 ease-out",
        config.colors[status],
        className
      )}
    >
      <Icon className="h-4 w-4 flex-shrink-0" />
      <span className={cn(
        "font-medium overflow-hidden transition-all duration-500 ease-out",
        "max-w-[200px] truncate"
      )}>
        {statusLabel}
      </span>
      <div className="relative flex-shrink-0">
        <div 
          className={cn(
            "w-2 h-2 rounded-full transition-colors duration-300",
            status === "connected" && "bg-green-500",
            status === "disconnected" && "bg-gray-500",
            status === "connecting" && "bg-yellow-500",
            status === "error" && "bg-red-500"
          )}
        />
        {isAnimating && (
          <div 
            className={cn(
              "absolute inset-0 rounded-full animate-ping",
              status === "connecting" && "bg-yellow-500"
            )}
          />
        )}
      </div>
    </div>
  )
}

// Compound component for more complex status displays
export function ConnectionStatusGroup({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {children}
    </div>
  )
}

// Hook to use with GitHub auth
export function useGitHubConnectionStatus() {
  const [status, setStatus] = useState<"connected" | "disconnected" | "connecting" | "error">("disconnected")

  useEffect(() => {
    const checkConnection = () => {
      const userCookie = document.cookie
        .split("; ")
        .find((row) => row.startsWith("github_user="))
      
      if (userCookie) {
        setStatus("connected")
      } else {
        setStatus("disconnected")
      }
    }

    checkConnection()
    
    // Check periodically
    const interval = setInterval(checkConnection, 5000)
    return () => clearInterval(interval)
  }, [])

  return status
}

// Hook for E2B sandbox connection
export function useE2BConnectionStatus(sandboxId?: string) {
  const [status, setStatus] = useState<"connected" | "disconnected" | "connecting" | "error">("disconnected")

  useEffect(() => {
    if (!sandboxId) {
      setStatus("disconnected")
      return
    }

    setStatus("connecting")
    
    // Simulate connection check - in real app, you'd check the actual sandbox status
    const timeout = setTimeout(() => {
      setStatus("connected")
    }, 1000)

    return () => clearTimeout(timeout)
  }, [sandboxId])

  return status
}