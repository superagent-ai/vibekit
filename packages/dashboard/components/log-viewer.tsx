'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { RefreshCw, Wifi, WifiOff } from 'lucide-react'

interface LogEntry {
  id: string
  timestamp: string
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
  metadata?: Record<string, any>
  source?: 'stream' | 'file'
}

interface LogViewerProps {
  projectId: string
  taskId: string
}

export function LogViewer({ projectId, taskId }: LogViewerProps) {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'connecting'>('disconnected')
  const [isAutoScroll, setIsAutoScroll] = useState(true)
  const [lastEventId, setLastEventId] = useState<string>('')
  
  const eventSourceRef = useRef<EventSource | null>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const logsEndRef = useRef<HTMLDivElement>(null)

  // Load logs from JSON file fallback
  const loadLogsFromFile = useCallback(async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}/tasks/${taskId}/logs`)
      if (response.ok) {
        const fileLogs: LogEntry[] = await response.json()
        setLogs(prev => {
          // Merge file logs with existing logs, avoiding duplicates
          const existing = new Set(prev.map(log => log.id))
          const newLogs = fileLogs.filter(log => !existing.has(log.id))
          return [...prev, ...newLogs].sort((a, b) => 
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          )
        })
      }
    } catch (error) {
      console.error('Failed to load logs from file:', error)
    }
  }, [projectId, taskId])

  // Setup EventSource for real-time streaming
  const setupEventSource = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }

    setConnectionStatus('connecting')
    
    const eventSource = new EventSource(
      `/api/projects/${projectId}/tasks/${taskId}/logs/stream${lastEventId ? `?lastEventId=${lastEventId}` : ''}`
    )

    eventSource.onopen = () => {
      setConnectionStatus('connected')
    }

    eventSource.onmessage = (event) => {
      try {
        const logEntry: LogEntry = JSON.parse(event.data)
        logEntry.source = 'stream'
        
        setLogs(prev => {
          // Check if log already exists to avoid duplicates
          if (prev.some(log => log.id === logEntry.id)) {
            return prev
          }
          return [...prev, logEntry].sort((a, b) => 
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          )
        })
        
        setLastEventId(event.lastEventId || logEntry.id)
      } catch (error) {
        console.error('Failed to parse log entry:', error)
      }
    }

    eventSource.onerror = () => {
      setConnectionStatus('disconnected')
      // Try to reconnect after a delay
      setTimeout(() => {
        setupEventSource()
      }, 5000)
    }

    eventSourceRef.current = eventSource
  }, [projectId, taskId, lastEventId])

  // Initialize log loading
  useEffect(() => {
    // First load existing logs from file
    loadLogsFromFile()
    
    // Then setup real-time streaming
    setupEventSource()

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }
    }
  }, [loadLogsFromFile, setupEventSource])

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (isAutoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, isAutoScroll])

  // Handle manual refresh
  const handleRefresh = () => {
    loadLogsFromFile()
    if (connectionStatus === 'disconnected') {
      setupEventSource()
    }
  }

  const getLevelColor = (level: LogEntry['level']) => {
    switch (level) {
      case 'error':
        return 'text-red-600 dark:text-red-400'
      case 'warn':
        return 'text-yellow-600 dark:text-yellow-400'
      case 'info':
        return 'text-blue-600 dark:text-blue-400'
      case 'debug':
        return 'text-gray-600 dark:text-gray-400'
      default:
        return 'text-gray-600 dark:text-gray-400'
    }
  }

  const getLevelBadgeColor = (level: LogEntry['level']) => {
    switch (level) {
      case 'error':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
      case 'warn':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
      case 'info':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
      case 'debug':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
    }
  }

  return (
    <div className="h-[500px] flex flex-col">
      {/* Header with connection status and controls */}
      <div className="flex items-center justify-between p-2 border-b">
        <div className="flex items-center gap-2">
          {connectionStatus === 'connected' ? (
            <Wifi className="h-4 w-4 text-green-600" />
          ) : (
            <WifiOff className="h-4 w-4 text-red-600" />
          )}
          <span className="text-sm font-medium">
            {connectionStatus === 'connected' && 'Live streaming'}
            {connectionStatus === 'connecting' && 'Connecting...'}
            {connectionStatus === 'disconnected' && 'File-based logs'}
          </span>
          {connectionStatus === 'disconnected' && (
            <Badge variant="outline" className="text-xs">
              Offline mode
            </Badge>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsAutoScroll(!isAutoScroll)}
            className={isAutoScroll ? 'bg-blue-100 dark:bg-blue-900' : ''}
          >
            Auto-scroll {isAutoScroll ? 'ON' : 'OFF'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={connectionStatus === 'connecting'}
          >
            <RefreshCw className={`h-4 w-4 ${connectionStatus === 'connecting' ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Logs display */}
      <ScrollArea className="flex-1 p-2" ref={scrollAreaRef}>
        {logs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            No logs available yet
          </div>
        ) : (
          <div className="space-y-1">
            {logs.map((log, index) => (
              <div key={log.id} className="group">
                <div className="flex items-start gap-2 p-2 rounded hover:bg-muted/50">
                  <div className="flex-shrink-0">
                    <Badge className={`text-xs ${getLevelBadgeColor(log.level)}`}>
                      {log.level.toUpperCase()}
                    </Badge>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-muted-foreground font-mono">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                      {log.source === 'stream' && (
                        <Badge variant="outline" className="text-xs">
                          Live
                        </Badge>
                      )}
                    </div>
                    <div className={`text-sm ${getLevelColor(log.level)}`}>
                      {log.message}
                    </div>
                    {log.metadata && Object.keys(log.metadata).length > 0 && (
                      <details className="mt-1 text-xs text-muted-foreground">
                        <summary className="cursor-pointer">Metadata</summary>
                        <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-x-auto">
                          {JSON.stringify(log.metadata, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
                {index < logs.length - 1 && <Separator className="my-1" />}
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        )}
      </ScrollArea>
    </div>
  )
}