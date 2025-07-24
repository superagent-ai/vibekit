import React, { useState } from 'react'
import { 
  useHealthStatus, 
  useMetrics, 
  useAnalytics, 
  useSessions, 
  useTelemetryEvents,
  useRefreshData,
  useConnectionStatus
} from '@/hooks/use-telemetry-api'
import { formatBytes, formatDuration, formatNumber, getStatusColor, formatDate } from './lib/utils'

function App() {
  const [activeTab, setActiveTab] = useState('overview')
  
  console.log('🎯 App component rendering...')
  
  // Data hooks
  const { data: health, isLoading: healthLoading, error: healthError } = useHealthStatus()
  const { data: metrics, isLoading: metricsLoading, error: metricsError } = useMetrics()
  const { data: analytics, isLoading: analyticsLoading, error: analyticsError } = useAnalytics()
  const { data: sessions, isLoading: sessionsLoading, error: sessionsError } = useSessions()
  const { data: events, isLoading: eventsLoading, error: eventsError } = useTelemetryEvents()
  
  console.log('📊 Data loaded:', { health: !!health, metrics: !!metrics, analytics: !!analytics, sessions: !!sessions, events: !!events })
  console.log('⏳ Loading states:', { healthLoading, metricsLoading, analyticsLoading, sessionsLoading, eventsLoading })
  console.log('❌ Errors:', { healthError, metricsError, analyticsError, sessionsError, eventsError })
  
  // Connection status
  const isConnected = useConnectionStatus()
  console.log('🔌 Connection status:', isConnected)
  
  // Refresh functions
  const { refreshAll, refreshHealth, refreshMetrics, refreshAnalytics, refreshSessions, refreshEvents } = useRefreshData()

  // Error handling
  if (healthError || metricsError || analyticsError || sessionsError || eventsError) {
    console.error('❌ App has errors:', { healthError, metricsError, analyticsError, sessionsError, eventsError })
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full">
          <h1 className="text-xl font-bold text-red-600 mb-4">Dashboard Error</h1>
          <div className="space-y-2 text-sm text-gray-600">
            {healthError && <p>Health: {String(healthError)}</p>}
            {metricsError && <p>Metrics: {String(metricsError)}</p>}
            {analyticsError && <p>Analytics: {String(analyticsError)}</p>}
            {sessionsError && <p>Sessions: {String(sessionsError)}</p>}
            {eventsError && <p>Events: {String(eventsError)}</p>}
          </div>
          <button 
            onClick={() => window.location.reload()} 
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Reload Page
          </button>
        </div>
      </div>
    )
  }

  // Loading state
  if (healthLoading && metricsLoading && analyticsLoading && sessionsLoading && eventsLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-md">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 text-center">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  const tabs = [
    { id: 'overview', label: 'Overview', icon: '📊' },
    { id: 'events', label: 'Events', icon: '📡' },
    { id: 'sessions', label: 'Sessions', icon: '📋' },
    { id: 'analytics', label: 'Analytics', icon: '📈' },
    { id: 'raw', label: 'Raw Data', icon: '📄' }
  ]

  if (healthLoading || metricsLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (healthError || metricsError) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Connection Error</h1>
          <p className="text-gray-600 mb-4">
            Failed to connect to telemetry server
          </p>
          <p className="text-sm text-gray-500">
            Make sure the telemetry server is running on port 3000
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">VibeKit Telemetry Dashboard</h1>
              <p className="text-gray-600">Real-time monitoring and analytics</p>
            </div>
            
            {/* Connection Status and Controls */}
            <div className="flex items-center gap-4">
              {/* WebSocket Connection Status */}
              <div className="flex items-center gap-2 text-sm">
                <div className="flex items-center gap-1">
                  <div className={`w-2 h-2 rounded-full ${
                    isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'
                  }`}></div>
                  <span className="text-gray-600">
                    {isConnected ? 'Connected' : 'Disconnected'}
                  </span>
                </div>
              </div>
              
              {/* Test Event Button */}
              <button
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  
                  // Use a timeout to prevent blocking the UI
                  setTimeout(async () => {
                    try {
                      console.log('🧪 Triggering test telemetry event...')
                      const response = await fetch(`${import.meta.env.VITE_TELEMETRY_API_URL || 'http://localhost:3000'}/test-event`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                          type: 'dashboard_test',
                          timestamp: new Date().toISOString(),
                          message: 'Dashboard real-time test event'
                        })
                      })
                      
                      if (response.ok) {
                        console.log('✅ Test event sent successfully')
                        const result = await response.json()
                        console.log('📡 Test event result:', result)
                      } else {
                        console.warn('⚠️ Test event failed:', response.status)
                      }
                    } catch (error) {
                      console.error('❌ Error sending test event:', error)
                    }
                  }, 0)
                }}
                className="flex items-center gap-2 px-3 py-1.5 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm"
                title="Send test event to verify real-time updates"
                type="button"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Test Event
              </button>
              
              {/* Manual Refresh Button */}
              <button
                onClick={refreshAll}
                className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm"
                title="Refresh all data"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh
              </button>
              
              {/* Health Status Indicator */}
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${
                  health?.status === 'healthy' ? 'bg-green-500' : 'bg-red-500'
                }`}></div>
                <span className="text-sm text-gray-600">
                  {health?.status || 'Unknown'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="border-b pb-4">
          <h1 className="text-3xl font-bold text-gray-900">VibeKit Telemetry Dashboard</h1>
          <p className="text-gray-600 mt-2">
            Real-time monitoring and analytics for your telemetry data
          </p>
        </div>

        {/* Navigation Tabs */}
        <div className="border-b">
          <nav className="flex space-x-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                  activeTab === tab.id
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 hover:text-blue-600 hover:bg-gray-100'
                }`}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="space-y-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* System Health Overview */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white border rounded-lg p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium text-gray-900">System Status</h3>
                    <div className={`h-3 w-3 rounded-full ${
                      health?.status === 'healthy' ? 'bg-green-500' :
                      health?.status === 'degraded' ? 'bg-yellow-500' : 'bg-red-500'
                    }`}></div>
                  </div>
                  <div className="mt-2">
                    <p className={`text-2xl font-bold ${getStatusColor(health?.status || 'unknown')}`}>
                      {health?.status || 'Unknown'}
                    </p>
                  </div>
                </div>

                <div className="bg-white border rounded-lg p-4 shadow-sm">
                  <h3 className="font-medium text-gray-900">Total Events</h3>
                  <div className="mt-2">
                    <p className="text-2xl font-bold text-gray-900">
                      {formatNumber(metrics?.events.total || 0)}
                    </p>
                  </div>
                </div>

                <div className="bg-white border rounded-lg p-4 shadow-sm">
                  <h3 className="font-medium text-gray-900">Error Rate</h3>
                  <div className="mt-2">
                    <p className="text-2xl font-bold text-gray-900">
                      {metrics?.events.total ? 
                        ((metrics.events.error / metrics.events.total) * 100).toFixed(1) : '0.0'
                      }%
                    </p>
                  </div>
                </div>

                <div className="bg-white border rounded-lg p-4 shadow-sm">
                  <h3 className="font-medium text-gray-900">Active Sessions</h3>
                  <div className="mt-2">
                    <p className="text-2xl font-bold text-gray-900">
                      {sessions?.results.filter(s => s.status === 'active').length || 0}
                    </p>
                  </div>
                </div>
              </div>

              {/* Real-time Metrics */}
              {health?.metrics && (
                <div className="bg-white border rounded-lg p-6 shadow-sm">
                  <h2 className="text-xl font-semibold mb-4 text-gray-900">Real-time Metrics</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {health.metrics.map((metric, index) => (
                      <div key={index} className="bg-gray-50 rounded-lg p-4">
                        <h3 className="font-medium text-sm text-gray-600">{metric.metric}</h3>
                        <p className="text-xl font-bold mt-2 text-gray-900">{formatNumber(metric.value)}</p>
                        <span className="text-xs text-gray-500 capitalize">{metric.type}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Memory Usage */}
              {health?.memory && (
                <div className="bg-white border rounded-lg p-6 shadow-sm">
                  <h2 className="text-xl font-semibold mb-4 text-gray-900">Memory Usage</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-gray-50 rounded-lg p-4">
                      <h3 className="font-medium text-sm text-gray-600">RSS</h3>
                      <p className="text-xl font-bold mt-2 text-gray-900">{formatBytes(health.memory.rss)}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <h3 className="font-medium text-sm text-gray-600">Heap Used</h3>
                      <p className="text-xl font-bold mt-2 text-gray-900">{formatBytes(health.memory.heapUsed)}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <h3 className="font-medium text-gray-600">Heap Total</h3>
                      <p className="text-xl font-bold mt-2 text-gray-900">{formatBytes(health.memory.heapTotal)}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <h3 className="font-medium text-sm text-gray-600">External</h3>
                      <p className="text-xl font-bold mt-2 text-gray-900">{formatBytes(health.memory.external)}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Database Status */}
              {health?.database && (
                <div className="bg-white border rounded-lg p-6 shadow-sm">
                  <h2 className="text-xl font-semibold mb-4 text-gray-900">Database Status</h2>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-700">Status:</span>
                      <span className={getStatusColor(health.database.status)}>
                        {health.database.status}
                      </span>
                    </div>
                    {health.database.latency && (
                      <div className="flex justify-between">
                        <span className="font-medium text-gray-700">Latency:</span>
                        <span className="text-gray-900">{health.database.latency}ms</span>
                      </div>
                    )}
                    {health.database.activeConnections && (
                      <div className="flex justify-between">
                        <span className="font-medium text-gray-700">Active Connections:</span>
                        <span className="text-gray-900">{health.database.activeConnections}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'events' && (
            <div className="space-y-6">
              <h2 className="text-2xl font-semibold text-gray-900">Events Stream</h2>
              <div className="bg-white border rounded-lg shadow-sm">
                <div className="p-4 border-b">
                  <h3 className="font-semibold text-gray-900">Recent Events</h3>
                  <p className="text-sm text-gray-600">
                    Real-time telemetry events from your workflows
                  </p>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {eventsLoading ? (
                    <div className="p-8 text-center">
                      <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto"></div>
                      <p className="mt-4 text-gray-500">Loading events...</p>
                    </div>
                  ) : eventsError ? (
                    <div className="p-8 text-center text-red-600">
                      <p>Failed to load events: {String(eventsError)}</p>
                    </div>
                  ) : events && events.length > 0 ? (
                    <div className="divide-y">
                      {events.slice(0, 20).map((event, index) => (
                        <div key={index} className="p-4 hover:bg-gray-50">
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-medium text-gray-900">{event.event_type}</p>
                              <p className="text-sm text-gray-600">
                                Session: {event.session_id}
                              </p>
                              <p className="text-sm text-gray-600">
                                Agent: {event.agent_type}
                              </p>
                            </div>
                            <span className="text-xs text-gray-500">
                              {formatDate(event.timestamp)}
                            </span>
                          </div>
                          {event.data && (
                            <pre className="mt-2 text-xs bg-gray-100 p-2 rounded overflow-x-auto">
                              {JSON.stringify(event.data, null, 2)}
                            </pre>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-8 text-center text-gray-500">
                      No events to display
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'sessions' && (
            <div className="space-y-6">
              <h2 className="text-2xl font-semibold text-gray-900">Sessions</h2>
              
              {/* Data Quality Notice */}
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <span className="text-yellow-600">⚠️</span>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-yellow-800">
                      Event Count Discrepancy Detected
                    </h3>
                    <div className="mt-2 text-sm text-yellow-700">
                      <p>Sessions show 0 events each, but metrics indicate {metrics?.events.total || 0} total events exist.</p>
                      <p>This suggests events aren't being properly linked to sessions in the database.</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white border rounded-lg shadow-sm">
                <div className="p-4 border-b">
                  <h3 className="font-semibold text-gray-900">Session Overview</h3>
                  <p className="text-sm text-gray-600">
                    Individual workflow execution sessions ({sessions?.count || 0} total)
                  </p>
                  
                  {/* Session Summary Stats */}
                  {sessions?.results && (
                    <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-gray-50 rounded-lg">
                      {['active', 'completed', 'error', 'cancelled'].map(status => {
                        const count = sessions.results.filter(s => s.status === status).length
                        const statusColors = {
                          active: 'text-blue-600',
                          completed: 'text-green-600', 
                          error: 'text-red-600',
                          cancelled: 'text-gray-600'
                        }
                        return (
                          <div key={status} className="text-center">
                            <p className={`text-xl font-bold ${statusColors[status as keyof typeof statusColors]}`}>
                              {count}
                            </p>
                            <p className="text-xs text-gray-600 capitalize">{status}</p>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {sessionsLoading ? (
                    <div className="p-8 text-center">
                      <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto"></div>
                      <p className="mt-4 text-gray-500">Loading sessions...</p>
                    </div>
                  ) : sessionsError ? (
                    <div className="p-8 text-center text-red-600">
                      <p>Failed to load sessions: {String(sessionsError)}</p>
                    </div>
                  ) : sessions?.results && sessions.results.length > 0 ? (
                    <div className="divide-y">
                      {sessions.results.map((session, index) => {
                        // Calculate estimated events per session (rough distribution)
                        const totalEvents = metrics?.events.total || 0
                        const totalSessions = sessions.results.length || 1
                        const estimatedEvents = Math.floor(totalEvents / totalSessions)
                        const isRecent = session.startTime > Date.now() - (24 * 60 * 60 * 1000) // Last 24 hours
                        
                        let parsedMetadata: any = {}
                        try {
                          parsedMetadata = JSON.parse(session.metadata || '{}')
                        } catch (e) {
                          // Ignore parsing errors
                        }
                        
                        return (
                          <div key={session.id} className="p-4 hover:bg-gray-50">
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                  <p className="font-medium font-mono text-sm text-gray-900">
                                    {session.id}
                                  </p>
                                  {isRecent && (
                                    <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded-full">
                                      Recent
                                    </span>
                                  )}
                                </div>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                                  <div>
                                    <p className="text-gray-600">
                                      <span className="font-medium">Agent:</span> {session.agentType}
                                    </p>
                                    <p className="text-gray-600">
                                      <span className="font-medium">Mode:</span> {session.mode}
                                    </p>
                                    <p className="text-gray-600">
                                      <span className="font-medium">Started:</span> {formatDate(session.startTime)}
                                    </p>
                                  </div>
                                  
                                  <div>
                                    {session.endTime && (
                                      <p className="text-gray-600">
                                        <span className="font-medium">Duration:</span> {formatDuration(session.endTime - session.startTime)}
                                      </p>
                                    )}
                                    {session.repoUrl && (
                                      <p className="text-gray-600">
                                        <span className="font-medium">Repo:</span> {session.repoUrl}
                                      </p>
                                    )}
                                    {parsedMetadata.model && (
                                      <p className="text-gray-600">
                                        <span className="font-medium">Model:</span> {parsedMetadata.model}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                
                                <div className="mt-2 flex items-center gap-4 text-sm">
                                  <span className="text-gray-700">
                                    <span className="font-medium">Recorded Events:</span> {session.eventCount || 0}
                                  </span>
                                  <span className="text-gray-700">
                                    <span className="font-medium">Stream Events:</span> {session.streamEventCount || 0}
                                  </span>
                                  {session.eventCount === 0 && totalEvents > 0 && (
                                    <span className="text-amber-600 text-xs">
                                      (Est. ~{estimatedEvents} based on total)
                                    </span>
                                  )}
                                </div>
                                
                                {session.errorCount > 0 && (
                                  <p className="text-sm text-red-600 mt-1">
                                    <span className="font-medium">Errors:</span> {session.errorCount}
                                  </p>
                                )}
                              </div>
                              
                              <div className="ml-4 flex-shrink-0">
                                <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                                  session.status === 'completed' ? 'bg-green-100 text-green-800' :
                                  session.status === 'error' ? 'bg-red-100 text-red-800' :
                                  session.status === 'active' ? 'bg-blue-100 text-blue-800' :
                                  'bg-yellow-100 text-yellow-800'
                                }`}>
                                  {session.status}
                                </span>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="p-8 text-center text-gray-500">
                      No sessions to display
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'analytics' && (
            <div className="space-y-6">
              <h2 className="text-2xl font-semibold text-gray-900">Analytics</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="bg-white border rounded-lg p-6 shadow-sm">
                  <h3 className="font-semibold mb-4 text-gray-900">Event Distribution</h3>
                  {metrics?.events && (
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-700">Start Events</span>
                        <div className="flex items-center gap-2">
                          <div className="w-12 bg-gray-200 rounded-full h-2">
                            <div 
                              className="bg-blue-500 h-2 rounded-full" 
                              style={{ width: `${(metrics.events.start / metrics.events.total) * 100}%` }}
                            ></div>
                          </div>
                          <span className="font-medium text-gray-900 text-sm w-8">{metrics.events.start}</span>
                        </div>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-700">Stream Events</span>
                        <div className="flex items-center gap-2">
                          <div className="w-12 bg-gray-200 rounded-full h-2">
                            <div 
                              className="bg-green-500 h-2 rounded-full" 
                              style={{ width: `${(metrics.events.stream / metrics.events.total) * 100}%` }}
                            ></div>
                          </div>
                          <span className="font-medium text-gray-900 text-sm w-8">{metrics.events.stream}</span>
                        </div>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-700">End Events</span>
                        <div className="flex items-center gap-2">
                          <div className="w-12 bg-gray-200 rounded-full h-2">
                            <div 
                              className="bg-purple-500 h-2 rounded-full" 
                              style={{ width: `${(metrics.events.end / metrics.events.total) * 100}%` }}
                            ></div>
                          </div>
                          <span className="font-medium text-gray-900 text-sm w-8">{metrics.events.end}</span>
                        </div>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-700">Error Events</span>
                        <div className="flex items-center gap-2">
                          <div className="w-12 bg-gray-200 rounded-full h-2">
                            <div 
                              className="bg-red-500 h-2 rounded-full" 
                              style={{ width: `${(metrics.events.error / metrics.events.total) * 100}%` }}
                            ></div>
                          </div>
                          <span className="font-medium text-gray-900 text-sm w-8">{metrics.events.error}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="bg-white border rounded-lg p-6 shadow-sm">
                  <h3 className="font-semibold mb-4 text-gray-900">Performance Metrics</h3>
                  {metrics?.performance && (
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-gray-700">Average Latency</span>
                        <span className="font-medium text-gray-900">{metrics.performance.avgLatency}ms</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-700">Throughput</span>
                        <span className="font-medium text-gray-900">{metrics.performance.throughput?.toFixed(3)} events/sec</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-700">95th Percentile</span>
                        <span className="font-medium text-gray-900">{metrics.performance.p95Latency}ms</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="bg-white border rounded-lg p-6 shadow-sm">
                  <h3 className="font-semibold mb-4 text-gray-900">System Health</h3>
                  {analytics?.health?.checks && (
                    <div className="space-y-2">
                      {Object.entries(analytics.health.checks).map(([key, check]) => (
                        <div key={key} className="flex justify-between items-center">
                          <span className="text-gray-700 capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            check.status === 'healthy' ? 'bg-green-100 text-green-800' :
                            check.status === 'disabled' ? 'bg-gray-100 text-gray-600' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {check.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Data Quality Insights */}
              <div className="bg-white border rounded-lg p-6 shadow-sm">
                <h3 className="font-semibold mb-4 text-gray-900">Data Quality Insights</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-medium text-gray-800 mb-2">Event Tracking</h4>
                    <div className="space-y-1 text-sm">
                      <p className="text-gray-600">
                        <span className="font-medium">Total Events Tracked:</span> {metrics?.events.total || 0}
                      </p>
                                             <p className="text-gray-600">
                         <span className="font-medium">Sessions with Event Data:</span> {
                           sessions?.results?.filter(s => s.eventCount > 0).length || 0
                         } / {sessions?.count || 0}
                       </p>
                      <p className="text-amber-600 text-xs mt-2">
                        ⚠️ Events may not be properly linked to sessions
                      </p>
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="font-medium text-gray-800 mb-2">Session Activity</h4>
                    <div className="space-y-1 text-sm">
                                             <p className="text-gray-600">
                         <span className="font-medium">Active Sessions:</span> {
                           sessions?.results?.filter(s => s.status === 'active').length || 0
                         }
                       </p>
                       <p className="text-gray-600">
                         <span className="font-medium">Completed Sessions:</span> {
                           sessions?.results?.filter(s => s.status === 'completed').length || 0
                         }
                       </p>
                       <p className="text-gray-600">
                         <span className="font-medium">Error Rate:</span> {
                           sessions?.results && sessions.results.length > 0 
                             ? ((sessions.results.filter(s => s.status === 'error').length / sessions.results.length) * 100).toFixed(1) 
                             : 0
                         }%
                       </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'raw' && (
            <div className="space-y-6">
              <h2 className="text-2xl font-semibold text-gray-900">Raw Telemetry Data</h2>
              
              <div className="space-y-4">
                <div className="bg-white border rounded-lg shadow-sm">
                  <div className="p-4 border-b">
                    <h3 className="font-semibold text-gray-900">Health Status</h3>
                  </div>
                  <pre className="p-4 text-xs bg-gray-50 overflow-x-auto">
                    {JSON.stringify(health, null, 2)}
                  </pre>
                </div>

                <div className="bg-white border rounded-lg shadow-sm">
                  <div className="p-4 border-b">
                    <h3 className="font-semibold text-gray-900">Metrics</h3>
                  </div>
                  <pre className="p-4 text-xs bg-gray-50 overflow-x-auto">
                    {JSON.stringify(metrics, null, 2)}
                  </pre>
                </div>

                <div className="bg-white border rounded-lg shadow-sm">
                  <div className="p-4 border-b">
                    <h3 className="font-semibold text-gray-900">Sessions ({sessions?.count || 0})</h3>
                  </div>
                  <pre className="p-4 text-xs bg-gray-50 overflow-x-auto">
                    {JSON.stringify(sessions, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default App 