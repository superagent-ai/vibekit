"use client";

import { useState } from "react";
import { useTaskStore, Task } from "@/stores/tasks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow } from "date-fns";
import { Trash2, Container, CheckCircle, XCircle, Clock, ChevronDown, ChevronRight } from "lucide-react";

interface AssistantResult {
  sandboxId?: string;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
}

function TaskCard({ task }: { task: Task }) {
  const { removeTask } = useTaskStore();
  const [isExpanded, setIsExpanded] = useState(false);

  const getStatusIcon = () => {
    switch (task.status) {
      case "DONE":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "FAILED":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "IN_PROGRESS":
        return <Clock className="h-4 w-4 text-blue-500 animate-spin" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusColor = () => {
    switch (task.status) {
      case "DONE":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "FAILED":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
      case "IN_PROGRESS":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
    }
  };

  return (
    <div className="border rounded-lg p-4 bg-card space-y-3">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            {task.messages.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsExpanded(!isExpanded)}
                className="h-6 w-6 p-0"
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </Button>
            )}
            {getStatusIcon()}
            <h3 className="font-medium truncate">{task.title}</h3>
          </div>
          <p className="text-sm text-muted-foreground line-clamp-2">
            {task.description}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => removeTask(task.id)}
          className="ml-2 h-8 w-8 p-0"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Badge className={getStatusColor()}>
          {task.status.toLowerCase()}
        </Badge>
        
        {task.dockerImage && (
          <Badge variant="outline" className="text-xs">
            <Container className="h-3 w-3 mr-1" />
            {task.dockerImage}
          </Badge>
        )}
        
        <span className="text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(task.createdAt), { addSuffix: true })}
        </span>
      </div>

      {task.statusMessage && (
        <p className="text-xs text-muted-foreground bg-muted p-2 rounded">
          {task.statusMessage}
        </p>
      )}

      {task.messages.length > 0 && isExpanded && (
        <div className="border-t pt-3">
          <h4 className="text-sm font-medium mb-2">Messages:</h4>
          <div className="max-h-96 overflow-y-auto">
            <div className="space-y-3">
              {task.messages.map((message, index) => (
                <div
                  key={index}
                  className={`text-sm p-3 rounded ${
                    message.role === "user"
                      ? "bg-blue-50 dark:bg-blue-950 text-blue-900 dark:text-blue-100"
                      : "bg-green-50 dark:bg-green-950 text-green-900 dark:text-green-100"
                  }`}
                >
                  <div className="font-medium capitalize mb-2">
                    {message.role}:
                  </div>
                  {message.role === "assistant" && message.type === "result" && message.data ? (
                    <div className="space-y-3">
                      {/* Sandbox ID and Exit Code */}
                      <div className="flex gap-4">
                        {(message.data as AssistantResult).sandboxId && (
                          <div className="bg-gray-100 dark:bg-gray-700 p-2 rounded">
                            <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">Sandbox ID:</span>
                            <div className="font-mono text-xs">{(message.data as AssistantResult).sandboxId}</div>
                          </div>
                        )}
                        {typeof (message.data as AssistantResult).exitCode !== 'undefined' && (
                          <div className={`p-2 rounded ${
                            (message.data as AssistantResult).exitCode === 0 
                              ? 'bg-green-100 dark:bg-green-900' 
                              : 'bg-red-100 dark:bg-red-900'
                          }`}>
                            <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">Exit Code:</span>
                            <div className={`font-mono text-xs font-bold ${
                              (message.data as AssistantResult).exitCode === 0 
                                ? 'text-green-700 dark:text-green-300' 
                                : 'text-red-700 dark:text-red-300'
                            }`}>
                              {(message.data as AssistantResult).exitCode}
                            </div>
                          </div>
                        )}
                      </div>
                      
                      {/* Stdout */}
                      {(message.data as AssistantResult).stdout && (
                        <div>
                          <div className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">STDOUT:</div>
                          <div className="whitespace-pre-wrap font-mono text-xs bg-white dark:bg-gray-800 p-3 rounded border overflow-auto">
                            {(() => {
                              try {
                                const stdout = (message.data as AssistantResult).stdout || '';
                                const unescaped = JSON.parse(`"${stdout.replace(/"/g, '\\"')}"`);
                                return typeof unescaped === 'string' ? unescaped : JSON.stringify(JSON.parse(unescaped), null, 2);
                              } catch {
                                return (message.data as AssistantResult).stdout;
                              }
                            })()}
                          </div>
                        </div>
                      )}
                      
                      {/* Stderr */}
                      {(message.data as AssistantResult).stderr && (
                        <div>
                          <div className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">STDERR:</div>
                          <div className="whitespace-pre-wrap font-mono text-xs bg-red-50 dark:bg-red-950 p-3 rounded border overflow-auto">
                            {(() => {
                              try {
                                const stderr = (message.data as AssistantResult).stderr || '';
                                const unescaped = JSON.parse(`"${stderr.replace(/"/g, '\\"')}"`);
                                return typeof unescaped === 'string' ? unescaped : JSON.stringify(JSON.parse(unescaped), null, 2);
                              } catch {
                                return (message.data as AssistantResult).stderr;
                              }
                            })()}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap font-mono text-xs bg-white dark:bg-gray-800 p-3 rounded border overflow-auto">
                      {message.type === "result" && message.data
                        ? JSON.stringify(message.data, null, 2)
                        : String((message.data as Record<string, unknown>)?.text || "No content")}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TaskList() {
  const { getActiveTasks, clear } = useTaskStore();
  const tasks = getActiveTasks();

  if (tasks.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-center">
        <div className="max-w-md">
          <Container className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No tasks yet</h3>
          <p className="text-muted-foreground">
            Create your first task above to see Claude work with Docker containers.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">
          Tasks ({tasks.length})
        </h2>
        {tasks.length > 0 && (
          <Button variant="outline" size="sm" onClick={clear}>
            Clear All
          </Button>
        )}
      </div>
      
      <ScrollArea className="flex-1">
        <div className="space-y-4">
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}