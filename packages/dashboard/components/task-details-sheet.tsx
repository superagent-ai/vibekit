"use client";

import { useState } from "react";
import { 
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { 
  ChevronRight,
  ChevronDown, 
  Clock, 
  CheckCircle, 
  Circle, 
  AlertCircle,
  Hash,
  Link,
  FileText,
  TestTube,
  ListChecks,
  Edit,
  Sparkles,
  Loader2
} from "lucide-react";

interface Subtask {
  id: number;
  title: string;
  description: string;
  dependencies: number[];
  details: string;
  status: "pending" | "done" | "in-progress" | "review" | "deferred" | "cancelled";
  testStrategy: string;
}

interface Task {
  id: number;
  title: string;
  description: string;
  details: string;
  testStrategy: string;
  priority: "high" | "medium" | "low";
  dependencies: number[];
  status: "pending" | "done" | "in-progress" | "review" | "deferred" | "cancelled";
  subtasks: Subtask[];
}

interface TaskDetailsSheetProps {
  task: Task | null;
  allTasks?: Task[];  // Optional: pass all tasks to resolve dependency names
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isManualTask?: boolean;
  onEditClick?: () => void;
  projectId?: string;
  onTaskUpdate?: () => void;
  onSubtaskClick?: (subtask: Subtask) => void;
}

export function TaskDetailsSheet({ task, allTasks, open, onOpenChange, isManualTask, onEditClick, projectId, onTaskUpdate, onSubtaskClick }: TaskDetailsSheetProps) {
  const [expandedSubtasks, setExpandedSubtasks] = useState<Set<number>>(new Set());
  const [subtaskCount, setSubtaskCount] = useState<number>(5);
  const [isExpanding, setIsExpanding] = useState(false);
  
  if (!task) return null;
  
  // Helper function to toggle subtask expansion
  const toggleSubtask = (subtaskId: number) => {
    setExpandedSubtasks(prev => {
      const newSet = new Set(prev);
      if (newSet.has(subtaskId)) {
        newSet.delete(subtaskId);
      } else {
        newSet.add(subtaskId);
      }
      return newSet;
    });
  };
  
  // Handle expanding task into subtasks
  const handleExpandTask = async () => {
    if (!projectId || !task) return;
    
    setIsExpanding(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/tasks/expand`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: task.id,
          numSubtasks: subtaskCount
        }),
      });
      
      if (!response.ok) {
        let errorMessage = 'Failed to expand task';
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorMessage;
        } catch {
          // If not JSON, try text
          const errorText = await response.text();
          if (errorText) {
            errorMessage = errorText;
          }
        }
        throw new Error(errorMessage);
      }
      
      // Refresh the task data
      if (onTaskUpdate) {
        onTaskUpdate();
      }
      
      // Success! The useEffect in KanbanView will update the selected task automatically
    } catch (error) {
      console.error('Failed to expand task:', error);
      alert(`Failed to expand task: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsExpanding(false);
    }
  };
  
  // Helper function to get task title by ID
  const getTaskTitle = (taskId: number): string => {
    const foundTask = allTasks?.find(t => t.id === taskId);
    return foundTask ? foundTask.title : `Task #${taskId}`;
  };
  
  // Helper function to get subtask title by ID (for subtask dependencies)
  const getSubtaskTitle = (subtaskId: number): string => {
    if (!task.subtasks) return `Subtask #${subtaskId}`;
    const foundSubtask = task.subtasks.find(s => s.id === subtaskId);
    return foundSubtask ? foundSubtask.title : `Subtask #${subtaskId}`;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "done":
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case "in-progress":
        return <Clock className="h-4 w-4 text-blue-600" />;
      case "review":
        return <AlertCircle className="h-4 w-4 text-purple-600" />;
      case "deferred":
        return <Clock className="h-4 w-4 text-yellow-600" />;
      case "cancelled":
        return <Circle className="h-4 w-4 text-red-600" />;
      case "pending":
      default:
        return <Circle className="h-4 w-4 text-gray-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "done":
        return "text-green-600 bg-green-50";
      case "in-progress":
        return "text-blue-600 bg-blue-50";
      case "review":
        return "text-purple-600 bg-purple-50";
      case "deferred":
        return "text-yellow-600 bg-yellow-50";
      case "cancelled":
        return "text-red-600 bg-red-50";
      case "pending":
      default:
        return "text-gray-600 bg-gray-50";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high":
        return "destructive";
      case "medium":
        return "default";
      case "low":
        return "secondary";
      default:
        return "outline";
    }
  };

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case "high":
        return "🔴";
      case "medium":
        return "🟡";
      case "low":
        return "🔵";
      default:
        return "⚪";
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl lg:max-w-3xl overflow-hidden p-6 lg:p-8">
        <SheetHeader className="pb-6">
          <div className="flex items-start justify-between">
            <div className="space-y-1.5 flex-1 pr-2">
              <SheetTitle className="text-xl flex items-center gap-2">
                {getStatusIcon(task.status)}
                <span className="line-clamp-2">{task.title}</span>
              </SheetTitle>
              <SheetDescription className="flex items-center gap-2 text-sm">
                <Hash className="h-3 w-3" />
                Task #{task.id}
              </SheetDescription>
            </div>
            <div className="flex flex-col gap-2">
              {isManualTask && onEditClick && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    onOpenChange(false);
                    onEditClick();
                  }}
                >
                  <Edit className="h-4 w-4 mr-1" />
                  Edit
                </Button>
              )}
              <Badge variant={getPriorityColor(task.priority)} className="text-xs">
                {getPriorityIcon(task.priority)} {task.priority}
              </Badge>
              <Badge className={`text-xs ${getStatusColor(task.status)}`}>
                {task.status.replace("-", " ")}
              </Badge>
            </div>
          </div>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-180px)] pr-6">
          <div className="space-y-8">
            {/* Description */}
            {task.description && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Description
                </h3>
                <p className="text-sm text-muted-foreground pl-8">
                  {task.description}
                </p>
              </div>
            )}

            {/* Details */}
            {task.details && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  Details
                </h3>
                <div className="text-sm text-muted-foreground pl-8 whitespace-pre-wrap">
                  {task.details}
                </div>
              </div>
            )}

            {/* Test Strategy */}
            {task.testStrategy && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <TestTube className="h-4 w-4" />
                  Test Strategy
                </h3>
                <p className="text-sm text-muted-foreground pl-8">
                  {task.testStrategy}
                </p>
              </div>
            )}

            {/* Dependencies */}
            {task.dependencies && task.dependencies.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Link className="h-4 w-4" />
                  Dependencies
                </h3>
                <div className="pl-8">
                  <div className="space-y-1">
                    {task.dependencies.map(dep => (
                      <div key={dep} className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          #{dep}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {getTaskTitle(dep)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Subtasks */}
            {task.subtasks && task.subtasks.length > 0 ? (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <ListChecks className="h-4 w-4" />
                  Subtasks ({task.subtasks.length})
                </h3>
                <div className="space-y-3 pl-8">
                  {task.subtasks.map((subtask, index) => {
                    const isExpanded = expandedSubtasks.has(subtask.id);
                    const hasToggleContent = subtask.details || subtask.testStrategy || (subtask.dependencies && subtask.dependencies.length > 0);
                    
                    return (
                      <div key={subtask.id}>
                        {index > 0 && <Separator className="my-3" />}
                        <Collapsible open={isExpanded} onOpenChange={() => toggleSubtask(subtask.id)}>
                          <div className="space-y-2">
                            {/* Subtask Header - Always Visible */}
                            <div className="flex items-start justify-between">
                              <div className="flex items-start gap-2 flex-1">
                                <CollapsibleTrigger className="mt-0.5" disabled={!hasToggleContent}>
                                  {hasToggleContent ? (
                                    isExpanded ? (
                                      <ChevronDown className="h-3 w-3 text-muted-foreground hover:text-foreground transition-colors cursor-pointer" />
                                    ) : (
                                      <ChevronRight className="h-3 w-3 text-muted-foreground hover:text-foreground transition-colors cursor-pointer" />
                                    )
                                  ) : (
                                    <div className="w-3" />
                                  )}
                                </CollapsibleTrigger>
                                <div className="space-y-1 flex-1 text-left">
                                  <div 
                                    className="cursor-pointer hover:opacity-80 transition-opacity"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (onSubtaskClick) {
                                        onSubtaskClick(subtask);
                                      }
                                    }}
                                  >
                                    <h4 className="text-sm font-medium hover:underline inline">
                                      #{index + 1}. {subtask.title}
                                    </h4>
                                  </div>
                                  {subtask.description && (
                                    <p className="text-xs text-muted-foreground">
                                      {subtask.description}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <Badge className={`text-xs ml-2 ${getStatusColor(subtask.status)}`}>
                                {subtask.status.replace("-", " ")}
                              </Badge>
                            </div>
                            
                            {/* Expandable Content - Only details and test strategy */}
                            {hasToggleContent && (
                              <CollapsibleContent>
                                <div className="space-y-3 ml-8 pt-2">
                                  {subtask.details && (
                                    <div>
                                      <p className="text-xs font-medium text-muted-foreground mb-1">Details:</p>
                                      <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                                        {subtask.details}
                                      </p>
                                    </div>
                                  )}
                                  
                                  {subtask.testStrategy && (
                                    <div>
                                      <p className="text-xs font-medium text-muted-foreground mb-1">Test Strategy:</p>
                                      <p className="text-xs text-muted-foreground">
                                        {subtask.testStrategy}
                                      </p>
                                    </div>
                                  )}
                                  
                                  {subtask.dependencies && subtask.dependencies.length > 0 && (
                                    <div>
                                      <p className="text-xs font-medium text-muted-foreground mb-1">Depends on:</p>
                                      <div className="space-y-1">
                                        {subtask.dependencies.map(dep => (
                                          <div key={dep} className="flex items-center gap-2">
                                            <Badge variant="outline" className="text-xs">
                                              #{dep}
                                            </Badge>
                                            <span className="text-xs text-muted-foreground">
                                              {getSubtaskTitle(dep)}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </CollapsibleContent>
                            )}
                          </div>
                        </Collapsible>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              // Show expand option when no subtasks exist and not a manual task
              !isManualTask && projectId && (
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <ListChecks className="h-4 w-4" />
                    Subtasks
                  </h3>
                  <div className="pl-8 space-y-4">
                    <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                      <p className="text-sm text-muted-foreground">
                        This task hasn't been broken down into subtasks yet. 
                        Use AI to automatically generate subtasks for better task management.
                      </p>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min="1"
                            max="20"
                            value={subtaskCount}
                            onChange={(e) => {
                              const value = parseInt(e.target.value);
                              if (!isNaN(value) && value >= 1 && value <= 20) {
                                setSubtaskCount(value);
                              }
                            }}
                            className="w-16 h-8"
                            disabled={isExpanding}
                            autoFocus={false}
                            tabIndex={-1}
                          />
                          <span className="text-sm text-muted-foreground">subtasks</span>
                        </div>
                        <Button 
                          onClick={handleExpandTask}
                          disabled={isExpanding}
                          size="sm"
                        >
                          {isExpanding ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Expanding...
                            </>
                          ) : (
                            <>
                              <Sparkles className="mr-2 h-4 w-4" />
                              Expand Task
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}