"use client";

import { useState, useEffect } from "react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Loader2,
  Plus,
  Trash2,
  Edit2,
  X
} from "lucide-react";
import { Tool, ToolHeader, ToolContent, ToolInput, ToolOutput, type ToolState } from "@/components/ui/tool";

interface Subtask {
  id: number;
  title: string;
  description: string;
  dependencies: number[];
  details: string;
  status: "pending" | "done" | "in-progress" | "review" | "deferred" | "cancelled";
  testStrategy: string;
}

interface SubtaskFormData {
  id?: number;
  title: string;
  description: string;
  details: string;
  status: "pending" | "done" | "in-progress" | "review" | "deferred" | "cancelled";
  testStrategy: string;
  dependencies: number[];
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
  parentTaskId?: number;  // Parent task ID for subtasks
  allTasks?: Task[];  // Optional: pass all tasks to resolve dependency names
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isManualTask?: boolean;
  onEditClick?: () => void;
  projectId?: string;
  projectRoot?: string;
  projectTag?: string;
  onTaskUpdate?: () => void;
  onSubtaskClick?: (subtask: Subtask) => void;
}

export function TaskDetailsSheet({ task, parentTaskId, allTasks, open, onOpenChange, isManualTask, onEditClick, projectId, projectRoot, projectTag, onTaskUpdate, onSubtaskClick }: TaskDetailsSheetProps) {
  const [expandedSubtasks, setExpandedSubtasks] = useState<Set<number>>(new Set());
  const [subtaskCount, setSubtaskCount] = useState<number>(5);
  const [useResearch, setUseResearch] = useState(false);
  const [promptText, setPromptText] = useState("");
  const [forceExpand, setForceExpand] = useState(false);
  const [isExpanding, setIsExpanding] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [editingSubtask, setEditingSubtask] = useState<SubtaskFormData | null>(null);
  const [expansionResult, setExpansionResult] = useState<any>(null);
  const [expansionError, setExpansionError] = useState<string | null>(null);
  const [clearResult, setClearResult] = useState<any>(null);
  const [clearError, setClearError] = useState<string | null>(null);
  const [toolExpanded, setToolExpanded] = useState(true);
  const [showSubtaskForm, setShowSubtaskForm] = useState(false);
  const [isUpdatingTask, setIsUpdatingTask] = useState(false);
  
  // Reset expansion state when sheet opens/closes (page navigation)
  useEffect(() => {
    if (!open) {
      setExpansionResult(null);
      setExpansionError(null);
      setClearResult(null);
      setClearError(null);
      setToolExpanded(true);
      setUseResearch(false);
      setPromptText("");
      setForceExpand(false);
    }
  }, [open]);

  // Clear tool results when switching between expand/clear based on subtasks presence
  useEffect(() => {
    if (!task) return;
    
    const hasSubtasks = task.subtasks && task.subtasks.length > 0;
    if (hasSubtasks) {
      // Switching to clear tool - clear expansion results
      setExpansionResult(null);
      setExpansionError(null);
    } else {
      // Switching to expand tool - clear clear results
      setClearResult(null);
      setClearError(null);
    }
  }, [task?.subtasks?.length]);
  
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
  
  // Handle adding a new subtask
  const handleAddSubtask = () => {
    setEditingSubtask({
      title: "",
      description: "",
      details: "",
      status: "pending",
      testStrategy: "",
      dependencies: [],
    });
    setShowSubtaskForm(true);
  };

  // Handle editing an existing subtask
  const handleEditSubtask = (subtask: Subtask) => {
    setEditingSubtask({
      id: subtask.id,
      title: subtask.title,
      description: subtask.description,
      details: subtask.details || "",
      status: subtask.status,
      testStrategy: subtask.testStrategy || "",
      dependencies: subtask.dependencies || [],
    });
    setShowSubtaskForm(true);
  };

  // Handle saving a subtask
  const handleSaveSubtask = async () => {
    if (!editingSubtask || !editingSubtask.title.trim() || !task || !projectId) {
      return;
    }

    setIsUpdatingTask(true);
    try {
      // Create a copy of the current task's subtasks
      let updatedSubtasks = [...(task.subtasks || [])];

      if (editingSubtask.id !== undefined) {
        // Update existing subtask
        const subtaskIndex = updatedSubtasks.findIndex(s => s.id === editingSubtask.id);
        if (subtaskIndex !== -1) {
          updatedSubtasks[subtaskIndex] = {
            ...updatedSubtasks[subtaskIndex],
            ...editingSubtask,
          };
        }
      } else {
        // Add new subtask
        const newSubtask: Subtask = {
          ...editingSubtask,
          id: updatedSubtasks.length > 0 
            ? Math.max(...updatedSubtasks.map(s => s.id)) + 1 
            : 1,
        };
        updatedSubtasks.push(newSubtask);
      }

      // Update the task via API
      const response = await fetch(`/api/projects/${projectId}/tasks/manual`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          taskId: task.id,
          title: task.title,
          description: task.description,
          details: task.details,
          priority: task.priority,
          status: task.status,
          testStrategy: task.testStrategy,
          dependencies: task.dependencies,
          subtasks: updatedSubtasks,
        }),
      });

      if (response.ok) {
        setShowSubtaskForm(false);
        setEditingSubtask(null);
        if (onTaskUpdate) {
          onTaskUpdate();
        }
      } else {
        alert("Failed to save subtask");
      }
    } catch (error) {
      console.error("Failed to save subtask:", error);
      alert("Failed to save subtask");
    } finally {
      setIsUpdatingTask(false);
    }
  };

  // Handle deleting a subtask
  const handleDeleteSubtask = async (subtaskId: number) => {
    if (!task || !projectId || !confirm("Are you sure you want to delete this subtask?")) {
      return;
    }

    setIsUpdatingTask(true);
    try {
      const updatedSubtasks = (task.subtasks || []).filter(s => s.id !== subtaskId);

      const response = await fetch(`/api/projects/${projectId}/tasks/manual`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          taskId: task.id,
          title: task.title,
          description: task.description,
          details: task.details,
          priority: task.priority,
          status: task.status,
          testStrategy: task.testStrategy,
          dependencies: task.dependencies,
          subtasks: updatedSubtasks,
        }),
      });

      if (response.ok) {
        if (onTaskUpdate) {
          onTaskUpdate();
        }
      } else {
        alert("Failed to delete subtask");
      }
    } catch (error) {
      console.error("Failed to delete subtask:", error);
      alert("Failed to delete subtask");
    } finally {
      setIsUpdatingTask(false);
    }
  };

  // Handle expanding task into subtasks
  const handleExpandTask = async () => {
    if (!projectId || !task) return;
    
    setIsExpanding(true);
    setExpansionResult(null);
    setExpansionError(null);
    // Clear any previous clear results
    setClearResult(null);
    setClearError(null);
    
    try {
      const response = await fetch(`/api/projects/${projectId}/tasks/expand`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: task.id.toString(),
          numSubtasks: subtaskCount,
          id: task.id.toString(),
          num: subtaskCount.toString(),
          projectRoot: projectRoot || '',
          research: useResearch,
          prompt: promptText,
          file: ".taskmaster/tasks/tasks.json",
          tag: projectTag || "master",
          force: forceExpand
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
        setExpansionError(errorMessage);
        throw new Error(errorMessage);
      }
      
      const result = await response.json();
      setExpansionResult(result);
      
      // Close the tool on successful expansion since subtasks will be shown below
      setToolExpanded(false);
      
      // Refresh the task data
      if (onTaskUpdate) {
        onTaskUpdate();
      }
      
      // Success! The useEffect in KanbanView will update the selected task automatically
    } catch (error) {
      console.error('Failed to expand task:', error);
      if (!expansionError) {
        setExpansionError(error instanceof Error ? error.message : 'Unknown error');
      }
    } finally {
      setIsExpanding(false);
    }
  };

  // Handle clearing all subtasks
  const handleClearSubtasks = async () => {
    if (!projectId || !task) return;
    
    setIsClearing(true);
    setClearResult(null);
    setClearError(null);
    // Clear any previous expansion results
    setExpansionResult(null);
    setExpansionError(null);
    
    try {
      const response = await fetch(`/api/projects/${projectId}/tasks/clear-subtasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: task.id.toString(),
          all: true,
          tag: projectTag || 'master'
        }),
      });
      
      if (!response.ok) {
        let errorMessage = 'Failed to clear subtasks';
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorMessage;
        } catch {
          const errorText = await response.text();
          if (errorText) {
            errorMessage = errorText;
          }
        }
        setClearError(errorMessage);
        throw new Error(errorMessage);
      }
      
      const result = await response.json();
      setClearResult({ message: 'All subtasks cleared successfully' });
      
      // Clear expansion results since we're switching back to expand tool
      setExpansionResult(null);
      setExpansionError(null);
      
      // Close the tool after clearing
      setToolExpanded(false);
      
      // Refresh the task data
      if (onTaskUpdate) {
        onTaskUpdate();
      }
    } catch (error) {
      console.error('Failed to clear subtasks:', error);
      if (!clearError) {
        setClearError(error instanceof Error ? error.message : 'Unknown error');
      }
    } finally {
      setIsClearing(false);
    }
  };

  // Helper function to get tool state for expansion
  const getExpansionToolState = (): ToolState => {
    if (isExpanding) return 'executing';
    if (expansionError) return 'output-error';
    if (expansionResult) return 'output-available';
    return 'input-available';
  };

  // Helper function to get tool state for clearing
  const getClearToolState = (): ToolState => {
    if (isClearing) return 'executing';
    if (clearError) return 'output-error';
    if (clearResult) return 'output-available';
    return 'input-available';
  };
  
  // Helper function to get task title by ID
  const getTaskTitle = (taskId: number): string => {
    const foundTask = allTasks?.find(t => t.id === taskId);
    return foundTask ? foundTask.title : `Task #${taskId}`;
  };

  // Helper function to get task by ID
  const getTask = (taskId: number): Task | undefined => {
    return allTasks?.find(t => t.id === taskId);
  };
  
  // Helper function to get subtask title by ID (for subtask dependencies)
  const getSubtaskTitle = (subtaskId: number): string => {
    if (!task.subtasks) return `Subtask #${subtaskId}`;
    const foundSubtask = task.subtasks.find(s => s.id === subtaskId);
    return foundSubtask ? foundSubtask.title : `Subtask #${subtaskId}`;
  };

  // Helper function to get subtask by ID
  const getSubtask = (subtaskId: number): Subtask | undefined => {
    return task.subtasks?.find(s => s.id === subtaskId);
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
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs font-mono">
                  Task {parentTaskId ? `${parentTaskId}.${task.id}` : task.id}
                </Badge>
                <SheetTitle className="text-lg">
                  <span className="line-clamp-2">{task.title}</span>
                </SheetTitle>
              </div>
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
              <div className="flex gap-2">
                <Badge variant={getPriorityColor(task.priority)} className="text-xs">
                  {task.priority}
                </Badge>
                <Badge className={`text-xs ${getStatusColor(task.status)}`}>
                  {task.status.replace("-", " ")}
                </Badge>
              </div>
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
                    {task.dependencies.map(dep => {
                      const dependencyTask = getTask(dep);
                      const status = dependencyTask?.status || 'unknown';
                      
                      return (
                        <div key={dep} className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            #{dep}
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            {getTaskTitle(dep)}
                          </span>
                          {status !== 'unknown' ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className={`h-6 px-2 ${getStatusColor(status)} border hover:bg-opacity-80`}
                            >
                              <span className="text-xs">
                                {status.replace("-", " ")}
                              </span>
                            </Button>
                          ) : (
                            <Badge variant="outline" className="text-xs text-muted-foreground">
                              not found
                            </Badge>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Taskmaster - Always visible for non-manual tasks */}
            {!isManualTask && projectId && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    Taskmaster
                  </h3>
                </div>
                
                <div className="pl-8">
                  {/* Show different tool based on whether subtasks exist */}
                  {task.subtasks && task.subtasks.length > 0 ? (
                    // Clear Subtasks Tool
                    <>
                      <div className="text-sm text-muted-foreground mb-3">
                        This task has {task.subtasks.length} subtask{task.subtasks.length !== 1 ? 's' : ''}. You can clear all subtasks to regenerate them.
                      </div>
                      
                      <Tool defaultOpen={toolExpanded}>
                        <ToolHeader 
                          type="clear_subtasks"
                          state={getClearToolState()}
                          isOpen={toolExpanded}
                          onToggle={() => setToolExpanded(!toolExpanded)}
                        />
                        <ToolContent isOpen={toolExpanded}>
                          <ToolInput 
                            input={{
                              id: task.id.toString(),
                              all: true,
                              projectRoot: projectRoot || '',
                              tag: projectTag || 'master'
                            }}
                          />
                          
                          <div className="space-y-3 pt-2">
                            <div className="flex items-center gap-3">
                              <div className="flex items-center gap-2">
                                <AlertCircle className="h-4 w-4 text-destructive" />
                                <span className="text-sm text-muted-foreground">
                                  This will permanently delete all {task.subtasks.length} subtask{task.subtasks.length !== 1 ? 's' : ''}.
                                </span>
                              </div>
                              <Button 
                                onClick={handleClearSubtasks}
                                disabled={isClearing}
                                size="sm"
                                variant="destructive"
                              >
                                {isClearing ? (
                                  <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Clearing...
                                  </>
                                ) : (
                                  <>
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Clear All Subtasks
                                  </>
                                )}
                              </Button>
                            </div>
                          </div>
                          
                          {(clearResult || clearError) && (
                            <ToolOutput 
                              output={clearResult}
                              errorText={clearError || undefined}
                            />
                          )}
                        </ToolContent>
                      </Tool>
                    </>
                  ) : (
                    // Expand Task Tool
                    <>
                      {(!expansionResult && !expansionError) && (
                        <div className="text-sm text-muted-foreground mb-3">
                          This task hasn't been broken down into subtasks yet. Use AI to automatically generate subtasks for better task management.
                        </div>
                      )}
                      
                      <Tool defaultOpen={toolExpanded}>
                        <ToolHeader 
                          type="expand_task"
                          state={getExpansionToolState()}
                          isOpen={toolExpanded}
                          onToggle={() => setToolExpanded(!toolExpanded)}
                        />
                        <ToolContent isOpen={toolExpanded}>
                          <ToolInput 
                            input={{
                              id: task.id.toString(),
                              num: subtaskCount.toString(),
                              research: useResearch,
                              prompt: promptText,
                              file: ".taskmaster/tasks/tasks.json",
                              projectRoot: projectRoot || '',
                              force: forceExpand,
                              tag: projectTag || "master"
                            }}
                          />
                          
                          <div className="space-y-3 pt-2">
                            {/* Number of subtasks and Research checkbox on same line */}
                            <div className="flex items-end gap-4">
                              <div className="w-20">
                                <Label htmlFor="num-subtasks" className="text-xs">Number</Label>
                                <Input
                                  id="num-subtasks"
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
                                  className="h-8 mt-1"
                                  disabled={isExpanding}
                                />
                              </div>
                              <div className="flex items-center gap-2 pb-1 flex-1">
                                <input
                                  type="checkbox"
                                  id="research"
                                  checked={useResearch}
                                  onChange={(e) => setUseResearch(e.target.checked)}
                                  disabled={isExpanding}
                                  className="h-4 w-4"
                                />
                                <Label htmlFor="research" className="text-xs cursor-pointer">Use research role</Label>
                              </div>
                            </div>

                            {/* Prompt */}
                            <div className="grid gap-2">
                              <Label htmlFor="prompt" className="text-xs">Prompt (optional context)</Label>
                              <Textarea
                                id="prompt"
                                value={promptText}
                                onChange={(e) => setPromptText(e.target.value)}
                                placeholder="Additional context for generating subtasks (optional)"
                                rows={2}
                                className="text-xs"
                                disabled={isExpanding}
                              />
                            </div>

                            {/* Force checkbox (only shown when subtasks exist) */}
                            {task.subtasks && task.subtasks.length > 0 && (
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  id="force"
                                  checked={forceExpand}
                                  onChange={(e) => setForceExpand(e.target.checked)}
                                  disabled={isExpanding}
                                  className="h-4 w-4"
                                />
                                <Label htmlFor="force" className="text-xs cursor-pointer">Force (overwrite existing)</Label>
                              </div>
                            )}

                            {/* Execute button */}
                            <div className="flex justify-end">
                              <Button 
                                onClick={handleExpandTask}
                                disabled={isExpanding}
                                size="sm"
                              >
                                {isExpanding ? (
                                  <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Executing...
                                  </>
                                ) : (
                                  <>
                                    <Sparkles className="mr-2 h-4 w-4" />
                                    Execute Tool
                                  </>
                                )}
                              </Button>
                            </div>
                          </div>
                          
                          {(expansionResult || expansionError) && (
                            <ToolOutput 
                              output={expansionResult}
                              errorText={expansionError || undefined}
                            />
                          )}
                        </ToolContent>
                      </Tool>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Subtasks */}
            {(!task.subtasks || task.subtasks.length === 0) && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <ListChecks className="h-4 w-4" />
                    Subtasks
                  </h3>
                  {isManualTask && !showSubtaskForm && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleAddSubtask}
                      disabled={isUpdatingTask}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add Subtask
                    </Button>
                  )}
                </div>
                <div className="pl-8 space-y-4">
                  {/* Show manual task option for empty manual tasks */}
                  {isManualTask && !showSubtaskForm && (
                    <div className="text-center py-6 border-2 border-dashed border-muted-foreground/30 rounded-lg">
                      <p className="text-sm text-muted-foreground mb-3">
                        No subtasks yet
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleAddSubtask}
                        disabled={isUpdatingTask}
                        className="text-primary hover:text-primary hover:bg-primary/10"
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add your first subtask
                      </Button>
                    </div>
                  )}

                  {/* Add Subtask Form for manual tasks */}
                  {isManualTask && showSubtaskForm && editingSubtask && (
                    <Card className="border-primary/20 bg-primary/5">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm">New Subtask</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="grid gap-2">
                          <Label htmlFor="subtask-title-empty">Title</Label>
                          <Input
                            id="subtask-title-empty"
                            value={editingSubtask.title}
                            onChange={(e) => setEditingSubtask({ ...editingSubtask, title: e.target.value })}
                            placeholder="Subtask title"
                            disabled={isUpdatingTask}
                          />
                        </div>
                        
                        <div className="grid gap-2">
                          <Label htmlFor="subtask-description-empty">Description</Label>
                          <Textarea
                            id="subtask-description-empty"
                            value={editingSubtask.description}
                            onChange={(e) => setEditingSubtask({ ...editingSubtask, description: e.target.value })}
                            placeholder="Subtask description"
                            rows={2}
                            disabled={isUpdatingTask}
                          />
                        </div>
                        
                        <div className="grid gap-2">
                          <Label htmlFor="subtask-details-empty">Details</Label>
                          <Textarea
                            id="subtask-details-empty"
                            value={editingSubtask.details}
                            onChange={(e) => setEditingSubtask({ ...editingSubtask, details: e.target.value })}
                            placeholder="Additional details"
                            rows={2}
                            disabled={isUpdatingTask}
                          />
                        </div>
                        
                        <div className="grid gap-2">
                          <Label htmlFor="subtask-test-empty">Test Strategy</Label>
                          <Input
                            id="subtask-test-empty"
                            value={editingSubtask.testStrategy}
                            onChange={(e) => setEditingSubtask({ ...editingSubtask, testStrategy: e.target.value })}
                            placeholder="How to test this subtask"
                            disabled={isUpdatingTask}
                          />
                        </div>
                        
                        <div className="grid gap-2">
                          <Label htmlFor="subtask-status-empty">Status</Label>
                          <Select
                            value={editingSubtask.status}
                            onValueChange={(value: typeof editingSubtask.status) => 
                              setEditingSubtask({ ...editingSubtask, status: value })
                            }
                            disabled={isUpdatingTask}
                          >
                            <SelectTrigger id="subtask-status-empty">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending">Pending</SelectItem>
                              <SelectItem value="in-progress">In Progress</SelectItem>
                              <SelectItem value="review">Review</SelectItem>
                              <SelectItem value="done">Done</SelectItem>
                              <SelectItem value="deferred">Deferred</SelectItem>
                              <SelectItem value="cancelled">Cancelled</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        
                        <div className="flex justify-end gap-2 pt-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setShowSubtaskForm(false);
                              setEditingSubtask(null);
                            }}
                            disabled={isUpdatingTask}
                          >
                            Cancel
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            onClick={handleSaveSubtask}
                            disabled={isUpdatingTask || !editingSubtask.title.trim()}
                          >
                            {isUpdatingTask ? "Saving..." : "Save Subtask"}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </div>
            )}

            {task.subtasks && task.subtasks.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <ListChecks className="h-4 w-4" />
                    Subtasks ({task.subtasks.length})
                  </h3>
                  {isManualTask && !showSubtaskForm && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleAddSubtask}
                      disabled={isUpdatingTask}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add Subtask
                    </Button>
                  )}
                </div>
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
                              <div className="flex items-center gap-2 ml-2">
                                <Badge className={`text-xs ${getStatusColor(subtask.status)}`}>
                                  {subtask.status.replace("-", " ")}
                                </Badge>
                                {isManualTask && (
                                  <div className="flex gap-1">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleEditSubtask(subtask);
                                      }}
                                      disabled={isUpdatingTask}
                                      className="h-6 w-6 p-0"
                                    >
                                      <Edit2 className="h-3 w-3" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteSubtask(subtask.id);
                                      }}
                                      disabled={isUpdatingTask}
                                      className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </div>
                                )}
                              </div>
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
                                        {subtask.dependencies.map(dep => {
                                          const dependencySubtask = getSubtask(dep);
                                          const status = dependencySubtask?.status || 'unknown';
                                          
                                          return (
                                            <div key={dep} className="flex items-center gap-2">
                                              <Badge variant="outline" className="text-xs">
                                                #{dep}
                                              </Badge>
                                              <span className="text-xs text-muted-foreground">
                                                {getSubtaskTitle(dep)}
                                              </span>
                                              {status !== 'unknown' ? (
                                                <Button
                                                  variant="outline"
                                                  size="sm"
                                                  className={`h-5 px-1.5 ${getStatusColor(status)} border hover:bg-opacity-80`}
                                                >
                                                  <span className="text-xs">
                                                    {status.replace("-", " ")}
                                                  </span>
                                                </Button>
                                              ) : (
                                                <Badge variant="outline" className="text-xs text-muted-foreground">
                                                  not found
                                                </Badge>
                                              )}
                                            </div>
                                          );
                                        })}
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

                {/* Add Subtask Form */}
                {isManualTask && showSubtaskForm && editingSubtask && (
                  <div className="pl-8">
                    <Card className="border-primary/20 bg-primary/5">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm">
                          {editingSubtask.id !== undefined ? "Edit Subtask" : "New Subtask"}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="grid gap-2">
                          <Label htmlFor="subtask-title">Title</Label>
                          <Input
                            id="subtask-title"
                            value={editingSubtask.title}
                            onChange={(e) => setEditingSubtask({ ...editingSubtask, title: e.target.value })}
                            placeholder="Subtask title"
                            disabled={isUpdatingTask}
                          />
                        </div>
                        
                        <div className="grid gap-2">
                          <Label htmlFor="subtask-description">Description</Label>
                          <Textarea
                            id="subtask-description"
                            value={editingSubtask.description}
                            onChange={(e) => setEditingSubtask({ ...editingSubtask, description: e.target.value })}
                            placeholder="Subtask description"
                            rows={2}
                            disabled={isUpdatingTask}
                          />
                        </div>
                        
                        <div className="grid gap-2">
                          <Label htmlFor="subtask-details">Details</Label>
                          <Textarea
                            id="subtask-details"
                            value={editingSubtask.details}
                            onChange={(e) => setEditingSubtask({ ...editingSubtask, details: e.target.value })}
                            placeholder="Additional details"
                            rows={2}
                            disabled={isUpdatingTask}
                          />
                        </div>
                        
                        <div className="grid gap-2">
                          <Label htmlFor="subtask-test">Test Strategy</Label>
                          <Input
                            id="subtask-test"
                            value={editingSubtask.testStrategy}
                            onChange={(e) => setEditingSubtask({ ...editingSubtask, testStrategy: e.target.value })}
                            placeholder="How to test this subtask"
                            disabled={isUpdatingTask}
                          />
                        </div>
                        
                        <div className="grid gap-2">
                          <Label htmlFor="subtask-status">Status</Label>
                          <Select
                            value={editingSubtask.status}
                            onValueChange={(value: typeof editingSubtask.status) => 
                              setEditingSubtask({ ...editingSubtask, status: value })
                            }
                            disabled={isUpdatingTask}
                          >
                            <SelectTrigger id="subtask-status">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending">Pending</SelectItem>
                              <SelectItem value="in-progress">In Progress</SelectItem>
                              <SelectItem value="review">Review</SelectItem>
                              <SelectItem value="done">Done</SelectItem>
                              <SelectItem value="deferred">Deferred</SelectItem>
                              <SelectItem value="cancelled">Cancelled</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        
                        <div className="flex justify-end gap-2 pt-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setShowSubtaskForm(false);
                              setEditingSubtask(null);
                            }}
                            disabled={isUpdatingTask}
                          >
                            Cancel
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            onClick={handleSaveSubtask}
                            disabled={isUpdatingTask || !editingSubtask.title.trim()}
                          >
                            {isUpdatingTask ? "Saving..." : "Save Subtask"}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </div>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}