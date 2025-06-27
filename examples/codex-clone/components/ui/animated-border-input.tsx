"use client"

import { cn } from "@/lib/utils"
import { forwardRef } from "react"

interface AnimatedBorderInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  pulseColor?: string
  backgroundColor?: string
}

export const AnimatedBorderInput = forwardRef<HTMLInputElement, AnimatedBorderInputProps>(
  ({ className, pulseColor = "cyan", backgroundColor = "black", ...props }, ref) => {
    return (
      <div className="relative group">
        {/* Animated border container */}
        <div className="absolute -inset-0.5 rounded-lg opacity-75 group-focus-within:opacity-100 blur-sm transition duration-1000">
          <div 
            className={cn(
              "absolute inset-0 rounded-lg animate-border-pulse",
              pulseColor === "cyan" && "bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500",
              pulseColor === "green" && "bg-gradient-to-r from-green-500 via-emerald-500 to-teal-500",
              pulseColor === "purple" && "bg-gradient-to-r from-purple-500 via-pink-500 to-red-500",
              pulseColor === "rainbow" && "bg-gradient-to-r from-red-500 via-yellow-500 to-blue-500"
            )}
            style={{
              backgroundSize: "200% 200%",
            }}
          />
        </div>
        
        {/* Input field */}
        <div className="relative">
          <input
            ref={ref}
            className={cn(
              "relative w-full rounded-lg border-0 px-4 py-3",
              "bg-white dark:bg-gray-900/95 text-foreground placeholder:text-muted-foreground",
              "focus:outline-none focus:ring-0",
              "transition-all duration-300 shadow-lg",
              backgroundColor === "black" && "dark:bg-black bg-white",
              backgroundColor === "gray" && "dark:bg-gray-900 bg-gray-50",
              className
            )}
            {...props}
          />
        </div>
      </div>
    )
  }
)

AnimatedBorderInput.displayName = "AnimatedBorderInput"

// Textarea variant
export const AnimatedBorderTextarea = forwardRef<HTMLTextAreaElement, AnimatedBorderInputProps>(
  ({ className, pulseColor = "cyan", backgroundColor = "black", ...props }, ref) => {
    return (
      <div className="relative group">
        {/* Animated border container */}
        <div className="absolute -inset-0.5 rounded-lg opacity-75 group-focus-within:opacity-100 blur-sm transition duration-1000">
          <div 
            className={cn(
              "absolute inset-0 rounded-lg animate-border-pulse",
              pulseColor === "cyan" && "bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500",
              pulseColor === "green" && "bg-gradient-to-r from-green-500 via-emerald-500 to-teal-500",
              pulseColor === "purple" && "bg-gradient-to-r from-purple-500 via-pink-500 to-red-500",
              pulseColor === "rainbow" && "bg-gradient-to-r from-red-500 via-yellow-500 to-blue-500"
            )}
            style={{
              backgroundSize: "200% 200%",
            }}
          />
        </div>
        
        {/* Textarea field */}
        <div className="relative">
          <textarea
            ref={ref}
            className={cn(
              "relative w-full rounded-lg border-0 px-4 py-3",
              "bg-white dark:bg-gray-900/95 text-foreground placeholder:text-muted-foreground",
              "focus:outline-none focus:ring-0",
              "transition-all duration-300 shadow-lg",
              "min-h-[120px] resize-none",
              backgroundColor === "black" && "dark:bg-black bg-white",
              backgroundColor === "gray" && "dark:bg-gray-900 bg-gray-50",
              className
            )}
            {...props}
          />
        </div>
      </div>
    )
  }
)

AnimatedBorderTextarea.displayName = "AnimatedBorderTextarea"