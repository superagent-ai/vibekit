import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a timestamp into a human-readable date string
 */
export function formatDate(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffHours / 24)

  if (diffDays > 30) {
    return date.toLocaleDateString()
  } else if (diffDays > 0) {
    return `${diffDays}d ago`
  } else if (diffHours > 0) {
    return `${diffHours}h ago`
  } else {
    const diffMinutes = Math.floor(diffMs / (1000 * 60))
    return diffMinutes > 0 ? `${diffMinutes}m ago` : 'Just now'
  }
}

/**
 * Format a duration in milliseconds into a human-readable string
 */
export function formatDuration(durationMs: number): string {
  const seconds = Math.floor(durationMs / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) {
    const remainingMinutes = minutes % 60
    const remainingSeconds = seconds % 60
    return `${hours}h ${remainingMinutes}m ${remainingSeconds}s`
  } else if (minutes > 0) {
    const remainingSeconds = seconds % 60
    return `${minutes}m ${remainingSeconds}s`
  } else {
    return `${seconds}s`
  }
}

/**
 * Format bytes into human-readable format
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
}

/**
 * Format numbers with commas
 */
export function formatNumber(num: number): string {
  return num.toLocaleString()
}

/**
 * Get color class for status
 */
export function getStatusColor(status: string): string {
  switch (status) {
    case 'healthy':
    case 'completed':
      return 'text-green-600'
    case 'error':
    case 'failed':
      return 'text-red-600'
    case 'warning':
    case 'degraded':
      return 'text-yellow-600'
    case 'active':
    case 'running':
      return 'text-blue-600'
    default:
      return 'text-gray-600'
  }
}
