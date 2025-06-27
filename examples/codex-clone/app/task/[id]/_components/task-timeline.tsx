// @ts-nocheck
"use client"

import { useState, useEffect, useRef } from "react"
import { formatDistanceToNow } from "date-fns"
import { ChevronRight, Clock, Terminal, Play, Pause, Square, Loader2, Send, Code, GitBranch, Zap, CheckCircle, AlertCircle, RotateCcw, ExternalLink, Monitor, Globe, Server, Copy, Trash2, Edit, FileCode, User, Bot, Expand } from "lucide-react"
import { TimeDisplay } from "@/components/ui/time-display"
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ModeSelector } from "@/components/ui/mode-selector"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Layers } from "lucide-react"
import { Markdown } from "@/components/markdown"
import { DiffViewerV2 } from "@/components/diff-viewer-v2"
import type { Task } from "@/stores/tasks"

// Type guards for message data
type UserMessageData = { content: string };
type AssistantMessageData = { content: string };
type ShellCallData = { action?: { command?: string[] } };
type ShellCallOutputData = { output?: string };

function isUserMessageData(data: any): data is UserMessageData {
    return data && typeof data.content === 'string';
}

function isAssistantMessageData(data: any): data is AssistantMessageData {
    return data && typeof data.content === 'string';
}

function isShellCallData(data: any): data is ShellCallData {
    return data && typeof data.action?.command !== 'undefined' && Array.isArray(data.action.command);
}

function isShellCallOutputData(data: any): data is ShellCallOutputData {
    return data && typeof data.output === 'string';
}

interface RealTimeProgress {
  status: "running" | "paused" | "completed" | "stopped"
  currentCommand?: string
  output: string[]
  duration: string
}

interface TaskTimelineProps {
  task: Task
  onFollowUp?: (mode: "ask" | "code", content: string, versions: number) => void
  onTaskControl?: (action: "pause" | "resume" | "stop" | "rerun" | "cleanup" | "reactivate" | "delete") => void
  onEditMessage?: (messageId: string, text: string) => void
}

interface FollowUpDialogProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  codeContext?: string
  onSubmit?: (mode: "ask" | "code", content: string, versions: number) => void
}

function FollowUpDialog({ isOpen, onOpenChange, codeContext, onSubmit }: FollowUpDialogProps) {
  const [mode, setMode] = useState<"ask" | "code">("ask")
  const [content, setContent] = useState("")
  const [versions, setVersions] = useState("1")

  const handleSubmit = () => {
    if (content.trim() && onSubmit) {
      onSubmit(mode, content, parseInt(versions))
      setContent("")
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto mx-4">
        <DialogHeader>
          <DialogTitle>Request changes or ask a question</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {codeContext && (
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground mb-2">Code context:</p>
              <pre className="text-sm bg-background p-2 rounded border overflow-x-auto">
                {codeContext}
              </pre>
            </div>
          )}
          
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Request changes or ask a question"
            className="w-full min-h-[100px] resize-none border border-border rounded-lg p-4 focus:outline-none focus:ring-2 focus:ring-ring"
          />
          
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Ask questions or request specific changes to this code
            </div>
            
            <div className="flex items-center gap-2">
              <ModeSelector
                mode={mode}
                onModeChange={setMode}
                size="md"
              />

              <Select 
                value={versions} 
                onValueChange={setVersions}
              >
                <SelectTrigger className="w-auto">
                  <Layers className="w-4 h-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1x</SelectItem>
                  <SelectItem value="2">2x</SelectItem>
                  <SelectItem value="3">3x</SelectItem>
                  <SelectItem value="4">4x</SelectItem>
                </SelectContent>
              </Select>

              <Button 
                onClick={handleSubmit}
                disabled={!content.trim()}
                size="icon"
                className="rounded-full"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function TaskTimeline({ task, onFollowUp, onTaskControl, onEditMessage }: TaskTimelineProps) {
  const [isMounted, setIsMounted] = useState(false)
  const [isHydrated, setIsHydrated] = useState(false)
  const [isLogsExpanded, setIsLogsExpanded] = useState(false)
  const [isRealTimeExpanded, setIsRealTimeExpanded] = useState(true)
  const [isRealTimeLogExpanded, setIsRealTimeLogExpanded] = useState(true)
  const [isCompletedLogExpanded, setIsCompletedLogExpanded] = useState(true)
  const [followUpDialog, setFollowUpDialog] = useState<{
    isOpen: boolean
    codeContext?: string
  }>({ isOpen: false })
  
  useEffect(() => {
    setIsMounted(true)
    setIsHydrated(true)
  }, [])
  
  const realTimeLogsRef = useRef<HTMLDivElement>(null)
  const completedLogsRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to latest logs when new messages arrive
  useEffect(() => {
    if (realTimeLogsRef.current && task?.status === "IN_PROGRESS") {
      realTimeLogsRef.current.scrollTop = realTimeLogsRef.current.scrollHeight
    }
  }, [task?.messages, task?.status])

  // Auto-expand real-time logs when task is running
  useEffect(() => {
    if (task?.status === "IN_PROGRESS" && !isRealTimeExpanded) {
      setIsRealTimeExpanded(true)
    }
  }, [task?.status, isRealTimeExpanded])

  // Debug logging for task state
  useEffect(() => {
    if (task) {
      console.log('[TaskTimeline] Task state:', {
        id: task.id,
        status: task.status,
        messagesCount: task.messages?.length || 0,
        sessionId: task.sessionId,
        containerConnections: task.containerConnections,
        runId: task.runId,
        eventId: task.eventId,
        messages: task.messages
      });
    }
  }, [task]);

  // Show loading state during hydration to prevent mismatch
  if (!isHydrated) {
    return (
      <div className="max-w-4xl mx-auto space-y-4 p-4">
        <div className="bg-muted/50 rounded-xl p-4">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  if (!task) {
    return (
      <div className="max-w-4xl mx-auto space-y-4 p-4">
        <div className="bg-muted/50 rounded-xl p-4">
          <p className="text-muted-foreground">Task not found</p>
        </div>
      </div>
    )
  }
  
  // Get actual current command from the latest shell call
  const getCurrentCommand = () => {
    const shellCalls = task?.messages?.filter(m => m.type === "local_shell_call" && isShellCallData(m.data)) || []
    const latestCall = shellCalls[shellCalls.length - 1] as typeof shellCalls[number] | undefined
    const cmdArray = latestCall?.data && (latestCall.data as ShellCallData).action?.command as string[] | undefined
    if (cmdArray && cmdArray.length > 1) {
      return cmdArray.slice(1).join(" ")
    }
    return undefined
  }

  // Generate human-readable descriptions for commands
  const getCommandDescription = (command: string): string => {
    // Common command patterns
    if (command.includes('ls')) return 'Listing directory contents'
    if (command.includes('cd')) return 'Changing directory'
    if (command.includes('mkdir')) return 'Creating directory'
    if (command.includes('rm')) return 'Removing files/directories'
    if (command.includes('cp')) return 'Copying files'
    if (command.includes('mv')) return 'Moving/renaming files'
    if (command.includes('cat')) return 'Reading file contents'
    if (command.includes('echo')) return 'Outputting text'
    if (command.includes('grep')) return 'Searching for patterns'
    if (command.includes('find')) return 'Finding files'
    if (command.includes('sed')) return 'Stream editing'
    if (command.includes('git clone')) return 'Cloning repository'
    if (command.includes('git add')) return 'Staging changes'
    if (command.includes('git commit')) return 'Committing changes'
    if (command.includes('git push')) return 'Pushing changes'
    if (command.includes('git pull')) return 'Pulling changes'
    if (command.includes('npm install')) return 'Installing dependencies'
    if (command.includes('npm run')) return 'Running npm script'
    if (command.includes('yarn')) return 'Running yarn command'
    if (command.includes('python')) return 'Running Python script'
    if (command.includes('node')) return 'Running Node.js script'
    if (command.includes('chmod')) return 'Changing file permissions'
    if (command.includes('curl')) return 'Making HTTP request'
    if (command.includes('wget')) return 'Downloading file'
    if (command.includes('docker')) return 'Running Docker command'
    if (command.includes('kubectl')) return 'Managing Kubernetes'
    
    // Default
    return 'Executing command'
  }

  // Enhanced log processing with categorization and grouping
  const processLogs = () => {
    const messages = task?.messages || []
    const logs: Array<{
      id: string
      type: 'command' | 'output' | 'git' | 'error' | 'info'
      timestamp: number
      content: string
      command?: string[]
      success?: boolean
      output?: { content: string; success: boolean; type: string }
      description?: string
    }> = []

    const baseTimestamp = task?.createdAt ? new Date(task.createdAt).getTime() : Date.now()

    let pendingCommand: {
      id: string
      type: 'command'
      timestamp: number
      content: string
      command?: string[]
      description?: string
      output?: { content: string; success: boolean; type: string }
      success?: boolean
    } | null = null
    
    messages.forEach((message, index) => {
      // Try to extract real timestamp from message data if available
      const messageData = message.data
      const messageTimestamp = (messageData as any)?.timestamp || (messageData as any)?.createdAt
      const actualTimestamp = messageTimestamp 
        ? new Date(messageTimestamp as string).getTime() 
        : baseTimestamp + (index * 2000) // Use 2 second intervals for readability

      const baseLog = {
        id: `${message.type}-${index}`,
        timestamp: actualTimestamp,
      }

      if (message.type === "user" && isUserMessageData(message.data)) {
        logs.push({
          ...baseLog,
          type: 'info',
          content: message.data.content,
          description: "User message"
        });
        return;
      }
      if (message.type === "assistant" && isAssistantMessageData(message.data)) {
        logs.push({
          ...baseLog,
          type: 'info',
          content: message.data.content,
          description: "Assistant message"
        });
        return;
      }

      if (message.type === "local_shell_call" && isShellCallData(message.data)) {
        const command = (message.data as ShellCallData).action?.command
        if (command) {
          const commandStr = command.slice(1).join(' ')
          pendingCommand = {
            ...baseLog,
            type: 'command' as const,
            content: commandStr,
            command,
            description: getCommandDescription(commandStr),
          }
        }
      }

      if (message.type === "local_shell_call_output" && isShellCallOutputData(message.data)) {
        try {
          const outputData = (message.data as ShellCallOutputData).output!
          if (outputData) {
            const parsed = JSON.parse(outputData)
            const stdout = parsed.stdout || parsed.output || ""
            const stderr = parsed.stderr || ""
            const exitCode = parsed.exitCode || parsed.code || 0
            const isError = stderr.length > 0 || exitCode !== 0
            
            const content = stderr || stdout || "Command completed"
            
            // If we have a pending command, attach the output to it
            if (pendingCommand) {
              pendingCommand.output = {
                content: content.trim(),
                success: !isError,
                type: isError ? 'error' : 'output'
              }
              pendingCommand.success = !isError
              logs.push(pendingCommand)
              pendingCommand = null
            } else {
              // Standalone output
              logs.push({
                ...baseLog,
                type: isError ? 'error' : 'output',
                content: content.trim(),
                success: !isError,
              })
            }
          }
        } catch {
          // If parsing fails, treat as generic output
          const fallbackOutput = (message.data as ShellCallOutputData).output ?? ""
          if (pendingCommand) {
            pendingCommand.output = {
              content: fallbackOutput,
              success: true,
              type: 'output'
            }
            pendingCommand.success = true
            logs.push(pendingCommand)
            pendingCommand = null
          } else {
            logs.push({
              ...baseLog,
              type: 'output',
              content: fallbackOutput,
              success: true,
            })
          }
        }
      }

      if (message.type === "git" && message.data) {
        const gitOutput = (message.data as { output?: string }).output ?? "Git operation completed"
        logs.push({
          ...baseLog,
          type: 'git',
          content: gitOutput.trim(),
        })
      }
    })

    return logs.sort((a, b) => a.timestamp - b.timestamp)
  }

  const logs = processLogs()
  
  // Calculate actual work duration
  const calculateDuration = () => {
    if (!task?.createdAt) return "0s"
    
    const startTime = new Date(task.createdAt).getTime()
    let endTime: number
    
    if (task.status === "IN_PROGRESS") {
      // If still running, show time elapsed so far
      endTime = Date.now()
    } else if (task.updatedAt) {
      // If completed, use the last update time
      endTime = new Date(task.updatedAt).getTime()
    } else {
      return "0s"
    }
    
    const durationMs = endTime - startTime
    const seconds = Math.floor(durationMs / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    
    if (hours > 0) {
      return `${hours} hour${hours > 1 ? 's' : ''} ${minutes % 60} minute${minutes % 60 !== 1 ? 's' : ''}`
    } else if (minutes > 0) {
      return `${minutes} minute${minutes > 1 ? 's' : ''} ${seconds % 60} second${seconds % 60 !== 1 ? 's' : ''}`
    } else {
      return `${seconds} second${seconds !== 1 ? 's' : ''}`
    }
  }
  
  const realTimeProgress: RealTimeProgress = {
    status: task?.status === "IN_PROGRESS" ? "running" : task?.status === "DONE" ? "completed" : "stopped",
    currentCommand: task?.status === "IN_PROGRESS" ? getCurrentCommand() : undefined,
    output: logs.map(log => log.content).filter(Boolean),
    duration: calculateDuration()
  }

  // Debug logging
  console.log('[TaskTimeline] Status check:', {
    taskStatus: task?.status,
    realTimeProgressStatus: realTimeProgress.status,
    runId: task?.runId
  })

  const handleCodeBlockAction = (codeContent: string) => {
    setFollowUpDialog({
      isOpen: true,
      codeContext: codeContent
    })
  }

  const handleFollowUpSubmit = (mode: "ask" | "code", content: string, versions: number) => {
    onFollowUp?.(mode, content, versions)
  }

  const handleTaskControl = (action: "pause" | "resume" | "stop") => {
    console.log('[TaskTimeline] handleTaskControl called with:', action)
    console.log('[TaskTimeline] onTaskControl available:', !!onTaskControl)
    onTaskControl?.(action)
  }

  // Function to detect if content is a diff
  const isDiffContent = (content: string): boolean => {
    // More aggressive logging for debugging
    console.log('[DiffDetection] Checking content:', {
      length: content.length,
      firstLine: content.split('\n')[0],
      hasGitDiff: /^diff --git/m.test(content),
      hasUnifiedDiff: /^--- /m.test(content) && /^\+\+\+ /m.test(content),
      sample: content.substring(0, 300)
    })
    
    // Check for common diff patterns
    const diffPatterns = [
      /^diff --git/m,  // Git diff
      /^--- /m,     // Unified diff (removed a/ requirement)
      /^\+\+\+ /m,  // Unified diff (removed b/ requirement)
      /^@@\s+-\d+,\d+\s+\+\d+,\d+\s+@@/m,  // Hunk header
      /^Index: /m,     // SVN diff
      /^===================================================================$/m,  // SVN separator
    ]
    
    // Check if content has diff-like structure (multiple lines with +/- at start)
    const lines = content.split('\n')
    const diffLineCount = lines.filter(line => /^[+-]/.test(line)).length
    const hasDiffStructure = diffLineCount > 3 && (diffLineCount / lines.length) > 0.2
    
    // Also check for git diff command output
    const isGitDiffOutput = content.includes('diff --git') || 
                           (content.includes('---') && content.includes('+++')) ||
                           content.includes('@@')
    
    const result = diffPatterns.some(pattern => pattern.test(content)) || hasDiffStructure || isGitDiffOutput
    console.log('[DiffDetection] Result:', result)
    
    return result
  }

  // Enhanced log entry component with syntax highlighting
  const LogEntry = ({ log, onOpenInViewer }: { log: { type: string; content: string; command?: string[]; success?: boolean; timestamp: number; description?: string }; onOpenInViewer?: (content: string) => void }) => {
    const [isExpanded, setIsExpanded] = useState(false)
    const contentRef = useRef<HTMLDivElement>(null)
    const [shouldShowToggle, setShouldShowToggle] = useState(false)
    
    // Debug logging for diff detection
    const isDiff = isDiffContent(String(log.content))
    if (log.type === 'output' && log.content.includes('diff') || log.content.includes('+++') || log.content.includes('---')) {
      console.log('[DiffViewer Debug] Log content preview:', log.content.substring(0, 200))
      console.log('[DiffViewer Debug] Is diff detected?', isDiff)
    }
    
    // Check if content needs truncation
    useEffect(() => {
      if (contentRef.current) {
        const lineCount = String(log.content).split('\n').length
        const charCount = String(log.content).length
        // Show toggle if more than 20 lines or 2000 characters
        setShouldShowToggle(lineCount > 20 || charCount > 2000)
      }
    }, [log.content])
    
    const getIcon = () => {
      if (log.description === "User message") {
        return <User className="h-3 w-3 text-purple-500" />
      }
      if (log.description === "Assistant message") {
        return <Bot className="h-3 w-3 text-teal-500" />
      }
      switch (log.type) {
        case 'command':
          return <Code className="h-3 w-3 text-blue-500" />
        case 'git':
          return <GitBranch className="h-3 w-3 text-orange-500" />
        case 'error':
          return <AlertCircle className="h-3 w-3 text-red-500" />
        case 'output':
          return log.success ? <CheckCircle className="h-3 w-3 text-green-500" /> : <AlertCircle className="h-3 w-3 text-yellow-500" />
        default:
          return <Zap className="h-3 w-3 text-gray-500" />
      }
    }

    const getBgColor = () => {
      if (log.description === "User message") {
        return 'bg-purple-50 dark:bg-purple-950/20 border-l-purple-500'
      }
      if (log.description === "Assistant message") {
        return 'bg-teal-50 dark:bg-teal-950/20 border-l-teal-500'
      }
      switch (log.type) {
        case 'command':
          return 'bg-blue-50 dark:bg-blue-950/20 border-l-blue-500'
        case 'git':
          return 'bg-orange-50 dark:bg-orange-950/20 border-l-orange-500'
        case 'error':
          return 'bg-red-50 dark:bg-red-950/20 border-l-red-500'
        case 'output':
          return log.success ? 'bg-green-50 dark:bg-green-950/20 border-l-green-500' : 'bg-yellow-50 dark:bg-yellow-950/20 border-l-yellow-500'
        default:
          return 'bg-muted/50 border-l-gray-500'
      }
    }

    const isCode = log.type === 'command'
    const isInfo = log.type === 'info'
    const isMessage = log.description === "User message" || log.description === "Assistant message"

    return (
      <div className={`border-l-2 pl-3 py-2 ${getBgColor()}`}>
        <div className="flex items-start gap-2 mb-1">
          {getIcon()}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <div className="flex items-center gap-2">
                <TimeDisplay timestamp={log.timestamp} />
                <span className="text-muted-foreground/50">•</span>
                <span className="text-muted-foreground/60">{log.description || log.type}</span>
              </div>
              {/* Open in viewer button */}
              {log.content && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (onOpenInViewer) {
                      onOpenInViewer(String(log.content))
                    }
                  }}
                  className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground"
                  title="Expand in right panel"
                >
                  <Expand className="h-3 w-3" />
                </Button>
              )}
            </div>
            <div className="relative" ref={contentRef}>
              <div className={`${shouldShowToggle && !isExpanded ? 'max-h-[400px] overflow-hidden' : ''}`}>
                {isCode ? (
              <SyntaxHighlighter
                language="bash"
                style={oneDark}
                customStyle={{
                  margin: 0,
                  padding: '8px',
                  fontSize: '11px',
                  borderRadius: '4px',
                  background: 'rgba(0, 0, 0, 0.4)',
                  opacity: 0.7,
                }}
                wrapLongLines
              >
                {String(log.content)}
              </SyntaxHighlighter>
            ) : isInfo || isMessage ? (
              <Markdown>{String(log.content)}</Markdown>
            ) : isDiffContent(String(log.content)) ? (
              <DiffViewerV2
                diffContent={String(log.content)}
                viewType="unified"
                className="my-2"
              />
            ) : (
              <pre className="text-xs font-mono whitespace-pre-wrap break-words text-foreground/90">
                {(String(log.content) as string).split('\n').map((line: string, lineIndex: number): React.ReactNode => {
                  // Check for lines with +/- changes (git diff, test results, etc)
                  const additionMatch = line.match(/^\s*\+(.*)$/)
                  const deletionMatch = line.match(/^\s*-(.*)$/)
                  const addedFilesMatch = line.match(/(\d+)\s+files?\s+changed,\s+(\d+)\s+insertions?\(\+\)/)
                  const deletedFilesMatch = line.match(/(\d+)\s+files?\s+changed,.*?(\d+)\s+deletions?\(-\)/)
                  const mixedChangesMatch = line.match(/(\d+)\s+files?\s+changed,\s+(\d+)\s+insertions?\(\+\),\s+(\d+)\s+deletions?\(-\)/)
                  
                  if (additionMatch) {
                    return (
                      <span key={lineIndex} className="block">
                        <span className="text-green-500">+</span>
                        <span className="text-green-400">{additionMatch[1]}</span>
                      </span>
                    )
                  }
                  
                  if (deletionMatch) {
                    return (
                      <span key={lineIndex} className="block">
                        <span className="text-red-500">-</span>
                        <span className="text-red-400">{deletionMatch[1]}</span>
                      </span>
                    )
                  }
                  
                  if (addedFilesMatch) {
                    return (
                      <span key={lineIndex} className="block text-green-500">
                        {line}
                      </span>
                    )
                  }
                  
                  if (deletedFilesMatch || mixedChangesMatch) {
                    return (
                      <span key={lineIndex} className="block text-yellow-500">
                        {line}
                      </span>
                    )
                  }
                  // default fallback
                  return <span key={lineIndex}>{line}</span>
                })}
              </pre>
                )}
              </div>
              
              {/* Fade out effect */}
              {shouldShowToggle && !isExpanded && (
                <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-background to-transparent pointer-events-none" />
              )}
              
              {/* Show more/less button */}
              {shouldShowToggle && (
                <div className="mt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    {isExpanded ? (
                      <>
                        <ChevronRight className="h-3 w-3 mr-1 rotate-90" />
                        Show less
                      </>
                    ) : (
                      <>
                        <ChevronRight className="h-3 w-3 mr-1" />
                        Show more
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full space-y-4 min-w-0">

      {/* Chat Messages - Show prominently at the top */}
      <div className="space-y-6 min-w-0">
        {task?.messages
          ?.filter((message) => message.type === "message")
          ?.map((message, index) => {
            // Calculate approximate timestamp for each message
            const allMessages = task.messages || []
            const messageMessages = allMessages.filter(m => m.type === "message")
            const messageIndex = messageMessages.findIndex(m => m === message)
            
            // Use task creation time as base, or current time if not available
            const baseTime = task.createdAt ? new Date(task.createdAt).getTime() : Date.now()
            
            // Add 30 seconds for each message to simulate conversation flow
            const messageTimestamp = baseTime + (messageIndex * 30000)
            
            // For debugging - ensure we have a valid timestamp
            if (!messageTimestamp || isNaN(messageTimestamp)) {
              console.warn('[TaskTimeline] Invalid timestamp calculated:', {
                messageIndex,
                baseTime,
                taskCreatedAt: task.createdAt,
                messageTimestamp
              })
            }
            
            
            return (
            <div key={`timeline-${index}`} className="space-y-4 min-w-0">
              <div className={`min-w-0 ${
                message.role === "user" 
                  ? "bg-blue-50 dark:bg-blue-950/20 border-l-4 border-l-blue-500 pl-4 py-2" 
                  : "bg-gray-50 dark:bg-gray-950/20 border-l-4 border-l-gray-400 pl-4 py-2"
              }`}>
                {message.role === "user" ? (
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-medium text-blue-700 dark:text-blue-400">
                        You asked
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {isMounted ? formatDistanceToNow(new Date(messageTimestamp), { addSuffix: true }) : 'Loading...'}
                      </div>
                    </div>
                    {/* Edit button for user messages */}
                    {onEditMessage && message.data?.id && task?.status !== "IN_PROGRESS" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onEditMessage(message.data.id, message.data?.text as string)}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        <Edit className="h-3 w-3 mr-1" />
                        Edit
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 mb-2">
                    <div className="text-sm font-medium text-gray-700 dark:text-gray-400">
                      Assistant's response
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      {isMounted ? formatDistanceToNow(new Date(messageTimestamp), { addSuffix: true }) : 'Loading...'}
                    </div>
                  </div>
                )}
                <div className="relative">
                  <Markdown
                    repoUrl={
                      task?.repository
                        ? `https://github.com/${task.repository}`
                        : undefined
                    }
                    branch={task?.branch}
                    onCodeBlockAction={message.role === "assistant" ? handleCodeBlockAction : undefined}
                  >
                    {message.data?.text as string}
                  </Markdown>
                  {/* Streaming indicator */}
                  {message.data?.isStreaming && (
                    <div className="absolute bottom-0 right-0 flex items-center gap-1 text-xs text-muted-foreground bg-background px-2 py-1 rounded">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span>Streaming...</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
            )
          })
      </div>

      {/* Current Phase/Activity Indicator */}
      {realTimeProgress.status === "running" && (
        <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-lg p-4 mb-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
              <span className="text-lg font-semibold">Task in Progress</span>
            </div>
            
            {/* Live Status Indicator */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span>Live</span>
            </div>
          </div>
          
          {/* Current Activity */}
          {realTimeProgress.currentCommand && (
            <div className="mt-2">
              <p className="text-sm text-muted-foreground mb-1">Current activity:</p>
              <p className="text-sm font-medium bg-black/5 dark:bg-white/5 rounded px-3 py-2">
                {realTimeProgress.currentCommand}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Real-time Progress Section */}
      {realTimeProgress.status === "running" && (
        <Collapsible open={isRealTimeExpanded} onOpenChange={setIsRealTimeExpanded}>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Terminal className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Detailed Execution Log</span>
            </div>
          </div>
          
          <CollapsibleContent className="mt-4">
            <div className="bg-background border rounded-lg overflow-hidden">
              <Collapsible open={isRealTimeLogExpanded} onOpenChange={setIsRealTimeLogExpanded}>
                <CollapsibleTrigger asChild>
                  <div className="bg-muted/30 px-4 py-2 border-b sticky top-24 z-10 shadow-sm cursor-pointer hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <ChevronRight className={`h-3 w-3 transition-transform ${isRealTimeLogExpanded ? 'rotate-90' : ''}`} />
                      <Code className="h-4 w-4" />
                      Live Execution Log
                    </div>
                  </div>
                </CollapsibleTrigger>
                
                <CollapsibleContent>
                  <div ref={realTimeLogsRef} className="overflow-y-auto p-4 space-y-3 scroll-smooth">
                    {logs.length > 0 ? (
                      logs.slice(-10).map((log) => (
                        <LogEntry key={log.id} log={log} onOpenInViewer={handleCodeBlockAction} />
                      ))
                    ) : (
                      <div className="text-center text-muted-foreground py-8">
                        <Terminal className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">Waiting for command execution...</p>
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Completed Work Duration */}
      {realTimeProgress.status !== "running" && logs.length > 0 && (
        <Collapsible open={isLogsExpanded} onOpenChange={setIsLogsExpanded}>
          <CollapsibleTrigger asChild>
            <Button 
              variant="ghost" 
              className="flex items-center gap-2 p-0 h-auto text-muted-foreground hover:text-foreground"
            >
              <ChevronRight className={`h-4 w-4 transition-transform ${isLogsExpanded ? 'rotate-90' : ''}`} />
              <Clock className="h-4 w-4" />
              <span>Task duration: {realTimeProgress.duration}</span>
            </Button>
          </CollapsibleTrigger>
          
          <CollapsibleContent className="mt-4">
            <div className="bg-background border rounded-lg overflow-hidden">
              <Collapsible open={isCompletedLogExpanded} onOpenChange={setIsCompletedLogExpanded}>
                <CollapsibleTrigger asChild>
                  <div className="bg-muted/30 px-4 py-2 border-b cursor-pointer hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2 font-medium">
                        <ChevronRight className={`h-3 w-3 transition-transform ${isCompletedLogExpanded ? 'rotate-90' : ''}`} />
                        <FileCode className="h-4 w-4" />
                        Show logs
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-muted-foreground">{logs.filter(l => l.type === 'command').length} tools used</span>
                        <div className="flex items-center gap-1">
                          <CheckCircle className="h-3 w-3 text-green-500" />
                          <span>{logs.filter(l => l.type === 'output' && l.success).length} successful</span>
                        </div>
                        {logs.filter(l => l.type === 'error').length > 0 && (
                          <div className="flex items-center gap-1">
                            <AlertCircle className="h-3 w-3 text-red-500" />
                            <span>{logs.filter(l => l.type === 'error').length} errors</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </CollapsibleTrigger>
                
                <CollapsibleContent>
                  <div ref={completedLogsRef} className="overflow-y-auto space-y-3 scroll-smooth">
                    {/* Summary Stats */}
                    <div className="sticky top-0 bg-background/95 backdrop-blur-sm p-4 border-b">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2">
                            <Code className="h-4 w-4 text-blue-500" />
                            <span className="font-medium">{logs.filter(l => l.type === 'command').length} commands</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-green-500" />
                            <span className="font-medium">{logs.filter(l => l.type === 'output' && l.success).length} successful</span>
                          </div>
                          {logs.filter(l => l.type === 'error').length > 0 && (
                            <div className="flex items-center gap-2">
                              <AlertCircle className="h-4 w-4 text-red-500" />
                              <span className="font-medium">{logs.filter(l => l.type === 'error').length} errors</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    {/* Log Entries */}
                    <div className="p-4 space-y-3">
                      {logs.length > 0 ? (
                        logs.map((log) => (
                          <LogEntry key={log.id} log={log} onOpenInViewer={handleCodeBlockAction} />
                        ))
                      ) : (
                        <div className="text-center text-muted-foreground py-8">
                          <Terminal className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p className="text-sm">No execution logs available</p>
                        </div>
                      )}
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}


      
      {/* Container Expired/Missing Notice */}
      {task.sessionId && !task.containerConnections && task.status === "DONE" && (
        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Server className="h-4 w-4 text-red-500" />
            <span className="font-medium text-red-700 dark:text-red-400">E2B Container</span>
            <span className="text-xs text-red-600 bg-red-100 dark:bg-red-900/20 px-2 py-1 rounded font-medium">
              EXPIRED
            </span>
          </div>
          <p className="text-sm text-red-600 dark:text-red-400">
            The sandbox has expired after 1 hour. Click "WAKE UP" above to reactivate it.
          </p>
        </div>
      )}


      {/* Follow-up Dialog */}
      <FollowUpDialog
        isOpen={followUpDialog.isOpen}
        onOpenChange={(open) => setFollowUpDialog({ ...followUpDialog, isOpen: open })}
        codeContext={followUpDialog.codeContext}
        onSubmit={handleFollowUpSubmit}
      />
    </div>
  )
}