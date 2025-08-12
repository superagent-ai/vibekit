"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, RefreshCw, AlertCircle, CheckCircle, Clock, Circle, X, Settings, Eye, EyeOff, Tag, Info } from "lucide-react";
import Link from "next/link";
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
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { TaskDetailsSheet } from "@/components/task-details-sheet";
import { SubtaskDetailsSheet } from "@/components/subtask-details-sheet";
import type { Project } from "@/lib/projects";

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

// Kanban item type that extends the required properties
interface KanbanTask {
  id: string;
  name: string;
  column: string;
  task: Task;
  [key: string]: unknown; // Allow additional properties for compatibility
}

// Kanban column type
interface KanbanColumn {
  id: string;
  name: string;
  icon: React.ReactNode;
  [key: string]: unknown; // Allow additional properties for compatibility
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

export default function ProjectKanbanPage() {
  const params = useParams();
  const projectId = params ? (Array.isArray(params.projectId) ? params.projectId[0] : params.projectId as string) : '';
  const isMobile = useIsMobile();
  
  const [project, setProject] = useState<Project | null>(null);
  const [allTasksData, setAllTasksData] = useState<TasksData>({});
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [selectedTag, setSelectedTag] = useState<string>("master");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [kanbanData, setKanbanData] = useState<KanbanTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [selectedSubtask, setSelectedSubtask] = useState<Subtask | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [subtaskDialogOpen, setSubtaskDialogOpen] = useState(false);
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("pending");
  
  // Column visibility state with default values
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(`kanban-columns-${projectId}`);
      if (saved) {
        return JSON.parse(saved);
      }
    }
    // Default: show pending, in-progress, review, and done; hide deferred and cancelled
    return {
      pending: true,
      'in-progress': true,
      review: true,
      done: true,
      deferred: false,
      cancelled: false,
    };
  });

  // Convert tasks to kanban format
  const convertTasksToKanbanData = (tasks: Task[]): KanbanTask[] => {
    return tasks.map(task => ({
      id: `task-${task.id}`,
      name: task.title,
      column: task.status,
      task: task,
    }));
  };

  // Fetch project details
  const fetchProject = async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}`);
      if (!response.ok) throw new Error("Failed to fetch project");
      const data = await response.json();
      if (data.success) {
        console.log("Project loaded:", data.data);
        setProject(data.data);
      }
    } catch (error) {
      console.error("Failed to fetch project:", error);
      setError("Failed to load project details");
    }
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
      if (data.success && data.data) {
        // Check if data is in the old format (single tag) or new format (multiple tags)
        if (data.data.tasks) {
          // Old format - single tag
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
        setLastUpdated(new Date());
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

  // Set up SSE for real-time updates
  useEffect(() => {
    let eventSource: EventSource | null = null;
    
    const connectSSE = () => {
      eventSource = new EventSource(`/api/projects/${projectId}/tasks/watch`);
      
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "tasks-updated") {
            fetchTasks(true);
          }
        } catch (error) {
          console.error("Error parsing SSE message:", error);
        }
      };
      
      eventSource.onerror = (error) => {
        console.error("SSE connection error:", error);
        eventSource?.close();
        // Retry connection after 5 seconds
        setTimeout(connectSSE, 5000);
      };
    };
    
    connectSSE();
    
    return () => {
      eventSource?.close();
    };
  }, [projectId]);

  useEffect(() => {
    fetchProject();
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

  // Render task card content (shared between desktop and mobile views)
  const renderTaskCard = (item: KanbanTask) => (
    <div className="space-y-2">
      <div className="flex items-start justify-between">
        <h3 className="font-medium text-sm line-clamp-2 flex-1">{item.task.title}</h3>
        <div className="flex items-center gap-1">
          <Badge variant={getPriorityColor(item.task.priority)} className="text-xs">
            {getPriorityIcon(item.task.priority)} {item.task.priority}
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

  const handleTaskClick = (task: Task) => {
    setSelectedTask(task);
    setDialogOpen(true);
  };

  const handleSubtaskClick = (subtask: Subtask) => {
    console.log("Opening subtask sheet, project:", project);
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
    setSelectedSubtask(subtask);
    setSubtaskDialogOpen(true);
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

  const handleManualRefresh = async () => {
    setIsManualRefreshing(true);
    await fetchTasks(true);
    
    // Keep the animation going for at least 1 second for visual feedback
    setTimeout(() => {
      setIsManualRefreshing(false);
    }, 1000);
  };

  // Handle tag selection change
  const handleTagChange = (newTag: string) => {
    setSelectedTag(newTag);
    if (allTasksData[newTag]) {
      setTasks(allTasksData[newTag].tasks || []);
      setKanbanData(convertTasksToKanbanData(allTasksData[newTag].tasks || []));
    }
  };

  // Filter columns based on visibility settings
  const visibleColumns = useMemo(() => {
    return columns.filter(column => columnVisibility[column.id] !== false);
  }, [columnVisibility]);

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">Loading tasks...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4">
        <header className="flex h-16 shrink-0 items-center gap-2">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink href="/projects">Projects</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>{project?.name || projectId}</BreadcrumbPage>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>Kanban</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>
        
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center max-w-md">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
            <h2 className="text-lg font-semibold mb-2">Unable to Load Tasks</h2>
            <p className="text-muted-foreground mb-4">{error}</p>
            <div className="flex gap-2 justify-center">
              <Button variant="outline" asChild>
                <Link href="/projects">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Projects
                </Link>
              </Button>
              <Button onClick={() => fetchTasks()}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Retry
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <header className="flex h-16 shrink-0 items-center gap-2">
        <div className="flex items-center gap-2 px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem className="hidden md:block">
                <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem>
                <BreadcrumbLink href="/projects">Projects</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{project?.name || "Loading..."}</BreadcrumbPage>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Kanban</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </header>

      <div className="flex-1 space-y-4 p-2 sm:p-4 pt-0">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                Taskmaster Kanban
                {(isRefreshing && !isManualRefreshing) && (
                  <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </h2>
              {/* Only show info icon on smaller screens where path is hidden */}
              {project?.projectRoot && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground lg:hidden"
                      >
                        <Info className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-sm">
                      <p className="text-xs font-mono break-all">
                        {project.projectRoot}/.taskmaster/tasks/tasks.json
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
            {/* Show path inline only on desktop */}
            <p className="text-muted-foreground hidden lg:block">
              {project?.projectRoot && (
                <code className="text-xs">{project.projectRoot}/.taskmaster/tasks/tasks.json</code>
              )}
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            {availableTags.length > 0 && (
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
            {!isMobile && lastUpdated && (
              <span className="text-xs text-muted-foreground">
                Last updated: {lastUpdated.toLocaleTimeString()}
              </span>
            )}
            {!isMobile && (
              <span className="text-xs text-muted-foreground">
                {visibleTaskCount} tasks visible
              </span>
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
                <DropdownMenuSeparator />
                <div className="px-2 py-1.5">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Total tasks:</span>
                    <span>{kanbanData.length}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Visible:</span>
                    <span>{visibleTaskCount}</span>
                  </div>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
            
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleManualRefresh}
              disabled={isManualRefreshing}
            >
              <RefreshCw className={`${isMobile ? '' : 'mr-2'} h-4 w-4 ${isManualRefreshing ? 'animate-spin' : ''}`} />
              {!isMobile && 'Refresh'}
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/projects">
                <ArrowLeft className={`${isMobile ? '' : 'mr-2'} h-4 w-4`} />
                {!isMobile && 'Back'}
              </Link>
            </Button>
          </div>
        </div>

        {/* Mobile View - Tabs */}
        {isMobile ? (
          <Tabs 
            value={activeTab} 
            onValueChange={setActiveTab}
            className="h-[calc(100vh-200px)]"
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
            className={`grid gap-4 h-[calc(100vh-200px)] overflow-x-auto ${
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
          allTasks={tasks}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onSubtaskClick={handleSubtaskClick}
          projectId={projectId}
          onTaskUpdate={() => fetchTasks(true)}
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
          projectRoot={project?.projectRoot}
        />
      </div>
    </div>
  );
}