import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Clock, User, Activity, ChevronDown, ChevronRight } from 'lucide-react'
import { formatDate, formatDuration } from '../lib/utils'
import { telemetryAPI } from '../lib/telemetry-api'
import { parseStreamData, groupEventsByPrompt, EventGroup } from '../lib/stream-parser'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible'
import { ScrollArea } from './ui/scroll-area'
import { Separator } from './ui/separator'

interface SessionEvent {
  id: number
  sessionId: string
  eventType: string
  agentType: string
  mode: string
  prompt: string
  streamData: string | null
  sandboxId: string | null
  repoUrl: string | null
  metadata: string | null
  timestamp: number
  createdAt: number
  version: number
  schemaVersion: string
}

interface SessionEventsResponse {
  sessionId: string
  events: SessionEvent[]
  count: number
  timestamp: string
}

export function SessionDetail() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set())
  const [expandedJsons, setExpandedJsons] = useState<Set<string>>(new Set())
  
  // Fetch session details
  const { data: sessionData, isLoading: sessionLoading, error: sessionError } = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => telemetryAPI.querySessions({ sessionId }),
    enabled: !!sessionId,
  })

  // Fetch session events
  const { data: eventsData, isLoading: eventsLoading, error: eventsError } = useQuery({
    queryKey: ['sessionEvents', sessionId],
    queryFn: async (): Promise<SessionEventsResponse> => {
      const response = await fetch(`http://localhost:3000/sessions/${sessionId}/events?limit=1000`)
      if (!response.ok) {
        throw new Error(`Failed to fetch events: ${response.statusText}`)
      }
      return response.json()
    },
    enabled: !!sessionId,
  })

  if (!sessionId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="text-destructive">Session Not Found</CardTitle>
          </CardHeader>
          <CardContent>
            <Link to="/" className="text-primary hover:underline">
              ← Back to Dashboard
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (sessionLoading || eventsLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="flex flex-col items-center p-6">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-4"></div>
            <p className="text-muted-foreground">Loading session details...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (sessionError || eventsError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="text-destructive">Error Loading Session</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              {sessionError ? String(sessionError) : String(eventsError)}
            </p>
            <Link to="/">
              <Button variant="outline">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Dashboard
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  const session = sessionData?.results?.[0]
  const events = eventsData?.events || []

  if (!session) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Session Not Found</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">Session "{sessionId}" does not exist.</p>
            <Link to="/">
              <Button variant="outline">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Dashboard
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  let parsedMetadata: any = {}
  try {
    parsedMetadata = JSON.parse(session.metadata || '{}')
  } catch (e) {
    // Ignore parsing errors
  }

  // Group events by prompt
  const eventGroups = groupEventsByPrompt(events)

  const toggleGroupExpansion = (groupIndex: number) => {
    const newExpanded = new Set(expandedGroups)
    if (newExpanded.has(groupIndex)) {
      newExpanded.delete(groupIndex)
    } else {
      newExpanded.add(groupIndex)
    }
    setExpandedGroups(newExpanded)
  }

  const toggleJsonExpansion = (eventId: string) => {
    const newExpanded = new Set(expandedJsons)
    if (newExpanded.has(eventId)) {
      newExpanded.delete(eventId)
    } else {
      newExpanded.add(eventId)
    }
    setExpandedJsons(newExpanded)
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Compact Header */}
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Link to="/">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
              </Link>
              <Separator orientation="vertical" className="h-6" />
              <div className="flex items-center space-x-3">
                <h1 className="text-xl font-semibold">Session Details</h1>
                <Badge variant={
                  session.status === 'completed' ? 'default' :
                  session.status === 'error' ? 'destructive' :
                  session.status === 'active' ? 'secondary' : 'outline'
                }>
                  {session.status}
                </Badge>
              </div>
            </div>
            
            <div className="flex items-center space-x-6 text-sm text-muted-foreground">
              <div className="flex items-center space-x-1">
                <User className="w-4 h-4" />
                <span>{session.agentType}</span>
              </div>
              <div className="flex items-center space-x-1">
                <Activity className="w-4 h-4" />
                <span>{session.mode}</span>
              </div>
              {session.duration && (
                <div className="flex items-center space-x-1">
                  <Clock className="w-4 h-4" />
                  <span>{formatDuration(session.duration)}</span>
                </div>
              )}
              <span>Started {formatDate(session.startTime)}</span>
            </div>
          </div>
          
          {/* Quick Stats & Metadata */}
          <div className="flex items-center justify-between mt-3 pt-3 border-t">
            <div className="flex items-center space-x-6">
              <Badge variant="outline">
                {session.eventCount || 0} Total Events
              </Badge>
              <Badge variant="outline">
                {session.streamEventCount || 0} Stream Events
              </Badge>
              {session.errorCount > 0 && (
                <Badge variant="destructive">
                  {session.errorCount} Errors
                </Badge>
              )}
              {session.repoUrl && (
                <span className="text-sm text-muted-foreground">
                  📁 {session.repoUrl}
                </span>
              )}
              {parsedMetadata.model && (
                <span className="text-sm text-muted-foreground">
                  🤖 {parsedMetadata.model}
                </span>
              )}
            </div>
            
            <div className="text-xs text-muted-foreground font-mono">
              {session.id}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <ScrollArea className="h-[calc(100vh-200px)]">
          <div className="space-y-6">
            {eventGroups.length > 0 ? (
              eventGroups.map((group: EventGroup, groupIndex: number) => (
                <Card key={groupIndex} className="overflow-hidden">
                  <Collapsible
                    open={expandedGroups.has(groupIndex)}
                    onOpenChange={() => toggleGroupExpansion(groupIndex)}
                  >
                    <CollapsibleTrigger asChild>
                      <CardHeader className="pb-3 cursor-pointer hover:bg-muted/50 transition-colors">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center space-x-2 mb-2">
                              {expandedGroups.has(groupIndex) ? (
                                <ChevronDown className="w-4 h-4 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-muted-foreground" />
                              )}
                              <CardTitle className="text-base font-medium leading-tight">
                                {group.prompt}
                              </CardTitle>
                            </div>
                            <div className="flex items-center space-x-4 text-sm text-muted-foreground ml-6">
                              <span>📊 {group.summary.totalStreams} events</span>
                              {group.summary.filesAffected.length > 0 && (
                                <span>📁 {group.summary.filesAffected.slice(0, 2).join(', ')}
                                  {group.summary.filesAffected.length > 2 && ` +${group.summary.filesAffected.length - 2} more`}
                                </span>
                              )}
                              {group.duration && (
                                <span>⏱️ {formatDuration(group.duration)}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center space-x-2 ml-4">
                            {group.startEvent && (
                              <Badge variant="outline" className="text-xs">
                                🚀 {formatDate(group.startEvent.timestamp)}
                              </Badge>
                            )}
                            {group.endEvent && (
                              <Badge variant="outline" className="text-xs">
                                ✅ {formatDate(group.endEvent.timestamp)}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </CardHeader>
                    </CollapsibleTrigger>
                  
                                     <CollapsibleContent>
                     <CardContent className="pt-0">
                       <Separator className="mb-4" />
                       
                       {/* Events Table */}
                       {group.streamEvents.length > 0 ? (
                         <div className="overflow-x-auto">
                           <table className="w-full table-fixed">
                             <thead>
                               <tr className="border-b text-sm text-muted-foreground">
                                 <th className="text-left py-2 px-3 font-medium w-20">Type</th>
                                 <th className="text-left py-2 px-3 font-medium">Stream Data (JSON)</th>
                                 <th className="text-left py-2 px-3 font-medium w-24">Time</th>
                               </tr>
                             </thead>
                             <tbody>
                               {group.streamEvents.map((event: SessionEvent) => {
                                 const parsed = parseStreamData(event.streamData)
                                 
                                 return (
                                   <tr key={event.id} className="border-b hover:bg-muted/20 align-top">
                                     <td className="py-3 px-3 align-top">
                                       <Badge variant="outline" className="text-xs">
                                         {parsed?.type || 'unknown'}
                                       </Badge>
                                     </td>
                                                                           <td className="py-3 px-3 align-top">
                                        <div 
                                          className="font-mono text-[11px] max-w-lg break-words whitespace-pre-wrap cursor-pointer hover:bg-muted/20 p-2 rounded transition-colors"
                                          onClick={() => toggleJsonExpansion(`${groupIndex}-${event.id}`)}
                                        >
                                          {event.streamData ? (
                                            (() => {
                                              try {
                                                const formatted = JSON.stringify(JSON.parse(event.streamData), null, 2)
                                                const lines = formatted.split('\n')
                                                const isExpanded = expandedJsons.has(`${groupIndex}-${event.id}`)
                                                
                                                if (lines.length > 4 && !isExpanded) {
                                                  return lines.slice(0, 4).join('\n') + '\n  ...'
                                                }
                                                return formatted
                                              } catch {
                                                const text = event.streamData
                                                const lines = text.split('\n')
                                                const isExpanded = expandedJsons.has(`${groupIndex}-${event.id}`)
                                                
                                                if (lines.length > 4 && !isExpanded) {
                                                  return lines.slice(0, 4).join('\n') + '\n...'
                                                }
                                                return text
                                              }
                                            })()
                                          ) : 'No data'}
                                        </div>
                                      </td>
                                     <td className="py-3 px-3 align-top">
                                       <span className="text-xs text-muted-foreground font-mono">
                                         {formatDate(event.timestamp)}
                                       </span>
                                     </td>
                                   </tr>
                                 )
                               })}
                             </tbody>
                           </table>
                         </div>
                       ) : (
                         <div className="text-center py-8 text-muted-foreground">
                           <Activity className="w-8 h-8 mx-auto mb-2" />
                           <p>No stream events in this group</p>
                         </div>
                       )}
                     </CardContent>
                   </CollapsibleContent>
                 </Collapsible>
                </Card>
              ))
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Activity className="w-12 h-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No events recorded for this session</p>
                </CardContent>
              </Card>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
} 