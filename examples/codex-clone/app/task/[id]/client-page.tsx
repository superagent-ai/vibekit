"use client";
import { useInngestSubscription } from "@inngest/realtime/hooks";
import { useEffect, useRef, useState } from "react";

import TaskNavbar from "./_components/navbar";
import MessageInput from "./_components/message-input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { fetchRealtimeSubscriptionToken } from "@/app/actions/inngest";
import { useTaskStore } from "@/stores/tasks";
import { Terminal, Bot, User, Loader2, FileText, Plus, Minus, ChevronRight, ThumbsUp, ThumbsDown, Clock, ChevronDown, ChevronUp } from "lucide-react";
import { TextShimmer } from "@/components/ui/text-shimmer";
import { Markdown } from "@/components/markdown";
import { StreamingIndicator } from "@/components/streaming-indicator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { DiffViewerV2 } from "@/components/diff-viewer-v2";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { TaskTimeline } from "./_components/task-timeline";
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

// Custom theme based on oneDark but without line backgrounds
const customDarkTheme = {
  ...oneDark,
  'code[class*="language-"]': {
    ...oneDark['code[class*="language-"]'],
    background: 'transparent',
  },
  'pre[class*="language-"]': {
    ...oneDark['pre[class*="language-"]'],
    background: 'transparent',
  },
  ':not(pre) > code[class*="language-"]': {
    ...oneDark[':not(pre) > code[class*="language-"]'],
    background: 'transparent',
  },
};

interface Props {
  id: string;
}

interface StreamingMessage {
  role: "user" | "assistant";
  type: string;
  data: Record<string, unknown> & {
    text?: string;
    isStreaming?: boolean;
    streamId?: string;
    chunkIndex?: number;
    totalChunks?: number;
  };
}

interface IncomingMessage {
  role: "user" | "assistant";
  type: string;
  data: Record<string, unknown> & {
    text?: string;
    isStreaming?: boolean;
    streamId?: string;
    chunkIndex?: number;
    totalChunks?: number;
    call_id?: string;
    action?: {
      command?: string[];
    };
    output?: string;
  };
}

// Type guard to check if a message has streaming properties
function isStreamingMessage(message: unknown): message is IncomingMessage & {
  data: { isStreaming: true; streamId: string };
} {
  return (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    message.type === "message" &&
    "data" in message &&
    typeof message.data === "object" &&
    message.data !== null &&
    "isStreaming" in message.data &&
    message.data.isStreaming === true &&
    "streamId" in message.data &&
    typeof message.data.streamId === "string"
  );
}

// Function to detect if content is a diff
function isDiffContent(content: string): boolean {
  if (!content) return false;
  
  // Check for common diff patterns
  const diffPatterns = [
    /^diff --git/m,  // Git diff
    /^--- /m,        // Unified diff
    /^\+\+\+ /m,     // Unified diff
    /^@@\s+-\d+,\d+\s+\+\d+,\d+\s+@@/m,  // Hunk header
    /^Index: /m,     // SVN diff
  ];
  
  // Check if content has diff-like structure
  const lines = content.split('\n');
  const diffLineCount = lines.filter(line => /^[+-]/.test(line)).length;
  const hasDiffStructure = diffLineCount > 3 && (diffLineCount / lines.length) > 0.2;
  
  return diffPatterns.some(pattern => pattern.test(content)) || hasDiffStructure;
}

// Format duration in human readable format
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

// Type guard to check if a message is a completed stream
function isCompletedStreamMessage(
  message: unknown
): message is IncomingMessage & {
  data: { streamId: string; isStreaming: false };
} {
  return (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    message.type === "message" &&
    "data" in message &&
    typeof message.data === "object" &&
    message.data !== null &&
    "streamId" in message.data &&
    typeof message.data.streamId === "string" &&
    (!("isStreaming" in message.data) || message.data.isStreaming === false)
  );
}

// Type guard to check if message is a valid incoming message
function isValidIncomingMessage(message: unknown): message is IncomingMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    "role" in message &&
    "type" in message &&
    "data" in message &&
    (message.role === "user" || message.role === "assistant") &&
    typeof message.type === "string" &&
    typeof message.data === "object"
  );
}

export default function TaskClientPage({ id }: Props) {
  const { getTaskById, updateTask } = useTaskStore();
  const task = getTaskById(id);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const chatScrollAreaRef = useRef<HTMLDivElement>(null);
  const [subscriptionEnabled, setSubscriptionEnabled] = useState(true);
  const [streamingMessages, setStreamingMessages] = useState<
    Map<string, StreamingMessage>
  >(new Map());
  const [chatWidth, setChatWidth] = useState(50); // percentage
  const resizeRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isResizingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  const [selectedFileIndex, setSelectedFileIndex] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(task?.feedback || null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const getMessageTimestamp = (message: any, index: number, task: any): string | null => {
    // Try various timestamp sources
    const timestamp = message.data?.timestamp || message.data?.createdAt || message.timestamp;
    
    if (timestamp) {
      return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
    }
    
    // Fallback: calculate based on task creation time and message index
    if (task?.createdAt) {
      const baseTime = new Date(task.createdAt).getTime();
      const estimatedTime = new Date(baseTime + (index * 30000)); // 30 seconds per message
      return formatDistanceToNow(estimatedTime, { addSuffix: true });
    }
    
    return null;
  };
  
  // Get actual timestamp for logs (showing real date/time)
  const getLogTimestamp = (message: any): string => {
    const timestamp = message.data?.timestamp || message.data?.createdAt || message.timestamp;
    
    if (timestamp) {
      const date = new Date(timestamp);
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
    }
    
    return new Date().toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  };

  // Function to get the output message for a given shell call message
  const getOutputForCall = (callId: string) => {
    return task?.messages.find(
      (message) =>
        message.type === "local_shell_call_output" &&
        message.data?.call_id === callId
    );
  };

  // Handle feedback
  const handleFeedback = (type: 'up' | 'down') => {
    setFeedback(type);
    updateTask(id, {
      feedback: type,
      feedbackAt: new Date().toISOString()
    });
    console.log(`Task ${id} feedback:`, type);
  };

  // Extract file changes from all git diff outputs and file modifications
  const getFileChanges = () => {
    const fileChanges: Array<{
      filename: string;
      additions: number;
      deletions: number;
      diffContent: string;
      messageIndex: number;
    }> = [];
    const fileMap = new Map<string, typeof fileChanges[0]>();
    

    task?.messages.forEach((message, index) => {
      // Check for shell commands that modify files or run git diff
      if (message.type === "local_shell_call") {
        const command = (message.data as { action?: { command?: string[] } })?.action?.command;
        if (command && command.length > 1) {
          const cmdStr = command.join(' ');
          
          // Check if this is a git diff command
          if (cmdStr.includes('git diff') || cmdStr.includes('git show')) {
            // Find the corresponding output message
            const outputMessage = task?.messages.find((msg, idx) => 
              idx > index && 
              msg.type === "local_shell_call_output" && 
              msg.data?.call_id === message.data?.call_id
            );
            
            if (outputMessage) {
              const outputData = outputMessage.data as { output?: string };
              const outputString = outputData?.output || "";
              
              let finalOutput = "";
              if (outputString && !outputString.trim().startsWith('{')) {
                finalOutput = outputString;
              } else {
                try {
                  const parsed = JSON.parse(outputString || "{}");
                  finalOutput = parsed.output || outputString || "";
                } catch {
                  finalOutput = outputString || "";
                }
              }
              
              if (isDiffContent(finalOutput)) {
                // This will be processed in the output section below
              }
            }
          }
          
          // Look for file operations
          if (cmdStr.includes('edit') || cmdStr.includes('create') || cmdStr.includes('write') || cmdStr.includes('vim') || cmdStr.includes('nano')) {
            const fileMatch = cmdStr.match(/["']([^"']+)["']/);
            if (fileMatch) {
              const filename = fileMatch[1];
              if (!fileMap.has(filename)) {
                fileMap.set(filename, {
                  filename,
                  additions: 0,
                  deletions: 0,
                  diffContent: '',
                  messageIndex: index
                });
              }
            }
          }
        }
      }
      
      // Check for tool_use messages (file edits, writes, etc)
      if (message.type === "tool_use") {
        const toolData = message.data as any;
        if (toolData?.name === "str_replace_editor" || toolData?.name === "file_editor" || toolData?.name === "write_file") {
          const filename = toolData?.input?.path || toolData?.input?.file_path;
          if (filename) {
            if (!fileMap.has(filename)) {
              fileMap.set(filename, {
                filename,
                additions: 0,
                deletions: 0,
                diffContent: '',
                messageIndex: index
              });
            }
          }
        }
      }

      // Check for diff outputs
      if (message.type === "local_shell_call_output") {
        const outputData = message.data as { output?: string };
        const outputString = outputData?.output || "";
        
        let finalOutput = "";
        if (outputString && !outputString.trim().startsWith('{')) {
          finalOutput = outputString;
        } else {
          try {
            const parsed = JSON.parse(outputString || "{}");
            finalOutput = parsed.output || outputString || "";
          } catch {
            finalOutput = outputString || "";
          }
        }
        
        if (isDiffContent(finalOutput)) {
          // Parse diff to extract file information
          const lines = finalOutput.split('\n');
          let currentFile = "";
          let additions = 0;
          let deletions = 0;
          
          lines.forEach(line => {
            if (line.startsWith('diff --git')) {
              // Save previous file if exists
              if (currentFile) {
                fileMap.set(currentFile, {
                  filename: currentFile,
                  additions,
                  deletions,
                  diffContent: finalOutput,
                  messageIndex: index
                });
              }
              // Extract filename from diff --git a/filename b/filename
              const match = line.match(/diff --git a\/(.*?) b\//);
              currentFile = match ? match[1] : "";
              additions = 0;
              deletions = 0;
            } else if (line.startsWith('+') && !line.startsWith('+++')) {
              additions++;
            } else if (line.startsWith('-') && !line.startsWith('---')) {
              deletions++;
            }
          });
          
          // Add the last file
          if (currentFile) {
            fileMap.set(currentFile, {
              filename: currentFile,
              additions,
              deletions,
              diffContent: finalOutput,
              messageIndex: index
            });
          }
        }
      }
    });

    return Array.from(fileMap.values());
  };

  const { latestData } = useInngestSubscription({
    refreshToken: fetchRealtimeSubscriptionToken,
    bufferInterval: 0,
    enabled: subscriptionEnabled,
  });

  useEffect(() => {
    if (latestData?.channel === "tasks" && latestData.topic === "update") {
      const { taskId, message } = latestData.data;

      if (taskId === id && message && isValidIncomingMessage(message)) {
        // Handle streaming messages
        if (isStreamingMessage(message)) {
          const streamId = message.data.streamId;

          setStreamingMessages((prev) => {
            const newMap = new Map(prev);
            const existingMessage = newMap.get(streamId);

            if (existingMessage) {
              // Append to existing streaming message
              newMap.set(streamId, {
                ...existingMessage,
                data: {
                  ...existingMessage.data,
                  text:
                    (existingMessage.data.text || "") +
                    (message.data.text || ""),
                  chunkIndex: message.data.chunkIndex,
                  totalChunks: message.data.totalChunks,
                },
              });
            } else {
              // New streaming message
              newMap.set(streamId, message as StreamingMessage);
            }

            return newMap;
          });
        } else if (isCompletedStreamMessage(message)) {
          // Stream ended, move to regular messages
          const streamId = message.data.streamId;
          const streamingMessage = streamingMessages.get(streamId);

          if (streamingMessage) {
            updateTask(id, {
              messages: [
                ...(task?.messages || []),
                {
                  ...streamingMessage,
                  data: {
                    ...streamingMessage.data,
                    text: message.data.text || streamingMessage.data.text,
                    isStreaming: false,
                  },
                },
              ],
            });

            setStreamingMessages((prev) => {
              const newMap = new Map(prev);
              newMap.delete(streamId);
              return newMap;
            });
          }
        } else {
          // Regular non-streaming message
          updateTask(id, {
            messages: [...(task?.messages || []), message],
          });
        }
      }
    }
  }, [latestData, id, task?.messages, streamingMessages, updateTask]);

  // Auto-scroll to bottom when messages change or streaming messages update
  useEffect(() => {
    // Scroll chat messages (left side)
    if (chatScrollAreaRef.current) {
      const viewport = chatScrollAreaRef.current.querySelector(
        "[data-radix-scroll-area-viewport]"
      );
      if (viewport) {
        viewport.scrollTo({
          top: viewport.scrollHeight,
          behavior: "smooth",
        });
      }
    }
    
    // Scroll command outputs (right side)
    if (scrollAreaRef.current) {
      const viewport = scrollAreaRef.current.querySelector(
        "[data-radix-scroll-area-viewport]"
      );
      if (viewport) {
        viewport.scrollTo({
          top: viewport.scrollHeight,
          behavior: "smooth",
        });
      }
    }
  }, [task?.messages, streamingMessages]);

  useEffect(() => {
    if (task) {
      updateTask(task.id, {
        hasChanges: false,
      });
    }
  }, []);

  // Initial scroll to bottom when task is first loaded
  useEffect(() => {
    if (!task || !task.id) return;
    
    // Use a longer delay to ensure all content is fully rendered
    const scrollTimer = setTimeout(() => {
      // Scroll chat messages (left side)
      if (chatScrollAreaRef.current) {
        const viewport = chatScrollAreaRef.current.querySelector(
          "[data-radix-scroll-area-viewport]"
        );
        if (viewport) {
          // Use scrollHeight from the content container inside viewport
          const content = viewport.querySelector('[data-radix-scroll-area-content]');
          const scrollHeight = content?.scrollHeight || viewport.scrollHeight;
          viewport.scrollTo({
            top: scrollHeight,
            behavior: "smooth",
          });
        }
      }
      
      // Scroll command outputs (right side)
      if (scrollAreaRef.current) {
        const viewport = scrollAreaRef.current.querySelector(
          "[data-radix-scroll-area-viewport]"
        );
        if (viewport) {
          // Use scrollHeight from the content container inside viewport
          const content = viewport.querySelector('[data-radix-scroll-area-content]');
          const scrollHeight = content?.scrollHeight || viewport.scrollHeight;
          viewport.scrollTo({
            top: scrollHeight,
            behavior: "smooth",
          });
        }
      }
    }, 800); // Increased delay to ensure content is loaded
    
    return () => clearTimeout(scrollTimer);
  }, [task?.id]); // Only run when task ID changes

  // Cleanup subscription on unmount to prevent stream cancellation errors
  useEffect(() => {
    return () => {
      setSubscriptionEnabled(false);
    };
  }, []);

  // Handle resize
  useEffect(() => {
    const resize = resizeRef.current;
    const container = containerRef.current;
    if (!resize || !container) return;

    const handleMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      isResizingRef.current = true;
      startXRef.current = e.clientX;
      startWidthRef.current = (chatWidth / 100) * container.offsetWidth;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      
      // Add overlay to prevent iframe interference
      const overlay = document.createElement('div');
      overlay.id = 'resize-overlay';
      overlay.style.position = 'fixed';
      overlay.style.top = '0';
      overlay.style.left = '0';
      overlay.style.right = '0';
      overlay.style.bottom = '0';
      overlay.style.zIndex = '9999';
      overlay.style.cursor = 'col-resize';
      document.body.appendChild(overlay);
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return;
      e.preventDefault();
      const container = containerRef.current;
      if (!container) return;
      
      const diff = e.clientX - startXRef.current;
      const newWidth = startWidthRef.current + diff;
      const percentage = (newWidth / container.offsetWidth) * 100;
      setChatWidth(Math.min(Math.max(percentage, 20), 80)); // Limit between 20% and 80%
    };

    const handleMouseUp = () => {
      if (!isResizingRef.current) return;
      isResizingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      
      // Remove overlay
      const overlay = document.getElementById('resize-overlay');
      if (overlay) {
        overlay.remove();
      }
    };

    resize.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      resize.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [chatWidth]);

  return (
    <div className="flex flex-col h-screen">
      <TaskNavbar id={id} />
      <div ref={containerRef} className="flex flex-1 overflow-hidden relative">
        {/* Sidebar for chat messages */}
        <div 
          className="border-r border-border bg-gradient-to-b from-background to-muted/5 flex flex-col h-full min-w-[300px] relative"
          style={{ width: `${chatWidth}%` }}
        >
          <ScrollArea
            ref={chatScrollAreaRef}
            className="flex-1 scroll-area-custom overflow-hidden"
          >
            <div className="p-3 sm:p-4 md:p-6 flex flex-col gap-y-4 sm:gap-y-6">
              {isMounted && (
                <>
                  {/* Initial task message */}
                  <div className="flex justify-end animate-in slide-in-from-right duration-300">
                    <div className="flex gap-2 sm:gap-3 items-end max-w-[85%]">
                      <div className="bg-primary text-primary-foreground rounded-2xl px-3 py-2 sm:px-5 sm:py-3 shadow-sm">
                        <p className="text-sm leading-relaxed">{task?.title?.trim() || ""}</p>
                        {task?.createdAt && (
                          <div className="mt-2 text-xs text-primary-foreground/70">
                            {formatDistanceToNow(new Date(task.createdAt), { addSuffix: true })}
                          </div>
                        )}
                      </div>
                      <div className="flex-shrink-0">
                        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <User className="w-3 h-3 sm:w-4 sm:h-4 text-primary" />
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Render regular messages */}
                  {isMounted && task?.messages
                    .filter(
                      (message) =>
                        (message.role === "assistant" || message.role === "user") &&
                        message.type === "message"
                    )
                    .map((message, index) => {
                  const isAssistant = message.role === "assistant";
                  const timestamp = getMessageTimestamp(message, index, task);
                  return (
                    <div
                      key={
                        (message.data as { id?: string })?.id ||
                        `message-${index}-${message.role}` ||
                        index
                      }
                      className={cn(
                        "flex animate-in duration-300",
                        isAssistant
                          ? "justify-start slide-in-from-left"
                          : "justify-end slide-in-from-right"
                      )}
                    >
                      {isAssistant ? (
                        // Assistant message with avatar on left
                        <div className="flex gap-2 sm:gap-3 items-start max-w-[85%]">
                          <div className="flex-shrink-0">
                            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-muted flex items-center justify-center border border-border">
                              <Bot className="w-3 h-3 sm:w-4 sm:h-4 text-muted-foreground" />
                            </div>
                          </div>
                          <div className="bg-card border border-border rounded-2xl px-3 py-2 sm:px-5 sm:py-3 shadow-sm min-w-0">
                            <div className="prose prose-sm dark:prose-invert max-w-none">
                              <Markdown
                                repoUrl={
                                  task?.repository
                                    ? `https://github.com/${task.repository}`
                                    : undefined
                                }
                                branch={task?.branch}
                              >
                                {message.data?.text as string}
                              </Markdown>
                            </div>
                            {timestamp && (
                              <div className="mt-2 text-xs text-muted-foreground">
                                {timestamp}
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        // User message with avatar on right
                        <div className="flex gap-2 sm:gap-3 items-end max-w-[85%]">
                          <div className="bg-primary text-primary-foreground rounded-2xl px-3 py-2 sm:px-5 sm:py-3 shadow-sm min-w-0">
                            <p className="text-sm leading-relaxed">
                              {message.data?.text as string}
                            </p>
                            {timestamp && (
                              <div className="mt-2 text-xs text-primary-foreground/70">
                                {timestamp}
                              </div>
                            )}
                          </div>
                          <div className="flex-shrink-0">
                            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-primary/10 flex items-center justify-center">
                              <User className="w-3 h-3 sm:w-4 sm:h-4 text-primary" />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                );
              })}

              {/* Render streaming messages */}
              {Array.from(streamingMessages.values()).map((message) => {
                const isAssistant = message.role === "assistant";
                const timestamp = message.data?.timestamp 
                  ? formatDistanceToNow(new Date(message.data.timestamp as string), { addSuffix: true })
                  : "just now";
                return (
                  <div
                    key={message.data.streamId as string}
                    className={cn(
                      "flex animate-in duration-300",
                      isAssistant
                        ? "justify-start slide-in-from-left"
                        : "justify-end slide-in-from-right"
                    )}
                  >
                    {isAssistant ? (
                      // Streaming assistant message
                      <div className="flex gap-2 sm:gap-3 items-start max-w-[85%]">
                        <div className="flex-shrink-0">
                          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-muted flex items-center justify-center border border-border relative overflow-hidden">
                            <Bot className="w-3 h-3 sm:w-4 sm:h-4 text-muted-foreground z-10 relative" />
                            <div
                              className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/20 to-transparent"
                              style={{
                                animation: "shimmer 2s linear infinite",
                                backgroundSize: "200% 100%",
                              }}
                            />
                          </div>
                        </div>
                        <div className="bg-card border border-border rounded-2xl px-3 py-2 sm:px-5 sm:py-3 shadow-sm min-w-0">
                          <div className="prose prose-sm dark:prose-invert max-w-none overflow-hidden">
                            <Markdown
                              repoUrl={
                                task?.repository
                                  ? `https://github.com/${task.repository}`
                                  : undefined
                              }
                              branch={task?.branch}
                            >
                              {message.data?.text as string}
                            </Markdown>
                            {/* Enhanced streaming indicator */}
                            <span className="inline-flex items-center gap-2 ml-1">
                              <StreamingIndicator size="sm" variant="cursor" />
                              {typeof message.data.chunkIndex === "number" &&
                                typeof message.data.totalChunks === "number" && (
                                  <span className="text-[10px] text-muted-foreground/60 font-mono">
                                    {Math.round(
                                      ((message.data.chunkIndex + 1) /
                                        message.data.totalChunks) *
                                        100
                                    )}
                                    %
                                  </span>
                                )}
                            </span>
                          </div>
                          <div className="mt-2 text-xs text-muted-foreground">
                            {timestamp}
                          </div>
                        </div>
                      </div>
                    ) : (
                      // Streaming user message
                      <div className="flex gap-2 sm:gap-3 items-end max-w-[85%]">
                        <div className="bg-primary text-primary-foreground rounded-2xl px-3 py-2 sm:px-5 sm:py-3 shadow-sm min-w-0">
                          <p className="text-sm leading-relaxed">
                            {message.data?.text as string}
                          </p>
                          <div className="mt-2 text-xs text-primary-foreground/70">
                            {timestamp}
                          </div>
                        </div>
                        <div className="flex-shrink-0">
                          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-primary/10 flex items-center justify-center">
                            <User className="w-3 h-3 sm:w-4 sm:h-4 text-primary" />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {task?.status === "IN_PROGRESS" &&
                streamingMessages.size === 0 && (
                  <div className="flex justify-start animate-in slide-in-from-left duration-300">
                    <div className="flex gap-2 sm:gap-3">
                      <div className="flex-shrink-0">
                        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-muted flex items-center justify-center border border-border animate-pulse">
                          <Bot className="w-3 h-3 sm:w-4 sm:h-4 text-muted-foreground" />
                        </div>
                      </div>
                      <div className="bg-card border border-border rounded-2xl px-3 py-2 sm:px-5 sm:py-3 shadow-sm">
                        <div className="flex items-center gap-2">
                          <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 text-muted-foreground animate-spin" />
                          <TextShimmer className="text-xs sm:text-sm">
                            {task?.statusMessage
                              ? `${task.statusMessage}`
                              : "Working on task..."}
                          </TextShimmer>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

              {/* Combined Summary Card at the end */}
              {task?.status === "DONE" && (
                <div className="flex justify-start animate-in slide-in-from-left duration-300">
                  <div className="flex gap-2 sm:gap-3 max-w-[90%] sm:max-w-[85%]">
                    <div className="flex-shrink-0">
                      <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-muted flex items-center justify-center border border-border">
                        <Bot className="w-3 h-3 sm:w-4 sm:h-4 text-muted-foreground" />
                      </div>
                    </div>
                    <Card className="flex-1 border-primary/20">
                      <CardHeader className="pb-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <CardTitle className="text-base font-semibold">Task Completed</CardTitle>
                            {task?.createdAt && task?.updatedAt && (
                              <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                                <Clock className="w-4 h-4" />
                                <span>
                                  Worked for {formatDuration(
                                    new Date(task.updatedAt).getTime() - new Date(task.createdAt).getTime()
                                  )}
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <Button 
                              size="icon" 
                              variant={feedback === 'up' ? "default" : "ghost"} 
                              className="h-8 w-8"
                              onClick={() => handleFeedback('up')}
                            >
                              <ThumbsUp className={cn("w-4 h-4", feedback === 'up' && "fill-current")} />
                            </Button>
                            <Button 
                              size="icon" 
                              variant={feedback === 'down' ? "default" : "ghost"} 
                              className="h-8 w-8"
                              onClick={() => handleFeedback('down')}
                            >
                              <ThumbsDown className={cn("w-4 h-4", feedback === 'down' && "fill-current")} />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4 pt-0">
                        {/* Summary Section - Extract from last assistant message */}
                        {(() => {
                          const lastAssistantMessage = [...(task?.messages || [])]
                            .reverse()
                            .find(m => m.role === "assistant" && m.type === "message");
                          
                          if (lastAssistantMessage?.data?.text) {
                            const text = lastAssistantMessage.data.text as string;
                            // Extract bullet points or key actions from the message
                            const lines = text.split('\n').filter(line => line.trim());
                            const summaryLines = lines
                              .filter(line => 
                                line.trim().startsWith('-') || 
                                line.trim().startsWith('•') ||
                                line.trim().startsWith('*') ||
                                line.match(/^\d+\./)
                              )
                              .slice(0, 5); // Limit to 5 items
                            
                            if (summaryLines.length > 0) {
                              return (
                                <div>
                                  <h4 className="font-medium mb-2 text-sm">Summary</h4>
                                  <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                                    {summaryLines.map((line, idx) => (
                                      <li key={idx}>
                                        {line.replace(/^[-•*]\s*/, '').replace(/^\d+\.\s*/, '')}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              );
                            }
                          }
                          
                          return null;
                        })()}

                        {/* Files Section */}
                        {getFileChanges().length > 0 && (
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="font-medium text-sm">Files ({getFileChanges().length})</h4>
                              <ChevronRight className="w-4 h-4 text-muted-foreground" />
                            </div>
                            <div className="space-y-2">
                              {getFileChanges().map((file, index) => (
                                <button
                                  key={index}
                                  onClick={() => setSelectedFileIndex(index)}
                                  className={cn(
                                    "w-full text-left p-2 rounded-md hover:bg-muted/50 transition-colors",
                                    selectedFileIndex === index && "bg-muted"
                                  )}
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <FileText className="w-4 h-4 text-muted-foreground" />
                                      <span className="text-sm font-mono truncate">{file.filename}</span>
                                    </div>
                                    <div className="flex items-center gap-3 text-xs">
                                      <span className="flex items-center gap-1 text-green-600">
                                        <Plus className="w-3 h-3" />
                                        {file.additions}
                                      </span>
                                      <span className="flex items-center gap-1 text-red-600">
                                        <Minus className="w-3 h-3" />
                                        {file.deletions}
                                      </span>
                                    </div>
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </div>
              )}
               </>
             )}
           </div>
         </ScrollArea>

         {/* Message input component - fixed at bottom */}
          <div className="flex-shrink-0">
            <MessageInput task={task!} />
          </div>
       </div>

       {/* Resize handle */}
       <div
          ref={resizeRef}
          className="w-1 hover:w-3 bg-border hover:bg-primary/30 cursor-col-resize transition-all duration-200 relative group flex-shrink-0"
        >
          <div className="absolute inset-y-0 -left-4 -right-4 group-hover:bg-primary/5" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-12 bg-muted-foreground/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>

        {/* Right panel for details */}
        <div className="flex-1 bg-gradient-to-br from-muted/50 to-background relative">
          {/* Fade overlay at the top */}
          <div className="absolute top-0 left-0 right-0 h-20 bg-gradient-to-b from-muted/50 to-transparent pointer-events-none z-10" />
          <ScrollArea ref={scrollAreaRef} className="h-full scroll-area-custom">
            <div className="max-w-4xl mx-auto w-full py-10 px-6">
              {/* Show selected diff or all command outputs */}
              {selectedFileIndex !== null ? (
                // Show specific diff
                <div className="animate-in slide-in-from-right duration-300">
                  <div className="mb-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedFileIndex(null)}
                      className="mb-2"
                    >
                      ← Back to all outputs
                    </Button>
                    <h3 className="text-lg font-semibold mb-2">
                      {getFileChanges()[selectedFileIndex]?.filename}
                    </h3>
                  </div>
                  <DiffViewerV2 
                    diffContent={getFileChanges()[selectedFileIndex]?.diffContent || ''}
                    viewType="unified"
                    className="w-full"
                  />
                </div>
              ) : (
                // Show all command outputs
                <div className="flex flex-col gap-y-10">
                {task?.messages.map((message, index) => {
                  if (message.type === "local_shell_call") {
                    const output = getOutputForCall(
                      message.data?.call_id as string
                    );
                    const isLatest = index === task.messages.length - 1 || 
                      (index === task.messages.length - 2 && task.messages[task.messages.length - 1].type === "local_shell_call_output");
                    return (
                      <div
                        key={message.data?.call_id as string}
                        className="flex flex-col"
                      >
                        <div className="flex items-start justify-between gap-x-2">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <p className="font-medium font-mono text-sm -mt-1 truncate max-w-md cursor-help">
                                  {(() => {
                                    const command = (
                                      message.data as {
                                        action?: { command?: string[] };
                                      }
                                    )?.action?.command;
                                    const cmdStr = command?.slice(1).join(" ") || "";
                                    
                                    // Check if this is a file operation
                                    const isFileOp = cmdStr.includes('edit') || 
                                                    cmdStr.includes('create') || 
                                                    cmdStr.includes('write') ||
                                                    cmdStr.includes('cat') ||
                                                    cmdStr.includes('diff');
                                    
                                    // Extract filename if present
                                    const fileMatch = cmdStr.match(/["']([^"']+)["']/);
                                    const filename = fileMatch?.[1];
                                    
                                    if (isFileOp && filename && output && isDiffContent((output.data as { output?: string })?.output || "")) {
                                      return (
                                        <button
                                          onClick={() => {
                                            // Find this file in the file changes and select it
                                            const fileIndex = getFileChanges().findIndex(f => f.filename === filename);
                                            if (fileIndex !== -1) {
                                              setSelectedFileIndex(fileIndex);
                                            }
                                          }}
                                          className="text-left hover:text-primary transition-colors"
                                        >
                                          {cmdStr}
                                        </button>
                                      );
                                    }
                                    
                                    return cmdStr;
                                  })()}
                                </p>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="max-w-sm break-words">
                                  {(
                                    message.data as {
                                      action?: { command?: string[] };
                                    }
                                  )?.action?.command
                                    ?.slice(1)
                                    .join(" ")}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          {/* Command timestamp - show actual date/time */}
                          <span className="text-xs text-muted-foreground/60 font-mono">
                            {getLogTimestamp(message)}
                          </span>
                        </div>
                        {output && (
                          <div className="mt-3 animate-in slide-in-from-bottom duration-300">
                            <div className={cn(
                              "rounded-xl bg-background dark:bg-zinc-900 border-2 shadow-sm overflow-hidden transition-all duration-200 hover:shadow-md",
                              isLatest ? "animate-pulse-border" : "border-border"
                            )}>
                              <div className="flex items-center justify-between bg-muted border-b px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <Terminal className="size-4 text-muted-foreground" />
                                  <span className="font-medium text-sm text-muted-foreground">
                                    Output
                                  </span>
                                </div>
                              </div>
                              <div>
                                {(() => {
                                  const outputData = output.data as { output?: string };
                                  const outputString = outputData?.output || "";
                                  
                                  let finalOutput = "";
                                  
                                  // First, check if it's already a plain string (not JSON)
                                  if (outputString && !outputString.trim().startsWith('{')) {
                                    finalOutput = outputString;
                                  } else {
                                    // Try to parse as JSON
                                    try {
                                      const parsed = JSON.parse(outputString || "{}");
                                      finalOutput = parsed.output || outputString || "No output";
                                    } catch {
                                      // If JSON parsing fails, return the raw output
                                      finalOutput = outputString || "Failed to parse output";
                                    }
                                  }
                                  
                                  // Component for collapsible output
                                  const CollapsibleOutput = ({ content, isDiff = false }: { content: string; isDiff?: boolean }) => {
                                    const [isExpanded, setIsExpanded] = useState(false);
                                    const lines = content.split('\n');
                                    const lineCount = lines.length;
                                    const charCount = content.length;
                                    const shouldCollapse = lineCount > 10 || charCount > 1000;
                                    
                                    if (isDiff) {
                                      return (
                                        <div className="relative">
                                          <div className={`${shouldCollapse && !isExpanded ? 'max-h-[400px] overflow-hidden' : ''}`}>
                                            <div className="p-4 w-full overflow-hidden">
                                              <DiffViewerV2 
                                                diffContent={content}
                                                viewType="unified"
                                                className="w-full"
                                              />
                                            </div>
                                          </div>
                                          {shouldCollapse && !isExpanded && (
                                            <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-background to-transparent pointer-events-none" />
                                          )}
                                          {shouldCollapse && (
                                            <div className="px-4 pb-2">
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setIsExpanded(!isExpanded)}
                                                className="text-xs text-muted-foreground hover:text-foreground"
                                              >
                                                {isExpanded ? (
                                                  <>
                                                    <ChevronUp className="h-3 w-3 mr-1" />
                                                    Show less
                                                  </>
                                                ) : (
                                                  <>
                                                    <ChevronDown className="h-3 w-3 mr-1" />
                                                    Show more ({lineCount} lines)
                                                  </>
                                                )}
                                              </Button>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    }
                                    
                                    // Try to detect the language from the content
                                    const detectLanguage = (text: string): string => {
                                      // Check for common patterns
                                      if (text.includes('import ') || text.includes('export ') || text.includes('const ') || text.includes('function ')) {
                                        return 'javascript';
                                      }
                                      if (text.includes('def ') || text.includes('import ') || text.includes('class ') || text.includes('if __name__')) {
                                        return 'python';
                                      }
                                      if (text.includes('<!DOCTYPE') || text.includes('<html') || text.includes('<div')) {
                                        return 'html';
                                      }
                                      if (text.includes('{') && text.includes('}') && text.includes(':')) {
                                        return 'json';
                                      }
                                      if (text.includes('```')) {
                                        // Extract language from markdown code block
                                        const match = text.match(/```(\w+)/);
                                        if (match) return match[1];
                                      }
                                      return 'text';
                                    };
                                    
                                    const language = detectLanguage(content);
                                    const shouldUseSyntaxHighlighting = language !== 'text';
                                    
                                    return (
                                      <div className="relative">
                                        <div className={`${shouldCollapse && !isExpanded ? 'max-h-[400px] overflow-hidden' : ''}`}>
                                          {shouldUseSyntaxHighlighting ? (
                                            <div className="bg-zinc-900 dark:bg-zinc-950 rounded-md overflow-hidden">
                                              <SyntaxHighlighter
                                                language={language}
                                                style={customDarkTheme}
                                                customStyle={{
                                                  margin: 0,
                                                  padding: '16px',
                                                  fontSize: '12px',
                                                  background: 'transparent',
                                                  maxWidth: '100%',
                                                  overflow: 'auto'
                                                }}
                                                wrapLongLines={true}
                                              >
                                                {content}
                                              </SyntaxHighlighter>
                                            </div>
                                          ) : (
                                            <pre className="whitespace-pre-wrap break-all font-mono text-xs leading-relaxed p-4 text-muted-foreground max-w-full overflow-x-auto">
                                              {content}
                                            </pre>
                                          )}
                                        </div>
                                        {shouldCollapse && !isExpanded && (
                                          <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-background to-transparent pointer-events-none" />
                                        )}
                                        {shouldCollapse && (
                                          <div className="px-4 pb-2">
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              onClick={() => setIsExpanded(!isExpanded)}
                                              className="text-xs text-muted-foreground hover:text-foreground"
                                            >
                                              {isExpanded ? (
                                                <>
                                                  <ChevronUp className="h-3 w-3 mr-1" />
                                                  Show less
                                                </>
                                              ) : (
                                                <>
                                                  <ChevronDown className="h-3 w-3 mr-1" />
                                                  Show more ({lineCount} lines)
                                                </>
                                              )}
                                            </Button>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  };
                                  
                                  // Check if the output is a diff
                                  if (isDiffContent(finalOutput)) {
                                    return <CollapsibleOutput content={finalOutput} isDiff={true} />;
                                  }
                                  
                                  // Regular output
                                  return <CollapsibleOutput content={finalOutput} />;
                                })()}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  }
                  return null;
                })}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
