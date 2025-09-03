'use client';

import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './ui/card';
import { Badge } from './ui/badge';
import { ExternalLink, Plus, Check, AlertCircle, Database, Search, Wrench, Code, Zap, Users } from 'lucide-react';
import { Alert, AlertDescription } from './ui/alert';

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
  const [servers, setServers] = useState<RecommendedServers | null>(null);
  const [installedServers, setInstalledServers] = useState<Set<string>>(new Set());
  const [installing, setInstalling] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  useEffect(() => {
    loadRecommendedServers();
    loadInstalledServers();
  }, []);

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
      const response = await fetch('/api/mcp-servers');
      if (response.ok) {
        const data = await response.json();
        setInstalledServers(new Set(Object.keys(data.mcpServers || {})));
      }
    } catch (error) {
      console.error('Failed to load installed servers:', error);
    }
  };

  const installServer = async (serverId: string, server: MCPServer) => {
    setInstalling(prev => new Set([...prev, serverId]));
    setError(null);
    
    try {
      const response = await fetch('/api/mcp-servers/install', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          serverId,
          config: server.config
        })
      });

      if (response.ok) {
        setInstalledServers(prev => new Set([...prev, serverId]));
      } else {
        const error = await response.json();
        setError(`Failed to install ${server.name}: ${error.message}`);
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
      const response = await fetch(`/api/mcp-servers/${serverId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        setInstalledServers(prev => {
          const next = new Set(prev);
          next.delete(serverId);
          return next;
        });
      } else {
        const error = await response.json();
        setError(`Failed to uninstall ${serverName}: ${error.message}`);
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
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <CategoryIcon className="h-4 w-4 text-muted-foreground" />
                      <CardTitle className="text-lg">{server.name}</CardTitle>
                    </div>
                    <Badge className={categoryColor}>
                      {server.category}
                    </Badge>
                  </div>
                </div>
                <CardDescription className="text-sm">
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
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(server.repository, '_blank')}
                >
                  <ExternalLink className="h-3 w-3" />
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </div>
  );
}