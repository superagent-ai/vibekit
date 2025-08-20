"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Plus, LayoutGrid, List, Search, X, CheckCircle, RefreshCw, GripVertical, ArrowUpDown, MessageSquare, Kanban, Info, CheckSquare, Github, GitBranch } from "lucide-react";
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

interface GitInfo {
  hasGitRepo: boolean;
  account?: string;
  repo?: string;
  remoteUrl?: string;
}

interface SortableRowProps {
  project: Project;
  gitInfo: GitInfo | null;
}

function SortableTableRow({ project, gitInfo }: SortableRowProps) {
  const router = useRouter();
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
      className={`hover:bg-muted/50 transition-colors cursor-pointer ${isDragging ? 'shadow-lg' : ''}`}
      onClick={() => router.push(`/projects/${project.id}`)}
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
      <TableCell className="hidden md:table-cell">
        {gitInfo?.hasGitRepo && gitInfo.account && gitInfo.repo ? (
          <div className="flex items-center text-xs">
            <Github className="mr-2 h-3 w-3" />
            <span className="truncate max-w-[180px]">{gitInfo.account}/{gitInfo.repo}</span>
          </div>
        ) : gitInfo?.hasGitRepo === false ? (
          <div className="flex items-center text-xs text-muted-foreground/60">
            <GitBranch className="mr-2 h-3 w-3" />
            <span className="truncate max-w-[180px]">No remote repository</span>
          </div>
        ) : (
          <div className="flex items-center text-xs">
            <GitBranch className="mr-2 h-3 w-3" />
            <span className="truncate max-w-[180px]">{project.projectRoot.split('/').pop() || project.projectRoot}</span>
          </div>
        )}
      </TableCell>
      <TableCell>
        <div className="flex gap-1.5">
          {project.priority && (
            <Badge 
              variant={
                project.priority === 'high' ? 'destructive' : 
                project.priority === 'low' ? 'secondary' : 
                'default'
              }
              className={`h-5 text-[10px] px-1.5 ${
                project.priority === 'high' ? 'bg-red-100 text-red-800 hover:bg-red-100' : 
                project.priority === 'low' ? '' : 
                'bg-yellow-100 text-yellow-800 hover:bg-yellow-100'
              }`}
            >
              {project.priority[0].toUpperCase()}
            </Badge>
          )}
          <Badge 
            variant={project.status === 'active' ? 'default' : 'secondary'}
            className={`h-5 text-[10px] px-1.5 ${
              project.status === 'active' ? 'bg-green-100 text-green-800 hover:bg-green-100' : ''
            }`}
          >
            {project.status === 'active' ? '✓' : 'AR'}
          </Badge>
        </div>
      </TableCell>
      <TableCell className="hidden lg:table-cell">
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
      <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
        {new Date(project.createdAt).toLocaleDateString()}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/projects/${project.id}`);
            }}
            title="View project details"
          >
            <Info className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/projects/${project.id}/kanban`);
            }}
            title="View Taskmaster Kanban"
          >
            <Kanban className="h-3 w-3" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [gitInfoMap, setGitInfoMap] = useState<Record<string, GitInfo>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [lastModified, setLastModified] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isReordering, setIsReordering] = useState(false);
  const [sortBy, setSortBy] = useState<'rank' | 'priority' | 'alphabetical'>('rank');
  const [viewMode, setViewMode] = useState<'card' | 'list'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('projectsViewMode') as 'card' | 'list') || 'card';
    }
    return 'card';
  });

  const parseGitUrl = (url: string): { account: string; repo: string } | null => {
    if (!url) return null;
    
    // Handle different Git URL formats
    // SSH: git@github.com:user/repo.git
    // HTTPS: https://github.com/user/repo.git
    // HTTPS without .git: https://github.com/user/repo
    
    let match;
    
    // SSH format
    match = url.match(/git@([^:]+):([^/]+)\/(.+?)(?:\.git)?$/);
    if (match) {
      return { account: match[2], repo: match[3] };
    }
    
    // HTTPS format
    match = url.match(/https?:\/\/([^/]+)\/([^/]+)\/(.+?)(?:\.git)?$/);
    if (match) {
      return { account: match[2], repo: match[3] };
    }
    
    return null;
  };

  const fetchGitInfoForProjects = async (projectList: Project[]) => {
    const gitInfoPromises = projectList.map(async (project) => {
      try {
        const response = await fetch('/api/projects/check-git', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectRoot: project.projectRoot }),
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.hasGitRepo && data.gitInfo?.remoteUrl) {
            const parsed = parseGitUrl(data.gitInfo.remoteUrl);
            return {
              projectId: project.id,
              gitInfo: {
                hasGitRepo: true,
                account: parsed?.account,
                repo: parsed?.repo,
                remoteUrl: data.gitInfo.remoteUrl,
              } as GitInfo
            };
          }
        }
        return {
          projectId: project.id,
          gitInfo: { hasGitRepo: false } as GitInfo
        };
      } catch (error) {
        console.error(`Failed to fetch git info for ${project.name}:`, error);
        return {
          projectId: project.id,
          gitInfo: { hasGitRepo: false } as GitInfo
        };
      }
    });
    
    const gitInfoResults = await Promise.all(gitInfoPromises);
    const gitInfoRecord: Record<string, GitInfo> = {};
    gitInfoResults.forEach(({ projectId, gitInfo }) => {
      gitInfoRecord[projectId] = gitInfo;
    });
    
    setGitInfoMap(gitInfoRecord);
  };

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

  // Filter and sort projects based on search query and selected sort option
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
    
    // Sort based on selected option
    return filtered.sort((a, b) => {
      switch (sortBy) {
        case 'rank':
          // Sort by rank (lower rank = higher priority)
          const rankA = a.rank ?? Number.MAX_SAFE_INTEGER;
          const rankB = b.rank ?? Number.MAX_SAFE_INTEGER;
          return rankA - rankB;
          
        case 'priority':
          // Sort by priority (high > medium > low)
          const priorityOrder = { high: 0, medium: 1, low: 2 };
          const priorityA = priorityOrder[a.priority || 'medium'];
          const priorityB = priorityOrder[b.priority || 'medium'];
          if (priorityA !== priorityB) return priorityA - priorityB;
          // If same priority, sort by name
          return a.name.localeCompare(b.name);
          
        case 'alphabetical':
          // Sort alphabetically by name
          return a.name.localeCompare(b.name);
          
        default:
          return 0;
      }
    });
  }, [projects, searchQuery, sortBy]);

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
          
          // Fetch git info for projects
          fetchGitInfoForProjects(data.data);
          
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


  useEffect(() => {
    fetchProjects();
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

      <div className="flex-1 space-y-4 p-2 sm:p-4 pt-0">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Projects</h2>
              {isRefreshing && (
                <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
              {isReordering && (
                <span className="text-sm text-green-600 animate-pulse">✓ Order saved</span>
              )}
            </div>
            <p className="text-sm sm:text-base text-muted-foreground hidden sm:block">
              Manage your development projects and their configurations.
            </p>
          </div>
          <div className="flex flex-wrap lg:flex-nowrap items-center gap-2">
            {/* Search Box */}
            <div className="relative w-full sm:w-48 lg:w-64 order-last sm:order-none">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 pl-8 pr-8 text-sm"
              />
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute right-0.5 top-1/2 h-6 w-6 -translate-y-1/2 p-0"
                  onClick={() => setSearchQuery('')}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
            
            {/* Sort Options */}
            <div className="flex items-center rounded-md bg-muted p-1">
              <Button
                variant={sortBy === 'rank' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setSortBy('rank')}
                className="h-7 px-3 rounded-sm text-xs font-medium"
                title="Sort by custom rank (drag to reorder)"
              >
                Rank
              </Button>
              <Button
                variant={sortBy === 'priority' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setSortBy('priority')}
                className="h-7 px-3 rounded-sm text-xs font-medium"
                title="Sort by priority"
              >
                Priority
              </Button>
              <Button
                variant={sortBy === 'alphabetical' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setSortBy('alphabetical')}
                className="h-7 px-3 rounded-sm text-xs font-medium"
                title="Sort alphabetically"
              >
                Alpha
              </Button>
            </div>
            
            {/* View Toggle */}
            <div className="flex items-center rounded-md bg-muted p-1">
              <Button
                variant={viewMode === 'card' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => handleViewModeChange('card')}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => handleViewModeChange('list')}
              >
                <List className="h-3.5 w-3.5" />
              </Button>
            </div>
            
            {/* New Project Button */}
            <Button onClick={() => setShowForm(true)} size="sm">
              <Plus className="mr-1 h-3.5 w-3.5" />
              New
            </Button>
          </div>
        </div>

        {/* Show filter results */}
        <div className="flex items-center justify-end">
          {searchQuery && filteredProjects.length !== projects.length && (
            <p className="text-sm text-muted-foreground">
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
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
              />
            ))}
          </div>
        ) : sortBy === 'rank' ? (
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
                    <TableHead className="hidden md:table-cell">Repository</TableHead>
                    <TableHead className="w-20">Status</TableHead>
                    <TableHead className="hidden lg:table-cell">Tags</TableHead>
                    <TableHead className="hidden sm:table-cell">Created</TableHead>
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
                        gitInfo={gitInfoMap[project.id] || null}
                      />
                    ))}
                  </SortableContext>
                </TableBody>
              </Table>
            </div>
          </DndContext>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden md:table-cell">Repository</TableHead>
                  <TableHead className="w-20">Status</TableHead>
                  <TableHead className="hidden lg:table-cell">Tags</TableHead>
                  <TableHead className="hidden sm:table-cell">Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProjects.map((project) => (
                  <TableRow 
                    key={project.id} 
                    className="hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => router.push(`/projects/${project.id}`)}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
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
                    <TableCell className="hidden md:table-cell">
                      <div className="flex items-center text-xs">
                        <GitBranch className="mr-2 h-3 w-3" />
                        <span className="truncate max-w-[180px]">{project.projectRoot.split('/').pop() || project.projectRoot}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1.5">
                        {project.priority && (
                          <Badge 
                            variant={
                              project.priority === 'high' ? 'destructive' : 
                              project.priority === 'low' ? 'secondary' : 
                              'default'
                            }
                            className={`h-5 text-[10px] px-1.5 ${
                              project.priority === 'high' ? 'bg-red-100 text-red-800 hover:bg-red-100' : 
                              project.priority === 'low' ? '' : 
                              'bg-yellow-100 text-yellow-800 hover:bg-yellow-100'
                            }`}
                          >
                            {project.priority[0].toUpperCase()}
                          </Badge>
                        )}
                        <Badge 
                          variant={project.status === 'active' ? 'default' : 'secondary'}
                          className={`h-5 text-[10px] px-1.5 ${
                            project.status === 'active' ? 'bg-green-100 text-green-800 hover:bg-green-100' : ''
                          }`}
                        >
                          {project.status === 'active' ? '✓' : 'AR'}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
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
                    <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                      {new Date(project.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/projects/${project.id}`);
                          }}
                          title="View project details"
                        >
                          <Info className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/projects/${project.id}/kanban`);
                          }}
                          title="View Taskmaster Kanban"
                        >
                          <Kanban className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/projects/${project.id}/chat`);
                          }}
                          title="Open chat for this project"
                        >
                          <MessageSquare className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {showForm && (
          <ProjectForm
            onSubmit={handleCreateProject}
            onCancel={() => setShowForm(false)}
          />
        )}

      </div>
    </div>
  );
}