"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Trash2, RefreshCw, Terminal, Code2, ExternalLink, Play, Pause, Clock, HelpCircle } from "lucide-react"
import { listE2BSandboxesAction, cleanupE2BSandboxAction, getE2BContainerConnectionsAction, reactivateE2BSandboxAction } from "@/app/actions/inngest"
import { pauseE2BSandboxAction, resumeE2BSandboxAction, getE2BSandboxStatusAction } from "@/app/actions/sandbox"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { toast } from "sonner"
import { useEnvironmentStore } from "@/stores/environments"
import { useTaskStore } from "@/stores/tasks"

interface Sandbox {
  id: string
  status: string
  template: string
  createdAt: string
  expiresAt: string
  url: string
  displayName: string
}

export function ActiveSandboxes() {
  const [sandboxes, setSandboxes] = useState<Sandbox[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [sandboxToDelete, setSandboxToDelete] = useState<string | null>(null)
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())
  const [pausingIds, setPausingIds] = useState<Set<string>>(new Set())
  const [resumingIds, setResumingIds] = useState<Set<string>>(new Set())
  const [extendingIds, setExtendingIds] = useState<Set<string>>(new Set())
  
  const { environments } = useEnvironmentStore()
  const { tasks } = useTaskStore()

  const fetchSandboxes = async () => {
    try {
      const activeSandboxes = await listE2BSandboxesAction()
      
      // Also check for sandboxes that might be referenced in environments or tasks
      const allSandboxIds = new Set<string>()
      
      // Add sandboxes from environments
      environments.forEach(env => {
        if (env.existingSandboxId) {
          allSandboxIds.add(env.existingSandboxId)
        }
      })
      
      // Add sandboxes from tasks
      tasks.forEach(task => {
        if (task.sessionId) {
          allSandboxIds.add(task.sessionId)
        }
      })
      
      // Check status of additional sandboxes not in the active list
      const additionalSandboxes: Sandbox[] = []
      for (const sandboxId of allSandboxIds) {
        if (!activeSandboxes.find(s => s.id === sandboxId)) {
          try {
            const status = await getE2BSandboxStatusAction(sandboxId)
            if (status.exists) {
              additionalSandboxes.push({
                id: sandboxId,
                status: status.status,
                template: status.template || 'unknown',
                createdAt: status.createdAt || new Date().toISOString(),
                expiresAt: status.expiresAt || new Date().toISOString(),
                url: `https://${sandboxId}.e2b.dev`,
                displayName: `${status.template || 'unknown'} (${sandboxId.substring(0, 8)}...)`
              })
            }
          } catch (error) {
            console.error(`Failed to check sandbox ${sandboxId}:`, error)
          }
        }
      }
      
      setSandboxes([...activeSandboxes, ...additionalSandboxes])
    } catch (error) {
      console.error("Failed to fetch sandboxes:", error)
      toast.error("Failed to fetch active sandboxes")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchSandboxes()
  }, [])

  const handleRefresh = () => {
    setRefreshing(true)
    fetchSandboxes()
  }

  const handleDeleteSandbox = async (sandboxId: string) => {
    setDeletingIds(prev => new Set([...prev, sandboxId]))
    try {
      await cleanupE2BSandboxAction(sandboxId)
      toast.success("Sandbox deleted successfully")
      // Remove from local state
      setSandboxes(prev => prev.filter(s => s.id !== sandboxId))
    } catch (error) {
      console.error("Failed to delete sandbox:", error)
      toast.error("Failed to delete sandbox")
    } finally {
      setDeletingIds(prev => {
        const newSet = new Set(prev)
        newSet.delete(sandboxId)
        return newSet
      })
      setSandboxToDelete(null)
    }
  }

  const handlePauseSandbox = async (sandboxId: string) => {
    setPausingIds(prev => new Set([...prev, sandboxId]))
    try {
      await pauseE2BSandboxAction(sandboxId)
      toast.success("Sandbox paused successfully")
      await fetchSandboxes() // Refresh the list
    } catch (error) {
      console.error("Failed to pause sandbox:", error)
      toast.error("Failed to pause sandbox")
    } finally {
      setPausingIds(prev => {
        const newSet = new Set(prev)
        newSet.delete(sandboxId)
        return newSet
      })
    }
  }

  const handleResumeSandbox = async (sandboxId: string) => {
    setResumingIds(prev => new Set([...prev, sandboxId]))
    try {
      // Check if the sandbox is inactive or paused to determine the message
      const currentSandbox = sandboxes.find(s => s.id === sandboxId)
      const isInactive = currentSandbox && (
        currentSandbox.status === 'stopped' || 
        currentSandbox.status === 'inactive' ||
        (!['running', 'active', 'paused', 'expired'].includes(currentSandbox.status))
      )
      
      await resumeE2BSandboxAction(sandboxId)
      toast.success(isInactive ? "Sandbox started successfully" : "Sandbox resumed successfully")
      await fetchSandboxes() // Refresh the list
    } catch (error) {
      console.error("Failed to resume/start sandbox:", error)
      toast.error("Failed to start sandbox")
    } finally {
      setResumingIds(prev => {
        const newSet = new Set(prev)
        newSet.delete(sandboxId)
        return newSet
      })
    }
  }

  const handleExtendSandbox = async (sandboxId: string) => {
    setExtendingIds(prev => new Set([...prev, sandboxId]))
    try {
      await reactivateE2BSandboxAction(sandboxId)
      toast.success("Sandbox extended for 1 hour")
      await fetchSandboxes() // Refresh the list
    } catch (error) {
      console.error("Failed to extend sandbox:", error)
      toast.error("Failed to extend sandbox timeout")
    } finally {
      setExtendingIds(prev => {
        const newSet = new Set(prev)
        newSet.delete(sandboxId)
        return newSet
      })
    }
  }

  const handleKillAll = async () => {
    if (sandboxes.length === 0) return

    const confirmed = window.confirm(`Are you sure you want to delete all ${sandboxes.length} sandboxes?`)
    if (!confirmed) return

    // Delete all sandboxes in parallel
    const deletePromises = sandboxes.map(sandbox => 
      cleanupE2BSandboxAction(sandbox.id).catch(error => {
        console.error(`Failed to delete sandbox ${sandbox.id}:`, error)
        return null
      })
    )

    setLoading(true)
    await Promise.all(deletePromises)
    toast.success("All sandboxes deleted")
    setSandboxes([])
    setLoading(false)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString()
  }

  const getTimeRemaining = (expiresAt: string) => {
    const now = new Date()
    const expiry = new Date(expiresAt)
    const diff = expiry.getTime() - now.getTime()
    
    if (diff <= 0) return "Expired"
    
    const minutes = Math.floor(diff / 1000 / 60)
    const hours = Math.floor(minutes / 60)
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m remaining`
    }
    return `${minutes}m remaining`
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Active E2B Sandboxes</CardTitle>
          <CardDescription>Loading active sandboxes...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-2">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          </div>
        </CardContent>
      </Card>
    )
  }

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case 'running':
      case 'active':
        return <Badge variant="default">Running</Badge>
      case 'paused':
        return <Badge variant="secondary">Paused</Badge>
      case 'stopped':
      case 'inactive':
        return <Badge variant="secondary">Inactive</Badge>
      case 'expired':
        return <Badge variant="destructive">Expired</Badge>
      default:
        // If status is unclear, treat it as inactive
        return <Badge variant="secondary">Inactive</Badge>
    }
  }

  const getLinkedInfo = (sandboxId: string) => {
    const linkedEnvs = environments.filter(env => env.existingSandboxId === sandboxId)
    const linkedTasks = tasks.filter(task => task.sessionId === sandboxId)
    
    return {
      environments: linkedEnvs,
      tasks: linkedTasks,
      hasLinks: linkedEnvs.length > 0 || linkedTasks.length > 0
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                Active E2B Sandboxes
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <HelpCircle className="h-4 w-4 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="mb-2">E2B sandboxes are cloud-based development environments that run your code.</p>
                      <p className="mb-2">Sandboxes are created automatically when you run a task. Each sandbox:</p>
                      <ul className="list-disc list-inside text-xs space-y-1">
                        <li>Runs for up to 1 hour</li>
                        <li>Can be paused to save resources</li>
                        <li>Can be resumed from where it left off</li>
                        <li>Is separate from environment configurations</li>
                      </ul>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </CardTitle>
              <CardDescription>
                Running E2B sandbox instances. Sandboxes are created when tasks are executed.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={refreshing}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              {sandboxes.length > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleKillAll}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Kill All
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {sandboxes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No active sandboxes found
            </div>
          ) : (
            <div className="space-y-4">
              {sandboxes.map((sandbox) => {
                const linkedInfo = getLinkedInfo(sandbox.id)
                const isRunning = sandbox.status === 'running' || sandbox.status === 'active'
                const isPaused = sandbox.status === 'paused'
                const isInactive = sandbox.status === 'stopped' || sandbox.status === 'inactive' || 
                                  (!isRunning && !isPaused && sandbox.status !== 'expired')
                
                return (
                  <div
                    key={sandbox.id}
                    className="flex flex-col gap-3 p-4 border rounded-lg"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium">{sandbox.displayName}</span>
                          {getStatusBadge(sandbox.status)}
                          {linkedInfo.hasLinks && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <Badge variant="outline" className="text-xs">
                                    Linked
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <div className="text-xs">
                                    {linkedInfo.environments.length > 0 && (
                                      <p>Environments: {linkedInfo.environments.map(e => e.name).join(', ')}</p>
                                    )}
                                    {linkedInfo.tasks.length > 0 && (
                                      <p>Tasks: {linkedInfo.tasks.length}</p>
                                    )}
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground space-y-1">
                          <div>Created: {formatDate(sandbox.createdAt)}</div>
                          <div>Expires: {formatDate(sandbox.expiresAt)} ({getTimeRemaining(sandbox.expiresAt)})</div>
                          <div className="text-xs font-mono">{sandbox.id}</div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Access buttons */}
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(`https://${sandbox.id}.e2b.dev/terminal`, '_blank')}
                          title="Open Terminal"
                        >
                          <Terminal className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(`https://${sandbox.id}.e2b.dev/code`, '_blank')}
                          title="Open VS Code"
                        >
                          <Code2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(sandbox.url, '_blank')}
                          title="Open Sandbox"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </div>
                      
                      <div className="h-4 w-px bg-border" />
                      
                      {/* Control buttons */}
                      <div className="flex items-center gap-1">
                        {isRunning && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handlePauseSandbox(sandbox.id)}
                            disabled={pausingIds.has(sandbox.id)}
                            title="Pause sandbox"
                          >
                            {pausingIds.has(sandbox.id) ? (
                              <RefreshCw className="h-4 w-4 animate-spin" />
                            ) : (
                              <Pause className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                        
                        {(isPaused || isInactive) && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleResumeSandbox(sandbox.id)}
                            disabled={resumingIds.has(sandbox.id)}
                            title={isInactive ? "Start sandbox" : "Resume sandbox"}
                          >
                            {resumingIds.has(sandbox.id) ? (
                              <RefreshCw className="h-4 w-4 animate-spin" />
                            ) : (
                              <Play className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                        
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleExtendSandbox(sandbox.id)}
                          disabled={extendingIds.has(sandbox.id)}
                          title="Extend sandbox timeout by 1 hour"
                        >
                          {extendingIds.has(sandbox.id) ? (
                            <RefreshCw className="h-4 w-4 animate-spin" />
                          ) : (
                            <Clock className="h-4 w-4" />
                          )}
                        </Button>
                        
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => setSandboxToDelete(sandbox.id)}
                          disabled={deletingIds.has(sandbox.id)}
                          title="Delete sandbox"
                        >
                          {deletingIds.has(sandbox.id) ? (
                            <RefreshCw className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!sandboxToDelete} onOpenChange={() => setSandboxToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Sandbox</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this sandbox? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => sandboxToDelete && handleDeleteSandbox(sandboxToDelete)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}