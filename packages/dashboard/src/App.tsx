import { useState } from 'react'
import { Routes, Route, useNavigate } from 'react-router-dom'
import { 
  useHealthStatus, 
  useMetrics, 
  useSessions, 
  useTelemetryEvents,
  useRefreshData,
  useConnectionStatus
} from '@/hooks/use-telemetry-api'
import { formatDuration, formatNumber, formatDate } from './lib/utils'
import { SessionDetail } from './components/SessionDetail'
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card'
import { Badge } from './components/ui/badge'
import { Button } from './components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs'
import { ScrollArea } from './components/ui/scroll-area'
import { Popover, PopoverContent, PopoverTrigger } from './components/ui/popover'

import { Activity, Zap, RefreshCw, Wifi, WifiOff } from 'lucide-react'

function Dashboard() {
  const [activeTab, setActiveTab] = useState('overview')
  const navigate = useNavigate()
  
  console.log('🎯 App component rendering...')
  
  // Data hooks
  const { data: health, isLoading: healthLoading, error: healthError } = useHealthStatus()
  const { data: metrics, isLoading: metricsLoading, error: metricsError } = useMetrics()

  const { data: sessions, isLoading: sessionsLoading, error: sessionsError } = useSessions()
  const { data: events, isLoading: eventsLoading, error: eventsError } = useTelemetryEvents()
  
  // Connection status
  const isConnected = useConnectionStatus()
  
  // Refresh functions
  const { refreshAll } = useRefreshData()

  // Error handling
  if (healthError || metricsError || sessionsError || eventsError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="text-destructive">Dashboard Error</CardTitle>
          </CardHeader>
          <CardContent>
                         <div className="space-y-2 text-sm text-muted-foreground">
               {healthError && <p>Health: {String(healthError)}</p>}
               {metricsError && <p>Metrics: {String(metricsError)}</p>}
               {sessionsError && <p>Sessions: {String(sessionsError)}</p>}
               {eventsError && <p>Events: {String(eventsError)}</p>}
             </div>
            <Button 
              onClick={() => window.location.reload()} 
              className="mt-4 w-full"
            >
              Reload Page
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Loading state
  if (healthLoading && metricsLoading && sessionsLoading && eventsLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="flex flex-col items-center p-6">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-4"></div>
            <p className="text-muted-foreground">Loading dashboard...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (healthLoading || metricsLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="flex flex-col items-center p-6">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-4"></div>
            <p className="text-muted-foreground">Connecting to telemetry server...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (healthError || metricsError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="text-destructive">Connection Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              Failed to connect to telemetry server
            </p>
            <p className="text-sm text-muted-foreground">
              Make sure the telemetry server is running on port 3000
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Filter sessions for real-time focus
  const activeSessions = sessions?.results?.filter(s => s.status === 'active') || []
  const recentSessions = sessions?.results?.filter(s => 
    s.status === 'completed' && s.startTime > Date.now() - (24 * 60 * 60 * 1000)
  ).slice(0, 10) || []
  const errorSessions = sessions?.results?.filter(s => s.status === 'error').slice(0, 5) || []

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">🖖 VibeKit Telemetry</h1>
              <p className="text-muted-foreground">Real-time monitoring and analytics</p>
            </div>
            
            <div className="flex items-center space-x-4">
              {/* Connection Status */}
              <div className="flex items-center space-x-2 text-sm">
                {isConnected ? (
                  <Wifi className="w-4 h-4 text-green-500" />
                ) : (
                  <WifiOff className="w-4 h-4 text-red-500" />
                )}
                <span className="text-muted-foreground">
                  {isConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>

              {/* Test Event Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    const response = await fetch('http://localhost:3000/test-event', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ 
                        type: 'dashboard_test',
                        timestamp: new Date().toISOString(),
                        message: 'Dashboard test event'
                      })
                    })
                    if (response.ok) {
                      console.log('✅ Test event sent')
                    }
                  } catch (error) {
                    console.error('❌ Test event failed:', error)
                  }
                }}
              >
                <Zap className="w-4 h-4 mr-2" />
                Test Event
              </Button>

              {/* Refresh Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={refreshAll}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </Button>

              {/* Health Status */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" className="h-auto p-0">
                    <Badge 
                      variant={health?.status === 'healthy' ? 'default' : health?.status === 'degraded' ? 'secondary' : 'destructive'}
                      className="cursor-pointer"
                    >
                      {health?.status ? health.status.charAt(0).toUpperCase() + health.status.slice(1) : 'Unknown'}
                    </Badge>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold">System Health</h4>
                      <div className={`h-3 w-3 rounded-full ${
                        health?.status === 'healthy' ? 'bg-green-500' : 
                        health?.status === 'degraded' ? 'bg-yellow-500' : 'bg-red-500'
                      }`} />
                    </div>
                    
                    {health?.details && (
                      <div className="space-y-2 text-sm">
                        {health.details.providers?.storage?.map((provider: any, idx: number) => (
                          <div key={idx} className="flex justify-between">
                            <span className="text-muted-foreground">{provider.type || provider.name}:</span>
                            <span className={provider.status === 'healthy' ? 'text-green-600' : 'text-red-600'}>
                              {provider.status}
                            </span>
                          </div>
                        ))}
                        
                        {health.details.reliability?.errors && (
                          <div className="pt-2 border-t">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Recent Errors:</span>
                              <span className={(health.details.reliability.errors.recent || 0) > 0 ? 'text-red-600' : ''}>
                                {health.details.reliability.errors.recent || 0}
                              </span>
                            </div>
                            {(health.details.reliability.errors.bySeverity?.critical || 0) > 0 && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Critical Errors:</span>
                                <span className="text-red-600">{health.details.reliability.errors.bySeverity?.critical || 0}</span>
                              </div>
                            )}
                          </div>
                        )}
                        
                        {health.details.reliability?.circuitBreakers && (
                          <div className="pt-2 border-t">
                            {Object.entries(health.details.reliability.circuitBreakers).map(([name, breaker]: [string, any]) => (
                              <div key={name} className="flex justify-between">
                                <span className="text-muted-foreground">{name}:</span>
                                <span className={breaker.state === 'closed' ? 'text-green-600' : 'text-red-600'}>
                                  {breaker.state}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                        
                        <div className="pt-2 border-t text-xs text-muted-foreground">
                          Last checked: {health.details.timestamp ? new Date(health.details.timestamp).toLocaleTimeString() : 'Unknown'}
                        </div>
                      </div>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="sessions">Sessions</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="events">Events</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* Real-time Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Active Sessions</CardTitle>
                  <Activity className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-blue-600">{activeSessions.length}</div>
                  <p className="text-xs text-muted-foreground">Currently running</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Events</CardTitle>
                  <Activity className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatNumber(metrics?.events.total || 0)}</div>
                  <p className="text-xs text-muted-foreground">All time</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Recent Sessions</CardTitle>
                  <Activity className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">{recentSessions.length}</div>
                  <p className="text-xs text-muted-foreground">Last 24 hours</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Error Sessions</CardTitle>
                  <Activity className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-red-600">{errorSessions.length}</div>
                  <p className="text-xs text-muted-foreground">Need attention</p>
                </CardContent>
              </Card>
            </div>

            {/* Active Sessions */}
            {activeSessions.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Activity className="w-5 h-5 text-blue-500" />
                    <span>Active Sessions</span>
                    <Badge variant="secondary">{activeSessions.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-64">
                    <div className="space-y-3">
                      {activeSessions.map((session) => (
                        <div
                          key={session.id}
                          className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                          onClick={() => navigate(`/session/${session.id}`)}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center space-x-2 mb-1">
                              <span className="font-mono text-sm font-medium">{session.id}</span>
                              <Badge variant="secondary">{session.agentType}</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              Started {formatDate(session.startTime)} • {session.mode}
                            </p>
                          </div>
                          <Badge className="bg-blue-100 text-blue-800">Running</Badge>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}

            {/* Recent Completed Sessions */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Activity className="w-5 h-5 text-green-500" />
                  <span>Recent Completed</span>
                  <Badge variant="secondary">{recentSessions.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-64">
                  <div className="space-y-3">
                    {recentSessions.map((session) => {
                      let parsedMetadata: any = {}
                      try {
                        parsedMetadata = JSON.parse(session.metadata || '{}')
                      } catch (e) {
                        console.error('Failed to parse session metadata:', e)
                        parsedMetadata = {}
                      }

                      return (
                        <div
                          key={session.id}
                          className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                          onClick={() => navigate(`/session/${session.id}`)}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center space-x-2 mb-1">
                              <span className="font-mono text-sm font-medium">{session.id}</span>
                              <Badge variant="outline">{session.agentType}</Badge>
                              {parsedMetadata.model && (
                                <Badge variant="outline" className="text-xs">{parsedMetadata.model}</Badge>
                              )}
                            </div>
                            <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                              <span>{formatDate(session.startTime)}</span>
                              {session.duration && <span>{formatDuration(session.duration)}</span>}
                              <span>{session.eventCount || 0} events</span>
                            </div>
                          </div>
                          <Badge variant="outline" className="text-green-600">Completed</Badge>
                        </div>
                      )
                    })}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sessions" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>All Sessions</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {sessions?.count || 0} total sessions
                </p>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-96">
                  <div className="space-y-3">
                                         {sessions?.results?.map((session) => {
                       return (
                        <div
                          key={session.id}
                          className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                          onClick={() => navigate(`/session/${session.id}`)}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center space-x-2 mb-2">
                              <span className="font-mono text-sm font-medium">{session.id}</span>
                              <Badge variant="outline">{session.agentType}</Badge>
                              <Badge variant="outline">{session.mode}</Badge>
                            </div>
                            <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground">
                              <div>
                                <p>Started: {formatDate(session.startTime)}</p>
                                {session.duration && <p>Duration: {formatDuration(session.duration)}</p>}
                              </div>
                              <div>
                                <p>Events: {session.eventCount || 0}</p>
                                <p>Streams: {session.streamEventCount || 0}</p>
                              </div>
                            </div>
                          </div>
                          <Badge variant={
                            session.status === 'completed' ? 'default' :
                            session.status === 'error' ? 'destructive' :
                            session.status === 'active' ? 'secondary' : 'outline'
                          }>
                            {session.status}
                          </Badge>
                        </div>
                      )
                    })}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analytics" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Event Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  {metrics?.events && (
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm">Start Events</span>
                        <Badge variant="outline">{metrics?.events?.start || 0}</Badge>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm">Stream Events</span>
                        <Badge variant="outline">{metrics?.events?.stream || 0}</Badge>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm">End Events</span>
                        <Badge variant="outline">{metrics?.events?.end || 0}</Badge>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm">Error Events</span>
                        <Badge variant="destructive">{metrics?.events?.error || 0}</Badge>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

                             <Card>
                 <CardHeader>
                   <CardTitle>Performance Metrics</CardTitle>
                 </CardHeader>
                 <CardContent>
                   {metrics?.performance && (
                     <div className="space-y-3">
                       <div className="flex justify-between items-center">
                         <span className="text-sm">Average Latency</span>
                         <span className="text-sm font-mono">{metrics?.performance?.avgLatency || 0}ms</span>
                       </div>
                       <div className="flex justify-between items-center">
                         <span className="text-sm">Throughput</span>
                         <span className="text-sm font-mono">{(metrics?.performance?.throughput || 0).toFixed(2)} events/sec</span>
                       </div>
                       <div className="flex justify-between items-center">
                         <span className="text-sm">95th Percentile</span>
                         <span className="text-sm font-mono">{metrics?.performance?.p95Latency || 0}ms</span>
                       </div>
                     </div>
                   )}
                   {metrics?.health && (
                     <div className="mt-4 pt-4 border-t space-y-3">
                       <div className="flex justify-between items-center">
                         <span className="text-sm">Uptime</span>
                         <span className="text-sm font-mono">{formatDuration((metrics?.health?.uptime || 0) * 1000)}</span>
                       </div>
                     </div>
                   )}
                 </CardContent>
               </Card>
            </div>
          </TabsContent>

          <TabsContent value="events" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Recent Events</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Latest telemetry events
                </p>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-96">
                  <div className="space-y-3">
                    {events?.slice(0, 20).map((event, index) => (
                      <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2 mb-1">
                            <Badge variant="outline">{event.type}</Badge>
                            <span className="text-sm text-muted-foreground">{event.agent}</span>
                          </div>
                          <p className="text-sm truncate">{event.message || 'No message'}</p>
                        </div>
                        <span className="text-xs text-muted-foreground font-mono">
                          {formatDate(event.timestamp)}
                        </span>
                      </div>
                    )) || <p className="text-muted-foreground">No events to display</p>}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/session/:sessionId" element={<SessionDetail />} />
    </Routes>
  )
}

export default App 