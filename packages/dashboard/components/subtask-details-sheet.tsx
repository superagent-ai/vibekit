"use client";

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
  Hash,
  Link,
  FileText,
  TestTube,
  ArrowLeft,
  ChevronRight,
  AlertCircle,
  ScrollText,
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

interface SubtaskDetailsSheetProps {
  subtask: Subtask | null;
  parentTask: Task | null;
  allTasks?: Task[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onParentTaskClick?: () => void;
  onSiblingSubtaskClick?: (subtask: Subtask) => void;
}

export function SubtaskDetailsSheet({ 
  subtask, 
  parentTask, 
  allTasks, 
  open, 
  onOpenChange,
  onParentTaskClick,
  onSiblingSubtaskClick
}: SubtaskDetailsSheetProps) {
  if (!subtask || !parentTask) return null;
  
  // Get sibling subtasks (excluding current)
  const siblingSubtasks = parentTask.subtasks.filter(s => s.id !== subtask.id);
  
  // Helper function to get subtask title by ID (for dependencies)
  const getSubtaskTitle = (subtaskId: number): string => {
    const foundSubtask = parentTask.subtasks.find(s => s.id === subtaskId);
    return foundSubtask ? foundSubtask.title : `Subtask #${subtaskId}`;
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl lg:max-w-3xl overflow-hidden p-6 lg:p-8">
        <SheetHeader className="pb-6">
          <div className="space-y-4">
            {/* Parent Task Reference */}
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (onParentTaskClick) {
                    onOpenChange(false);
                    onParentTaskClick();
                  }
                }}
                className="h-auto px-2 py-1"
              >
                <ArrowLeft className="h-3 w-3 mr-1" />
                <span className="text-xs">Parent Task</span>
              </Button>
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground truncate">
                {parentTask.title}
              </span>
            </div>
            
            {/* Subtask Title and Status */}
            <div className="flex items-start justify-between">
              <div className="space-y-1.5 flex-1 pr-2">
                <SheetTitle className="text-xl">
                  <span className="line-clamp-2">{subtask.title}</span>
                </SheetTitle>
                <SheetDescription className="flex items-center gap-2 text-sm">
                  <Hash className="h-3 w-3" />
                  Subtask #{subtask.id}
                </SheetDescription>
              </div>
              <Badge className={`text-xs ${getStatusColor(subtask.status)}`}>
                {subtask.status.replace("-", " ")}
              </Badge>
            </div>
          </div>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-220px)] pr-6">
          <div className="space-y-8">
            {/* Description */}
            {subtask.description && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Description
                </h3>
                <p className="text-sm text-muted-foreground pl-8">
                  {subtask.description}
                </p>
              </div>
            )}

            {/* Details */}
            {subtask.details && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  Details
                </h3>
                <div className="text-sm text-muted-foreground pl-8 whitespace-pre-wrap">
                  {subtask.details}
                </div>
              </div>
            )}

            {/* Test Strategy */}
            {subtask.testStrategy && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <TestTube className="h-4 w-4" />
                  Test Strategy
                </h3>
                <p className="text-sm text-muted-foreground pl-8">
                  {subtask.testStrategy}
                </p>
              </div>
            )}

            {/* Dependencies */}
            {subtask.dependencies && subtask.dependencies.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Link className="h-4 w-4" />
                  Dependencies
                </h3>
                <div className="pl-8">
                  <div className="space-y-1">
                    {subtask.dependencies.map(dep => (
                      <div key={dep} className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          #{dep}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {getSubtaskTitle(dep)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Sibling Subtasks */}
            {siblingSubtasks.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Other Subtasks in Parent Task</h3>
                <div className="pl-8 space-y-2">
                  {siblingSubtasks.map(sibling => {
                    // Find the index of this sibling in the parent's subtasks array
                    const siblingIndex = parentTask.subtasks.findIndex(s => s.id === sibling.id);
                    return (
                      <div
                        key={sibling.id}
                        className="flex items-center justify-between p-2 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => {
                          if (onSiblingSubtaskClick) {
                            onOpenChange(false);
                            setTimeout(() => onSiblingSubtaskClick(sibling), 100);
                          }
                        }}
                      >
                        <div>
                          <p className="text-sm font-medium">#{siblingIndex + 1}. {sibling.title}</p>
                          {sibling.description && (
                            <p className="text-xs text-muted-foreground">{sibling.description}</p>
                          )}
                        </div>
                        <Badge className={`text-xs ${getStatusColor(sibling.status)}`}>
                          {sibling.status.replace("-", " ")}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            
            {/* Logs Section */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <ScrollText className="h-4 w-4" />
                Logs
              </h3>
              <div className="pl-8">
                <div className="border rounded-lg p-4 bg-muted/20">
                  <div className="text-center py-4">
                    <p className="text-sm text-muted-foreground">No logs available for this subtask</p>
                    <p className="text-xs text-muted-foreground mt-2">Logs will appear here when the subtask is executed</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}