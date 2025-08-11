"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink, Plus, Check, Github, Twitter, Globe, Key, Terminal, Package, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getXAvatarUrl } from "@/lib/avatar-utils";
import recommendedServers from "../../../../../../assets/recommended-mcp-servers.json";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { SidebarTrigger } from "@/components/ui/sidebar";

interface MCPServer {
  name: string;
  description: string;
  repository: string;
  url?: string;
  xHandle?: string;
  category: string;
  requiresApiKeys?: boolean;
  envVars?: string[];
  config: {
    command: string;
    args: string[];
    enabled: boolean;
  };
}

const categoryColors = {
  utility: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  productivity: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  development: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  search: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  database: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  automation: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
};

export default function RecommendedServerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const serverId = params.id as string;
  
  const [server, setServer] = useState<MCPServer | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isInstalling, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Load server details
    const serverData = recommendedServers.servers[serverId as keyof typeof recommendedServers.servers];
    if (serverData) {
      setServer(serverData);
      checkIfInstalled(serverData.name);
    } else {
      setError("Server not found");
    }
  }, [serverId]);

  const checkIfInstalled = async (serverName: string) => {
    try {
      const response = await fetch('/api/mcp/servers');
      if (response.ok) {
        const data = await response.json();
        const installed = data.servers?.some((s: any) => s.name === serverName);
        setIsInstalled(installed);
      }
    } catch (error) {
      console.error('Failed to check installation status:', error);
    }
  };

  const handleInstall = async () => {
    if (!server) return;
    
    setInstalling(true);
    setError(null);
    
    try {
      const response = await fetch('/api/mcp/servers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: server.name,
          description: server.description,
          transport: 'stdio',
          config: {
            command: server.config.command,
            args: server.config.args,
            env: {}
          }
        })
      });

      if (response.ok) {
        const result = await response.json();
        const newServerId = result.server?.id || result.data?.id;
        
        if (newServerId) {
          // Auto-connect to the server
          try {
            await fetch(`/api/mcp/servers/${newServerId}/connect`, {
              method: 'POST'
            });
          } catch (connectError) {
            console.error('Failed to auto-connect:', connectError);
          }
        }
        
        setIsInstalled(true);
        // Redirect to installed servers page after successful installation
        setTimeout(() => {
          router.push('/mcp-servers');
        }, 1500);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to install server');
      }
    } catch (error) {
      setError('Failed to install server');
      console.error('Installation error:', error);
    } finally {
      setInstalling(false);
    }
  };

  if (!server) {
    return (
      <div className="flex items-center justify-center h-64">
        {error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : (
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        )}
      </div>
    );
  }

  const categoryColor = categoryColors[server.category as keyof typeof categoryColors] || categoryColors.utility;

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
        <div className="flex items-start justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.back()}
            className="mb-4"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {/* Main Content */}
          <div className="md:col-span-2 space-y-6">
            {/* Header Card */}
            <Card>
              <CardHeader>
                <div className="flex items-start gap-4">
                  {server.xHandle && (
                    <img 
                      src={getXAvatarUrl(server.xHandle, { size: 64 })}
                      alt={`${server.name} author`}
                      className="w-16 h-16 rounded-full"
                      onError={(e) => {
                        e.currentTarget.src = '/default-avatar.svg';
                      }}
                    />
                  )}
                  <div className="flex-1">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-2xl">{server.name}</CardTitle>
                        <CardDescription className="mt-2 text-base">
                          {server.description}
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-4">
                      <Badge className={categoryColor}>
                        {server.category}
                      </Badge>
                      {server.xHandle && (
                        <Badge variant="outline">
                          {server.xHandle}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </CardHeader>
            </Card>

            {/* Installation Info */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Terminal className="h-5 w-5" />
                  Installation
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium mb-2">Command</h4>
                  <code className="block p-3 bg-muted rounded-md text-sm">
                    {server.config.command} {server.config.args.join(' ')}
                  </code>
                </div>

                {server.requiresApiKeys && server.envVars && (
                  <Alert>
                    <Key className="h-4 w-4" />
                    <AlertDescription>
                      <div className="space-y-2">
                        <p className="font-medium">This server requires API keys:</p>
                        <ul className="list-disc list-inside space-y-1">
                          {server.envVars.map((envVar) => (
                            <li key={envVar} className="text-sm">
                              <code className="bg-muted px-1 py-0.5 rounded">{envVar}</code>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </AlertDescription>
                  </Alert>
                )}

                <div className="flex gap-3">
                  {isInstalled ? (
                    <Button disabled className="flex-1">
                      <Check className="mr-2 h-4 w-4" />
                      Already Installed
                    </Button>
                  ) : (
                    <Button 
                      onClick={handleInstall}
                      disabled={isInstalling}
                      className="flex-1"
                    >
                      {isInstalling ? (
                        <>
                          <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent" />
                          Installing...
                        </>
                      ) : (
                        <>
                          <Plus className="mr-2 h-4 w-4" />
                          Install Server
                        </>
                      )}
                    </Button>
                  )}
                </div>

                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            {/* Configuration */}
            <Card>
              <CardHeader>
                <CardTitle>Configuration Details</CardTitle>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="basic" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="basic">Basic</TabsTrigger>
                    <TabsTrigger value="advanced">Advanced</TabsTrigger>
                  </TabsList>
                  <TabsContent value="basic" className="space-y-4">
                    <div>
                      <h4 className="text-sm font-medium mb-1">Transport</h4>
                      <p className="text-sm text-muted-foreground">stdio</p>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium mb-1">Command</h4>
                      <p className="text-sm text-muted-foreground font-mono">{server.config.command}</p>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium mb-1">Arguments</h4>
                      <div className="space-y-1">
                        {server.config.args.map((arg, index) => (
                          <p key={index} className="text-sm text-muted-foreground font-mono">
                            {arg}
                          </p>
                        ))}
                      </div>
                    </div>
                  </TabsContent>
                  <TabsContent value="advanced" className="space-y-4">
                    <div>
                      <h4 className="text-sm font-medium mb-2">Full Configuration</h4>
                      <pre className="p-3 bg-muted rounded-md text-xs overflow-x-auto">
                        {JSON.stringify(server.config, null, 2)}
                      </pre>
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => window.open(server.repository, '_blank')}
                >
                  <Github className="mr-2 h-4 w-4" />
                  View on GitHub
                </Button>
                
                {server.url && server.url !== server.repository && (
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => window.open(server.url, '_blank')}
                  >
                    <Globe className="mr-2 h-4 w-4" />
                    Visit Website
                  </Button>
                )}
                
                {server.xHandle && (
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => window.open(`https://twitter.com/${server.xHandle.replace('@', '')}`, '_blank')}
                  >
                    <Twitter className="mr-2 h-4 w-4" />
                    Follow {server.xHandle}
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Server Info */}
            <Card>
              <CardHeader>
                <CardTitle>Server Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-sm text-muted-foreground">Category</p>
                  <p className="text-sm font-medium capitalize">{server.category}</p>
                </div>
                <Separator />
                <div>
                  <p className="text-sm text-muted-foreground">Package</p>
                  <p className="text-sm font-medium font-mono">
                    {server.config.args.find(arg => arg.startsWith('@')) || server.config.args[1] || 'N/A'}
                  </p>
                </div>
                <Separator />
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <p className="text-sm font-medium">
                    {server.config.enabled ? 'Enabled by default' : 'Disabled by default'}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Requirements */}
            {server.requiresApiKeys && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Key className="h-4 w-4" />
                    Requirements
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-3">
                    This server requires the following API keys to function:
                  </p>
                  <div className="space-y-2">
                    {server.envVars?.map((envVar) => (
                      <div key={envVar} className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-yellow-500" />
                        <code className="text-xs">{envVar}</code>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </>
  );
}