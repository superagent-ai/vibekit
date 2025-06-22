"use client"

import { formatDistanceToNow, format, isToday, isYesterday, isThisYear } from "date-fns"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface TimeDisplayProps {
  timestamp: number | string | Date
  className?: string
  showRelativeOnly?: boolean
}

export function TimeDisplay({ timestamp, className = "", showRelativeOnly = false }: TimeDisplayProps) {
  const date = new Date(timestamp)
  const now = new Date()
  
  // Calculate time difference in milliseconds
  const diffInMs = now.getTime() - date.getTime()
  const diffInMinutes = Math.floor(diffInMs / (1000 * 60))
  
  // Format the display based on age
  let displayText: string
  
  if (diffInMinutes < 1) {
    displayText = "Just now"
  } else if (diffInMinutes < 60) {
    displayText = formatDistanceToNow(date, { addSuffix: true })
  } else if (showRelativeOnly) {
    displayText = formatDistanceToNow(date, { addSuffix: true })
  } else if (isToday(date)) {
    displayText = `Today at ${format(date, "h:mm a")}`
  } else if (isYesterday(date)) {
    displayText = `Yesterday at ${format(date, "h:mm a")}`
  } else if (isThisYear(date)) {
    displayText = format(date, "MMM d 'at' h:mm a")
  } else {
    displayText = format(date, "MMM d, yyyy 'at' h:mm a")
  }
  
  // Full timestamp for tooltip
  const fullTimestamp = format(date, "PPpp") // e.g., "Apr 29, 2023 at 3:45:00 PM PDT"
  const isoTimestamp = date.toISOString()
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <time 
            dateTime={isoTimestamp}
            className={`text-xs text-muted-foreground ${className}`}
            aria-label={`Time: ${fullTimestamp}`}
          >
            {displayText}
          </time>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">{fullTimestamp}</p>
          <p className="text-xs text-muted-foreground">{isoTimestamp}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}