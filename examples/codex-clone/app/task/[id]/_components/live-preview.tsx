"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { 
  Monitor, 
  Code, 
  Terminal, 
  RefreshCw, 
  ExternalLink, 
  Globe,
  Server,
  Loader2,
  AlertCircle,
  Copy
} from "lucide-react"
import type { Task } from "@/stores/tasks"

interface LivePreviewProps {
  task: Task
  size: "small" | "medium" | "large"
  mode?: "full" | "preview-only" | "tools-only"
}

interface DetectedService {
  port: number
  protocol: string
  name: string
  url: string
}

export function LivePreview({ task, size, mode = "full" }: LivePreviewProps) {
  const [activeTab, setActiveTab] = useState("preview")
  const [detectedServices, setDetectedServices] = useState<DetectedService[]>([])
  const [isDetecting, setIsDetecting] = useState(false)
  const [selectedService, setSelectedService] = useState<DetectedService | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [isMounted, setIsMounted] = useState(false)

  // Prevent hydration issues
  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Auto-detect running services
  useEffect(() => {
    if (!task?.sessionId || !isMounted) return

    const detectServices = async () => {
      setIsDetecting(true)
      const services: DetectedService[] = []
      
      try {
        const { getE2BContainerPortsAction } = await import("@/app/actions/inngest")
        const ports = await getE2BContainerPortsAction(task.sessionId)
        
        console.log('[LivePreview] Detected ports:', ports)
        
        // Common web development ports and their likely services
        const commonServices = [
          { port: 3000, name: "React/Next.js Dev Server" },
          { port: 5173, name: "Vite Dev Server" },
          { port: 4000, name: "Express Server" },
          { port: 8080, name: "Web Server" },
          { port: 5000, name: "Flask/Node Server" },
          { port: 3001, name: "Secondary Server" },
          { port: 8000, name: "Python Server" },
          { port: 9000, name: "Application Server" },
          { port: 8501, name: "Streamlit" },
          { port: 3002, name: "Alternative Dev Server" },
        ]
        
        // Only add actually detected/exposed ports
        if (Array.isArray(ports) && ports.length > 0) {
          console.log('[LivePreview] Processing detected ports:', ports)
          
          for (const port of ports) {
            // Skip ports that are likely our host application or system ports
            const hostPort = typeof window !== 'undefined' ? parseInt(window.location.port || '3000') : 3000
            if (port.port === hostPort) {
              console.log('[LivePreview] Skipping host app port', port.port)
              continue
            }
            
            // Skip common system/proxy ports that aren't user applications
            if ([22, 80, 443, 8288].includes(port.port)) {
              console.log('[LivePreview] Skipping system port', port.port)
              continue
            }
            
            const common = commonServices.find(s => s.port === port.port)
            const service = {
              port: port.port,
              protocol: "http",
              name: common?.name || `Port ${port.port}`,
              url: `https://${task.sessionId}.e2b.dev:${port.port}`
            }
            
            // Verify the service is actually responding and not serving our host app
            try {
              console.log('[LivePreview] Checking if port', port.port, 'is responding...')
              
              // For port 3000, do a more thorough check to see if it's different from host
              if (port.port === 3000) {
                try {
                  const testResponse = await fetch(service.url, { 
                    method: 'GET', 
                    signal: AbortSignal.timeout(3000)
                  })
                  const content = await testResponse.text()
                  
                  // Check if this looks like our host application (contains "DeepSite" or task-specific content)
                  if (content.includes('DeepSite') || content.includes('Task') || content.includes('claude')) {
                    console.log('[LivePreview] Port 3000 appears to be host application, skipping')
                    continue
                  }
                  console.log('[LivePreview] Port 3000 appears to be a different application, adding')
                } catch (error) {
                  console.log('[LivePreview] Port 3000 not responding or failed content check, skipping')
                  continue
                }
              } else {
                // For other ports, just check if they respond
                const testResponse = await fetch(service.url, { 
                  method: 'HEAD', 
                  mode: 'no-cors',
                  signal: AbortSignal.timeout(3000)
                })
              }
              
              console.log('[LivePreview] Port', port.port, 'verified, adding to services')
              services.push(service)
            } catch (error) {
              console.log('[LivePreview] Port', port.port, 'not responding or failed verification, skipping')
              // Port not responding or failed verification, don't add it
            }
          }
        } else {
          console.log('[LivePreview] No ports detected by E2B API, checking common ports...')
          
          // If no ports detected by API, try checking common development ports
          // but only add ones that actually respond (exclude host port)
          const hostPort = typeof window !== 'undefined' ? parseInt(window.location.port || '3000') : 3000
          const portsToCheck = [5173, 4000, 8080, 5000, 3001, 8000, 8501].filter(p => p !== hostPort)
          
          for (const portNum of portsToCheck) {
            try {
              const service = {
                port: portNum,
                protocol: "http",
                name: commonServices.find(s => s.port === portNum)?.name || `Port ${portNum}`,
                url: `https://${task.sessionId}.e2b.dev:${portNum}`
              }
              
              console.log('[LivePreview] Testing common port', portNum)
              const testResponse = await fetch(service.url, { 
                method: 'HEAD', 
                mode: 'no-cors',
                signal: AbortSignal.timeout(2000) // 2 second timeout for probing
              })
              
              console.log('[LivePreview] Common port', portNum, 'responded, adding to services')
              services.push(service)
            } catch (error) {
              // Port not responding, skip it
            }
          }
        }

        setDetectedServices(services)
        
        // Auto-select the first likely web server
        const webServer = services.find(s => [3000, 5173, 4000, 8080].includes(s.port))
        if (webServer && !selectedService) {
          setSelectedService(webServer)
        }
        
      } catch (error) {
        console.error('[LivePreview] Failed to detect services:', error)
      } finally {
        setIsDetecting(false)
      }
      
      // Only show fallback message if no services found
      if (services.length === 0) {
        console.log('[LivePreview] No active services found')
        // Don't add fallback services automatically
        // User can manually try URLs if needed
      }
    }

    detectServices()
    
    // Re-detect every 10 seconds while task is running
    const interval = task.status === "IN_PROGRESS" 
      ? setInterval(detectServices, 10000)
      : null

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [task?.sessionId, task?.status, selectedService, isMounted])

  const refreshPreview = () => {
    setRefreshKey(prev => prev + 1)
  }

  const openInNewTab = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const getHeaderHeight = () => {
    switch (size) {
      case "small": return "h-8"
      case "medium": return "h-10"
      case "large": return "h-12"
      default: return "h-10"
    }
  }

  const getIconSize = () => {
    switch (size) {
      case "small": return "h-3 w-3"
      case "medium": return "h-4 w-4"
      case "large": return "h-5 w-5"
      default: return "h-4 w-4"
    }
  }

  const getTextSize = () => {
    switch (size) {
      case "small": return "text-xs"
      case "medium": return "text-sm"
      case "large": return "text-base"
      default: return "text-sm"
    }
  }

  if (!task?.containerConnections) {
    return (
      <div className="flex items-center justify-center h-full bg-muted/50">
        <div className="text-center text-muted-foreground">
          <Monitor className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className={getTextSize()}>No sandbox available</p>
        </div>
      </div>
    )
  }

  // Handle different modes
  if (mode === "preview-only") {
    return (
      <div className="flex flex-col h-full bg-background">
        {/* Preview Controls */}
        <div className="border-b px-3 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isDetecting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : detectedServices.length > 0 ? (
                <select
                  title="Select port"
                  value={selectedService?.port || ""}
                  onChange={(e) => {
                    const service = detectedServices.find(s => s.port === parseInt(e.target.value))
                    setSelectedService(service || null)
                  }}
                  className="text-xs border rounded px-2 py-1 bg-background"
                >
                  <option value="">Select port...</option>
                  {detectedServices.map(service => (
                    <option key={service.port} value={service.port}>
                      :{service.port} - {service.name}
                    </option>
                  ))}
                </select>
            ) : (
              <span className="text-xs text-muted-foreground">
                No active web servers detected
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={refreshPreview}
              className="h-6 w-6 p-0"
            >
              <RefreshCw className="h-3 w-3" />
            </Button>
            {selectedService && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => openInNewTab(selectedService.url)}
                className="h-6 w-6 p-0"
              >
                <ExternalLink className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>

        {/* Preview Frame */}
        <div className="flex-1 bg-white">
          {selectedService ? (
            <iframe
              key={`${selectedService.url}-${refreshKey}`}
              src={selectedService.url}
              className="w-full h-full border-0"
              title={`Preview - ${selectedService.name}`}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
            />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <div className="text-center max-w-sm">
                <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                <p className={getTextSize()}>No web servers found</p>
                <p className="text-xs mt-1 text-muted-foreground/70">
                  Start a development server (e.g., <code className="bg-muted px-1 rounded">npm run dev</code>, <code className="bg-muted px-1 rounded">python -m http.server</code>) 
                  to see live preview
                </p>
                <p className="text-xs mt-2 text-muted-foreground/60">
                  Only active, responding servers are shown
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (mode === "tools-only") {
    return (
      <div className="p-3 h-full overflow-y-auto bg-background">
        <div className="space-y-3">
          {/* Detected Services */}
          <div>
            <h4 className="font-medium mb-2 flex items-center gap-2">
              <Globe className="h-4 w-4" />
              Detected Services
            </h4>
            <div className="space-y-2">
              {detectedServices.length > 0 ? (
                detectedServices.map(service => (
                  <Button
                    key={service.port}
                    variant="outline"
                    size="sm"
                    onClick={() => openInNewTab(service.url)}
                    className="w-full justify-start text-left"
                  >
                    <div className="flex-1">
                      <div className="font-medium">:{service.port}</div>
                      <div className="text-xs text-muted-foreground">{service.name}</div>
                    </div>
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                ))
              ) : (
                <p className="text-xs text-muted-foreground">No services detected yet</p>
              )}
            </div>
          </div>

          {/* Quick Access Tools */}
          <div>
            <h4 className="font-medium mb-2 flex items-center gap-2">
              <Server className="h-4 w-4" />
              Development Tools
            </h4>
            <div className="grid grid-cols-1 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => openInNewTab(task.containerConnections!.codeServerUrl)}
                className="justify-start"
              >
                <Code className="h-4 w-4 mr-2" />
                VS Code
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => openInNewTab(task.containerConnections!.webTerminalUrl)}
                className="justify-start"
              >
                <Terminal className="h-4 w-4 mr-2" />
                Terminal
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => openInNewTab(task.containerConnections!.sandboxUrl)}
                className="justify-start"
              >
                <Globe className="h-4 w-4 mr-2" />
                Sandbox
              </Button>
            </div>
          </div>

          {/* SSH Info */}
          {task.containerConnections.sshInfo && (
            <div>
              <h4 className="font-medium mb-2">SSH Connection</h4>
              <div className="bg-muted p-2 rounded text-xs font-mono">
                ssh {task.containerConnections.sshInfo.user}@{task.containerConnections.sshInfo.host} -p {task.containerConnections.sshInfo.port}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Full mode (original tabbed interface)
  return (
    <div className="flex flex-col h-full bg-background">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
        {/* Tab Headers */}
        <div className={`border-b px-3 py-2 ${getHeaderHeight()}`}>
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              {/* Quick Access Buttons with Tooltips */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => openInNewTab(task.containerConnections!.webTerminalUrl)}
                className="h-8 w-8 p-0"
                title="Open Terminal in new tab"
              >
                <Terminal className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => openInNewTab(task.containerConnections!.codeServerUrl)}
                className="h-8 w-8 p-0"
                title="Open VS Code in new tab"
              >
                <Code className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => openInNewTab(task.containerConnections!.sandboxUrl)}
                className="h-8 w-8 p-0"
                title="Open Sandbox in new tab"
              >
                <Globe className="h-4 w-4" />
              </Button>
            </div>
            
            <TabsList className="grid grid-cols-2 h-8">
              <TabsTrigger value="preview" className="flex items-center gap-1 px-3">
                <Monitor className={getIconSize()} />
                {size !== "small" && <span className={getTextSize()}>Preview</span>}
              </TabsTrigger>
              <TabsTrigger value="connections" className="flex items-center gap-1 px-3">
                <Server className={getIconSize()} />
                {size !== "small" && <span className={getTextSize()}>Tools</span>}
              </TabsTrigger>
            </TabsList>
          </div>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-hidden">
          <TabsContent value="preview" className="h-full m-0 p-0">
            <div className="flex flex-col h-full">
              {/* Preview Controls */}
              <div className="border-b px-3 py-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {isDetecting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <select
                      title="Select port"
                      value={selectedService?.port || ""}
                      onChange={(e) => {
                        const service = detectedServices.find(s => s.port === parseInt(e.target.value))
                        setSelectedService(service || null)
                      }}
                      className="text-xs border rounded px-2 py-1 bg-background"
                    >
                      <option value="">Select port...</option>
                      {detectedServices.map(service => (
                        <option key={service.port} value={service.port}>
                          :{service.port} - {service.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={refreshPreview}
                    className="h-6 w-6 p-0"
                  >
                    <RefreshCw className="h-3 w-3" />
                  </Button>
                  {selectedService && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openInNewTab(selectedService.url)}
                      className="h-6 w-6 p-0"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Preview Frame */}
              <div className="flex-1 bg-white">
                {selectedService ? (
                  <iframe
                    key={`${selectedService.url}-${refreshKey}`}
                    src={selectedService.url}
                    className="w-full h-full border-0"
                    title={`Preview - ${selectedService.name}`}
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    <div className="text-center">
                      <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                      <p className={getTextSize()}>No web server detected</p>
                      <p className="text-xs mt-1">Start a dev server to see preview</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="connections" className="h-full m-0 p-3 overflow-y-auto">
            <div className="space-y-3">
              {/* Detected Services */}
              <div>
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  Detected Services
                </h4>
                <div className="space-y-2">
                  {detectedServices.length > 0 ? (
                    detectedServices.map(service => (
                      <Button
                        key={service.port}
                        variant="outline"
                        size="sm"
                        onClick={() => openInNewTab(service.url)}
                        className="w-full justify-start text-left"
                      >
                        <div className="flex-1">
                          <div className="font-medium">:{service.port}</div>
                          <div className="text-xs text-muted-foreground">{service.name}</div>
                        </div>
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground">No services detected yet</p>
                  )}
                </div>
              </div>

              {/* Quick Access Tools */}
              <div>
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <Server className="h-4 w-4" />
                  Development Tools
                </h4>
                <div className="grid grid-cols-1 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openInNewTab(task.containerConnections!.codeServerUrl)}
                    className="justify-start"
                  >
                    <Code className="h-4 w-4 mr-2" />
                    VS Code
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openInNewTab(task.containerConnections!.webTerminalUrl)}
                    className="justify-start"
                  >
                    <Terminal className="h-4 w-4 mr-2" />
                    Terminal
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openInNewTab(task.containerConnections!.sandboxUrl)}
                    className="justify-start"
                  >
                    <Globe className="h-4 w-4 mr-2" />
                    Sandbox
                  </Button>
                </div>
              </div>

              {/* Enhanced SSH & VS Code Connection Info */}
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <Terminal className="h-4 w-4" />
                    VS Code SSH Remote Connection
                  </h4>
                  <Alert className="mb-3">
                    <AlertDescription>
                      Connect your local VS Code to the sandbox using the SSH Remote extension.
                    </AlertDescription>
                  </Alert>
                  
                  {/* SSH Config */}
                  <div className="space-y-2 mb-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">1. Add to ~/.ssh/config:</p>
                      <Button
                        size="sm"
                        variant="outline"
                        title="Copy SSH config"
                        onClick={() => {
                          const config = `Host e2b-${task.containerConnections?.sandboxId || task.sessionId}
  HostName ${task.containerConnections?.sandboxId || task.sessionId}.e2b.dev
  User user
  Port 22
  StrictHostKeyChecking no
  UserKnownHostsFile /dev/null
  ForwardAgent yes`
                          navigator.clipboard.writeText(config)
                        }}
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        Copy
                      </Button>
                    </div>
                    <pre className="text-xs bg-background p-3 rounded font-mono overflow-x-auto border">
{`Host e2b-${task.containerConnections?.sandboxId || task.sessionId}
  HostName ${task.containerConnections?.sandboxId || task.sessionId}.e2b.dev
  User user
  Port 22
  StrictHostKeyChecking no
  UserKnownHostsFile /dev/null
  ForwardAgent yes`}</pre>
                  </div>
                  
                  {/* VS Code Command */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">2. Connect with VS Code:</p>
                      <Button
                        size="sm"
                        variant="outline"
                        title="Copy VS Code command"
                        onClick={() => {
                          const command = `code --remote ssh-remote+e2b-${task.containerConnections?.sandboxId || task.sessionId} /home/user/`
                          navigator.clipboard.writeText(command)
                        }}
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        Copy
                      </Button>
                    </div>
                    <pre className="text-xs bg-background p-3 rounded font-mono border">
{`code --remote ssh-remote+e2b-${task.containerConnections?.sandboxId || task.sessionId} /home/user/`}</pre>
                  </div>
                  
                  {/* Quick SSH Command */}
                  {task.containerConnections?.sshInfo && (
                    <div className="mt-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">Direct SSH:</p>
                        <Button
                          size="sm"
                          variant="outline"
                          title="Copy SSH command"
                          onClick={() => {
                            const command = `ssh ${task.containerConnections?.sshInfo?.user}@${task.containerConnections?.sshInfo?.host} -p ${task.containerConnections?.sshInfo?.port}`
                            navigator.clipboard.writeText(command)
                          }}
                        >
                          <Copy className="h-3 w-3 mr-1" />
                          Copy
                        </Button>
                      </div>
                      <div className="bg-muted p-2 rounded text-xs font-mono">
                        ssh {task.containerConnections.sshInfo.user}@{task.containerConnections.sshInfo.host} -p {task.containerConnections.sshInfo.port}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}