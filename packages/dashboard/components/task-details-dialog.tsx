"use client";

import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
  ChevronRight, 
  Clock, 
  CheckCircle, 
  Circle, 
  AlertCircle,
  Hash,
  Link,
  FileText,
  TestTube,
  ListChecks
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

interface TaskDetailsDialogProps {
  task: Task | null;
  allTasks?: Task[];  // Optional: pass all tasks to resolve dependency names
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TaskDetailsDialog({ task, allTasks, open, onOpenChange }: TaskDetailsDialogProps) {
  if (!task) return null;
  
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-1.5">
              <DialogTitle className="text-xl flex items-center gap-2">
                {getStatusIcon(task.status)}
                {task.title}
              </DialogTitle>
              <DialogDescription className="flex items-center gap-2 text-sm">
                <Hash className="h-3 w-3" />
                Task #{task.id}
              </DialogDescription>
            </div>
            <div className="flex gap-2">
              <Badge variant={getPriorityColor(task.priority)} className="text-xs">
                {getPriorityIcon(task.priority)} {task.priority}
              </Badge>
              <Badge className={`text-xs ${getStatusColor(task.status)}`}>
                {task.status.replace("-", " ")}
              </Badge>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="h-[60vh] pr-4">
          <div className="space-y-6">
            {/* Description */}
            {task.description && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Description
                </h3>
                <p className="text-sm text-muted-foreground pl-6">
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
                <div className="text-sm text-muted-foreground pl-6 whitespace-pre-wrap">
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
                <p className="text-sm text-muted-foreground pl-6">
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
                <div className="pl-6">
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
            {task.subtasks && task.subtasks.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <ListChecks className="h-4 w-4" />
                  Subtasks ({task.subtasks.length})
                </h3>
                <div className="space-y-3 pl-6">
                  {task.subtasks.map((subtask, index) => (
                    <div key={subtask.id} className="space-y-2">
                      {index > 0 && <Separator className="my-3" />}
                      <div className="space-y-2">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-2">
                            {getStatusIcon(subtask.status)}
                            <div className="space-y-1">
                              <h4 className="text-sm font-medium">
                                {subtask.title}
                              </h4>
                              <p className="text-xs text-muted-foreground">
                                Subtask #{subtask.id}
                              </p>
                            </div>
                          </div>
                          <Badge className={`text-xs ${getStatusColor(subtask.status)}`}>
                            {subtask.status.replace("-", " ")}
                          </Badge>
                        </div>
                        
                        {subtask.description && (
                          <p className="text-sm text-muted-foreground ml-6">
                            {subtask.description}
                          </p>
                        )}
                        
                        {subtask.details && (
                          <div className="ml-6">
                            <p className="text-xs font-medium text-muted-foreground mb-1">Details:</p>
                            <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                              {subtask.details}
                            </p>
                          </div>
                        )}
                        
                        {subtask.testStrategy && (
                          <div className="ml-6">
                            <p className="text-xs font-medium text-muted-foreground mb-1">Test Strategy:</p>
                            <p className="text-xs text-muted-foreground">
                              {subtask.testStrategy}
                            </p>
                          </div>
                        )}
                        
                        {subtask.dependencies && subtask.dependencies.length > 0 && (
                          <div className="ml-6">
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
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}