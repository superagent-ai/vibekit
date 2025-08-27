"use client";

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  ExternalLink, 
  Monitor, 
  Smartphone, 
  Tablet, 
  Copy,
  AlertCircle,
  Loader2,
  Terminal,
  Settings
} from 'lucide-react';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { DevServerControls } from './dev-server-controls';
import { PreviewFrame } from './preview-frame';
import { TerminalOutput } from './terminal-output';
import { DevServerStatus, DevServerInstance, DevServerLog, PreviewOptions } from '@/lib/preview/types';

interface PreviewPanelProps {
  projectId: string;
  projectRoot: string;
  isVisible?: boolean; // To control polling when tab is active
}

export function PreviewPanel({ projectId, projectRoot, isVisible = true }: PreviewPanelProps) {
  const [instance, setInstance] = useState<DevServerInstance | null>(null);
  const [logs, setLogs] = useState<DevServerLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTerminal, setShowTerminal] = useState(true);
  const [previewOptions, setPreviewOptions] = useState<PreviewOptions>({
    device: 'desktop',
    theme: 'light',
  });
  const [customPort, setCustomPort] = useState<string>('');
  const [useCustomPort, setUseCustomPort] = useState(false);

  // Poll for server status and logs only when visible (temporarily disabled)
  useEffect(() => {
    // Temporarily disable polling to prevent dashboard hanging
    // Will re-enable once we confirm static detection works
    return;
    
    if (!isVisible) return;

    const pollInterval = setInterval(async () => {
      try {
        await Promise.all([
          fetchStatus(),
          instance?.status === 'running' ? fetchLogs() : Promise.resolve()
        ]);
      } catch (error) {
        console.error('Error during polling:', error);
      }
    }, 3000); // Poll every 3 seconds (reduced frequency)

    // Initial fetch only if visible
    fetchStatus();

    return () => clearInterval(pollInterval);
  }, [projectId, isVisible]);

  const fetchStatus = async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}/preview`);
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setInstance(data.instance);
        }
      }
    } catch (error) {
      console.error('Failed to fetch dev server status:', error);
    }
  };

  const fetchLogs = async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}/preview/logs`);
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setLogs(data.logs.map((log: any) => ({
            ...log,
            timestamp: new Date(log.timestamp)
          })));
        }
      }
    } catch (error) {
      console.error('Failed to fetch logs:', error);
    }
  };

  const handleStart = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const requestBody: any = { projectRoot };
      
      // Include custom port if specified
      if (useCustomPort && customPort) {
        const port = parseInt(customPort, 10);
        if (isNaN(port) || port <= 0 || port > 65535) {
          setError('Invalid port number. Please enter a port between 1 and 65535.');
          setIsLoading(false);
          return;
        }
        requestBody.customPort = port;
      }
      
      const response = await fetch(`/api/projects/${projectId}/preview/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      
      const data = await response.json();
      if (data.success) {
        setInstance(data.instance);
        await fetchLogs();
      } else {
        setError(data.error || 'Failed to start dev server');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStop = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/projects/${projectId}/preview/stop`, {
        method: 'POST',
      });
      
      if (response.ok) {
        setInstance(null);
        setLogs([]);
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  const clearLogs = async () => {
    try {
      await fetch(`/api/projects/${projectId}/preview/logs`, {
        method: 'DELETE',
      });
      setLogs([]);
    } catch (error) {
      console.error('Failed to clear logs:', error);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const openInNewTab = () => {
    if (instance?.previewUrl) {
      window.open(instance.previewUrl, '_blank');
    }
  };

  const getStatusBadge = (status: DevServerStatus | null) => {
    if (!status) return null;
    
    const statusConfig = {
      stopped: { variant: 'secondary', label: 'Stopped' },
      starting: { variant: 'default', label: 'Starting...' },
      running: { variant: 'default', label: 'Running' },
      stopping: { variant: 'secondary', label: 'Stopping...' },
      error: { variant: 'destructive', label: 'Error' },
    } as const;
    
    const config = statusConfig[status];
    return (
      <Badge variant={config.variant as any} className="ml-2">
        {status === 'starting' || status === 'stopping' ? (
          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
        ) : null}
        {config.label}
      </Badge>
    );
  };

  const getDeviceFrame = () => {
    switch (previewOptions.device) {
      case 'mobile':
        return { width: '375px', height: '667px' };
      case 'tablet':
        return { width: '768px', height: '1024px' };
      default:
        return { width: '100%', height: '100%' };
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg">Local Preview</CardTitle>
              {getStatusBadge(instance?.status || null)}
            </div>
            
            <div className="flex items-center gap-2">
              {/* Device selector */}
              <Select
                value={previewOptions.device}
                onValueChange={(value: 'desktop' | 'tablet' | 'mobile') =>
                  setPreviewOptions(prev => ({ ...prev, device: value }))
                }
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="desktop">
                    <div className="flex items-center gap-2">
                      <Monitor className="h-4 w-4" />
                      Desktop
                    </div>
                  </SelectItem>
                  <SelectItem value="tablet">
                    <div className="flex items-center gap-2">
                      <Tablet className="h-4 w-4" />
                      Tablet
                    </div>
                  </SelectItem>
                  <SelectItem value="mobile">
                    <div className="flex items-center gap-2">
                      <Smartphone className="h-4 w-4" />
                      Mobile
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>

              {/* Port configuration */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Settings className="h-4 w-4 mr-1" />
                    Port
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80" align="end">
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-medium text-sm mb-2">Port Configuration</h4>
                      <p className="text-xs text-muted-foreground mb-3">
                        By default, an available port will be found automatically. You can specify a custom port if needed.
                      </p>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="useCustomPort"
                        checked={useCustomPort}
                        onChange={(e) => setUseCustomPort(e.target.checked)}
                        className="rounded border-gray-300"
                      />
                      <Label htmlFor="useCustomPort" className="text-sm">
                        Use custom port
                      </Label>
                    </div>
                    
                    {useCustomPort && (
                      <div className="space-y-2">
                        <Label htmlFor="customPort" className="text-xs">
                          Port Number (1-65535)
                        </Label>
                        <Input
                          id="customPort"
                          type="number"
                          min="1"
                          max="65535"
                          value={customPort}
                          onChange={(e) => setCustomPort(e.target.value)}
                          placeholder="3000"
                          className="text-sm"
                        />
                        <p className="text-xs text-muted-foreground">
                          Common ports: 3000 (Next.js), 5173 (Vite), 8080 (Vue)
                        </p>
                      </div>
                    )}
                    
                    {instance && (
                      <div className="pt-2 border-t">
                        <p className="text-xs text-muted-foreground">
                          Current server running on port: <span className="font-mono">{instance.config.port}</span>
                        </p>
                      </div>
                    )}
                  </div>
                </PopoverContent>
              </Popover>

              {/* Terminal toggle */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowTerminal(!showTerminal)}
                className={showTerminal ? 'bg-muted' : ''}
              >
                <Terminal className="h-4 w-4 mr-1" />
                Terminal
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Main content area */}
      <div className="grid gap-4" style={{ gridTemplateColumns: showTerminal ? '1fr 400px' : '1fr' }}>
        {/* Preview area */}
        <Card className="min-h-[600px]">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">Application Preview</h3>
                {instance?.previewUrl && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <span>•</span>
                    <code className="bg-muted px-1 py-0.5 rounded text-xs">
                      {instance.previewUrl}
                    </code>
                  </div>
                )}
              </div>
              
              <div className="flex items-center gap-1">
                <DevServerControls
                  status={instance?.status || 'stopped'}
                  isLoading={isLoading}
                  onStart={handleStart}
                  onStop={handleStop}
                  disabled={isLoading}
                />
                
                {instance?.previewUrl && (
                  <>
                    <Button variant="outline" size="sm" onClick={() => copyToClipboard(instance.previewUrl!)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={openInNewTab}>
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
            </div>
            <Separator />
          </CardHeader>
          
          <CardContent className="p-0">
            {error ? (
              <div className="flex items-center justify-center h-96 p-8">
                <div className="text-center">
                  <AlertCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
                  <h3 className="text-lg font-semibold mb-2">Dev Server Error</h3>
                  <p className="text-muted-foreground mb-4">{error}</p>
                  <Button onClick={handleStart} disabled={isLoading}>
                    Try Again
                  </Button>
                </div>
              </div>
            ) : instance?.status === 'running' && instance?.previewUrl ? (
              <div className="p-4">
                <div 
                  className="mx-auto border rounded-lg overflow-hidden bg-white"
                  style={getDeviceFrame()}
                >
                  <PreviewFrame
                    url={instance.previewUrl}
                    title={`${projectId} Preview`}
                    onLoad={() => console.log('Preview loaded')}
                    onError={(error) => console.error('Preview error:', error)}
                  />
                </div>
              </div>
            ) : instance?.status === 'starting' ? (
              <div className="flex items-center justify-center h-96">
                <div className="text-center">
                  <Loader2 className="h-8 w-8 mx-auto mb-4 animate-spin" />
                  <h3 className="text-lg font-semibold mb-2">Starting Dev Server...</h3>
                  <p className="text-muted-foreground">
                    Please wait while we start your development environment.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-96">
                <div className="text-center">
                  <Monitor className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">Preview Not Available</h3>
                  <p className="text-muted-foreground mb-4">
                    Start the dev server to see a live preview of your application.
                  </p>
                  <Button onClick={handleStart} disabled={isLoading}>
                    Start Preview
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Terminal panel */}
        {showTerminal && (
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Terminal Output</CardTitle>
                <Button variant="outline" size="sm" onClick={clearLogs}>
                  Clear
                </Button>
              </div>
              <Separator />
            </CardHeader>
            <CardContent className="p-0">
              <TerminalOutput
                logs={logs}
                isConnected={instance?.status === 'running'}
                height={600}
              />
            </CardContent>
          </Card>
        )}
      </div>

      {/* Status information */}
      {instance && (
        <Card>
          <CardContent className="pt-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Status:</span>
                <div className="font-medium">{instance.status}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Project Type:</span>
                <div className="font-medium capitalize">{instance.config.projectType}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Port:</span>
                <div className="font-medium">{instance.config.port}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Command:</span>
                <div className="font-medium font-mono text-xs">{instance.config.devCommand}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}