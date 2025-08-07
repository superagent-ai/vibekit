"use client";

import { useEffect, useState, useMemo } from "react";
import { Plus, LayoutGrid, List, Search, X, CheckCircle, RefreshCw, GripVertical } from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProjectCard } from "@/components/project-card";
import { ProjectForm } from "@/components/project-form";
import type { Project } from "@/lib/projects";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import {
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface SortableRowProps {
  project: Project;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onEdit: (project: Project) => void;
  onDelete: (id: string) => void;
}

function SortableTableRow({ project, isSelected, onSelect, onEdit, onDelete }: SortableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: project.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <TableRow 
      ref={setNodeRef}
      style={style}
      className={`hover:bg-muted/50 transition-colors cursor-pointer ${
        isSelected ? 'bg-primary/5' : ''
      } ${isDragging ? 'shadow-lg' : ''}`}
      onClick={() => onSelect(project.id)}
    >
      <TableCell className="w-10">
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab hover:cursor-grabbing touch-none"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
      </TableCell>
      <TableCell className="font-medium">
        <div className="flex items-center gap-2">
          {isSelected && (
            <CheckCircle className="h-4 w-4 text-primary flex-shrink-0" />
          )}
          <div>
            <div>{project.name}</div>
            {project.description && (
              <div className="text-xs text-muted-foreground mt-1">
                {project.description}
              </div>
            )}
          </div>
        </div>
      </TableCell>
      <TableCell>
        <code className="text-xs">{project.projectRoot}</code>
      </TableCell>
      <TableCell>
        <Badge 
          variant={project.status === 'active' ? 'default' : 'secondary'}
          className={project.status === 'active' ? 'bg-green-100 text-green-800 hover:bg-green-100' : ''}
        >
          {project.status}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1">
          {project.tags?.slice(0, 2).map((tag) => (
            <Badge key={tag} variant="outline" className="text-xs">
              {tag}
            </Badge>
          ))}
          {project.tags && project.tags.length > 2 && (
            <Badge variant="outline" className="text-xs">
              +{project.tags.length - 2}
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {new Date(project.createdAt).toLocaleDateString()}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(project);
            }}
          >
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(project.id);
            }}
            className="text-destructive hover:text-destructive"
          >
            Delete
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [lastModified, setLastModified] = useState<string | null>(null);
  const [currentProjectLastModified, setCurrentProjectLastModified] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isReordering, setIsReordering] = useState(false);
  const [viewMode, setViewMode] = useState<'card' | 'list'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('projectsViewMode') as 'card' | 'list') || 'card';
    }
    return 'card';
  });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleViewModeChange = (mode: 'card' | 'list') => {
    setViewMode(mode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('projectsViewMode', mode);
    }
  };

  // Filter and sort projects based on search query and rank
  const filteredProjects = useMemo(() => {
    let filtered = projects;
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = projects.filter(project => 
        project.name.toLowerCase().includes(query) ||
        project.description?.toLowerCase().includes(query) ||
        project.projectRoot.toLowerCase().includes(query) ||
        project.tags?.some(tag => tag.toLowerCase().includes(query)) ||
        project.status.toLowerCase().includes(query)
      );
    }
    
    // Sort by rank (lower rank = higher priority)
    return filtered.sort((a, b) => {
      const rankA = a.rank ?? Number.MAX_SAFE_INTEGER;
      const rankB = b.rank ?? Number.MAX_SAFE_INTEGER;
      return rankA - rankB;
    });
  }, [projects, searchQuery]);

  const fetchProjects = async (skipLoadingState = false) => {
    try {
      if (!skipLoadingState) {
        setIsLoading(true);
      } else {
        // Show refresh indicator for background updates
        setIsRefreshing(true);
      }
      const response = await fetch('/api/projects');
      const data = await response.json();
      if (data.success) {
        // Only update if data has changed
        if (data.lastModified !== lastModified) {
          setProjects(data.data);
          setLastModified(data.lastModified);
          
          // Flash the refresh indicator when data updates
          if (skipLoadingState) {
            setTimeout(() => setIsRefreshing(false), 500);
          }
        } else {
          // No changes, hide refresh indicator
          setIsRefreshing(false);
        }
      }
    } catch (error) {
      console.error('Failed to fetch projects:', error);
      setIsRefreshing(false);
    } finally {
      if (!skipLoadingState) {
        setIsLoading(false);
      }
    }
  };

  const fetchCurrentProject = async () => {
    try {
      const response = await fetch('/api/projects/current');
      const data = await response.json();
      if (data.success) {
        // Only update if data has changed
        if (data.lastModified !== currentProjectLastModified) {
          setCurrentProject(data.data);
          setCurrentProjectLastModified(data.lastModified);
        }
      }
    } catch (error) {
      console.error('Failed to fetch current project:', error);
    }
  };

  useEffect(() => {
    fetchProjects();
    fetchCurrentProject();
  }, []);
  
  // Set up Server-Sent Events for real-time updates
  useEffect(() => {
    let eventSource: EventSource | null = null;
    let reconnectTimer: NodeJS.Timeout | null = null;
    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 10;
    const INITIAL_RECONNECT_DELAY = 1000;
    const MAX_RECONNECT_DELAY = 30000;
    
    const connectSSE = () => {
      // Don't reconnect if we've exceeded max attempts
      if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.error('Max SSE reconnection attempts reached');
        return;
      }
      
      eventSource = new EventSource('/api/ws');
      
      eventSource.onopen = () => {
        console.log('SSE connection established');
        reconnectAttempts = 0; // Reset on successful connection
      };
      
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'connected') {
            console.log('SSE connected to file watcher');
          } else if (data.type === 'error') {
            console.error('SSE server error:', data.message);
          } else if (data.type === 'projects-updated' || data.type === 'projects-cleared') {
            // Fetch updated projects
            fetchProjects(true);
          } else if (data.type === 'current-project-updated' || data.type === 'current-project-cleared') {
            // Fetch updated current project
            fetchCurrentProject();
          }
        } catch (error) {
          console.error('Error parsing SSE message:', error);
        }
      };
      
      eventSource.onerror = (error) => {
        console.error('SSE connection error:', error);
        eventSource?.close();
        eventSource = null;
        
        // Calculate exponential backoff delay
        const delay = Math.min(
          INITIAL_RECONNECT_DELAY * Math.pow(2, reconnectAttempts),
          MAX_RECONNECT_DELAY
        );
        
        reconnectAttempts++;
        console.log(`Reconnecting SSE in ${delay}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
        
        // Reconnect after a delay with exponential backoff
        reconnectTimer = setTimeout(() => {
          connectSSE();
        }, delay);
      };
    };
    
    connectSSE();
    
    // Clean up on unmount
    return () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      eventSource?.close();
    };
  }, []); // Empty dependency array - set up once

  const handleCreateProject = async (projectData: any) => {
    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(projectData),
      });
      
      if (response.ok) {
        await fetchProjects();
        setShowForm(false);
      }
    } catch (error) {
      console.error('Failed to create project:', error);
    }
  };

  const handleUpdateProject = async (id: string, projectData: any) => {
    try {
      const response = await fetch(`/api/projects/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(projectData),
      });
      
      if (response.ok) {
        await fetchProjects();
        setEditingProject(null);
      }
    } catch (error) {
      console.error('Failed to update project:', error);
    }
  };

  const handleDeleteProject = async (id: string) => {
    if (!confirm('Are you sure you want to delete this project?')) {
      return;
    }

    try {
      const response = await fetch(`/api/projects/${id}`, {
        method: 'DELETE',
      });
      
      if (response.ok) {
        await fetchProjects();
      }
    } catch (error) {
      console.error('Failed to delete project:', error);
    }
  };

  const handleSelectProject = async (projectId: string) => {
    try {
      const response = await fetch('/api/projects/current', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ projectId }),
      });
      
      if (response.ok) {
        const data = await response.json();
        setCurrentProject(data.data);
      }
    } catch (error) {
      console.error('Failed to select project:', error);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = filteredProjects.findIndex((p) => p.id === active.id);
    const newIndex = filteredProjects.findIndex((p) => p.id === over.id);

    if (oldIndex === -1 || newIndex === -1) {
      return;
    }

    // Reorder the projects locally
    const reorderedProjects = arrayMove(filteredProjects, oldIndex, newIndex);
    
    // Update ranks based on new order
    const updatedProjects = reorderedProjects.map((project, index) => ({
      ...project,
      rank: index
    }));

    // Update local state immediately for responsive UI
    setProjects(updatedProjects);
    setIsReordering(true);

    // Update the ranks in the backend
    try {
      const response = await fetch('/api/projects/reorder', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projects: updatedProjects.map(p => ({ id: p.id, rank: p.rank }))
        }),
      });
      
      if (response.ok) {
        // Show success briefly
        setTimeout(() => setIsReordering(false), 500);
      } else {
        throw new Error('Failed to reorder');
      }
    } catch (error) {
      console.error('Failed to update project order:', error);
      setIsReordering(false);
      // Refresh to get the correct state from backend
      await fetchProjects(true);
    }
  };

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
        <div className="flex items-center gap-2 px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator
            orientation="vertical"
            className="mr-2 data-[orientation=vertical]:h-4"
          />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem className="hidden md:block">
                <BreadcrumbLink href="/">
                  VibeKit Dashboard
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem>
                <BreadcrumbPage>Projects</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </header>

      <div className="flex-1 space-y-4 p-4 pt-0">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-3xl font-bold tracking-tight">Projects</h2>
              {isRefreshing && (
                <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
              {isReordering && (
                <span className="text-sm text-green-600 animate-pulse">✓ Order saved</span>
              )}
            </div>
            <p className="text-muted-foreground">
              Manage your development projects and their configurations. Updates in real-time.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Search Box */}
            <div className="relative w-64">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 pl-8 pr-8 text-sm"
              />
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute right-0.5 top-1/2 h-7 w-7 -translate-y-1/2 p-0"
                  onClick={() => setSearchQuery('')}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
            
            {/* View Toggle */}
            <div className="flex items-center rounded-md bg-muted p-1">
              <Button
                variant={viewMode === 'card' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => handleViewModeChange('card')}
                className="h-7 px-2 rounded-sm"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => handleViewModeChange('list')}
                className="h-7 px-2 rounded-sm"
              >
                <List className="h-3.5 w-3.5" />
              </Button>
            </div>
            
            {/* New Project Button */}
            <Button onClick={() => setShowForm(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New Project
            </Button>
          </div>
        </div>

        {/* Show current project and filter results */}
        <div className="flex items-center justify-between">
          {currentProject && (
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle className="h-4 w-4 text-primary" />
              <span className="text-muted-foreground">Current project:</span>
              <span className="font-medium">{currentProject.name}</span>
            </div>
          )}
          {searchQuery && filteredProjects.length !== projects.length && (
            <p className="text-sm text-muted-foreground ml-auto">
              Showing {filteredProjects.length} of {projects.length} projects
            </p>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <p className="text-muted-foreground">Loading projects...</p>
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 space-y-2">
            <p className="text-muted-foreground">No projects found</p>
            <Button variant="outline" onClick={() => setShowForm(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create your first project
            </Button>
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 space-y-2">
            <p className="text-muted-foreground">No projects match your search</p>
            <Button variant="outline" size="sm" onClick={() => setSearchQuery('')}>
              Clear search
            </Button>
          </div>
        ) : viewMode === 'card' ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                isSelected={currentProject?.id === project.id}
                onEdit={(project) => setEditingProject(project)}
                onDelete={(id) => handleDeleteProject(id)}
                onSelect={(id) => handleSelectProject(id)}
              />
            ))}
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Path</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Tags</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <SortableContext
                    items={filteredProjects.map(p => p.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {filteredProjects.map((project) => (
                      <SortableTableRow
                        key={project.id}
                        project={project}
                        isSelected={currentProject?.id === project.id}
                        onSelect={handleSelectProject}
                        onEdit={setEditingProject}
                        onDelete={handleDeleteProject}
                      />
                    ))}
                  </SortableContext>
                </TableBody>
              </Table>
            </div>
          </DndContext>
        )}

        {showForm && (
          <ProjectForm
            onSubmit={handleCreateProject}
            onCancel={() => setShowForm(false)}
          />
        )}

        {editingProject && (
          <ProjectForm
            project={editingProject}
            onSubmit={(data) => handleUpdateProject(editingProject.id, data)}
            onCancel={() => setEditingProject(null)}
          />
        )}
      </div>
    </div>
  );
}