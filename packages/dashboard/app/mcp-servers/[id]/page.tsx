"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, RefreshCw, Settings, Trash2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ServerStatusBadge } from "@/components/mcp/server-status";
import { ToolCard } from "@/components/mcp/tool-card";
import { ServerForm } from "@/components/mcp/server-form";
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

interface MCPServer {
  id: string;
  name: string;
  description?: string;
  transport: 'stdio' | 'sse' | 'http';
  status: 'active' | 'inactive' | 'error' | 'connecting' | 'disconnected';
  toolCount?: number;
  resourceCount?: number;
  promptCount?: number;
  lastConnected?: string;
  error?: string;
  config: any;
  createdAt?: string;
  updatedAt?: string;
}

interface Tool {
  name: string;
  description?: string;
  inputSchema?: any;
}

interface Resource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

interface Prompt {
  name: string;
  description?: string;
  arguments?: any[];
}

export default function ServerDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const serverId = params?.id as string;
  
  const [server, setServer] = useState<MCPServer | null>(null);
  const [tools, setTools] = useState<Tool[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isToolsLoading, setIsToolsLoading] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('tools');
  const [toolFilter, setToolFilter] = useState('');

  useEffect(() => {
    fetchServerDetails();
  }, [serverId]);

  // Fetch tools when switching to tools tab
  useEffect(() => {
    if (activeTab === 'tools' && server?.status === 'active' && tools.length === 0) {
      fetchTools();
    }
  }, [activeTab, server?.status]);

  const fetchServerDetails = async (isRefreshAction = false) => {
    if (isRefreshAction) setIsRefreshing(true);
    
    try {
      const response = await fetch(`/api/mcp/servers/${serverId}`);
      if (response.ok) {
        const data = await response.json();
        setServer(data.server);
        
        // If refreshing and server is active, force refresh tools
        if (isRefreshAction && data.server.status === 'active') {
          // Clear tools first to show it's refreshing
          setTools([]);
          // Add a small delay to make the refresh visible
          await new Promise(resolve => setTimeout(resolve, 300));
          await fetchTools();
        }
      } else if (response.status === 404) {
        router.push('/mcp-servers');
      }
    } catch (error) {
      console.error('Failed to fetch server:', error);
    } finally {
      setIsLoading(false);
      if (isRefreshAction) {
        // Add a minimum delay to show the animation
        setTimeout(() => setIsRefreshing(false), 500);
      }
    }
  };

  const fetchTools = async () => {
    setIsToolsLoading(true);
    try {
      let response = await fetch(`/api/mcp/servers/${serverId}/tools`);
      
      // If server shows active but isn't connected, try to reconnect
      if (!response.ok && response.status === 400) {
        console.log('Server not connected, attempting to reconnect...');
        const connectResponse = await fetch(`/api/mcp/servers/${serverId}/connect`, {
          method: 'POST',
        });
        
        if (connectResponse.ok) {
          const connectData = await connectResponse.json();
          if (connectData.server) {
            setServer(connectData.server);
          }
          // Try fetching tools again
          response = await fetch(`/api/mcp/servers/${serverId}/tools`);
        }
      }
      
      if (response.ok) {
        const data = await response.json();
        setTools(data.tools || []);
        console.log(`Fetched ${data.tools?.length || 0} tools for server ${serverId}`);
      } else {
        console.error('Failed to fetch tools, status:', response.status);
        const error = await response.json();
        console.error('Error:', error);
        setTools([]);
      }
    } catch (error) {
      console.error('Failed to fetch tools:', error);
      setTools([]);
    } finally {
      setIsToolsLoading(false);
    }
  };

  const handleConnect = async () => {
    try {
      const response = await fetch(`/api/mcp/servers/${serverId}/connect`, {
        method: 'POST',
      });
      
      if (response.ok) {
        const data = await response.json();
        // Update server immediately with new counts
        if (data.server) {
          setServer(data.server);
        }
        // Fetch full details including tools
        await fetchServerDetails();
      }
    } catch (error) {
      console.error('Failed to connect:', error);
    }
  };

  const handleDisconnect = async () => {
    try {
      const response = await fetch(`/api/mcp/servers/${serverId}/disconnect`, {
        method: 'POST',
      });
      
      if (response.ok) {
        await fetchServerDetails();
      }
    } catch (error) {
      console.error('Failed to disconnect:', error);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete "${server?.name}"?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/mcp/servers/${serverId}`, {
        method: 'DELETE',
      });
      
      if (response.ok) {
        router.push('/mcp-servers');
      }
    } catch (error) {
      console.error('Failed to delete server:', error);
    }
  };

  const handleUpdate = async (data: any) => {
    try {
      const response = await fetch(`/api/mcp/servers/${serverId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      
      if (response.ok) {
        await fetchServerDetails();
      }
    } catch (error) {
      console.error('Failed to update server:', error);
    }
  };

  const handleExecuteTool = async (serverId: string, toolName: string, params: any) => {
    try {
      const response = await fetch(`/api/mcp/servers/${serverId}/tools/${toolName}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ params }),
      });
      
      if (response.ok) {
        const data = await response.json();
        return data.result;
      } else {
        const error = await response.json();
        throw new Error(error.error || 'Failed to execute tool');
      }
    } catch (error) {
      throw error;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!server) {
    return null;
  }

  return (
    <>
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
                <BreadcrumbLink href="/mcp-servers">MCP Servers</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{server.name}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </header>
      
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push('/mcp-servers')}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{server.name}</h1>
              {server.description && (
                <p className="text-muted-foreground">{server.description}</p>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchServerDetails(true)}
              disabled={isRefreshing}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              {isRefreshing ? 'Refreshing...' : 'Refresh'}
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsFormOpen(true)}
            >
              <Settings className="mr-2 h-4 w-4" />
              Edit
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={handleDelete}
              className="text-red-600 hover:text-red-700"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
            
            {server.status === 'active' ? (
              <Button
                variant="destructive"
                onClick={handleDisconnect}
              >
                Disconnect
              </Button>
            ) : (
              <Button
                onClick={handleConnect}
                disabled={server.status === 'connecting'}
              >
                {server.status === 'connecting' ? 'Connecting...' : 'Connect'}
              </Button>
            )}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Status</CardTitle>
            </CardHeader>
            <CardContent>
              <ServerStatusBadge status={server.status} />
              {server.error && (
                <p className="mt-2 text-xs text-red-600">{server.error}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Configuration</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-1 text-sm">
                <div>
                  <dt className="text-muted-foreground">Transport</dt>
                  <dd className="font-medium">{server.transport.toUpperCase()}</dd>
                </div>
                {server.transport === 'stdio' && server.config.command && (
                  <div>
                    <dt className="text-muted-foreground">Command</dt>
                    <dd className="font-mono text-xs">{server.config.command}</dd>
                  </div>
                )}
                {(server.transport === 'sse' || server.transport === 'http') && server.config.url && (
                  <div>
                    <dt className="text-muted-foreground">URL</dt>
                    <dd className="font-mono text-xs truncate">{server.config.url}</dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Capabilities</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-2xl font-semibold">{server.toolCount || 0}</p>
                  <p className="text-xs text-muted-foreground">Tools</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold">{server.resourceCount || 0}</p>
                  <p className="text-xs text-muted-foreground">Resources</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold">{server.promptCount || 0}</p>
                  <p className="text-xs text-muted-foreground">Prompts</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
          <TabsList>
            <TabsTrigger value="tools">
              Tools {tools.length > 0 && `(${tools.length})`}
            </TabsTrigger>
            <TabsTrigger value="resources">
              Resources {resources.length > 0 && `(${resources.length})`}
            </TabsTrigger>
            <TabsTrigger value="prompts">
              Prompts {prompts.length > 0 && `(${prompts.length})`}
            </TabsTrigger>
            <TabsTrigger value="config">Configuration</TabsTrigger>
          </TabsList>

          <TabsContent value="tools" className="space-y-4">
            {server.status !== 'active' ? (
              <Card>
                <CardContent className="pt-6">
                  <p className="text-center text-muted-foreground">
                    Connect to the server to view available tools
                  </p>
                </CardContent>
              </Card>
            ) : tools.length === 0 || isToolsLoading ? (
              <Card>
                <CardContent className="pt-6">
                  <div className="flex flex-col items-center gap-4">
                    {isToolsLoading ? (
                      <>
                        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                        <p className="text-center text-muted-foreground">
                          Loading tools...
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-center text-muted-foreground">
                          No tools loaded (Server has {server.toolCount || 0} tools)
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={fetchTools}
                        >
                          Load Tools
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {tools.length > 5 && (
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder="Search tools..."
                      className="pl-8 h-9 text-sm"
                      value={toolFilter}
                      onChange={(e) => setToolFilter(e.target.value)}
                    />
                  </div>
                )}
                <div className="grid gap-1.5">
                  {tools
                    .filter((tool) => {
                      if (!toolFilter) return true;
                      const search = toolFilter.toLowerCase();
                      return (
                        tool.name.toLowerCase().includes(search) ||
                        (tool.description && tool.description.toLowerCase().includes(search))
                      );
                    })
                    .map((tool) => (
                      <ToolCard
                        key={tool.name}
                        tool={tool}
                        serverId={serverId}
                        onExecute={handleExecuteTool}
                      />
                    ))}
                </div>
                {toolFilter && tools.filter((tool) => {
                  const search = toolFilter.toLowerCase();
                  return (
                    tool.name.toLowerCase().includes(search) ||
                    (tool.description && tool.description.toLowerCase().includes(search))
                  );
                }).length === 0 && (
                  <p className="text-center text-sm text-muted-foreground py-4">
                    No tools matching "{toolFilter}"
                  </p>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="resources" className="space-y-4">
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-muted-foreground">
                  Resources discovery coming soon
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="prompts" className="space-y-4">
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-muted-foreground">
                  Prompts discovery coming soon
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="config" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Server Configuration</CardTitle>
                <CardDescription>
                  Full configuration details for this MCP server
                </CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="p-4 bg-muted rounded overflow-x-auto text-sm">
                  {JSON.stringify(server.config, null, 2)}
                </pre>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <ServerForm
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        onSubmit={handleUpdate}
        initialData={server}
        mode="edit"
      />
    </>
  );
}