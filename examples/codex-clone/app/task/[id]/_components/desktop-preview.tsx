"use client";
import { useEffect, useRef, useState } from "react";
import { Monitor, Mouse, Keyboard, Camera, Maximize2, Minimize2, RefreshCw, Chrome, Code, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Task } from "@/stores/tasks";

interface DesktopPreviewProps {
  task: Task;
  size?: "small" | "medium" | "large" | "fullscreen";
  onClose?: () => void;
}

export function DesktopPreview({ task, size = "medium", onClose }: DesktopPreviewProps) {
  const [activeTab, setActiveTab] = useState<"desktop" | "vscode" | "terminal">("desktop");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [navigationUrl, setNavigationUrl] = useState("http://localhost:3000");
  const [mouseCoords, setMouseCoords] = useState({ x: 0, y: 0 });
  const desktopRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Get connection URLs
  const getConnectionUrls = () => {
    if (!task.sessionId) return null;
    
    // Check if this is a desktop sandbox
    const isDesktop = task.containerConnections?.environment?.includes("desktop");
    
    return {
      desktop: streamUrl || `wss://${task.sessionId}.e2b.dev/stream`,
      vscode: task.containerConnections?.codeServerUrl || `https://${task.sessionId}.e2b.dev/code`,
      terminal: task.containerConnections?.webTerminalUrl || `https://${task.sessionId}.e2b.dev/terminal`,
      isDesktop,
    };
  };

  const urls = getConnectionUrls();

  // Initialize desktop streaming connection
  useEffect(() => {
    if (!urls?.isDesktop || !urls.desktop || activeTab !== "desktop") return;

    const connectToDesktop = async () => {
      setIsConnecting(true);
      setError(null);

      try {
        // In production, this would connect to the WebSocket stream
        // For now, we'll simulate the connection
        console.log('[DesktopPreview] Connecting to desktop stream:', urls.desktop);
        
        // TODO: Implement actual WebSocket connection to E2B Desktop stream
        // const ws = new WebSocket(urls.desktop);
        // ws.onmessage = (event) => { ... handle stream frames ... }
        
        setIsLoading(false);
        setIsConnecting(false);
      } catch (err) {
        console.error('[DesktopPreview] Failed to connect to desktop:', err);
        setError("Failed to connect to desktop stream");
        setIsLoading(false);
        setIsConnecting(false);
      }
    };

    connectToDesktop();
  }, [urls, activeTab]);

  // Handle mouse interactions
  const handleMouseClick = async (e: React.MouseEvent) => {
    if (!desktopRef.current || !task.sessionId) return;

    const rect = desktopRef.current.getBoundingClientRect();
    const x = Math.round(e.clientX - rect.left);
    const y = Math.round(e.clientY - rect.top);

    try {
      const response = await fetch("/api/desktop/click", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sandboxId: task.sessionId,
          x,
          y,
          button: e.button === 2 ? "right" : "left",
        }),
      });

      if (!response.ok) throw new Error("Failed to send click");
      console.log(`[DesktopPreview] Click sent at (${x}, ${y})`);
    } catch (err) {
      console.error("[DesktopPreview] Failed to send click:", err);
    }
  };

  // Handle keyboard input
  const handleKeyboardInput = async (text: string) => {
    if (!task.sessionId) return;

    try {
      const response = await fetch("/api/desktop/type", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sandboxId: task.sessionId,
          text,
        }),
      });

      if (!response.ok) throw new Error("Failed to send keyboard input");
      console.log("[DesktopPreview] Keyboard input sent");
    } catch (err) {
      console.error("[DesktopPreview] Failed to send keyboard input:", err);
    }
  };

  // Handle browser navigation
  const handleNavigate = async () => {
    if (!task.sessionId || !navigationUrl) return;

    try {
      // Send keyboard shortcut to focus address bar (Ctrl+L)
      await fetch("/api/desktop/key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sandboxId: task.sessionId,
          key: "ctrl+l",
        }),
      });

      // Type the URL
      await handleKeyboardInput(navigationUrl);

      // Press Enter
      await fetch("/api/desktop/key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sandboxId: task.sessionId,
          key: "Return",
        }),
      });

      console.log("[DesktopPreview] Navigated to:", navigationUrl);
    } catch (err) {
      console.error("[DesktopPreview] Failed to navigate:", err);
    }
  };

  // Take screenshot
  const handleScreenshot = async () => {
    if (!task.sessionId) return;

    try {
      const response = await fetch("/api/desktop/screenshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sandboxId: task.sessionId }),
      });

      if (!response.ok) throw new Error("Failed to take screenshot");
      
      const { screenshot } = await response.json();
      // Download the screenshot
      const link = document.createElement("a");
      link.href = `data:image/png;base64,${screenshot}`;
      link.download = `desktop-screenshot-${Date.now()}.png`;
      link.click();
      
      console.log("[DesktopPreview] Screenshot captured");
    } catch (err) {
      console.error("[DesktopPreview] Failed to take screenshot:", err);
    }
  };

  // Get size classes
  const getSizeClasses = () => {
    if (isFullscreen) return "fixed inset-0 z-50";
    
    switch (size) {
      case "small":
        return "h-[400px]";
      case "large":
        return "h-[800px]";
      case "medium":
      default:
        return "h-[600px]";
    }
  };

  if (!urls) {
    return (
      <Alert>
        <AlertDescription>
          No sandbox connection available. Please wait for the sandbox to initialize.
        </AlertDescription>
      </Alert>
    );
  }

  if (!urls.isDesktop) {
    return (
      <Alert>
        <AlertDescription>
          This is not a desktop sandbox. Desktop features are only available with desktop-enabled sandboxes.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Card className={`overflow-hidden ${getSizeClasses()}`}>
      <div className="flex flex-col h-full">
        {/* Header with tabs and controls */}
        <div className="border-b bg-muted/50 p-2">
          <div className="flex items-center justify-between gap-2">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
              <TabsList className="grid w-fit grid-cols-3">
                <TabsTrigger value="desktop" className="flex items-center gap-2">
                  <Monitor className="h-4 w-4" />
                  Desktop
                </TabsTrigger>
                <TabsTrigger value="vscode" className="flex items-center gap-2">
                  <Code className="h-4 w-4" />
                  VS Code
                </TabsTrigger>
                <TabsTrigger value="terminal" className="flex items-center gap-2">
                  <Terminal className="h-4 w-4" />
                  Terminal
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleScreenshot}
                title="Take screenshot"
                disabled={activeTab !== "desktop"}
              >
                <Camera className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsFullscreen(!isFullscreen)}
                title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              >
                {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </Button>
              {onClose && (
                <Button variant="ghost" size="icon" onClick={onClose}>
                  ×
                </Button>
              )}
            </div>
          </div>

          {/* Browser navigation bar (only for desktop tab) */}
          {activeTab === "desktop" && (
            <div className="flex items-center gap-2 mt-2">
              <div className="flex items-center gap-1 flex-1">
                <Chrome className="h-4 w-4 text-muted-foreground" />
                <Input
                  value={navigationUrl}
                  onChange={(e) => setNavigationUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleNavigate()}
                  placeholder="Enter URL..."
                  className="h-8"
                />
                <Button size="sm" variant="ghost" onClick={handleNavigate}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Mouse className="h-3 w-3" />
                <span>{mouseCoords.x}, {mouseCoords.y}</span>
              </div>
            </div>
          )}
        </div>

        {/* Content area */}
        <div className="flex-1 relative">
          {activeTab === "desktop" && (
            <div
              ref={desktopRef}
              className="w-full h-full bg-black relative cursor-crosshair"
              onClick={handleMouseClick}
              onMouseMove={(e) => {
                const rect = desktopRef.current?.getBoundingClientRect();
                if (rect) {
                  setMouseCoords({
                    x: Math.round(e.clientX - rect.left),
                    y: Math.round(e.clientY - rect.top),
                  });
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                handleMouseClick(e);
              }}
            >
              {isLoading || isConnecting ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      {isConnecting ? "Connecting to desktop..." : "Loading desktop stream..."}
                    </p>
                  </div>
                </div>
              ) : error ? (
                <Alert className="m-4">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : (
                <canvas
                  ref={canvasRef}
                  className="w-full h-full"
                  style={{ imageRendering: "pixelated" }}
                />
              )}
            </div>
          )}

          {activeTab === "vscode" && (
            <iframe
              src={urls.vscode}
              className="w-full h-full border-0"
              title="VS Code"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"
              onLoad={() => setIsLoading(false)}
            />
          )}

          {activeTab === "terminal" && (
            <iframe
              src={urls.terminal}
              className="w-full h-full border-0 bg-black"
              title="Terminal"
              sandbox="allow-scripts allow-same-origin allow-forms"
              onLoad={() => setIsLoading(false)}
            />
          )}

          {isLoading && activeTab !== "desktop" && (
            <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
              <Skeleton className="w-full h-full" />
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}