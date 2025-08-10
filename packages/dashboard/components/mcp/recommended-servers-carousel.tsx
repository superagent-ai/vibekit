'use client';

import { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../ui/card';
import { Badge } from '../ui/badge';
import { ChevronLeft, ChevronRight, Plus, Check, ExternalLink, Wrench, Users, Code, Search, Database, Zap } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useRouter } from 'next/navigation';

interface MCPServer {
  name: string;
  description: string;
  repository: string;
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

interface RecommendedServersCarouselProps {
  onServerInstalled?: () => void;
}

export function RecommendedServersCarousel({ onServerInstalled }: RecommendedServersCarouselProps) {
  const router = useRouter();
  const [servers, setServers] = useState<RecommendedServers | null>(null);
  const [installedServers, setInstalledServers] = useState<Set<string>>(new Set());
  const [installedServersData, setInstalledServersData] = useState<any[]>([]);
  const [installing, setInstalling] = useState<Set<string>>(new Set());
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    loadRecommendedServers();
    loadInstalledServers();
  }, []);

  const loadRecommendedServers = async () => {
    try {
      // Load from assets directory - single source of truth
      const recommendedServers = await import('../../../../assets/recommended-mcp-servers.json');
      setServers(recommendedServers.default || recommendedServers);
    } catch (error) {
      console.error('Failed to load recommended servers:', error);
    }
  };

  const loadInstalledServers = async () => {
    try {
      const response = await fetch('/api/mcp/servers');
      if (response.ok) {
        const data = await response.json();
        const serversList = data.servers || [];
        setInstalledServers(new Set(serversList.map((s: any) => s.name) || []));
        setInstalledServersData(serversList);
      }
    } catch (error) {
      console.error('Failed to load installed servers:', error);
    }
  };

  const handleCardClick = (serverId: string) => {
    // Find the installed server by name to get its actual ID
    const installedServer = installedServersData.find(s => s.name === serverId);
    if (installedServer) {
      // Server is installed, go to its details page
      window.location.href = `/mcp-servers/${installedServer.id}`;
    } else {
      // Server not installed, open the repository to learn more
      const server = servers?.servers[serverId];
      if (server) {
        window.open(server.repository, '_blank');
      }
    }
  };

  const installServer = async (serverId: string, server: MCPServer) => {
    setInstalling(prev => new Set([...prev, serverId]));
    
    try {
      // Step 1: Install the server
      const response = await fetch('/api/mcp/servers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: serverId,
          transport: 'stdio',
          config: {
            command: server.config.command,
            args: server.config.args
          }
        })
      });

      if (response.ok) {
        const result = await response.json();
        const newServerId = result.data?.id || result.id;
        
        if (newServerId) {
          // Step 2: Auto-connect the server
          try {
            console.log(`[CAROUSEL] Auto-connecting server: ${serverId} (ID: ${newServerId})`);
            const connectResponse = await fetch(`/api/mcp/servers/${newServerId}/connect`, {
              method: 'POST'
            });
            
            if (connectResponse.ok) {
              console.log(`[CAROUSEL] Successfully connected ${serverId}`);
            } else {
              console.warn(`[CAROUSEL] Failed to connect ${serverId}:`, await connectResponse.text());
            }
            
            // Small delay to allow connection to establish
            await new Promise(resolve => setTimeout(resolve, 1000));
          } catch (connectError) {
            console.error(`[CAROUSEL] Error connecting ${serverId}:`, connectError);
          }
        }
        
        // Step 3: Update state and refresh main server list
        setInstalledServers(prev => new Set([...prev, serverId]));
        await loadInstalledServers(); // Refresh our own data
        onServerInstalled?.(); // Refresh parent component's server list
      }
    } catch (error) {
      console.error('Failed to install server:', error);
    } finally {
      setInstalling(prev => {
        const next = new Set(prev);
        next.delete(serverId);
        return next;
      });
    }
  };

  if (!servers || !isVisible) return null;

  const serverEntries = Object.entries(servers.servers);
  const visibleServers = 6; // Show 6 cards at a time on desktop, fewer on mobile
  const maxIndex = Math.max(0, serverEntries.length - visibleServers);

  const nextSlide = () => {
    setCurrentIndex(prev => Math.min(prev + 1, maxIndex));
  };

  const prevSlide = () => {
    setCurrentIndex(prev => Math.max(prev - 1, 0));
  };

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-base font-medium">Browse MCP Servers</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsVisible(false)}
          className="text-muted-foreground hover:text-foreground text-xs"
        >
          Hide
        </Button>
      </div>

      <div className="relative">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={prevSlide}
            disabled={currentIndex === 0}
            className="h-6 w-6 shrink-0 hidden sm:flex"
          >
            <ChevronLeft className="h-3 w-3" />
          </Button>

          <div className="flex gap-3 overflow-x-auto scroll-smooth flex-1 pb-2 -mb-2">
            <div 
              className="flex gap-3 transition-transform duration-300 ease-in-out"
              style={{ transform: `translateX(-${currentIndex * 140}px)` }}
            >
              {serverEntries.map(([serverId, server]) => {
                const isInstalled = installedServers.has(serverId);
                const isInstalling = installing.has(serverId);
                const CategoryIcon = categoryIcons[server.category as keyof typeof categoryIcons] || Wrench;
                const categoryColor = categoryColors[server.category as keyof typeof categoryColors] || categoryColors.utility;

                return (
                  <Card 
                    key={serverId} 
                    className="shrink-0 w-32 h-28 cursor-pointer hover:shadow-lg transition-all border-0 bg-gradient-to-br from-background to-muted/20"
                    onClick={() => handleCardClick(serverId)}
                  >
                    <CardContent className="p-3 h-full flex flex-col justify-between">
                      <div className="flex flex-col items-center text-center gap-2">
                        <div className={cn(
                          "flex items-center justify-center w-10 h-10 rounded-full",
                          categoryColor.replace('text-', 'text-white ').replace('bg-', 'bg-')
                        )}>
                          <CategoryIcon className="h-5 w-5 text-white" />
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-semibold truncate w-full leading-tight">{server.name}</p>
                          {server.requiresApiKeys && (
                            <div className="w-2 h-2 rounded-full bg-amber-400 mx-auto" title="Requires API keys" />
                          )}
                        </div>
                      </div>
                      
                      <div className="flex justify-center mt-1">
                        {isInstalled ? (
                          <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                            <Check className="h-3 w-3" />
                            <span className="text-[10px] font-medium">Added</span>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              installServer(serverId, server);
                            }}
                            disabled={isInstalling}
                            className="h-6 px-3 text-[10px] rounded-full"
                            variant="outline"
                          >
                            {isInstalling ? (
                              <div className="animate-spin rounded-full h-3 w-3 border border-current border-t-transparent" />
                            ) : (
                              <>
                                <Plus className="h-3 w-3 mr-1" />
                                Add
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          <Button
            variant="outline"
            size="icon"
            onClick={nextSlide}
            disabled={currentIndex >= maxIndex}
            className="h-6 w-6 shrink-0 hidden sm:flex"
          >
            <ChevronRight className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}