"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Trash2, Edit2, ChevronRight, CheckCircle, Circle, Clock, AlertCircle, X } from "lucide-react";
import type { ManualTask, ManualSubtask } from "@/lib/projects";

interface EditTaskDialogProps {
  projectId: string;
  task: ManualTask | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTaskUpdated: () => void;
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

export function EditTaskDialog({ 
  projectId, 
  task,
  open, 
  onOpenChange,
  onTaskUpdated 
}: EditTaskDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    details: "",
    priority: "medium" as "high" | "medium" | "low",
    status: "pending" as "pending" | "in-progress" | "review" | "done" | "deferred" | "cancelled",
    testStrategy: "",
    dependencies: [] as number[],
  });
  
  const [subtasks, setSubtasks] = useState<ManualSubtask[]>([]);
  const [editingSubtask, setEditingSubtask] = useState<SubtaskFormData | null>(null);
  const [showSubtaskForm, setShowSubtaskForm] = useState(false);

  // Load task data when task changes
  useEffect(() => {
    if (task) {
      setFormData({
        title: task.title,
        description: task.description,
        details: task.details || "",
        priority: task.priority,
        status: task.status,
        testStrategy: task.testStrategy || "",
        dependencies: task.dependencies || [],
      });
      setSubtasks(task.subtasks || []);
    }
  }, [task]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.title.trim() || !task) {
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`/api/projects/${projectId}/tasks/manual`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          taskId: task.id,
          ...formData,
          subtasks,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        console.log("Task updated successfully:", result);
        
        // Close dialog
        onOpenChange(false);
        
        // Trigger refresh
        onTaskUpdated();
      } else {
        const error = await response.text();
        console.error("Failed to update task:", response.status, error);
        alert(`Failed to update task: ${error}`);
      }
    } catch (error) {
      console.error("Failed to update task:", error);
      alert("Failed to update task");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteTask = async () => {
    if (!task || !confirm("Are you sure you want to delete this task?")) {
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/tasks/manual`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ taskId: task.id }),
      });

      if (response.ok) {
        onOpenChange(false);
        onTaskUpdated();
      } else {
        alert("Failed to delete task");
      }
    } catch (error) {
      console.error("Failed to delete task:", error);
      alert("Failed to delete task");
    } finally {
      setIsLoading(false);
    }
  };

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

  const handleEditSubtask = (subtask: ManualSubtask) => {
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

  const handleSaveSubtask = () => {
    if (!editingSubtask || !editingSubtask.title.trim()) {
      return;
    }

    if (editingSubtask.id !== undefined) {
      // Update existing subtask
      setSubtasks(subtasks.map(s => 
        s.id === editingSubtask.id 
          ? { ...s, ...editingSubtask }
          : s
      ));
    } else {
      // Add new subtask
      const newSubtask: ManualSubtask = {
        ...editingSubtask,
        id: subtasks.length > 0 
          ? Math.max(...subtasks.map(s => s.id)) + 1 
          : 1,
      };
      setSubtasks([...subtasks, newSubtask]);
    }

    setShowSubtaskForm(false);
    setEditingSubtask(null);
  };

  const handleDeleteSubtask = (subtaskId: number) => {
    setSubtasks(subtasks.filter(s => s.id !== subtaskId));
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
        return <X className="h-4 w-4 text-red-600" />;
      default:
        return <Circle className="h-4 w-4 text-gray-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "done": return "default";
      case "in-progress": return "secondary";
      case "review": return "secondary";
      case "deferred": return "outline";
      case "cancelled": return "destructive";
      default: return "outline";
    }
  };

  if (!task) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <form onSubmit={handleSubmit} className="flex flex-col h-full">
          <DialogHeader>
            <DialogTitle>Edit Task</DialogTitle>
            <DialogDescription>
              Modify task details and manage subtasks
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="flex-1 px-1">
            <div className="space-y-6 pr-4">
              {/* Main Task Details */}
              <div className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="Task title"
                    required
                  />
                </div>
                
                <div className="grid gap-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Task description"
                    rows={3}
                  />
                </div>
                
                <div className="grid gap-2">
                  <Label htmlFor="details">Details</Label>
                  <Textarea
                    id="details"
                    value={formData.details}
                    onChange={(e) => setFormData({ ...formData, details: e.target.value })}
                    placeholder="Additional details"
                    rows={3}
                  />
                </div>
                
                <div className="grid gap-2">
                  <Label htmlFor="testStrategy">Test Strategy</Label>
                  <Textarea
                    id="testStrategy"
                    value={formData.testStrategy}
                    onChange={(e) => setFormData({ ...formData, testStrategy: e.target.value })}
                    placeholder="How should this task be tested?"
                    rows={2}
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="priority">Priority</Label>
                    <Select
                      value={formData.priority}
                      onValueChange={(value: "high" | "medium" | "low") => 
                        setFormData({ ...formData, priority: value })
                      }
                    >
                      <SelectTrigger id="priority">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="high">🔴 High</SelectItem>
                        <SelectItem value="medium">🟡 Medium</SelectItem>
                        <SelectItem value="low">🔵 Low</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="grid gap-2">
                    <Label htmlFor="status">Status</Label>
                    <Select
                      value={formData.status}
                      onValueChange={(value: typeof formData.status) => 
                        setFormData({ ...formData, status: value })
                      }
                    >
                      <SelectTrigger id="status">
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
                </div>
              </div>

              <Separator />

              {/* Subtasks Section */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Subtasks</h3>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddSubtask}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add Subtask
                  </Button>
                </div>

                {showSubtaskForm && editingSubtask && (
                  <Card>
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
                        />
                      </div>
                      
                      <div className="grid gap-2">
                        <Label htmlFor="subtask-test">Test Strategy</Label>
                        <Input
                          id="subtask-test"
                          value={editingSubtask.testStrategy}
                          onChange={(e) => setEditingSubtask({ ...editingSubtask, testStrategy: e.target.value })}
                          placeholder="How to test this subtask"
                        />
                      </div>
                      
                      <div className="grid gap-2">
                        <Label htmlFor="subtask-status">Status</Label>
                        <Select
                          value={editingSubtask.status}
                          onValueChange={(value: typeof editingSubtask.status) => 
                            setEditingSubtask({ ...editingSubtask, status: value })
                          }
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
                      
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setShowSubtaskForm(false);
                            setEditingSubtask(null);
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={handleSaveSubtask}
                        >
                          Save Subtask
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Subtasks List */}
                <div className="space-y-2">
                  {subtasks.map((subtask) => (
                    <Card key={subtask.id} className="p-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            {getStatusIcon(subtask.status)}
                            <span className="font-medium text-sm">{subtask.title}</span>
                            <Badge variant={getStatusColor(subtask.status)} className="text-xs">
                              {subtask.status}
                            </Badge>
                          </div>
                          {subtask.description && (
                            <p className="text-sm text-muted-foreground ml-6">
                              {subtask.description}
                            </p>
                          )}
                          {subtask.details && (
                            <p className="text-xs text-muted-foreground ml-6">
                              {subtask.details}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditSubtask(subtask)}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteSubtask(subtask.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                  
                  {subtasks.length === 0 && !showSubtaskForm && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No subtasks yet. Click "Add Subtask" to create one.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </ScrollArea>
          
          <DialogFooter className="mt-6">
            <Button
              type="button"
              variant="destructive"
              onClick={handleDeleteTask}
              disabled={isLoading}
            >
              Delete Task
            </Button>
            <div className="flex-1" />
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !formData.title.trim()}>
              {isLoading ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}