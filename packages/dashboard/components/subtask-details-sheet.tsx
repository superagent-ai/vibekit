"use client";

import { useState, useEffect } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

export function SubtaskDetailsSheet({ 
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
  console.log("SubtaskDetailsSheet props:", { projectId, projectRoot, open });
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
  
  // Fetch settings and execution history on mount/open
  useEffect(() => {
    if (!open || !subtask || !projectId) return;
    
    // Fetch user settings for defaults
    fetch("/api/settings")
      .then(res => res.json())
      .then(data => {
        console.log("Settings loaded:", data);
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
    
    // Fetch execution history for this subtask
    fetch(`/api/projects/${projectId}/tasks/execution-history?subtaskId=${subtask.id}`)
      .then(res => res.json())
      .then(data => {
        if (data.success && data.executions?.length > 0) {
          setExecutionHistory(data.executions);
          // Set the most recent sessionId for viewing logs
          const mostRecent = data.executions[0];
          if (mostRecent?.sessionId) {
            setSessionId(mostRecent.sessionId);
          }
        }
      })
      .catch(err => {
        console.error("Failed to load execution history:", err);
      });
  }, [open, subtask?.id, projectId]);
  
  // Fetch git branches when projectRoot is available
  useEffect(() => {
    if (!open) return;
    
    console.log("Branch fetch effect - projectRoot:", projectRoot, "open:", open);
    
    if (projectRoot) {
      console.log("Fetching branches for project root:", projectRoot);
      const params = new URLSearchParams({ projectRoot });
      fetch(`/api/projects/${projectId}/git/branches?${params}`)
        .then(res => {
          console.log("Branch fetch response status:", res.status);
          return res.json();
        })
        .then(data => {
          console.log("Branches data received:", data);
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
  }, [open, projectRoot]);
  
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
            {/* Agent Code Generation Card - Only show for pending subtasks */}
            {subtask.status === "pending" && (
              <Card className="border-primary/20 bg-primary/5">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Bot className="h-5 w-5" />
                    Agent Code Generation
                  </CardTitle>
                  <CardDescription>
                    Execute this subtask using an AI agent with your preferred settings
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-3">
                    {/* Agent Selection */}
                    <div className="space-y-2">
                      <Label htmlFor="agent-select" className="text-sm">
                        Agent
                      </Label>
                      <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                        <SelectTrigger id="agent-select" className="w-full">
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
                    <div className="space-y-2">
                      <Label htmlFor="sandbox-select" className="text-sm">
                        Sandbox Provider
                      </Label>
                      <Select value={selectedSandbox} onValueChange={setSelectedSandbox}>
                        <SelectTrigger id="sandbox-select" className="w-full">
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
                    <div className="space-y-2">
                      <Label htmlFor="branch-select" className="text-sm">
                        Base Branch
                      </Label>
                      <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                        <SelectTrigger id="branch-select" className="w-full">
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
                  </div>

                  {/* Execute Button */}
                  <div className="flex justify-end pt-2">
                    <Button
                      onClick={async () => {
                        if (!projectId || !projectRoot) {
                          alert("Project information is missing");
                          return;
                        }
                        
                        setIsExecuting(true);
                        
                        try {
                          console.log("Executing subtask:", {
                            projectId,
                            subtask,
                            agent: selectedAgent,
                            sandbox: selectedSandbox,
                            branch: selectedBranch,
                            projectRoot
                          });
                          
                          const response = await fetch(`/api/projects/${projectId}/execute-subtask`, {
                            method: 'POST',
                            headers: {
                              'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
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
                            }),
                          });
                          
                          const result = await response.json();
                          
                          if (result.success) {
                            console.log("Execution successful:", result);
                            
                            // Store the session ID for real-time log streaming
                            const executionSessionId = result.sessionId || result.analyticsId;
                            if (executionSessionId) {
                              setSessionId(executionSessionId);
                              
                              // Save execution history
                              fetch(`/api/projects/${projectId}/tasks/execution-history`, {
                                method: 'POST',
                                headers: {
                                  'Content-Type': 'application/json',
                                },
                                body: JSON.stringify({
                                  subtaskId: subtask.id,
                                  sessionId: executionSessionId,
                                  timestamp: new Date().toISOString(),
                                  agent: selectedAgent,
                                  sandbox: selectedSandbox,
                                  branch: selectedBranch,
                                  status: 'completed'
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
                            
                            // Switch to logs tab to show output
                            setActiveTab("logs");
                            
                            // TODO: Update subtask status to in-progress or done
                          } else {
                            console.error("Execution failed:", result);
                            alert(`Execution failed: ${result.error || 'Unknown error'}`);
                          }
                        } catch (error: any) {
                          console.error("Failed to execute subtask:", error);
                          alert(`Failed to execute subtask: ${error.message}`);
                        } finally {
                          setIsExecuting(false);
                        }
                      }}
                      disabled={isExecuting || !selectedAgent || !selectedSandbox || !selectedBranch || !projectId || !projectRoot}
                      className="gap-2"
                    >
                      <Play className="h-4 w-4" />
                      {isExecuting ? "Executing..." : "Execute Subtask"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

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
          </div>
          
          {/* Tabs for Logs and Other Subtasks */}
          <Separator className="my-6" />
          
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="logs" className="flex items-center gap-2">
                <ScrollText className="h-4 w-4" />
                Logs
              </TabsTrigger>
              <TabsTrigger value="subtasks" className="flex items-center gap-2">
                <ListChecks className="h-4 w-4" />
                Other Subtasks
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="logs" className="mt-4">
              <div className="border rounded-lg bg-background h-[500px]">
                <ExecutionLogsTable sessionId={sessionId} className="h-full p-4" />
              </div>
              
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
            </TabsContent>
            
            <TabsContent value="subtasks" className="mt-4">
              {siblingSubtasks.length > 0 ? (
                <div className="space-y-2">
                  {siblingSubtasks.map(sibling => {
                    // Find the index of this sibling in the parent's subtasks array
                    const siblingIndex = parentTask.subtasks.findIndex(s => s.id === sibling.id);
                    return (
                      <div
                        key={sibling.id}
                        className="flex items-center justify-between p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
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
                            <p className="text-xs text-muted-foreground mt-1">{sibling.description}</p>
                          )}
                        </div>
                        <Badge className={`text-xs ${getStatusColor(sibling.status)}`}>
                          {sibling.status.replace("-", " ")}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="border rounded-lg p-4 bg-muted/20">
                  <div className="text-center py-8">
                    <ListChecks className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">No other subtasks in this task</p>
                    <p className="text-xs text-muted-foreground mt-2">This is the only subtask for the parent task</p>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}