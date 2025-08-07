"use client";

import { useState } from "react";
import { MoreVertical, Play, Square, Trash2, Edit, Eye, Plug, Unplug } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ServerStatusBadge, ServerStatus } from "./server-status";
import { useRouter } from "next/navigation";

interface MCPServerCardProps {
  server: {
    id: string;
    name: string;
    description?: string;
    transport: 'stdio' | 'sse' | 'http';
    status: ServerStatus;
    toolCount?: number;
    resourceCount?: number;
    promptCount?: number;
    lastConnected?: string;
    error?: string;
  };
  onConnect?: (id: string) => Promise<void>;
  onDisconnect?: (id: string) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onEdit?: (id: string) => void;
}

export function MCPServerCard({ 
  server, 
  onConnect, 
  onDisconnect, 
  onDelete,
  onEdit 
}: MCPServerCardProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const handleToggleConnection = async () => {
    if (isLoading) return;
    setIsLoading(true);
    
    try {
      if (server.status === 'active' || server.status === 'connecting') {
        await onDisconnect?.(server.id);
      } else {
        await onConnect?.(server.id);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (confirm(`Are you sure you want to delete "${server.name}"?`)) {
      await onDelete?.(server.id);
    }
  };

  const formatLastConnected = (date?: string) => {
    if (!date) return 'Never';
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    return 'Recently';
  };

  return (
    <Card className="relative hover:shadow-lg transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg">{server.name}</CardTitle>
            {server.description && (
              <CardDescription className="text-sm">
                {server.description}
              </CardDescription>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push(`/mcp-servers/${server.id}`)}>
                <Eye className="mr-2 h-4 w-4" />
                View Details
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onEdit?.(server.id)}>
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={handleDelete}
                className="text-red-600 focus:text-red-600"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <ServerStatusBadge status={server.status} />
          <span className="text-xs text-muted-foreground">
            {server.transport.toUpperCase()}
          </span>
        </div>

        {server.error && server.status === 'error' && (
          <div className="rounded-md bg-red-50 dark:bg-red-900/10 p-2">
            <p className="text-xs text-red-600 dark:text-red-400">
              {server.error}
            </p>
          </div>
        )}

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

        <div className="flex items-center justify-between pt-2 border-t">
          <span className="text-xs text-muted-foreground">
            Last connected: {formatLastConnected(server.lastConnected)}
          </span>
          <Button 
            size="sm" 
            variant={server.status === 'active' ? 'destructive' : 'default'}
            onClick={handleToggleConnection}
            disabled={isLoading || server.status === 'connecting'}
          >
            {server.status === 'active' ? (
              <>
                <Square className="mr-1 h-3 w-3" />
                Disconnect
              </>
            ) : server.status === 'connecting' ? (
              <>
                <div className="mr-1 h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Connecting
              </>
            ) : (
              <>
                <Play className="mr-1 h-3 w-3" />
                Connect
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}