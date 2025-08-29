"use client";

import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { 
  Play, 
  Square, 
  ExternalLink, 
  Copy,
  AlertCircle,
  Loader2,
  Monitor,
  Smartphone,
  Tablet,
  Laptop,
  Terminal
} from 'lucide-react';

interface SimplePreviewPanelProps {
  projectId: string;
  projectRoot: string;
}

type ViewportMode = 'desktop' | 'tablet' | 'mobile';

interface ViewportConfig {
  mode: ViewportMode;
  width: string;
  height: string;
  icon: any;
  label: string;
}

const viewportConfigs: ViewportConfig[] = [
  { mode: 'desktop', width: '100%', height: '600px', icon: Laptop, label: 'Desktop' },
  { mode: 'tablet', width: '768px', height: '1024px', icon: Tablet, label: 'Tablet' },
  { mode: 'mobile', width: '375px', height: '667px', icon: Smartphone, label: 'Mobile' }
];

export function SimplePreviewPanel({ projectId, projectRoot }: SimplePreviewPanelProps) {
  const [isStarting, setIsStarting] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [iframeError, setIframeError] = useState(false);
  const [isFirefox, setIsFirefox] = useState(false);
  const [viewportMode, setViewportMode] = useState<ViewportMode>('desktop');
  const [showTerminal, setShowTerminal] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);

  // Memoized checkServerStatus function to prevent stale closures
  const checkServerStatus = useCallback(async () => {
    console.debug('Checking server status for project:', projectId);
    setIsCheckingStatus(true);
    
    try {
      const response = await fetch(`/api/projects/${projectId}/preview`);
      const data = await response.json();
      
      console.debug('Server status response:', { projectId, data });
      
      if (data.success && data.instance) {
        const newRunning = data.instance.status === 'running' || data.instance.status === 'starting';
        
        setIsRunning(prevRunning => {
          const wasRunning = prevRunning;
          
          if (newRunning && !wasRunning) {
            console.debug('Server detected as running, restoring state');
            setLogs(['🔄 Reconnected to existing server']);
            setIframeError(false); // Reset iframe error when server is running
            
            // Try to get recent logs from server
            setTimeout(async () => {
              try {
                const logsResponse = await fetch(`/api/projects/${projectId}/preview/logs`);
                if (logsResponse.ok) {
                  const logsData = await logsResponse.json();
                  if (logsData.success && logsData.logs) {
                    setLogs(prev => [...prev, ...logsData.logs.map((log: any) => `[Restored] ${log.message}`)]);
                  }
                }
              } catch (logError) {
                console.debug('Could not restore logs:', logError);
              }
            }, 0);
          }
          
          return newRunning;
        });
        
        setPreviewUrl(data.instance.previewUrl || null);
      } else {
        console.debug('No active server found for project:', projectId);
        setIsRunning(false);
        setPreviewUrl(null);
      }
    } catch (error) {
      console.debug('Error checking server status:', { projectId, error });
      setIsRunning(false);
      setPreviewUrl(null);
    } finally {
      setIsCheckingStatus(false);
    }
  }, [projectId]);

  // Detect Firefox and check server status on component mount
  React.useEffect(() => {
    setIsFirefox(navigator.userAgent.toLowerCase().includes('firefox'));
    
    console.debug('SimplePreviewPanel mounted for project:', projectId);
    
    // Check if server is already running when component mounts
    checkServerStatus();
  }, [projectId, checkServerStatus]);

  // Re-check server status when tab becomes visible
  React.useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        console.debug('Tab became visible, rechecking server status');
        checkServerStatus();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [checkServerStatus]);

  // Keyboard shortcuts
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ctrl/Cmd + ` to toggle terminal
      if ((event.ctrlKey || event.metaKey) && event.key === '`') {
        event.preventDefault();
        setShowTerminal(!showTerminal);
      }
      // Escape to close terminal when open
      if (event.key === 'Escape' && showTerminal) {
        setShowTerminal(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showTerminal]);

  // Server activity tracking to prevent idle cleanup
  React.useEffect(() => {
    if (!isRunning || !previewUrl) return;

    const updateActivity = async () => {
      try {
        await fetch(`/api/projects/${projectId}/preview/activity`, {
          method: 'POST',
        });
      } catch (error) {
        // Silently fail - activity updates are not critical
        console.debug('Failed to update server activity:', error);
      }
    };

    // Update activity every 5 minutes when server is running
    const activityInterval = setInterval(updateActivity, 5 * 60 * 1000);
    
    // Update activity immediately
    updateActivity();

    return () => {
      clearInterval(activityInterval);
    };
  }, [isRunning, previewUrl, projectId]);

  const handleStart = async () => {
    setIsStarting(true);
    setError(null);
    setIframeError(false);
    setLogs(['Starting dev server...']);
    setShowTerminal(true); // Auto-show terminal during startup
    
    try {
      const response = await fetch(`/api/projects/${projectId}/preview/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectRoot }),
      });
      
      const data = await response.json();
      if (data.success) {
        setIsRunning(true);
        setPreviewUrl(data.instance?.previewUrl || null);
        setIframeError(false); // Reset iframe error when starting successfully
        setLogs(prev => [...prev, '✅ Server started successfully!']);
        // Auto-close terminal after successful start (after a brief delay)
        setTimeout(() => {
          setShowTerminal(false);
        }, 2000);
      } else {
        setError(data.error || 'Failed to start dev server');
        setLogs(prev => [...prev, `❌ ${data.error}`]);
        // Keep terminal open on error so user can see what went wrong
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setError(errorMessage);
      setLogs(prev => [...prev, `❌ ${errorMessage}`]);
    } finally {
      setIsStarting(false);
    }
  };

  const handleStop = async () => {
    setIsStarting(true);
    
    try {
      const response = await fetch(`/api/projects/${projectId}/preview/stop`, {
        method: 'POST',
      });
      
      if (response.ok) {
        setIsRunning(false);
        setPreviewUrl(null);
        setLogs(prev => [...prev, '🛑 Server stopped']);
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsStarting(false);
    }
  };

  const handleRefreshStatus = async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}/preview`);
      const data = await response.json();
      
      if (data.success && data.instance) {
        const wasRunning = isRunning;
        setIsRunning(data.instance.status === 'running');
        setPreviewUrl(data.instance.previewUrl || null);
        
        // Only add log if status actually changed or it's a manual refresh
        if (!wasRunning && data.instance.status === 'running') {
          setLogs(prev => [...prev, '🔄 Server is now running']);
        } else if (wasRunning && data.instance.status !== 'running') {
          setLogs(prev => [...prev, '🛑 Server has stopped']);
        } else {
          setLogs(prev => [...prev, `📊 Status: ${data.instance.status}`]);
        }
      } else {
        setIsRunning(false);
        setPreviewUrl(null);
        setLogs(prev => [...prev, '📊 No active server found']);
      }
    } catch (error) {
      setLogs(prev => [...prev, `⚠️ Status check failed: ${error}`]);
    }
  };

  const copyToClipboard = () => {
    if (previewUrl) {
      navigator.clipboard.writeText(previewUrl);
      setLogs(prev => [...prev, '📋 URL copied to clipboard']);
    }
  };

  const openInNewTab = () => {
    if (previewUrl) {
      window.open(previewUrl, '_blank');
    }
  };

  const handleIframeError = () => {
    setIframeError(true);
    setLogs(prev => [...prev, '⚠️ Iframe failed to load - this may be a Firefox-specific issue']);
  };

  // Test if URL is actually accessible
  const testUrlAccessibility = async (url: string): Promise<boolean> => {
    try {
      const response = await fetch(url, { 
        method: 'HEAD',
        mode: 'no-cors'
      });
      return true;
    } catch (error) {
      return false;
    }
  };

  // Update server activity when user interacts with preview
  const updateServerActivity = React.useCallback(async () => {
    if (!isRunning) return;
    
    try {
      await fetch(`/api/projects/${projectId}/preview/activity`, {
        method: 'POST',
      });
    } catch (error) {
      console.debug('Failed to update server activity:', error);
    }
  }, [isRunning, projectId]);

  const currentViewport = viewportConfigs.find(v => v.mode === viewportMode) || viewportConfigs[0];

  return (
    <div className="space-y-4">
      {/* Main preview area */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">Application Preview</h3>
                <Badge variant={isRunning ? 'default' : 'secondary'}>
                  {isRunning ? 'Running' : 'Stopped'}
                </Badge>
              </div>
              
              {/* Viewport switcher */}
              {isRunning && previewUrl && !iframeError && (
                <div className="flex items-center gap-1 bg-gray-100 rounded-md p-1">
                  {viewportConfigs.map((config) => {
                    const Icon = config.icon;
                    return (
                      <Button
                        key={config.mode}
                        variant={viewportMode === config.mode ? "default" : "ghost"}
                        size="sm"
                        onClick={() => {
                          setViewportMode(config.mode);
                          updateServerActivity();
                        }}
                        className="px-2 py-1 h-8 flex-shrink-0"
                      >
                        <Icon className="h-4 w-4" />
                        <span className="ml-1 text-xs hidden sm:inline">{config.label}</span>
                      </Button>
                    );
                  })}
                </div>
              )}
            </div>
            
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  handleRefreshStatus();
                  updateServerActivity();
                }}
                disabled={isStarting}
              >
                <Monitor className="h-4 w-4 mr-1" />
                <span className="hidden sm:inline">Check Status</span>
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowTerminal(!showTerminal)}
                className={showTerminal ? 'bg-accent' : ''}
              >
                <div className="relative">
                  <Terminal className="h-4 w-4 mr-1" />
                  {logs.length > 0 && !showTerminal && (
                    <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-xs rounded-full h-4 w-4 flex items-center justify-center">
                      {logs.length > 9 ? '9+' : logs.length}
                    </span>
                  )}
                </div>
                <span className="hidden sm:inline">Terminal</span>
              </Button>
              
              {!isRunning && (
                <Button 
                  onClick={handleStart} 
                  disabled={isStarting}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {isStarting ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <Play className="h-4 w-4 mr-1" />
                  )}
                  Start Preview
                </Button>
              )}
              
              {isRunning && (
                <>
                  <Button 
                    variant="destructive"
                    onClick={handleStop}
                    disabled={isStarting}
                  >
                    <Square className="h-4 w-4 mr-1" />
                    Stop
                  </Button>
                  {previewUrl && (
                    <>
                      <Button variant="outline" size="sm" onClick={copyToClipboard}>
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={openInNewTab}>
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="p-4">
          {error ? (
            <div className="flex items-center justify-center h-96 p-8">
              <div className="text-center">
                <AlertCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
                <h3 className="text-lg font-semibold mb-2">Server Error</h3>
                <p className="text-muted-foreground mb-4">{error}</p>
                <Button onClick={handleStart} disabled={isStarting}>
                  Try Again
                </Button>
              </div>
            </div>
          ) : isRunning && previewUrl ? (
            iframeError ? (
              <div className="mx-auto border rounded-lg overflow-hidden bg-gray-50 h-96 flex items-center justify-center">
                <div className="text-center p-8">
                  <AlertCircle className="h-12 w-12 mx-auto mb-4 text-yellow-500" />
                  <h3 className="text-lg font-semibold mb-2">Preview not available in iframe</h3>
                  <p className="text-muted-foreground mb-4">
                    {isFirefox 
                      ? "Firefox has strict security policies for local previews. Please open in a new tab."
                      : "The iframe failed to load. Please try opening in a new tab."}
                  </p>
                  <div className="flex gap-2 justify-center">
                    <Button onClick={openInNewTab} className="bg-blue-600 hover:bg-blue-700">
                      <ExternalLink className="h-4 w-4 mr-1" />
                      Open in New Tab
                    </Button>
                    <Button variant="outline" onClick={copyToClipboard}>
                      <Copy className="h-4 w-4 mr-1" />
                      Copy URL
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    URL: {previewUrl}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex justify-center overflow-auto">
                <div 
                  className="border rounded-lg overflow-hidden bg-white shadow-lg transition-all duration-300"
                  style={{
                    width: viewportMode === 'desktop' ? '100%' : currentViewport.width,
                    height: currentViewport.height,
                    maxWidth: '100%',
                    maxHeight: viewportMode === 'desktop' ? '600px' : currentViewport.height,
                    minHeight: '400px'
                  }}
                >
                  <iframe
                    src={previewUrl}
                    title={`${projectId} Preview`}
                    className="w-full h-full border-0"
                    sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-downloads"
                    onError={handleIframeError}
                    onLoad={() => {
                      console.debug('Iframe loaded successfully for:', previewUrl);
                      // Don't auto-trigger error detection on load
                      // Let the browser handle iframe loading naturally
                    }}
                  />
                </div>
              </div>
            )
          ) : (
            <div className="flex items-center justify-center h-96">
              <div className="text-center">
                {isCheckingStatus ? (
                  <>
                    <Loader2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground animate-spin" />
                    <h3 className="text-lg font-semibold mb-2">Checking Server Status...</h3>
                    <p className="text-muted-foreground mb-4">
                      Verifying if the dev server is already running.
                    </p>
                  </>
                ) : (
                  <>
                    <Monitor className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="text-lg font-semibold mb-2">Preview Not Running</h3>
                    <p className="text-muted-foreground mb-4">
                      Start the dev server to see a live preview of your application.
                    </p>
                  </>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Terminal Modal */}
      <Dialog open={showTerminal} onOpenChange={setShowTerminal}>
        <DialogContent 
          className="flex flex-col p-4" 
          style={{ 
            maxWidth: '95vw', 
            width: '95vw',
            height: '90vh',
            maxHeight: '90vh'
          }}
        >
          <DialogHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Terminal className="h-5 w-5" />
              <DialogTitle className="text-xl">Development Server Terminal</DialogTitle>
            </div>
          </DialogHeader>
          
          <div className="flex-1 min-h-0 mt-4">
            <div className="bg-black text-green-400 font-mono text-base p-8 rounded-lg h-full overflow-y-auto">
              {logs.length === 0 ? (
                <div className="text-gray-500">No logs yet...</div>
              ) : (
                logs.map((log, index) => (
                  <div key={index} className="mb-2 leading-normal">
                    <span className="text-gray-500">{new Date().toLocaleTimeString()}</span> {log}
                  </div>
                ))
              )}
              {previewUrl && (
                <div className="mt-6 pt-3 border-t border-green-800">
                  <div className="text-blue-400">
                    🌐 Preview URL: <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-300">{previewUrl}</a>
                  </div>
                </div>
              )}
            </div>
          </div>
          
          <div className="flex justify-between items-center mt-3 pt-3 border-t">
            <div className="text-sm text-muted-foreground flex items-center gap-4">
              <span>{logs.length} {logs.length === 1 ? 'entry' : 'entries'}</span>
              <span className="text-xs">Press Ctrl+` to toggle terminal</span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setLogs([])}>
                Clear All
              </Button>
              <Button size="sm" onClick={() => setShowTerminal(false)}>
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}