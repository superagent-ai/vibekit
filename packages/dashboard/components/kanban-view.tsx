"use client";

import { useEffect, useState, useMemo } from "react";
import { RefreshCw, AlertCircle, CheckCircle, Clock, Circle, X, Settings, Eye, EyeOff, Tag, Plus, Network } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsMobile } from "@/hooks/use-media-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DynamicKanban, type DragEndEvent } from "@/components/ui/shadcn-io/kanban/dynamic-wrapper";
const { Provider: KanbanProvider, Board: KanbanBoard, Header: KanbanHeader, Cards: KanbanCards, Card: KanbanCard } = DynamicKanban;
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { TaskDetailsSheet } from "@/components/task-details-sheet";
import { SubtaskDetailsSheet } from "@/components/subtask-details-sheet";
import { EditTaskDialog } from "@/components/edit-task-dialog";
import { DependenciesSheet } from "@/components/dependencies-sheet";
import type { ManualTask } from "@/lib/projects";

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

interface TaggedTasks {
  tasks: Task[];
  metadata: {
    created: string;
    updated: string;
    description: string;
  };
}

interface TasksData {
  [tag: string]: TaggedTasks;
}

interface KanbanTask {
  id: string;
  name: string;
  column: string;
  task: Task;
  [key: string]: unknown;
}

interface KanbanColumn {
  id: string;
  name: string;
  icon: React.ReactNode;
  [key: string]: unknown;
  color: string;
}

const columns: KanbanColumn[] = [
  { 
    id: "pending", 
    name: "Pending",
    icon: <Circle className="h-4 w-4" />,
    color: "text-gray-600"
  },
  { 
    id: "in-progress", 
    name: "In Progress",
    icon: <Clock className="h-4 w-4" />,
    color: "text-blue-600"
  },
  {
    id: "review",
    name: "Review",
    icon: <AlertCircle className="h-4 w-4" />,
    color: "text-purple-600"
  },
  { 
    id: "done", 
    name: "Done",
    icon: <CheckCircle className="h-4 w-4" />,
    color: "text-green-600"
  },
  {
    id: "deferred",
    name: "Deferred",
    icon: <Clock className="h-4 w-4" />,
    color: "text-yellow-600"
  },
  {
    id: "cancelled",
    name: "Cancelled",
    icon: <X className="h-4 w-4" />,
    color: "text-red-600"
  },
];

interface KanbanViewProps {
  projectId: string;
  projectRoot: string;
  taskSource?: 'taskmaster' | 'manual';
  onCreateTask?: () => void;
}

export function KanbanView({ projectId, projectRoot, taskSource = 'taskmaster', onCreateTask }: KanbanViewProps) {
  const isMobile = useIsMobile();
  
  const [allTasksData, setAllTasksData] = useState<TasksData>({});
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [selectedTag, setSelectedTag] = useState<string>("master");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [kanbanData, setKanbanData] = useState<KanbanTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [selectedTaskParentId, setSelectedTaskParentId] = useState<number | undefined>(undefined);
  const [selectedSubtask, setSelectedSubtask] = useState<Subtask | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [subtaskDialogOpen, setSubtaskDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [dependenciesSheetOpen, setDependenciesSheetOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("pending");
  
  // Column visibility state with default values
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(`kanban-columns-${projectId}`);
      if (saved) {
        return JSON.parse(saved);
      }
    }
    return {
      pending: true,
      'in-progress': true,
      review: true,
      done: true,
      deferred: false,
      cancelled: false,
    };
  });
  
  // Update selected task when tasks are refreshed
  useEffect(() => {
    if (selectedTask && tasks.length > 0) {
      const updatedTask = tasks.find(t => t.id === selectedTask.id);
      if (updatedTask && JSON.stringify(updatedTask) !== JSON.stringify(selectedTask)) {
        console.log('[KanbanView] Updating selected task with refreshed data');
        setSelectedTask(updatedTask);
      }
    }
  }, [tasks]);

  // Convert tasks to kanban format
  const convertTasksToKanbanData = (tasks: Task[]): KanbanTask[] => {
    return tasks.map(task => ({
      id: `task-${task.id}`,
      name: task.title,
      column: task.status,
      task: task,
    }));
  };

  // Fetch tasks from the project's taskmaster file
  const fetchTasks = async (skipLoadingState = false) => {
    try {
      if (!skipLoadingState) {
        setIsLoading(true);
      } else {
        setIsRefreshing(true);
      }
      
      const response = await fetch(`/api/projects/${projectId}/tasks`);
      if (!response.ok) {
        throw new Error("Failed to fetch tasks");
      }
      
      const data = await response.json();
      console.log(`[KanbanView] Fetched tasks for project ${projectId}, taskSource: ${taskSource}:`, data);
      
      if (data.success && data.data) {
        // Check if data is in the old format (single tag) or new format (multiple tags)
        if (data.data.tasks) {
          // Old format - single tag (used for manual tasks and single-tag taskmaster)
          console.log(`[KanbanView] Using single-tag format with ${data.data.tasks.length} tasks`);
          setTasks(data.data.tasks);
          setKanbanData(convertTasksToKanbanData(data.data.tasks));
          setAvailableTags([]);
          setSelectedTag("");
        } else {
          // New format - multiple tags
          setAllTasksData(data.data);
          const tags = Object.keys(data.data);
          setAvailableTags(tags);
          
          // Set initial selected tag (first tag or 'master' if available)
          const initialTag = tags.includes('master') ? 'master' : tags[0];
          if (initialTag && data.data[initialTag]) {
            setSelectedTag(initialTag);
            setTasks(data.data[initialTag].tasks || []);
            setKanbanData(convertTasksToKanbanData(data.data[initialTag].tasks || []));
          }
        }
        setError(null);
      } else if (data.error) {
        setError(data.error);
      }
    } catch (error) {
      console.error("Failed to fetch tasks:", error);
      setError("Failed to load tasks. Make sure .taskmaster/tasks/tasks.json exists in the project.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  // Handle drag event from kanban board
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (!over || active.id === over.id) {
      return;
    }
    
    // Update the kanban data based on the drag event
    const updatedData = kanbanData.map(item => {
      if (item.id === active.id) {
        return { ...item, column: over.id as string };
      }
      return item;
    });
    
    handleDataChange(updatedData);
  };
  
  // Handle drag end to update task status
  const handleDataChange = async (newData: KanbanTask[]) => {
    setKanbanData(newData);
    
    // Find the task that changed status
    const changedTask = newData.find(item => {
      const originalTask = tasks.find(t => `task-${t.id}` === item.id);
      return originalTask && originalTask.status !== item.column;
    });
    
    if (changedTask) {
      // Update local state immediately for responsive UI
      const updatedTasks = tasks.map(task => 
        `task-${task.id}` === changedTask.id 
          ? { ...task, status: changedTask.column as Task["status"] }
          : task
      );
      setTasks(updatedTasks);
      
      // Send update to backend
      try {
        const response = await fetch(`/api/projects/${projectId}/tasks/update`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            taskId: changedTask.task.id,
            status: changedTask.column,
            tag: selectedTag || undefined,
          }),
        });
        
        if (!response.ok) {
          throw new Error("Failed to update task status");
        }
      } catch (error) {
        console.error("Failed to update task status:", error);
        // Revert on error
        fetchTasks(true);
      }
    }
  };

  useEffect(() => {
    fetchTasks();
  }, [projectId]);

  // Group tasks by status for counting
  const taskCounts = useMemo(() => {
    return columns.reduce((acc, col) => {
      acc[col.id] = kanbanData.filter(item => item.column === col.id).length;
      return acc;
    }, {} as Record<string, number>);
  }, [kanbanData]);

  // Count visible tasks
  const visibleTaskCount = useMemo(() => {
    return kanbanData.filter(item => columnVisibility[item.column] !== false).length;
  }, [kanbanData, columnVisibility]);

  // Filter columns based on visibility settings
  const visibleColumns = useMemo(() => {
    return columns.filter(column => columnVisibility[column.id] !== false);
  }, [columnVisibility]);

  const getPriorityColor = (priority: string): "destructive" | "warning" | "success" | "outline" => {
    switch (priority) {
      case "high":
        return "destructive";
      case "medium":
        return "warning";
      case "low":
        return "success";
      default:
        return "outline";
    }
  };

  const handleTaskClick = (task: Task, parentTaskId?: number) => {
    setSelectedTask(task);
    setSelectedTaskParentId(parentTaskId);
    setDialogOpen(true);
  };

  const handleSubtaskClick = (subtask: Subtask) => {
    setSelectedSubtask(subtask);
    setDialogOpen(false);
    // Small delay to allow the task dialog to close before opening subtask dialog
    setTimeout(() => {
      setSubtaskDialogOpen(true);
    }, 100);
  };

  const handleParentTaskClick = () => {
    setSubtaskDialogOpen(false);
    setDialogOpen(true);
  };

  const handleSiblingSubtaskClick = (subtask: Subtask) => {
    // Update subtask selection immediately without closing/reopening dialog
    setSelectedSubtask(subtask);
    // Keep dialog open - no need to toggle
  };

  const toggleColumnVisibility = (columnId: string) => {
    const newVisibility = {
      ...columnVisibility,
      [columnId]: !columnVisibility[columnId],
    };
    setColumnVisibility(newVisibility);
    
    // Save to localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem(`kanban-columns-${projectId}`, JSON.stringify(newVisibility));
    }
  };

  const setAllColumnsVisibility = (visible: boolean) => {
    const newVisibility = columns.reduce((acc, col) => {
      acc[col.id] = visible;
      return acc;
    }, {} as Record<string, boolean>);
    
    setColumnVisibility(newVisibility);
    
    // Save to localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem(`kanban-columns-${projectId}`, JSON.stringify(newVisibility));
    }
  };

  // Handle tag selection change
  const handleTagChange = (newTag: string) => {
    setSelectedTag(newTag);
    if (allTasksData[newTag]) {
      setTasks(allTasksData[newTag].tasks || []);
      setKanbanData(convertTasksToKanbanData(allTasksData[newTag].tasks || []));
    }
  };

  // Render task card content
  const renderTaskCard = (item: KanbanTask) => (
    <div className="space-y-2">
      <div className="flex items-start justify-between">
        <h3 className="font-medium text-sm line-clamp-2 flex-1">{item.task.title}</h3>
        <div className="flex items-center gap-1">
          <Badge variant={getPriorityColor(item.task.priority) as "default" | "secondary" | "destructive" | "warning" | "success" | "outline"} className="text-xs">
            {item.task.priority}
          </Badge>
        </div>
      </div>
      
      {item.task.description && (
        <p className="text-xs text-muted-foreground line-clamp-2">
          {item.task.description}
        </p>
      )}
      
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          {item.task.dependencies.length > 0 && (
            <Badge variant="outline" className="text-xs">
              Deps: {item.task.dependencies.length}
            </Badge>
          )}
          {item.task.subtasks.length > 0 && (
            <Badge variant="outline" className="text-xs">
              Subtasks: {item.task.subtasks.length}
            </Badge>
          )}
        </div>
        <span className="text-muted-foreground">
          #{item.task.id}
        </span>
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center py-8">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">Loading tasks...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center py-8">
        <div className="text-center max-w-md">
          <AlertCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
          <h2 className="text-lg font-semibold mb-2">Unable to Load Tasks</h2>
          <p className="text-muted-foreground mb-4">{error}</p>
          <Button onClick={() => fetchTasks()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {availableTags.length > 0 && taskSource === 'taskmaster' && (
            <Select value={selectedTag} onValueChange={handleTagChange}>
              <SelectTrigger className="w-[180px] h-8">
                <SelectValue placeholder="Select tag">
                  <div className="flex items-center gap-2">
                    <Tag className="h-3 w-3" />
                    <span>{selectedTag}</span>
                  </div>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {availableTags.map((tag) => (
                  <SelectItem key={tag} value={tag}>
                    <div className="flex items-center gap-2">
                      <Tag className="h-3 w-3" />
                      <span>{tag}</span>
                      <Badge variant="secondary" className="ml-auto text-xs">
                        {allTasksData[tag]?.tasks?.length || 0} tasks
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {taskSource === 'manual' && (
            <Badge variant="outline" className="text-xs">
              Manual Tasks Mode
            </Badge>
          )}
          {!isMobile && (
            <span className="text-xs text-muted-foreground">
              {visibleTaskCount} tasks visible
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {taskSource === 'manual' && onCreateTask && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={onCreateTask}
            >
              <Plus className={`${isMobile ? '' : 'mr-2'} h-4 w-4`} />
              {!isMobile && 'New Task'}
            </Button>
          )}
          {taskSource === 'taskmaster' && tasks.length > 0 && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setDependenciesSheetOpen(true)}
            >
              <Network className={`${isMobile ? '' : 'mr-2'} h-4 w-4`} />
              {!isMobile && 'Dependencies'}
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Settings className={`${isMobile ? '' : 'mr-2'} h-4 w-4`} />
                {!isMobile && 'Columns'}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Visible Columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <div className="px-2 pb-2 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 text-xs"
                  onClick={() => setAllColumnsVisibility(true)}
                >
                  <Eye className="mr-1 h-3 w-3" />
                  Show All
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 text-xs"
                  onClick={() => setAllColumnsVisibility(false)}
                >
                  <EyeOff className="mr-1 h-3 w-3" />
                  Hide All
                </Button>
              </div>
              <DropdownMenuSeparator />
              {columns.map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  checked={columnVisibility[column.id] !== false}
                  onCheckedChange={() => toggleColumnVisibility(column.id)}
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2">
                      {column.icon}
                      <span>{column.name}</span>
                    </div>
                    <Badge variant="secondary" className="ml-auto text-xs">
                      {taskCounts[column.id] || 0}
                    </Badge>
                  </div>
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => fetchTasks(true)}
            disabled={isRefreshing}
          >
            <RefreshCw className={`${isMobile ? '' : 'mr-2'} h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            {!isMobile && 'Refresh'}
          </Button>
        </div>
      </div>

      {/* Mobile View - Tabs */}
      {isMobile ? (
        <Tabs 
          value={activeTab} 
          onValueChange={setActiveTab}
          className="h-[calc(100vh-400px)]"
        >
          <TabsList className="grid w-full" style={{ gridTemplateColumns: `repeat(${visibleColumns.length}, 1fr)` }}>
            {visibleColumns.map((column) => (
              <TabsTrigger 
                key={column.id} 
                value={column.id}
                className="text-xs px-2"
              >
                <div className="flex items-center gap-1">
                  {column.icon}
                  <span className="hidden sm:inline">{column.name}</span>
                  <Badge variant="secondary" className="ml-1 h-4 px-1 text-xs">
                    {taskCounts[column.id] || 0}
                  </Badge>
                </div>
              </TabsTrigger>
            ))}
          </TabsList>
          
          {visibleColumns.map((column) => (
            <TabsContent 
              key={column.id} 
              value={column.id}
              className="h-[calc(100%-48px)] overflow-y-auto"
            >
              <div className="space-y-2 p-2">
                {kanbanData
                  .filter(item => item.column === column.id)
                  .map((item) => (
                    <Card 
                      key={item.id} 
                      className="p-3 group cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => handleTaskClick(item.task)}
                    >
                      {renderTaskCard(item)}
                    </Card>
                  ))}
                {kanbanData.filter(item => item.column === column.id).length === 0 && (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    No tasks in {column.name}
                  </div>
                )}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      ) : (
        /* Desktop View - Kanban Board */
        <KanbanProvider
          columns={visibleColumns}
          data={kanbanData}
          onDataChange={handleDragEnd}
          className={`grid gap-4 h-[calc(100vh-400px)] overflow-x-auto ${
            visibleColumns.length === 1 ? 'grid-cols-1' :
            visibleColumns.length === 2 ? 'grid-cols-1 md:grid-cols-2' :
            visibleColumns.length === 3 ? 'grid-cols-1 md:grid-cols-3' :
            visibleColumns.length === 4 ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4' :
            visibleColumns.length === 5 ? 'grid-cols-1 md:grid-cols-3 lg:grid-cols-5' :
            'grid-cols-1 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6'
          }`}
        >
          {(column: KanbanColumn) => (
            <KanbanBoard key={column.id} id={column.id}>
              <KanbanHeader className={`flex items-center justify-between ${column.color}`}>
                <div className="flex items-center gap-2">
                  {column.icon}
                  <span>{column.name}</span>
                </div>
                <Badge variant="secondary" className="ml-auto">
                  {taskCounts[column.id]}
                </Badge>
              </KanbanHeader>
              <KanbanCards id={column.id}>
                {(item: any) => (
                  <KanbanCard 
                    key={item.id}
                    {...item} 
                    className="transition-transform hover:scale-[1.02] group hover:shadow-md"
                    onClick={() => handleTaskClick(item.task)}
                  >
                    {renderTaskCard(item)}
                  </KanbanCard>
                )}
              </KanbanCards>
            </KanbanBoard>
          )}
        </KanbanProvider>
      )}
      
      <TaskDetailsSheet 
        task={selectedTask}
        parentTaskId={selectedTaskParentId}
        allTasks={tasks}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        isManualTask={taskSource === 'manual'}
        projectId={projectId}
        projectRoot={projectRoot}
        projectTag={selectedTag}
        onTaskUpdate={() => fetchTasks(true)}
        onSubtaskClick={handleSubtaskClick}
        onEditClick={() => {
          setEditDialogOpen(true);
        }}
      />
      
      <SubtaskDetailsSheet
        subtask={selectedSubtask}
        parentTask={selectedTask}
        allTasks={tasks}
        open={subtaskDialogOpen}
        onOpenChange={setSubtaskDialogOpen}
        onParentTaskClick={handleParentTaskClick}
        onSiblingSubtaskClick={handleSiblingSubtaskClick}
        projectId={projectId}
        projectRoot={projectRoot}
      />
      
      {taskSource === 'manual' && (
        <EditTaskDialog
          projectId={projectId}
          task={selectedTask as ManualTask}
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          onTaskUpdated={() => {
            // Refresh the tasks
            fetchTasks(true);
            setEditDialogOpen(false);
          }}
        />
      )}

      <DependenciesSheet
        open={dependenciesSheetOpen}
        onOpenChange={setDependenciesSheetOpen}
        tasks={tasks}
        onTaskClick={(task, parentTaskId) => handleTaskClick(task as any, parentTaskId)}
      />
    </div>
  );
}