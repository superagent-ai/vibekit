'use client';

import { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../ui/card';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription } from '../ui/alert';
import { ExternalLink, Plus, Check, AlertCircle, Database, Search, Wrench, Code, Zap, Users, Twitter } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { getXAvatarUrl, preloadAvatars } from '../../lib/avatar-utils';

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

interface RecommendedServers {
  description: string;
  servers: Record<string, MCPServer>;
  installation: {
    instructions: string;
    example: string;
  };
}

const categoryIcons = {
  utility: Wrench,
  productivity: Users,
  development: Code,
  search: Search,
  database: Database,
  automation: Zap
};

const categoryColors = {
  utility: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  productivity: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  development: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  search: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  database: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  automation: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
};

export function MCPServerBrowser() {
  const router = useRouter();
  const [servers, setServers] = useState<RecommendedServers | null>(null);
  const [installedServers, setInstalledServers] = useState<Set<string>>(new Set());
  const [installedServersData, setInstalledServersData] = useState<any[]>([]);
  const [installing, setInstalling] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  useEffect(() => {
    loadRecommendedServers();
    loadInstalledServers();
  }, []);

  useEffect(() => {
    // Preload avatars when servers are loaded
    if (servers) {
      const handles = Object.values(servers.servers)
        .map(server => server.xHandle)
        .filter(Boolean);
      preloadAvatars(handles);
    }
  }, [servers]);

  const loadRecommendedServers = async () => {
    try {
      const response = await fetch('/recommended-mcp-servers.json');
      if (response.ok) {
        const data = await response.json();
        setServers(data);
      }
    } catch (error) {
      console.error('Failed to load recommended servers:', error);
      setError('Failed to load recommended servers');
    }
  };

  const loadInstalledServers = async () => {
    try {
      const response = await fetch('/api/mcp/servers');
      if (response.ok) {
        const data = await response.json();
        console.log('[DEBUG] MCP servers API response:', data);
        const serversList = data.servers || [];
        console.log('[DEBUG] Servers list:', serversList);
        setInstalledServers(new Set(serversList.map((s: any) => s.name) || []));
        setInstalledServersData(serversList);
      }
    } catch (error) {
      console.error('Failed to load installed servers:', error);
    }
  };

  const handleViewDetails = (serverId: string, serverName: string) => {
    // serverId is the key from recommended servers (e.g., "filesystem", "git")
    // serverName is the actual name (e.g., "Filesystem Server", "Git Server")
    
    // Check if this server is installed
    const installedServer = installedServersData.find(s => s.name === serverName);
    
    if (installedServer) {
      // Server is installed, go to installed server details
      router.push(`/mcp-servers/${installedServer.id}`);
    } else {
      // Server not installed, go to recommended server detail page
      router.push(`/mcp-servers/recommended/${serverId}`);
    }
  };

  const installServer = async (serverId: string, server: MCPServer) => {
    setInstalling(prev => new Set([...prev, serverId]));
    setError(null);
    
    try {
      const response = await fetch('/api/mcp/servers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: server.name,  // Use the actual server name, not the ID
          transport: 'stdio',
          config: {
            command: server.config.command,
            args: server.config.args
          }
        })
      });

      if (response.ok) {
        const result = await response.json();
        setInstalledServers(prev => new Set([...prev, server.name]));  // Use server name
        
        // Show success message if server is connected
        if (result.server?.status === 'active') {
          console.log(`Server ${server.name} installed and connected successfully`);
          console.log(`Tools: ${result.server.toolCount || 0}, Resources: ${result.server.resourceCount || 0}`);
        } else {
          console.log(`Server ${server.name} installed (connection pending)`);
        }
        
        // Update the installed servers data immediately with the new server
        if (result.server) {
          setInstalledServersData(prev => [...prev, result.server]);
        }
        
        // Also refresh the full list to ensure consistency
        await loadInstalledServers();
      } else {
        const error = await response.json();
        setError(`Failed to install ${server.name}: ${error.error || error.message}`);
      }
    } catch (error) {
      console.error('Failed to install server:', error);
      setError(`Failed to install ${server.name}: Network error`);
    } finally {
      setInstalling(prev => {
        const next = new Set(prev);
        next.delete(serverId);
        return next;
      });
    }
  };

  const uninstallServer = async (serverId: string, serverName: string) => {
    setInstalling(prev => new Set([...prev, serverId]));
    
    try {
      // First, find the server by name to get its ID
      const serversResponse = await fetch('/api/mcp/servers');
      if (serversResponse.ok) {
        const serversData = await serversResponse.json();
        const server = serversData.servers?.find((s: any) => s.name === serverId);
        
        if (server) {
          const response = await fetch(`/api/mcp/servers/${server.id}`, {
            method: 'DELETE'
          });

          if (response.ok) {
            setInstalledServers(prev => {
              const next = new Set(prev);
              next.delete(serverId);
              return next;
            });
            await loadInstalledServers(); // Refresh the list
          } else {
            const error = await response.json();
            setError(`Failed to uninstall ${serverName}: ${error.error || error.message}`);
          }
        }
      }
    } catch (error) {
      console.error('Failed to uninstall server:', error);
      setError(`Failed to uninstall ${serverName}: Network error`);
    } finally {
      setInstalling(prev => {
        const next = new Set(prev);
        next.delete(serverId);
        return next;
      });
    }
  };

  if (!servers) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading MCP servers...</p>
        </div>
      </div>
    );
  }

  const categories = ['all', ...new Set(Object.values(servers.servers).map(s => s.category))];
  const availableServers = Object.entries(servers.servers).filter(([serverId]) => !installedServers.has(serverId));
  const filteredServers = selectedCategory === 'all' 
    ? availableServers
    : availableServers.filter(([_, server]) => server.category === selectedCategory);

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-bold">MCP Server Browser</h2>
          <p className="text-muted-foreground mt-1">{servers.description}</p>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Category Filter */}
        <div className="flex gap-2 flex-wrap">
          {categories.map((category) => (
            <Button
              key={category}
              variant={selectedCategory === category ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedCategory(category)}
            >
              {category === 'all' ? 'All' : category.charAt(0).toUpperCase() + category.slice(1)}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredServers.map(([serverId, server]) => {
          const isInstalling = installing.has(serverId);
          const CategoryIcon = categoryIcons[server.category as keyof typeof categoryIcons] || Wrench;
          const categoryColor = categoryColors[server.category as keyof typeof categoryColors] || categoryColors.utility;

          return (
            <Card key={serverId} className="flex flex-col">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2">
                      <CategoryIcon className="h-4 w-4 text-muted-foreground" />
                      <CardTitle 
                        className="text-lg cursor-pointer hover:text-primary transition-colors"
                        onClick={() => handleViewDetails(serverId, server.name)}
                      >
                        {server.name}
                      </CardTitle>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={categoryColor}>
                        {server.category}
                      </Badge>
                      {server.xHandle && (
                        <div className="flex items-center gap-1">
                          <img 
                            src={getXAvatarUrl(server.xHandle, { size: 20 })}
                            alt={`${server.name} author`}
                            className="w-5 h-5 rounded-full"
                            onError={(e) => {
                              // If Unavatar fails, use default avatar
                              e.currentTarget.src = '/default-avatar.svg';
                            }}
                          />
                          <span className="text-xs text-muted-foreground">{server.xHandle}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <CardDescription className="text-sm mt-2">
                  {server.description}
                </CardDescription>
              </CardHeader>

              <CardContent className="flex-1">
                {server.requiresApiKeys && (
                  <div className="mb-4">
                    <p className="text-sm text-muted-foreground mb-2">Requires API keys:</p>
                    <div className="flex flex-wrap gap-1">
                      {server.envVars?.map((envVar) => (
                        <Badge key={envVar} variant="outline" className="text-xs">
                          {envVar}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div className="text-xs text-muted-foreground">
                  <p className="mb-1">Command: {server.config.command}</p>
                  <p>Args: {server.config.args.join(' ')}</p>
                </div>
              </CardContent>

              <CardFooter className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => installServer(serverId, server)}
                  disabled={isInstalling}
                  className="flex-1"
                >
                  {isInstalling ? (
                    <>
                      <div className="animate-spin rounded-full h-3 w-3 border-b border-current mr-2" />
                      Installing...
                    </>
                  ) : (
                    <>
                      <Plus className="h-3 w-3 mr-1" />
                      Install
                    </>
                  )}
                </Button>
                
                <div className="flex gap-1">
                  {server.url && server.url !== server.repository && (
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => window.open(server.url, '_blank')}
                      title="Visit website"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => window.open(server.repository, '_blank')}
                    title="View on GitHub"
                  >
                    <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                    </svg>
                  </Button>
                  {server.xHandle && (
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => window.open(`https://twitter.com/${server.xHandle.replace('@', '')}`, '_blank')}
                      title={`Follow ${server.xHandle}`}
                    >
                      <Twitter className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </div>
  );
}