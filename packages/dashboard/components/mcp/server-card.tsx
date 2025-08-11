"use client";

import { useState } from "react";
import { MoreVertical, Play, Square, Trash2, Edit, Eye, Plug, Unplug } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getXAvatarUrl } from "@/lib/avatar-utils";
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
    xHandle?: string;
    url?: string;
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
      <CardHeader className="pb-1 pt-3">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-2 min-w-0 flex-1">
            {server.xHandle && (
              <img 
                src={getXAvatarUrl(server.xHandle, { size: 32 })}
                alt={`${server.name} avatar`}
                className="w-8 h-8 rounded-full shrink-0 mt-0.5"
                onError={(e) => {
                  // If Unavatar fails, use default avatar
                  e.currentTarget.src = '/default-avatar.svg';
                }}
              />
            )}
            <div className="space-y-0.5 min-w-0 flex-1">
              <CardTitle 
                className="text-sm font-medium cursor-pointer hover:text-primary transition-colors hover:underline"
                onClick={() => {
                  console.log('[DEBUG] Clicking server:', server.id);
                  window.location.href = `/mcp-servers/${server.id}`;
                }}
              >
                {server.name}
              </CardTitle>
              {server.description && (
                <CardDescription className="text-xs line-clamp-1">
                  {server.description}
                </CardDescription>
              )}
              {server.xHandle && (
                <p className="text-[10px] text-muted-foreground">{server.xHandle}</p>
              )}
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0">
                <MoreVertical className="h-3 w-3" />
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
      <CardContent className="space-y-2 pt-2 pb-3">
        <div className="flex items-center justify-between">
          <ServerStatusBadge status={server.status} />
          <div className="flex items-center gap-2 shrink-0">
            <div className="text-center">
              <p className="text-sm font-semibold whitespace-nowrap">{server.toolCount || 0} tools</p>
            </div>
            <span className="text-xs text-muted-foreground">
              {server.transport.toUpperCase()}
            </span>
          </div>
        </div>

        {server.error && server.status === 'error' && (
          <div className="rounded-md bg-red-50 dark:bg-red-900/10 p-1.5">
            <p className="text-xs text-red-600 dark:text-red-400">
              {server.error}
            </p>
          </div>
        )}

        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground truncate">
            {formatLastConnected(server.lastConnected)}
          </span>
          <Button 
            size="sm" 
            variant={server.status === 'active' ? 'destructive' : 'default'}
            onClick={handleToggleConnection}
            disabled={isLoading || server.status === 'connecting'}
            className="h-7 px-2 text-xs shrink-0"
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