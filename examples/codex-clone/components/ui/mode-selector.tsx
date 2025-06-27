"use client"

import { useState } from "react"
import { Switch } from "@/components/ui/switch"
import { Brain, MessageCircle, Bot } from "lucide-react"

interface ModeSelectorProps {
  mode: "ask" | "code"
  onModeChange: (mode: "ask" | "code") => void
  size?: "sm" | "md" | "lg"
  className?: string
  showThinkToggle?: boolean
  onThinkToggle?: (enabled: boolean) => void
}

export function ModeSelector({ 
  mode, 
  onModeChange, 
  size = "md", 
  className = "",
  showThinkToggle = true,
  onThinkToggle 
}: ModeSelectorProps) {
  const [thinkEnabled, setThinkEnabled] = useState(false)
  const getSizeClasses = () => {
    switch (size) {
      case "sm":
        return "px-2"
      case "lg":
        return "px-4"
      default:
        return "px-3"
    }
  }

  const handleThinkToggle = (enabled: boolean) => {
    setThinkEnabled(enabled)
    onThinkToggle?.(enabled)
  }

  return (
    <div className={`relative flex items-center gap-2 ${className}`}>
      {showThinkToggle && (
        <div className="flex items-center gap-2 px-3 h-8 rounded-full bg-blue-500/10 dark:bg-blue-600/20 backdrop-blur-sm border border-blue-500/20">
          <label htmlFor="think-toggle" className="text-blue-600 dark:text-blue-400">
            <Brain className="h-4 w-4" />
          </label>
          <Switch
            id="think-toggle"
            checked={thinkEnabled}
            onCheckedChange={handleThinkToggle}
            className="data-[state=checked]:bg-blue-500 data-[state=unchecked]:bg-blue-500/30 scale-75"
          />
        </div>
      )}
      <div className="relative grid w-auto grid-cols-2 rounded-full p-0.5 bg-gradient-to-r from-violet-600/30 via-pink-500/30 to-purple-600/30 dark:from-violet-700/40 dark:via-pink-600/40 dark:to-purple-700/40 border border-purple-500/30 dark:border-purple-400/30 h-8">
        {/* Sliding background */}
        <div 
          className={`absolute top-0.5 bottom-0.5 left-0.5 w-[calc(50%-2px)] bg-white/20 rounded-full shadow-sm border border-white/30 transition-transform duration-300 ease-in-out ${
            mode === "ask" ? "translate-x-0" : "translate-x-[calc(100%+2px)]"
          }`}
        />
        
        <button 
          type="button"
          onClick={() => onModeChange("ask")}
          className={`relative z-10 rounded-full transition-all duration-300 ease-in-out flex items-center justify-center h-full ${getSizeClasses()} ${
            mode === "ask" ? "text-white" : "text-purple-600 dark:text-purple-400"
          }`}
          title="Chat mode"
        >
          <MessageCircle className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
        </button>
        <button 
          type="button"
          onClick={() => onModeChange("code")}
          className={`relative z-10 rounded-full transition-all duration-300 ease-in-out flex items-center justify-center h-full ${getSizeClasses()} ${
            mode === "code" ? "text-white" : "text-purple-600 dark:text-purple-400"
          }`}
          title="Agent mode"
        >
          <Bot className={`${size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} ml-0.5`} />
        </button>
      </div>
    </div>
  )
}