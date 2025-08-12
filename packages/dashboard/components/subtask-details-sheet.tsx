"use client";

import { useState, useEffect } from "react";
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
  const [selectedAgent, setSelectedAgent] = useState<string>("");
  const [selectedSandbox, setSelectedSandbox] = useState<string>("");
  const [selectedBranch, setSelectedBranch] = useState<string>("");
  const [branches, setBranches] = useState<string[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  
  // Fetch settings on mount/open
  useEffect(() => {
    if (!open) return;
    
    // Fetch user settings for defaults
    fetch("/api/settings")
      .then(res => res.json())
      .then(data => {
        setSettings(data);
        setSelectedAgent(data.agents?.defaultAgent || "claude");
        setSelectedSandbox(data.agents?.defaultSandbox || "dagger");
      })
      .catch(err => console.error("Failed to load settings:", err));
  }, [open]);
  
  // Fetch git branches when projectRoot is available
  useEffect(() => {
    if (!open) return;
    
    console.log("Branch fetch effect - projectRoot:", projectRoot, "open:", open);
    
    if (projectRoot) {
      console.log("Fetching branches for project root:", projectRoot);
      const params = new URLSearchParams({ projectRoot });
      fetch(`/api/projects/git/branches?${params}`)
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
            } else if (data.branches[0]) {
              setSelectedBranch(data.branches[0]);
            }
          } else {
            console.warn("No branches found in repository");
            setBranches([]);
            setSelectedBranch('');
          }
        })
        .catch(err => {
          console.error("Failed to load branches:", err);
          setBranches([]);
          setSelectedBranch('');
        });
    } else {
      console.warn("No project root provided to branch fetch effect");
      setBranches([]);
      setSelectedBranch('');
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
                      onClick={() => {
                        setIsExecuting(true);
                        // TODO: Implement actual execution logic
                        console.log("Executing subtask with:", {
                          agent: selectedAgent,
                          sandbox: selectedSandbox,
                          branch: selectedBranch,
                          subtask: subtask,
                        });
                        // Simulate execution
                        setTimeout(() => setIsExecuting(false), 2000);
                      }}
                      disabled={isExecuting || !selectedAgent || !selectedSandbox || !selectedBranch}
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
              <div className="border rounded-lg p-4 bg-muted/20">
                <div className="text-center py-8">
                  <ScrollText className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">No logs available for this subtask</p>
                  <p className="text-xs text-muted-foreground mt-2">Logs will appear here when the subtask is executed</p>
                </div>
              </div>
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