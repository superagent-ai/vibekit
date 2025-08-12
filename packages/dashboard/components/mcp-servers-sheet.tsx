"use client";

import { useState, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { 
  Server, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  Settings,
  Plus,
  Search,
  Info,
  RefreshCw,
  Wrench,
  FileText,
  MessageSquare
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Project } from "@/lib/projects";

interface MCPServer {
  id: string;
  name: string;
  description?: string;
  transport: 'stdio' | 'sse' | 'http';
  config: {
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;
  };
  status: 'active' | 'inactive' | 'error' | 'connecting' | 'disconnected';
  toolCount?: number;
  resourceCount?: number;
  promptCount?: number;
  error?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface MCPServersSheetProps {
  project: Project;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSettingsUpdate?: () => void;
}

export function MCPServersSheet({ 
  project, 
  open, 
  onOpenChange,
  onSettingsUpdate 
}: MCPServersSheetProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [availableServers, setAvailableServers] = useState<MCPServer[]>([]);
  const [projectMCPSettings, setProjectMCPSettings] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Fetch installed MCP servers from the system
  const fetchMCPServers = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/mcp/servers');
      if (response.ok) {
        const data = await response.json();
        console.log('[MCP Servers Sheet] Fetched servers:', data);
        
        // The API returns { servers: [...] }
        if (data.servers && Array.isArray(data.servers)) {
          setAvailableServers(data.servers);
        } else {
          console.warn('[MCP Servers Sheet] Unexpected response format:', data);
          setAvailableServers([]);
        }
      } else {
        console.error('[MCP Servers Sheet] Failed to fetch servers:', response.status);
      }
    } catch (error) {
      console.error('[MCP Servers Sheet] Failed to fetch MCP servers:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Load project's MCP settings
  const loadProjectMCPSettings = () => {
    // Load saved settings or initialize as all disabled
    if (project.mcpServers) {
      setProjectMCPSettings(project.mcpServers);
    } else {
      // Initialize all servers as disabled for new projects
      const initialSettings: Record<string, boolean> = {};
      availableServers.forEach(server => {
        initialSettings[server.id] = false;
      });
      setProjectMCPSettings(initialSettings);
    }
  };

  useEffect(() => {
    if (open) {
      fetchMCPServers();
    }
  }, [open]);
  
  // Load settings after servers are fetched
  useEffect(() => {
    if (availableServers.length > 0) {
      loadProjectMCPSettings();
    }
  }, [availableServers, project.id]);

  // Handle toggle of MCP server for the project
  const handleToggleServer = async (serverId: string) => {
    const server = availableServers.find(s => s.id === serverId);
    if (!server) return;
    
    // Check current project setting (not server status)
    const isCurrentlyEnabled = projectMCPSettings[serverId] || false;
    const newEnabledState = !isCurrentlyEnabled;
    
    // Update project settings immediately for responsive UI
    const newSettings = {
      ...projectMCPSettings,
      [serverId]: newEnabledState
    };
    setProjectMCPSettings(newSettings);
    
    // Save project settings (this just saves the preference, doesn't connect/disconnect)
    try {
      const saveResponse = await fetch(`/api/projects/${project.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mcpServers: newSettings }),
      });
      
      if (!saveResponse.ok) {
        const errorText = await saveResponse.text();
        console.error('Failed to save project settings:', saveResponse.status, errorText);
        // Revert on error
        setProjectMCPSettings(prev => ({
          ...prev,
          [serverId]: isCurrentlyEnabled
        }));
        alert(`Failed to save settings: ${errorText}`);
      } else {
        console.log(`[MCP Servers Sheet] Server ${serverId} ${newEnabledState ? 'enabled' : 'disabled'} for project`);
      }
    } catch (err) {
      console.error('Failed to save project settings:', err);
      // Revert on error
      setProjectMCPSettings(prev => ({
        ...prev,
        [serverId]: isCurrentlyEnabled
      }));
      alert('Failed to save settings. Please try again.');
    }
    
    // Note: We're NOT connecting/disconnecting servers here
    // The chat handler will filter based on project settings
    // Servers remain connected globally for use by other projects
  };

  // Close the sheet (settings are saved automatically on toggle)
  const handleClose = () => {
    onSettingsUpdate?.();
    onOpenChange(false);
  };

  // Refresh MCP servers list
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchMCPServers();
    setIsRefreshing(false);
  };

  // Filter servers based on search query
  const filteredServers = availableServers.filter(server => {
    const query = searchQuery.toLowerCase();
    return (
      server.name.toLowerCase().includes(query) ||
      server.description?.toLowerCase().includes(query)
    );
  });

  // Count enabled servers for this project
  const enabledCount = Object.values(projectMCPSettings).filter(Boolean).length;
  // Count globally connected servers (for information)
  const globallyConnectedCount = availableServers.filter(s => s.status === 'active').length;

  const getServerStatusIcon = (server: MCPServer) => {
    // Show actual connection status
    switch (server.status) {
      case 'active':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      case 'connecting':
        return <RefreshCw className="h-4 w-4 text-blue-600 animate-spin" />;
      case 'disconnected':
        return <XCircle className="h-4 w-4 text-gray-600" />;
      default:
        return <Server className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getServerStatusText = (server: MCPServer, isEnabled: boolean) => {
    // Show if enabled for project and global connection status
    const projectStatus = isEnabled ? "Enabled for project" : "Disabled for project";
    const connectionStatus = server.status === 'active' ? "connected" : "not connected";
    
    if (!isEnabled) {
      return projectStatus;
    }
    
    return `${projectStatus} (${connectionStatus})`;
  };
  
  const getCapabilitiesText = (server: MCPServer) => {
    const capabilities = [];
    if (server.toolCount && server.toolCount > 0) {
      capabilities.push(`${server.toolCount} tool${server.toolCount !== 1 ? 's' : ''}`);
    }
    if (server.resourceCount && server.resourceCount > 0) {
      capabilities.push(`${server.resourceCount} resource${server.resourceCount !== 1 ? 's' : ''}`);
    }
    if (server.promptCount && server.promptCount > 0) {
      capabilities.push(`${server.promptCount} prompt${server.promptCount !== 1 ? 's' : ''}`);
    }
    return capabilities.length > 0 ? capabilities.join(', ') : null;
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl lg:max-w-3xl">
        <SheetHeader>
          <SheetTitle>MCP Servers for {project.name}</SheetTitle>
          <SheetDescription>
            Choose which MCP (Model Context Protocol) servers this project can use. Enabled servers will be available in the AI chat for this project only. Servers remain connected globally and can be used by multiple projects.
          </SheetDescription>
          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-2">
              <Badge variant={enabledCount > 0 ? "default" : "outline"} className="text-sm">
                {enabledCount} of {availableServers.length} enabled for project
              </Badge>
              {availableServers.length === 0 && (
                <Badge variant="secondary" className="text-sm">
                  No servers installed
                </Badge>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </SheetHeader>

        <div className="py-4 space-y-4">
          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search MCP servers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          <Separator />

          {/* Servers list */}
          <ScrollArea className="h-[calc(100vh-320px)]">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-center">
                  <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">Loading MCP servers...</p>
                </div>
              </div>
            ) : filteredServers.length === 0 ? (
              <div className="text-center py-8">
                <Server className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground mb-2">
                  {searchQuery ? 'No servers found matching your search' : 'No MCP servers installed yet'}
                </p>
                {!searchQuery && (
                  <>
                    <p className="text-sm text-muted-foreground mb-4">
                      Install MCP servers to enhance AI chat capabilities with tools and resources
                    </p>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => window.open('/mcp-servers', '_blank')}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Install MCP Servers
                    </Button>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-3 pr-4">
                {filteredServers.map((server) => {
                  const isEnabledForProject = projectMCPSettings[server.id] || false;
                  const isConnected = server.status === 'active';
                  return (
                    <Card 
                      key={server.id} 
                      className={cn(
                        "p-4 transition-colors",
                        isEnabledForProject && "border-primary/50 bg-primary/5",
                        isEnabledForProject && isConnected && "border-green-500/50 bg-green-500/5"
                      )}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2">
                            {getServerStatusIcon(server)}
                            <span className="text-sm font-medium">
                              {server.name}
                            </span>
                            <Badge variant="outline" className="text-xs">
                              {server.transport}
                            </Badge>
                          </div>
                          
                          {server.description && (
                            <p className="text-xs text-muted-foreground ml-6">
                              {server.description}
                            </p>
                          )}
                          
                          {/* Show capabilities if available */}
                          {getCapabilitiesText(server) && (
                            <div className="flex items-center gap-2 ml-6">
                              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                {server.toolCount && server.toolCount > 0 && (
                                  <span className="flex items-center gap-1">
                                    <Wrench className="h-3 w-3" />
                                    {server.toolCount}
                                  </span>
                                )}
                                {server.resourceCount && server.resourceCount > 0 && (
                                  <span className="flex items-center gap-1">
                                    <FileText className="h-3 w-3" />
                                    {server.resourceCount}
                                  </span>
                                )}
                                {server.promptCount && server.promptCount > 0 && (
                                  <span className="flex items-center gap-1">
                                    <MessageSquare className="h-3 w-3" />
                                    {server.promptCount}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}

                          {server.error && isEnabledForProject && (
                            <div className="flex items-center gap-2 ml-6">
                              <AlertCircle className="h-3 w-3 text-destructive" />
                              <p className="text-xs text-destructive">
                                {server.error}
                              </p>
                            </div>
                          )}

                          <div className="flex items-center gap-4 ml-6 text-xs text-muted-foreground">
                            <span>{getServerStatusText(server, isEnabledForProject)}</span>
                            {server.config.command && (
                              <code className="text-xs bg-muted px-1 py-0.5 rounded">
                                {server.config.command.split('/').pop()}
                              </code>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/50">
                            <Label 
                              htmlFor={`switch-${server.id}`}
                              className="text-sm font-medium cursor-pointer select-none"
                            >
                              Enable
                            </Label>
                            <Switch
                              id={`switch-${server.id}`}
                              checked={isEnabledForProject}
                              onCheckedChange={() => handleToggleServer(server.id)}
                              aria-label={`Toggle ${server.name} for this project`}
                              disabled={server.status === 'connecting'}
                            />
                          </div>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>

        <SheetFooter>
          <div className="flex items-center justify-between w-full">
            <p className="text-xs text-muted-foreground">
              Changes are saved automatically
            </p>
            <Button
              onClick={handleClose}
              variant="default"
            >
              Done
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}