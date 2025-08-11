"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { 
  ArrowLeft, 
  Folder, 
  Calendar, 
  Tag, 
  FileText, 
  Settings,
  MessageSquare,
  Kanban,
  Edit,
  ExternalLink,
  GitBranch,
  GitCommit,
  Clock,
  CheckCircle,
  AlertCircle,
  User,
  Hash,
  Info,
  ListTodo
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CommitDetailsSheet } from "@/components/commit-details-sheet";
import type { Project } from "@/lib/projects";

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params ? (Array.isArray(params.projectId) ? params.projectId[0] : params.projectId as string) : '';
  
  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [taskStats, setTaskStats] = useState<any>(null);
  const [gitCommits, setGitCommits] = useState<any[]>([]);
  const [isLoadingCommits, setIsLoadingCommits] = useState(false);
  const [selectedCommit, setSelectedCommit] = useState<any>(null);
  const [commitSheetOpen, setCommitSheetOpen] = useState(false);

  // Fetch project details
  const fetchProject = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/projects/${projectId}`);
      if (!response.ok) throw new Error("Failed to fetch project");
      const data = await response.json();
      if (data.success) {
        setProject(data.data);
      } else {
        setError(data.error || "Failed to load project");
      }
    } catch (error) {
      console.error("Failed to fetch project:", error);
      setError("Failed to load project details");
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch task statistics
  const fetchTaskStats = async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}/tasks`);
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data) {
          // Calculate task statistics
          let tasks = [];
          if (data.data.tasks) {
            // Old format
            tasks = data.data.tasks;
          } else {
            // New format - aggregate all tasks from all tags
            tasks = Object.values(data.data).flatMap((tagData: any) => tagData.tasks || []);
          }
          
          const stats = {
            total: tasks.length,
            pending: tasks.filter((t: any) => t.status === 'pending').length,
            inProgress: tasks.filter((t: any) => t.status === 'in-progress').length,
            review: tasks.filter((t: any) => t.status === 'review').length,
            done: tasks.filter((t: any) => t.status === 'done').length,
            deferred: tasks.filter((t: any) => t.status === 'deferred').length,
            cancelled: tasks.filter((t: any) => t.status === 'cancelled').length,
          };
          setTaskStats(stats);
        }
      }
    } catch (error) {
      console.error("Failed to fetch task stats:", error);
    }
  };

  // Fetch git commits
  const fetchGitCommits = async () => {
    try {
      setIsLoadingCommits(true);
      const response = await fetch(`/api/projects/${projectId}/git/commits`);
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setGitCommits(data.data || []);
        }
      }
    } catch (error) {
      console.error("Failed to fetch git commits:", error);
    } finally {
      setIsLoadingCommits(false);
    }
  };

  useEffect(() => {
    fetchProject();
    fetchTaskStats();
    fetchGitCommits();
  }, [projectId]);

  const handleSetAsCurrentProject = async () => {
    try {
      const response = await fetch('/api/projects/current', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ projectId }),
      });
      
      if (response.ok) {
        // Refresh project data to show it's now current
        fetchProject();
      }
    } catch (error) {
      console.error('Failed to set current project:', error);
    }
  };

  const getPriorityColor = (priority: string | undefined) => {
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

  const getPriorityIcon = (priority: string | undefined) => {
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

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto mb-4" />
          <p className="text-muted-foreground">Loading project details...</p>
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center max-w-md">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
            <h2 className="text-lg font-semibold mb-2">Unable to Load Project</h2>
            <p className="text-muted-foreground mb-4">{error || "Project not found"}</p>
            <Button variant="outline" asChild>
              <Link href="/projects">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Projects
              </Link>
            </Button>
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
                <BreadcrumbPage>{project.name}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </header>

      <div className="flex-1 space-y-6 p-2 sm:p-4 pt-0">
        {/* Project Header */}
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{project.name}</h1>
              <Badge variant={project.status === 'active' ? 'default' : 'secondary'}>
                {project.status}
              </Badge>
              {project.priority && (
                <Badge variant={getPriorityColor(project.priority)}>
                  {getPriorityIcon(project.priority)} {project.priority} priority
                </Badge>
              )}
            </div>
            {project.description && (
              <p className="text-muted-foreground">{project.description}</p>
            )}
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <Folder className="h-4 w-4" />
                <code className="text-xs">{project.projectRoot}</code>
              </div>
              <div className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                <span>Created {new Date(project.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-2">
            {project.id !== project.id && (
              <Button variant="outline" onClick={handleSetAsCurrentProject}>
                <CheckCircle className="mr-2 h-4 w-4" />
                Set as Current
              </Button>
            )}
            <Button variant="outline" asChild>
              <Link href={`/projects/${project.id}/chat`}>
                <MessageSquare className="mr-2 h-4 w-4" />
                Chat
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/projects/${project.id}/kanban`}>
                <Kanban className="mr-2 h-4 w-4" />
                Kanban
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/projects">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Link>
            </Button>
          </div>
        </div>

        <Separator />

        {/* Top Section - Project Stats */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {/* Project Status Card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{project.status}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {project.status === 'active' ? 'Currently active' : 'Archived project'}
              </p>
            </CardContent>
          </Card>

          {/* Total Tasks Card */}
          {taskStats && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total Tasks</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{taskStats.total}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {taskStats.done} completed, {taskStats.inProgress} in progress
                </p>
              </CardContent>
            </Card>
          )}

          {/* Priority Card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Priority</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold capitalize">{project.priority || 'Medium'}</span>
                <Badge variant={getPriorityColor(project.priority)}>
                  {getPriorityIcon(project.priority)}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Project priority level
              </p>
            </CardContent>
          </Card>

          {/* Last Updated Card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Last Updated</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {new Date(project.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {new Date(project.updatedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Bottom Section - Tabbed Content */}
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <Info className="h-4 w-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="tasks" className="flex items-center gap-2">
              <ListTodo className="h-4 w-4" />
              Tasks
            </TabsTrigger>
            <TabsTrigger value="git" className="flex items-center gap-2">
              <GitBranch className="h-4 w-4" />
              Git
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">

            {/* Project Path Card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Project Location</CardTitle>
                <CardDescription>File system path and configuration</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Project Root</div>
                  <code className="text-sm bg-muted px-2 py-1 rounded">{project.projectRoot}</code>
                </div>
                {project.gitRepo && (
                  <div>
                    <div className="text-sm text-muted-foreground mb-1 flex items-center gap-1">
                      <GitBranch className="h-3 w-3" />
                      Git Repository
                    </div>
                    <code className="text-sm bg-muted px-2 py-1 rounded">{project.gitRepo}</code>
                  </div>
                )}
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Taskmaster Configuration</div>
                  <code className="text-sm bg-muted px-2 py-1 rounded">
                    {project.projectRoot}/.taskmaster/tasks/tasks.json
                  </code>
                </div>
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Quick Actions</CardTitle>
                <CardDescription>Common actions for this project</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <Button variant="outline" className="justify-start" asChild>
                    <Link href={`/projects/${project.id}/chat`}>
                      <MessageSquare className="mr-2 h-4 w-4" />
                      Open Chat
                    </Link>
                  </Button>
                  <Button variant="outline" className="justify-start" asChild>
                    <Link href={`/projects/${project.id}/kanban`}>
                      <Kanban className="mr-2 h-4 w-4" />
                      View Kanban
                    </Link>
                  </Button>
                  <Button variant="outline" className="justify-start">
                    <Edit className="mr-2 h-4 w-4" />
                    Edit Project
                  </Button>
                  <Button variant="outline" className="justify-start">
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tasks" className="space-y-4">
            {taskStats ? (
              <Card>
                <CardHeader>
                  <CardTitle>Task Overview</CardTitle>
                  <CardDescription>
                    This project has {taskStats.total} tasks tracked in the Taskmaster system
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Pending</p>
                        <p className="text-2xl font-bold">{taskStats.pending}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">In Progress</p>
                        <p className="text-2xl font-bold text-blue-600">{taskStats.inProgress}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Review</p>
                        <p className="text-2xl font-bold text-purple-600">{taskStats.review}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Completed</p>
                        <p className="text-2xl font-bold text-green-600">{taskStats.done}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Deferred</p>
                        <p className="text-2xl font-bold text-yellow-600">{taskStats.deferred}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Cancelled</p>
                        <p className="text-2xl font-bold text-red-600">{taskStats.cancelled}</p>
                      </div>
                    </div>
                    <Separator />
                    <div className="flex justify-center">
                      <Button asChild>
                        <Link href={`/projects/${project.id}/kanban`}>
                          <Kanban className="mr-2 h-4 w-4" />
                          View Kanban
                        </Link>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>Task Overview</CardTitle>
                  <CardDescription>No task data available for this project</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Tasks will appear here once you create a Taskmaster configuration for this project.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="git" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Git History</CardTitle>
                <CardDescription>
                  Recent commits from the project repository
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingCommits ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="text-center">
                      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto mb-4" />
                      <p className="text-muted-foreground">Loading commit history...</p>
                    </div>
                  </div>
                ) : gitCommits.length > 0 ? (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[100px]">Hash</TableHead>
                          <TableHead>Message</TableHead>
                          <TableHead>Author</TableHead>
                          <TableHead className="text-right">Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {gitCommits.slice(0, 20).map((commit) => (
                          <TableRow 
                            key={commit.hash}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => {
                              setSelectedCommit(commit);
                              setCommitSheetOpen(true);
                            }}>
                            <TableCell className="font-mono text-xs">
                              <div className="flex items-center gap-1">
                                <GitCommit className="h-3 w-3 text-muted-foreground" />
                                {commit.hash.substring(0, 7)}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="max-w-[500px]">
                                <p className="truncate text-sm">{commit.message}</p>
                                {commit.body && (
                                  <p className="text-xs text-muted-foreground truncate">{commit.body}</p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <User className="h-3 w-3 text-muted-foreground" />
                                <span className="text-sm">{commit.author}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right text-sm text-muted-foreground">
                              {new Date(commit.date).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <GitBranch className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-muted-foreground">
                      No git history available for this project
                    </p>
                    <p className="text-sm text-muted-foreground mt-2">
                      Make sure this project is initialized as a git repository
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Project Settings</CardTitle>
                <CardDescription>Configure project-specific settings and preferences</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Project Details</h3>
                  <div className="grid gap-2">
                    <div className="flex justify-between items-center py-2">
                      <span className="text-sm">Project ID</span>
                      <code className="text-xs bg-muted px-2 py-1 rounded">{project.id}</code>
                    </div>
                    <div className="flex justify-between items-center py-2">
                      <span className="text-sm">Created</span>
                      <span className="text-sm text-muted-foreground">
                        {new Date(project.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-2">
                      <span className="text-sm">Last Modified</span>
                      <span className="text-sm text-muted-foreground">
                        {new Date(project.updatedAt).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
                <Separator />
                <div className="flex gap-2">
                  <Button variant="outline">
                    <Edit className="mr-2 h-4 w-4" />
                    Edit Project
                  </Button>
                  <Button variant="outline" className="text-destructive hover:text-destructive">
                    Delete Project
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <CommitDetailsSheet
        projectId={projectId}
        commit={selectedCommit}
        open={commitSheetOpen}
        onOpenChange={setCommitSheetOpen}
      />
    </div>
  );
}