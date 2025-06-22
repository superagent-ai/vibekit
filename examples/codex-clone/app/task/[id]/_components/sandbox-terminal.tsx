'use client'

import { useState, useRef } from 'react'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Terminal, Code, Globe, Copy, ExternalLink, CheckCircle } from "lucide-react"
import { Task } from "@/stores/tasks"
import { Badge } from "@/components/ui/badge"

interface SandboxTerminalProps {
  task: Task
}

export function SandboxTerminal({ task }: SandboxTerminalProps) {
  const [copied, setCopied] = useState<string | null>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  
  const sandboxId = task.sandboxId
  const terminalUrl = sandboxId ? `https://${sandboxId}.e2b.dev/terminal` : null
  const codeServerUrl = sandboxId ? `https://${sandboxId}.e2b.dev/code` : null
  const sandboxUrl = sandboxId ? `https://${sandboxId}.e2b.dev` : null

  const handleCopy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  const openInNewTab = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  if (!sandboxId) {
    return (
      <Alert>
        <AlertDescription>
          No sandbox is currently active. Start a sandbox to access remote development tools.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Terminal className="h-5 w-5" />
          Remote Access Tools
        </CardTitle>
        <CardDescription>
          Access your e2b sandbox through terminal, VS Code, or direct connection
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="terminal" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="terminal">Terminal</TabsTrigger>
            <TabsTrigger value="vscode">VS Code</TabsTrigger>
            <TabsTrigger value="connections">Connections</TabsTrigger>
          </TabsList>
          
          <TabsContent value="terminal" className="space-y-4">
            <div className="rounded-lg border bg-gray-50 dark:bg-black p-1" style={{ height: '500px' }}>
              {terminalUrl && (
                <iframe
                  ref={iframeRef}
                  src={terminalUrl}
                  className="w-full h-full rounded"
                  title="E2B Terminal"
                  allow="clipboard-read; clipboard-write"
                />
              )}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => openInNewTab(terminalUrl!)}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Open in New Tab
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => iframeRef.current?.requestFullscreen()}
              >
                Fullscreen
              </Button>
            </div>
          </TabsContent>
          
          <TabsContent value="vscode" className="space-y-4">
            <div className="space-y-4">
              <Alert>
                <Code className="h-4 w-4" />
                <AlertDescription>
                  VS Code is available through Code Server running in your sandbox.
                  You can open it directly or use the embedded view below.
                </AlertDescription>
              </Alert>
              
              <div className="rounded-lg border bg-background p-4 space-y-3">
                <h4 className="font-medium">Access Options:</h4>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">Web</Badge>
                      <span className="text-sm font-mono">{codeServerUrl}</span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openInNewTab(codeServerUrl!)}
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Open VS Code
                    </Button>
                  </div>
                  
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">SSH Config</Badge>
                      <span className="text-sm">Configure local VS Code for SSH</span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleCopy(
                        `Host e2b-${sandboxId}\n  HostName ${sandboxId}.e2b.dev\n  User user\n  Port 22\n  StrictHostKeyChecking no\n  UserKnownHostsFile /dev/null`,
                        'ssh-config'
                      )}
                    >
                      {copied === 'ssh-config' ? (
                        <CheckCircle className="h-4 w-4 mr-2" />
                      ) : (
                        <Copy className="h-4 w-4 mr-2" />
                      )}
                      Copy Config
                    </Button>
                  </div>
                </div>
              </div>
              
              <div className="rounded-lg border bg-gray-50 dark:bg-black p-1" style={{ height: '400px' }}>
                {codeServerUrl && (
                  <iframe
                    src={codeServerUrl}
                    className="w-full h-full rounded"
                    title="VS Code Server"
                    allow="clipboard-read; clipboard-write"
                  />
                )}
              </div>
            </div>
          </TabsContent>
          
          <TabsContent value="connections" className="space-y-4">
            <div className="space-y-4">
              <div className="rounded-lg border p-4 space-y-3">
                <h4 className="font-medium flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  Connection Details
                </h4>
                
                <div className="space-y-2">
                  <ConnectionItem
                    label="Sandbox URL"
                    value={sandboxUrl!}
                    onCopy={() => handleCopy(sandboxUrl!, 'sandbox-url')}
                    onOpen={() => openInNewTab(sandboxUrl!)}
                    copied={copied === 'sandbox-url'}
                  />
                  
                  <ConnectionItem
                    label="Terminal URL"
                    value={terminalUrl!}
                    onCopy={() => handleCopy(terminalUrl!, 'terminal-url')}
                    onOpen={() => openInNewTab(terminalUrl!)}
                    copied={copied === 'terminal-url'}
                  />
                  
                  <ConnectionItem
                    label="VS Code URL"
                    value={codeServerUrl!}
                    onCopy={() => handleCopy(codeServerUrl!, 'vscode-url')}
                    onOpen={() => openInNewTab(codeServerUrl!)}
                    copied={copied === 'vscode-url'}
                  />
                  
                  <ConnectionItem
                    label="Sandbox ID"
                    value={sandboxId}
                    onCopy={() => handleCopy(sandboxId, 'sandbox-id')}
                    copied={copied === 'sandbox-id'}
                  />
                </div>
              </div>
              
              <Alert>
                <AlertDescription className="space-y-2">
                  <p className="font-medium">Quick Access Commands:</p>
                  <code className="block p-2 bg-muted rounded text-xs">
                    # Open VS Code in browser
                    open https://{sandboxId}.e2b.dev/code
                  </code>
                  <code className="block p-2 bg-muted rounded text-xs">
                    # Access terminal
                    open https://{sandboxId}.e2b.dev/terminal
                  </code>
                </AlertDescription>
              </Alert>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}

interface ConnectionItemProps {
  label: string
  value: string
  onCopy: () => void
  onOpen?: () => void
  copied: boolean
}

function ConnectionItem({ label, value, onCopy, onOpen, copied }: ConnectionItemProps) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-muted">
      <div className="space-y-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs font-mono text-muted-foreground">{value}</p>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={onCopy}>
          {copied ? (
            <CheckCircle className="h-4 w-4" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </Button>
        {onOpen && (
          <Button size="sm" variant="outline" onClick={onOpen}>
            <ExternalLink className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )
}