"use client";

import { useState, useEffect } from "react";
import { Plus, Download, Upload, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MCPServerCard } from "@/components/mcp/server-card";
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
}

export default function MCPServersPage() {
  const [servers, setServers] = useState<MCPServer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<MCPServer | null>(null);

  useEffect(() => {
    fetchServers();
  }, []);

  const fetchServers = async () => {
    try {
      const response = await fetch('/api/mcp/servers');
      if (response.ok) {
        const data = await response.json();
        setServers(data.servers || []);
      }
    } catch (error) {
      console.error('Failed to fetch servers:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddServer = async (data: any) => {
    try {
      const response = await fetch('/api/mcp/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      
      if (response.ok) {
        await fetchServers();
      }
    } catch (error) {
      console.error('Failed to add server:', error);
    }
  };

  const handleEditServer = async (data: any) => {
    if (!editingServer) return;
    
    try {
      const response = await fetch(`/api/mcp/servers/${editingServer.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      
      if (response.ok) {
        await fetchServers();
        setEditingServer(null);
      }
    } catch (error) {
      console.error('Failed to update server:', error);
    }
  };

  const handleConnect = async (id: string) => {
    try {
      const response = await fetch(`/api/mcp/servers/${id}/connect`, {
        method: 'POST',
      });
      
      if (response.ok) {
        await fetchServers();
      }
    } catch (error) {
      console.error('Failed to connect:', error);
    }
  };

  const handleDisconnect = async (id: string) => {
    try {
      const response = await fetch(`/api/mcp/servers/${id}/disconnect`, {
        method: 'POST',
      });
      
      if (response.ok) {
        await fetchServers();
      }
    } catch (error) {
      console.error('Failed to disconnect:', error);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/mcp/servers/${id}`, {
        method: 'DELETE',
      });
      
      if (response.ok) {
        await fetchServers();
      }
    } catch (error) {
      console.error('Failed to delete server:', error);
    }
  };

  const handleExport = async () => {
    try {
      const response = await fetch('/api/mcp/servers/export');
      if (response.ok) {
        const data = await response.blob();
        const url = URL.createObjectURL(data);
        const a = document.createElement('a');
        a.href = url;
        a.download = `mcp-servers-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Failed to export:', error);
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const response = await fetch('/api/mcp/servers/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: text,
      });
      
      if (response.ok) {
        await fetchServers();
      }
    } catch (error) {
      console.error('Failed to import:', error);
    }
  };

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
                <BreadcrumbPage>MCP Servers</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </header>
      
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">MCP Servers</h1>
            <p className="text-muted-foreground">
              Manage your Model Context Protocol servers and their tools
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchServers}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
            >
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
            
            <label>
              <Button
                variant="outline"
                size="sm"
                asChild
              >
                <span>
                  <Upload className="mr-2 h-4 w-4" />
                  Import
                </span>
              </Button>
              <input
                type="file"
                accept="application/json"
                className="hidden"
                onChange={handleImport}
              />
            </label>
            
            <Button
              onClick={() => {
                setEditingServer(null);
                setIsFormOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Server
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : servers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed rounded-lg">
            <p className="text-muted-foreground mb-4">No MCP servers configured</p>
            <Button
              onClick={() => {
                setEditingServer(null);
                setIsFormOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Your First Server
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {servers.map((server) => (
              <MCPServerCard
                key={server.id}
                server={server}
                onConnect={handleConnect}
                onDisconnect={handleDisconnect}
                onDelete={handleDelete}
                onEdit={(id) => {
                  const server = servers.find(s => s.id === id);
                  if (server) {
                    setEditingServer(server);
                    setIsFormOpen(true);
                  }
                }}
              />
            ))}
          </div>
        )}
      </div>

      <ServerForm
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        onSubmit={editingServer ? handleEditServer : handleAddServer}
        initialData={editingServer || undefined}
        mode={editingServer ? 'edit' : 'create'}
      />
    </>
  );
}