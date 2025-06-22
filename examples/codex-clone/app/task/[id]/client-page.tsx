"use client";
import { useInngestSubscription } from "@inngest/realtime/hooks";
import { useEffect, useRef, useState } from "react";

import TaskNavbar from "./_components/navbar";
import MessageInput from "./_components/message-input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { fetchRealtimeSubscriptionToken } from "@/app/actions/inngest";
import { useTaskStore } from "@/stores/tasks";
import { Terminal, Bot, User, Loader2 } from "lucide-react";
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

  // Function to get the output message for a given shell call message
  const getOutputForCall = (callId: string) => {
    return task?.messages.find(
      (message) =>
        message.type === "local_shell_call_output" &&
        message.data?.call_id === callId
    );
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
  }, [task?.messages, streamingMessages]);

  useEffect(() => {
    if (task) {
      updateTask(task.id, {
        hasChanges: false,
      });
    }
  }, []);

  // Cleanup subscription on unmount to prevent stream cancellation errors
  useEffect(() => {
    return () => {
      setSubscriptionEnabled(false);
    };
  }, []);

  return (
    <div className="flex flex-col h-screen">
      <TaskNavbar id={id} />
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar for chat messages */}
        <div className="w-full max-w-3xl mx-auto border-r border-border bg-gradient-to-b from-background to-muted/5 flex flex-col h-full">
          <ScrollArea
            ref={chatScrollAreaRef}
            className="flex-1 overflow-y-auto scroll-area-custom"
          >
            <div className="p-6 flex flex-col gap-y-6">
              {/* Initial task message */}
              <div className="flex justify-end animate-in slide-in-from-right duration-300">
                <div className="max-w-[85%] flex gap-3">
                  <div className="bg-primary text-primary-foreground rounded-2xl px-5 py-3 shadow-sm">
                    <p className="text-sm leading-relaxed">{task?.title}</p>
                  </div>
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="w-4 h-4 text-primary" />
                    </div>
                  </div>
                </div>
              </div>
              {/* Render regular messages */}
              {task?.messages
                .filter(
                  (message) =>
                    (message.role === "assistant" || message.role === "user") &&
                    message.type === "message"
                )
                .map((message, index) => {
                  const isAssistant = message.role === "assistant";
                  return (
                    <div
                      key={
                        (message.data as { id?: string })?.id ||
                        `message-${index}-${message.role}` ||
                        index
                      }
                      className={cn(
                        "flex gap-3 animate-in duration-300",
                        isAssistant
                          ? "justify-start slide-in-from-left"
                          : "justify-end slide-in-from-right"
                      )}
                    >
                      {isAssistant && (
                        <div className="flex-shrink-0">
                          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center border border-border">
                            <Bot className="w-4 h-4 text-muted-foreground" />
                          </div>
                        </div>
                      )}
                      <div
                        className={cn(
                          "max-w-[85%] rounded-2xl px-5 py-3 shadow-sm",
                          isAssistant
                            ? "bg-card border border-border"
                            : "bg-primary text-primary-foreground"
                        )}
                      >
                        {isAssistant ? (
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
                          </div>
                        ) : (
                          <p className="text-sm leading-relaxed break-words">
                            {message.data?.text as string}
                          </p>
                        )}
                      </div>
                      {!isAssistant && (
                        <div className="flex-shrink-0">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                            <User className="w-4 h-4 text-primary" />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

              {/* Render streaming messages */}
              {Array.from(streamingMessages.values()).map((message) => {
                const isAssistant = message.role === "assistant";
                return (
                  <div
                    key={message.data.streamId as string}
                    className={cn(
                      "flex gap-3 animate-in duration-300",
                      isAssistant
                        ? "justify-start slide-in-from-left"
                        : "justify-end slide-in-from-right"
                    )}
                  >
                    {isAssistant && (
                      <div className="flex-shrink-0">
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center border border-border relative overflow-hidden">
                          <Bot className="w-4 h-4 text-muted-foreground z-10 relative" />
                          <div
                            className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/20 to-transparent"
                            style={{
                              animation: "shimmer 2s linear infinite",
                              backgroundSize: "200% 100%",
                            }}
                          />
                        </div>
                      </div>
                    )}
                    <div
                      className={cn(
                        "max-w-[85%] rounded-2xl px-5 py-3 shadow-sm",
                        isAssistant
                          ? "bg-card border border-border"
                          : "bg-primary text-primary-foreground"
                      )}
                    >
                      {isAssistant ? (
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
                      ) : (
                        <p className="text-sm leading-relaxed break-words">
                          {message.data?.text as string}
                        </p>
                      )}
                    </div>
                    {!isAssistant && (
                      <div className="flex-shrink-0">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <User className="w-4 h-4 text-primary" />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {task?.status === "IN_PROGRESS" &&
                streamingMessages.size === 0 && (
                  <div className="flex justify-start animate-in slide-in-from-left duration-300">
                    <div className="flex gap-3">
                      <div className="flex-shrink-0">
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center border border-border animate-pulse">
                          <Bot className="w-4 h-4 text-muted-foreground" />
                        </div>
                      </div>
                      <div className="bg-card border border-border rounded-2xl px-5 py-3 shadow-sm">
                        <div className="flex items-center gap-2">
                          <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
                          <TextShimmer className="text-sm">
                            {task?.statusMessage
                              ? `${task.statusMessage}`
                              : "Working on task..."}
                          </TextShimmer>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
            </div>
          </ScrollArea>

          {/* Message input component - fixed at bottom */}
          <div className="flex-shrink-0">
            <MessageInput task={task!} />
          </div>
        </div>

        {/* Right panel for details */}
        <div className="flex-1 bg-gradient-to-br from-muted/50 to-background relative">
          {/* Fade overlay at the top */}
          <div className="absolute top-0 left-0 right-0 h-20 bg-gradient-to-b from-muted/50 to-transparent pointer-events-none z-10" />
          <ScrollArea ref={scrollAreaRef} className="h-full scroll-area-custom">
            <div className="max-w-4xl mx-auto w-full py-10 px-6">
              {/* Details content will go here */}
              <div className="flex flex-col gap-y-10">
                {task?.messages.map((message) => {
                  if (message.type === "local_shell_call") {
                    const output = getOutputForCall(
                      message.data?.call_id as string
                    );
                    return (
                      <div
                        key={message.data?.call_id as string}
                        className="flex flex-col"
                      >
                        <div className="flex items-start gap-x-2">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <p className="font-medium font-mono text-sm -mt-1 truncate max-w-md cursor-help">
                                  {(
                                    message.data as {
                                      action?: { command?: string[] };
                                    }
                                  )?.action?.command
                                    ?.slice(1)
                                    .join(" ")}
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
                        </div>
                        {output && (
                          <div className="mt-3 animate-in slide-in-from-bottom duration-300">
                            <div className="rounded-xl bg-card border-2 border-border shadow-sm overflow-hidden transition-all duration-200 hover:shadow-md">
                              <div className="flex items-center gap-2 bg-muted/50 border-b px-4 py-3">
                                <Terminal className="size-4 text-muted-foreground" />
                                <span className="font-medium text-sm text-muted-foreground">
                                  Output
                                </span>
                              </div>
                              <ScrollArea className="max-h-[400px]">
                                <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed p-4 text-muted-foreground">
                                  {(() => {
                                    try {
                                      const parsed = JSON.parse(
                                        (output.data as { output?: string })
                                          ?.output || "{}"
                                      );
                                      return parsed.output || "No output";
                                    } catch {
                                      return "Failed to parse output";
                                    }
                                  })()}
                                </pre>
                              </ScrollArea>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
