"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { cn } from "@/lib/utils";

// Extend Day.js with plugins
dayjs.extend(relativeTime);
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ExecutionLogsTable } from "@/components/execution-logs-table";
import { ExecutionsList, type Execution } from "@/components/executions-list";
import { TodoListPanel } from "@/components/todo-list-panel";
import { DockerStatusIndicator } from "@/components/docker-status-indicator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { 
  Hash,
  Link,
  FileText,
  TestTube,
  ArrowLeft,
  ChevronRight,
  AlertCircle,
  ScrollText,
  ListChecks,
  Bot,
  Settings,
  GitBranch,
  Play,
  History,
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
  projectId?: string;
  projectRoot?: string;
}

const SubtaskDetailsSheetComponent = function SubtaskDetailsSheet({ 
  subtask, 
  parentTask, 
  allTasks, 
  open, 
  onOpenChange,
  onParentTaskClick,
  onSiblingSubtaskClick,
  projectId,
  projectRoot
}: SubtaskDetailsSheetProps) {
  const [activeTab, setActiveTab] = useState("logs");
  const [selectedAgent, setSelectedAgent] = useState<string>("claude");
  const [selectedSandbox, setSelectedSandbox] = useState<string>("dagger");
  const [selectedBranch, setSelectedBranch] = useState<string>("main");
  const [branches, setBranches] = useState<string[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionLogs, setExecutionLogs] = useState<string>("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [executionHistory, setExecutionHistory] = useState<any[]>([]);
  const [totalLogCount, setTotalLogCount] = useState<number>(0);
  const [selectedExecution, setSelectedExecution] = useState<Execution | null>(null);
  const [dockerStatus, setDockerStatus] = useState<any>(null);
  const [isDetailsExpanded, setIsDetailsExpanded] = useState(false);
  const [hasMoreDetailsContent, setHasMoreDetailsContent] = useState(false);
  const [detailsContentHeight, setDetailsContentHeight] = useState(80);
  
  // Todo state management
  const [currentTodos, setCurrentTodos] = useState<any[]>([]);
  const [hasTodos, setHasTodos] = useState(false);
  const [todosLastUpdated, setTodosLastUpdated] = useState<string | null>(null);
  
  // Reset state when subtask changes or dialog closes
  useEffect(() => {
    if (!open) {
      // Clear state when dialog closes to prevent stale data
      setSessionId(null);
      setExecutionHistory([]);
      setSelectedExecution(null);
      setTotalLogCount(0);
      setActiveTab("logs"); // Reset to default tab
      setIsExecuting(false); // Reset execution state
      setCurrentTodos([]);
      setHasTodos(false);
      setTodosLastUpdated(null);
      return;
    }
    
    if (!subtask) {
      // Clear state when no subtask selected
      setSessionId(null);
      setExecutionHistory([]);
      setSelectedExecution(null);
      setTotalLogCount(0);
      setCurrentTodos([]);
      setHasTodos(false);
      setTodosLastUpdated(null);
      return;
    }
  }, [open, subtask?.id]);

  // Fetch settings and execution history on mount/open
  useEffect(() => {
    if (!open || !subtask || !projectId) return;
    
    // Reset execution-related state for new subtask
    setSessionId(null);
    setExecutionHistory([]);
    setSelectedExecution(null);
    setTotalLogCount(0);
    
    // Fetch user settings for defaults
    fetch("/api/settings")
      .then(res => res.json())
      .then(data => {
        setSettings(data);
        // Override with user's configured defaults if they exist
        if (data?.agents?.defaultAgent) {
          setSelectedAgent(data.agents.defaultAgent);
        }
        if (data?.agents?.defaultSandbox) {
          setSelectedSandbox(data.agents.defaultSandbox);
        }
      })
      .catch(err => {
        console.error("Failed to load settings:", err);
        // Defaults are already set in useState, so no need to set them again
      });
    
    // Fetch execution history for this specific subtask
    fetch(`/api/projects/${projectId}/tasks/execution-history?subtaskId=${subtask.id}`)
      .then(res => res.json())
      .then(data => {
        if (data.success && data.executions?.length > 0) {
          setExecutionHistory(data.executions);
          // Set the most recent sessionId for viewing logs for THIS subtask
          const mostRecent = data.executions[0];
          if (mostRecent?.sessionId) {
            setSessionId(mostRecent.sessionId);
          }
        } else {
          // No executions for this subtask - ensure sessionId is null
          setSessionId(null);
          setExecutionHistory([]);
        }
      })
      .catch(err => {
        console.error("Failed to load execution history:", err);
        // Reset state on error
        setSessionId(null);
        setExecutionHistory([]);
      });
  }, [open, subtask?.id, projectId]);

  // Fetch Docker status when dialog opens
  useEffect(() => {
    if (!open) return;
    
    const fetchDockerStatus = async () => {
      try {
        const response = await fetch('/api/docker/status');
        const data = await response.json();
        setDockerStatus(data);
      } catch (error) {
        console.error('Failed to fetch Docker status:', error);
        // Set a default status that assumes Docker is available to prevent blocking
        setDockerStatus({
          dockerInstalled: true,
          dockerRunning: true,
          error: null
        });
      }
    };

    fetchDockerStatus();
  }, [open]);
  
  // Fetch git branches when projectRoot is available
  useEffect(() => {
    if (!open) return;
    
    if (projectRoot) {
      const params = new URLSearchParams({ projectRoot });
      fetch(`/api/projects/${projectId}/git/branches?${params}`)
        .then(res => res.json())
        .then(data => {
          if (data.error) {
            console.error("Branch fetch error:", data.error);
          }
          if (data.branches && data.branches.length > 0) {
            setBranches(data.branches);
            // Set default to current branch
            if (data.currentBranch) {
              setSelectedBranch(data.currentBranch);
            } else if (data.branches.includes("main")) {
              setSelectedBranch("main");
            } else if (data.branches.includes("master")) {
              setSelectedBranch("master");
            } else {
              setSelectedBranch(data.branches[0]);
            }
          } else {
            console.warn("No branches found in repository");
            setBranches(["main"]); // Provide a fallback branch
            setSelectedBranch("main");
          }
        })
        .catch(err => {
          console.error("Failed to load branches:", err);
          setBranches(["main"]); // Provide a fallback branch
          setSelectedBranch("main");
        });
    } else {
      console.warn("No project root provided to branch fetch effect");
      setBranches(["main"]); // Provide a fallback branch
      setSelectedBranch("main");
    }
  }, [open, projectRoot, projectId]);

  // Check if details content is longer than the default height
  useEffect(() => {
    if (subtask?.details || subtask?.testStrategy) {
      // Calculate estimated content height based on line count and character width
      const lineHeight = 16; // text-xs line height
      const charsPerLine = 80; // rough estimate for text-xs width
      
      let totalHeight = 0;
      
      // Calculate details height
      if (subtask.details) {
        const detailsLines = subtask.details.split('\n');
        detailsLines.forEach(line => {
          const wrappedLines = Math.ceil(line.length / charsPerLine) || 1;
          totalHeight += wrappedLines * lineHeight;
        });
        
        // Add space for "Details:" header if both exist
        if (subtask.testStrategy) {
          totalHeight += lineHeight;
        }
      }
      
      // Calculate test strategy height
      if (subtask.testStrategy) {
        // Add space for "Test Strategy:" header
        totalHeight += lineHeight;
        
        const testLines = subtask.testStrategy.split('\n');
        testLines.forEach(line => {
          const wrappedLines = Math.ceil(line.length / charsPerLine) || 1;
          totalHeight += wrappedLines * lineHeight;
        });
      }
      
      // Add some padding and spacing
      totalHeight += 24; // Extra padding for spacing between sections
      
      setDetailsContentHeight(totalHeight);
      setHasMoreDetailsContent(totalHeight > 80);
    } else {
      setHasMoreDetailsContent(false);
      setDetailsContentHeight(80);
    }
  }, [subtask?.details, subtask?.testStrategy]);

  // Handle todo updates from logs
  const handleTodoUpdate = useCallback((todos: any[]) => {
    setCurrentTodos(prev => {
      // Only update if the todos actually changed
      if (JSON.stringify(prev) !== JSON.stringify(todos)) {
        setHasTodos(true);
        setTodosLastUpdated(new Date().toISOString());
        return todos;
      }
      return prev;
    });
  }, []);

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

  // Ensure we have valid data before rendering
  if (!subtask || !parentTask) return null;

  // Get sibling subtasks (excluding current)
  const siblingSubtasks = parentTask.subtasks.filter(s => s.id !== subtask.id);
  
  // Helper function to get subtask title by ID (for dependencies)
  const getSubtaskTitle = (subtaskId: number): string => {
    const foundSubtask = parentTask.subtasks.find(s => s.id === subtaskId);
    return foundSubtask ? foundSubtask.title : `Subtask #${subtaskId}`;
  };

  return (
    <Sheet 
      open={open} 
      onOpenChange={(newOpen) => {
        // Ensure proper cleanup when closing
        if (!newOpen) {
          setActiveTab("logs");
          setIsExecuting(false);
        }
        onOpenChange(newOpen);
      }}
    >
      <SheetContent className="w-full sm:max-w-2xl lg:max-w-3xl overflow-hidden p-0">
        <div className="flex flex-col h-full">
          <SheetHeader className="px-6 py-3 border-b">
            <div className="space-y-2">
              {/* Parent Task Reference */}
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (onParentTaskClick) {
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
                  #{parentTask.id}: {parentTask.title}
                </span>
              </div>
              
              {/* Subtask Title and Status */}
              <div className="flex items-start justify-between">
                <div className="space-y-1.5 flex-1 pr-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs font-mono">
                      Task {parentTask.id}.{subtask.id}
                    </Badge>
                    <SheetTitle className="text-lg">
                      <span className="line-clamp-2">{subtask.title}</span>
                    </SheetTitle>
                  </div>
                  {subtask.description && (
                    <p className="text-xs text-muted-foreground pl-2">
                      {subtask.description}
                    </p>
                  )}
                </div>
                <Badge className={`text-xs ${getStatusColor(subtask.status)}`}>
                  {subtask.status.replace("-", " ")}
                </Badge>
              </div>
            </div>
          </SheetHeader>

          {/* Task Details - Fixed, not scrollable */}
          <div className="px-6 lg:px-8 flex-shrink-0">
            <div className="space-y-3 py-2">
            {/* Details & Test Strategy */}
            {(subtask.details || subtask.testStrategy) && (
              <div>
                <h3 className="text-[10px] font-semibold flex items-center gap-1.5 text-muted-foreground uppercase tracking-wider mb-1">
                  <AlertCircle className="h-3 w-3" />
                  Details {subtask.testStrategy && '& Test Strategy'}
                </h3>
                <ScrollArea 
                  className="w-full" 
                  style={{ height: isDetailsExpanded ? `${Math.min(detailsContentHeight, 200)}px` : '80px' }}
                >
                  <div className="text-xs pl-4 pr-3 whitespace-pre-wrap text-muted-foreground space-y-3">
                    {subtask.details && (
                      <div>
                        {subtask.testStrategy && (
                          <div className="font-medium mb-1">Details:</div>
                        )}
                        {subtask.details}
                      </div>
                    )}
                    {subtask.testStrategy && (
                      <div>
                        <div className="font-medium mb-1 flex items-center gap-1">
                          <TestTube className="h-3 w-3" />
                          Test Strategy:
                        </div>
                        {subtask.testStrategy}
                      </div>
                    )}
                  </div>
                </ScrollArea>
                {hasMoreDetailsContent && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 mt-1 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setIsDetailsExpanded(!isDetailsExpanded)}
                  >
                    {isDetailsExpanded ? 'Show Less' : 'Show More'}
                  </Button>
                )}
              </div>
            )}

            {/* Agent Code Generation Card - Only show for pending subtasks */}
            {subtask.status === "pending" && (
              <Card className="border-primary/20 bg-primary/5 p-3">
                <div className="flex gap-2 items-end">
                    {/* Agent Selection */}
                    <div className="flex-1">
                      <Label htmlFor="agent-select" className="text-xs text-muted-foreground">
                        Agent
                      </Label>
                      <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                        <SelectTrigger id="agent-select" className="w-full h-7 text-xs mt-0.5">
                          <SelectValue placeholder="Select agent" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="claude">
                            <div className="flex items-center gap-2">
                              <Bot className="h-4 w-4" />
                              <span>Claude</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="codex">
                            <div className="flex items-center gap-2">
                              <Bot className="h-4 w-4" />
                              <span>Codex</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="gemini">
                            <div className="flex items-center gap-2">
                              <Bot className="h-4 w-4" />
                              <span>Gemini</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="grok">
                            <div className="flex items-center gap-2">
                              <Bot className="h-4 w-4" />
                              <span>Grok</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="opencode">
                            <div className="flex items-center gap-2">
                              <Bot className="h-4 w-4" />
                              <span>OpenCode</span>
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Sandbox Selection */}
                    <div className="flex-1">
                      <Label htmlFor="sandbox-select" className="text-xs text-muted-foreground">
                        Sandbox
                      </Label>
                      <Select value={selectedSandbox} onValueChange={setSelectedSandbox}>
                        <SelectTrigger id="sandbox-select" className="w-full h-7 text-xs mt-0.5">
                          <SelectValue placeholder="Select sandbox" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cloudflare">
                            <div className="flex items-center gap-2">
                              <Settings className="h-4 w-4" />
                              <span>Cloudflare</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="dagger">
                            <div className="flex items-center gap-2">
                              <Settings className="h-4 w-4" />
                              <span>Dagger</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="daytona">
                            <div className="flex items-center gap-2">
                              <Settings className="h-4 w-4" />
                              <span>Daytona</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="e2b">
                            <div className="flex items-center gap-2">
                              <Settings className="h-4 w-4" />
                              <span>E2B</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="northflank">
                            <div className="flex items-center gap-2">
                              <Settings className="h-4 w-4" />
                              <span>Northflank</span>
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Branch Selection */}
                    <div className="flex-1">
                      <Label htmlFor="branch-select" className="text-xs text-muted-foreground">
                        Branch
                      </Label>
                      <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                        <SelectTrigger id="branch-select" className="w-full h-7 text-xs mt-0.5">
                          <SelectValue placeholder="Select branch" />
                        </SelectTrigger>
                        <SelectContent>
                          {branches.length > 0 ? (
                            branches.map(branch => (
                              <SelectItem key={branch} value={branch}>
                                <div className="flex items-center gap-2">
                                  <GitBranch className="h-4 w-4" />
                                  <span>{branch}</span>
                                </div>
                              </SelectItem>
                            ))
                          ) : projectRoot ? (
                            <div className="p-2 text-sm text-muted-foreground text-center">
                              No branches found in repository
                            </div>
                          ) : (
                            <div className="p-2 text-sm text-muted-foreground text-center">
                              No project root available
                            </div>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {/* Execute Button */}
                    <Button
                      onClick={async () => {
                        if (!projectId || !projectRoot) {
                          alert("Project information is missing");
                          return;
                        }
                        
                        setIsExecuting(true);
                        
                        // Switch to logs tab immediately to show real-time updates
                        setActiveTab("logs");
                        
                        try {
                          // Generate session ID immediately to establish SSE connection
                          const executionSessionId = Date.now().toString();
                          console.log("Generated session ID for real-time logging:", executionSessionId);
                          setSessionId(executionSessionId);
                          
                          // Small delay to allow SSE connection to establish
                          await new Promise(resolve => setTimeout(resolve, 100));
                          
                          console.log("Executing subtask:", {
                            projectId,
                            subtask,
                            agent: selectedAgent,
                            sandbox: selectedSandbox,
                            branch: selectedBranch,
                            projectRoot,
                            sessionId: executionSessionId
                          });
                          
                          const response = await fetch(`/api/projects/${projectId}/execute-subtask`, {
                            method: 'POST',
                            headers: {
                              'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                              parentTask: {
                                id: parentTask.id,
                                title: parentTask.title,
                              },
                              subtask: {
                                id: subtask.id,
                                title: subtask.title,
                                description: subtask.description,
                                details: subtask.details,
                                testStrategy: subtask.testStrategy,
                              },
                              agent: selectedAgent,
                              sandbox: selectedSandbox,
                              branch: selectedBranch,
                              projectRoot: projectRoot,
                              sessionId: executionSessionId,
                            }),
                          });
                          
                          const result = await response.json();
                          
                          if (result.success) {
                            console.log("Execution successful:", result);
                            
                            // Verify session ID matches what we sent
                            const returnedSessionId = result.sessionId || result.analyticsId;
                            if (returnedSessionId && returnedSessionId !== executionSessionId) {
                              console.warn("Session ID mismatch:", { sent: executionSessionId, returned: returnedSessionId });
                            }
                            
                            // Save execution history if we have a valid session ID
                            if (executionSessionId) {
                              fetch(`/api/projects/${projectId}/tasks/execution-history`, {
                                method: 'POST',
                                headers: {
                                  'Content-Type': 'application/json',
                                },
                                body: JSON.stringify({
                                  taskId: parentTask.id,
                                  taskTitle: parentTask.title,
                                  subtaskId: subtask.id,
                                  subtaskTitle: subtask.title,
                                  sessionId: executionSessionId,
                                  timestamp: new Date().toISOString(),
                                  agent: selectedAgent,
                                  sandbox: selectedSandbox,
                                  branch: selectedBranch,
                                  status: result.exitCode === 0 ? 'completed' : 'failed',
                                  duration: parseFloat(result.executionTime) * 1000
                                }),
                              }).catch(err => {
                                console.error('Failed to save execution history:', err);
                              });
                            }
                            
                            // Store the execution logs (for fallback if needed)
                            let logs = `=== Execution Summary ===\n`;
                            logs += `Execution Time: ${result.executionTime}s\n`;
                            logs += `Sandbox ID: ${result.sandboxId}\n`;
                            logs += `Exit Code: ${result.exitCode}\n\n`;
                            
                            if (result.stdout) {
                              logs += `=== Output ===\n${result.stdout}\n\n`;
                            }
                            
                            if (result.stderr) {
                              logs += `=== Errors/Warnings ===\n${result.stderr}\n\n`;
                            }
                            
                            if (result.updates && result.updates.length > 0) {
                              logs += `=== Updates ===\n${result.updates.join('\n')}\n`;
                            }
                            
                            setExecutionLogs(logs);
                            
                            // Add to execution history
                            const newExecution: Execution = {
                              id: executionSessionId,
                              sessionId: executionSessionId,
                              timestamp: new Date().toISOString(),
                              agent: selectedAgent,
                              sandbox: selectedSandbox,
                              branch: selectedBranch,
                              status: result.exitCode === 0 ? 'completed' : 'failed',
                              exitCode: result.exitCode,
                              duration: parseFloat(result.executionTime) * 1000
                            };
                            
                            setExecutionHistory(prev => [newExecution, ...prev]);
                            setSelectedExecution(newExecution);
                            
                            // Switch to logs tab to show the execution output
                            setActiveTab("logs");
                            
                            // TODO: Update subtask status to in-progress or done
                          } else {
                            console.error("Execution failed:", result);
                            
                            // Show user-friendly error dialog
                            let errorDialog = result.error || 'Unknown error occurred';
                            
                            if (result.errorType === 'docker_not_running') {
                              errorDialog = `🐳 Docker Not Running\n\n${result.error}\n\nSolution:\n1. Open Docker Desktop\n2. Wait for Docker to start\n3. Try executing again`;
                            } else if (result.errorType === 'auth_error') {
                              errorDialog = `🔑 Authentication Error\n\n${result.error}\n\n${result.details}`;
                            } else if (result.errorType === 'rate_limit') {
                              errorDialog = `⏱️ Rate Limit Exceeded\n\n${result.error}\n\n${result.details}`;
                            } else if (result.errorType === 'network_error') {
                              errorDialog = `🌐 Network Error\n\n${result.error}\n\n${result.details}`;
                            } else if (result.errorType === 'sandbox_error') {
                              errorDialog = `📦 Sandbox Error\n\n${result.error}\n\n${result.details}`;
                            }
                            
                            alert(errorDialog);
                          }
                        } catch (error: any) {
                          console.error("Failed to execute subtask:", error);
                          alert(`Failed to execute subtask: ${error.message}`);
                        } finally {
                          setIsExecuting(false);
                        }
                      }}
                      disabled={isExecuting || !selectedAgent || !selectedSandbox || !selectedBranch || !projectId || !projectRoot || (selectedSandbox === 'dagger' && (!dockerStatus?.dockerRunning || !dockerStatus?.dockerInstalled))}
                      className="gap-1 h-7 text-xs"
                      title={
                        isExecuting ? "Executing..." :
                        !selectedAgent ? "Please select an agent" :
                        !selectedSandbox ? "Please select a sandbox" :
                        !selectedBranch ? "Please select a branch" :
                        !projectId ? "Project ID missing" :
                        !projectRoot ? "Project root missing" :
                        (selectedSandbox === 'dagger' && !dockerStatus?.dockerInstalled) ? "Docker is not installed" :
                        (selectedSandbox === 'dagger' && !dockerStatus?.dockerRunning) ? "Docker is not running" :
                        "Execute subtask"
                      }
                    >
                      <Play className="h-3 w-3" />
                      {isExecuting ? "Executing..." : "Execute"}
                    </Button>
                  </div>
              </Card>
            )}


            {/* Dependencies */}
            {subtask.dependencies && subtask.dependencies.length > 0 && (
              <div>
                <h3 className="text-[10px] font-semibold flex items-center gap-1.5 text-muted-foreground uppercase tracking-wider mb-1">
                  <Link className="h-3 w-3" />
                  Dependencies
                </h3>
                <div className="pl-4">
                  <div className="space-y-0.5">
                    {subtask.dependencies.map(dep => (
                      <div key={dep} className="flex items-center gap-1.5">
                        <Badge variant="outline" className="text-[10px] h-4 px-1">
                          #{dep}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground">
                          {getSubtaskTitle(dep)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            </div>
          </div>

          {/* Tab Navigation - Sticky */}
          <div className="px-6 lg:px-8 py-2 bg-background border-t">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col text-sm text-muted-foreground">
              <TabsList size="xs" variant="line" className="grid grid-cols-3 w-full">
                <TabsTrigger value="logs">
                  <ScrollText />
                  Log ({totalLogCount})
                </TabsTrigger>
                <TabsTrigger value="subtasks">
                  <ListChecks />
                  Subtasks ({parentTask.subtasks.length})
                </TabsTrigger>
                <TabsTrigger value="executions">
                  <History />
                  Executions ({executionHistory.length})
                </TabsTrigger>
              </TabsList>
              
              {/* Tab Content */}
              <div className="flex-1 flex flex-col min-h-0">
                <TabsContent value="logs" className="flex-1 flex flex-col min-h-0 m-0">
                  <ScrollArea className="flex-1">
                    <div className="p-4">
                      {sessionId ? (
                        <div className="border rounded-lg bg-background">
                          <ExecutionLogsTable 
                            key={`${sessionId}-${subtask?.id}`} // Force re-render when session or subtask changes
                            sessionId={sessionId} 
                            className="h-[500px] p-4" 
                            onLogCountChange={setTotalLogCount}
                            onTodoUpdate={handleTodoUpdate}
                          />
                        </div>
                      ) : (
                        <div className="border rounded-lg bg-background h-[500px] p-4 flex items-center justify-center">
                          <div className="text-center text-muted-foreground">
                            <ScrollText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                            <p className="text-sm font-medium mb-1">No execution logs</p>
                            <p className="text-xs">
                              Execute this subtask to see logs here
                            </p>
                          </div>
                        </div>
                      )}
                      
                      {/* Todo List Panel */}
                      {hasTodos && currentTodos.length > 0 && (
                        <div className="mt-4">
                          <TodoListPanel 
                            todos={currentTodos} 
                            lastUpdated={todosLastUpdated || undefined}
                            className="border rounded-lg"
                          />
                        </div>
                      )}
                      
                      {/* Execution History Selector */}
                      {executionHistory.length > 1 && (
                        <div className="mt-4 p-3 border rounded-lg bg-muted/20">
                          <Label className="text-xs font-medium mb-2 block">Previous Executions</Label>
                          <Select value={sessionId || ""} onValueChange={setSessionId}>
                            <SelectTrigger className="w-full text-xs">
                              <SelectValue placeholder="Select execution to view" />
                            </SelectTrigger>
                            <SelectContent>
                              {executionHistory.map((exec, index) => (
                                <SelectItem key={exec.sessionId} value={exec.sessionId}>
                                  <div className="flex items-center justify-between gap-2">
                                    <span title={dayjs(exec.timestamp).format('LLLL')}>
                                      {dayjs(exec.timestamp).fromNow()} - {exec.agent}/{exec.sandbox}
                                    </span>
                                    {index === 0 && (
                                      <Badge variant="outline" className="text-xs ml-2">Latest</Badge>
                                    )}
                                    {exec.status && (
                                      <Badge 
                                        variant="outline" 
                                        className={cn(
                                          "text-xs ml-2",
                                          exec.status === 'completed' ? 'text-green-600 border-green-600' :
                                          exec.status === 'failed' ? 'text-red-600 border-red-600' :
                                          'text-yellow-600 border-yellow-600'
                                        )}
                                      >
                                        {exec.status}
                                      </Badge>
                                    )}
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </TabsContent>
                
                <TabsContent value="subtasks" className="flex-1 flex flex-col min-h-0 m-0">
                  <ScrollArea className="flex-1">
                    <div className="p-4">
                      <div className="space-y-2">
                        {parentTask.subtasks.map((taskSubtask, index) => {
                          const isCurrentSubtask = taskSubtask.id === subtask.id;
                          return (
                            <div
                              key={taskSubtask.id}
                              className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                                isCurrentSubtask 
                                  ? 'border-primary bg-primary/5 cursor-default' 
                                  : 'cursor-pointer hover:bg-muted/50'
                              }`}
                              onClick={() => {
                                if (!isCurrentSubtask && onSiblingSubtaskClick) {
                                  onSiblingSubtaskClick(taskSubtask);
                                }
                              }}
                            >
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <p className={`text-sm font-medium ${isCurrentSubtask ? 'text-primary' : ''}`}>
                                    #{index + 1}. {taskSubtask.title}
                                  </p>
                                  {isCurrentSubtask && (
                                    <Badge variant="outline" className="text-xs">
                                      Current
                                    </Badge>
                                  )}
                                </div>
                                {taskSubtask.description && (
                                  <p className="text-xs text-muted-foreground mt-1">{taskSubtask.description}</p>
                                )}
                              </div>
                              <Badge className={`text-xs ${getStatusColor(taskSubtask.status)}`}>
                                {taskSubtask.status.replace("-", " ")}
                              </Badge>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </ScrollArea>
                </TabsContent>
                
                <TabsContent value="executions" className="flex-1 flex flex-col min-h-0 m-0">
                  <ScrollArea className="flex-1">
                    <div className="p-4">
                      <div className="border rounded-lg bg-background">
                        <div className="p-3 border-b">
                          <h4 className="text-sm font-medium">Execution History</h4>
                          <p className="text-xs text-muted-foreground mt-1">
                            {executionHistory.length > 0 
                              ? "Click on an execution to view its logs in the Logs tab"
                              : "No executions yet for this subtask"
                            }
                          </p>
                        </div>
                        {executionHistory.length > 0 ? (
                          <ExecutionsList 
                            subtaskId={subtask.id}
                            projectId={projectId || ''}
                            selectedExecutionId={selectedExecution?.id}
                            onSelectExecution={(execution) => {
                              setSelectedExecution(execution);
                              setSessionId(execution.sessionId);
                              // Switch to logs tab when selecting an execution
                              setActiveTab("logs");
                            }}
                            className="h-[450px]"
                          />
                        ) : (
                          <div className="h-[450px] flex items-center justify-center">
                            <div className="text-center text-muted-foreground">
                              <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
                              <p className="text-sm font-medium mb-1">No executions yet</p>
                              <p className="text-xs">
                                Execute this subtask to see execution history here
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </ScrollArea>
                </TabsContent>
              </div>
            </Tabs>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

// Memoize the component to prevent unnecessary re-renders
export const SubtaskDetailsSheet = React.memo(SubtaskDetailsSheetComponent, (prevProps, nextProps) => {
  // Custom comparison to prevent re-renders when props haven't meaningfully changed
  return (
    prevProps.subtask?.id === nextProps.subtask?.id &&
    prevProps.parentTask?.id === nextProps.parentTask?.id &&
    prevProps.open === nextProps.open &&
    prevProps.projectId === nextProps.projectId &&
    prevProps.projectRoot === nextProps.projectRoot
  );
});