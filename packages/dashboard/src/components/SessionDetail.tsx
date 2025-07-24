import React from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Calendar, Clock, User, AlertCircle, Activity } from 'lucide-react'
import { formatDate, formatDuration, getStatusColor } from '../lib/utils'
import { telemetryAPI } from '../lib/telemetry-api'

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

interface SessionDetailProps {}

export function SessionDetail({}: SessionDetailProps) {
  const { sessionId } = useParams<{ sessionId: string }>()
  
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Session Not Found</h1>
          <Link to="/" className="text-blue-600 hover:text-blue-800">
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  if (sessionLoading || eventsLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-md">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 text-center">Loading session details...</p>
        </div>
      </div>
    )
  }

  if (sessionError || eventsError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full">
          <div className="flex items-center text-red-600 mb-4">
            <AlertCircle className="w-6 h-6 mr-2" />
            <h1 className="text-xl font-bold">Error Loading Session</h1>
          </div>
          <p className="text-gray-600 mb-4">
            {sessionError ? String(sessionError) : String(eventsError)}
          </p>
          <Link 
            to="/" 
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  const session = sessionData?.results?.[0]
  const events = eventsData?.events || []

  if (!session) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Session Not Found</h1>
          <p className="text-gray-600 mb-4">Session "{sessionId}" does not exist.</p>
          <Link 
            to="/" 
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  let parsedMetadata: any = {}
  try {
    parsedMetadata = JSON.parse(session.metadata || '{}')
  } catch (e) {
    // Ignore parsing errors
  }

  const getEventTypeIcon = (eventType: string) => {
    switch (eventType) {
      case 'start':
        return '🚀'
      case 'stream':
        return '📡'
      case 'end':
        return '✅'
      case 'error':
        return '❌'
      default:
        return '📝'
    }
  }

  const getEventTypeColor = (eventType: string) => {
    switch (eventType) {
      case 'start':
        return 'text-blue-600'
      case 'stream':
        return 'text-green-600'
      case 'end':
        return 'text-purple-600'
      case 'error':
        return 'text-red-600'
      default:
        return 'text-gray-600'
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link 
              to="/" 
              className="inline-flex items-center text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="w-5 h-5 mr-2" />
              Back to Dashboard
            </Link>
            <div className="h-6 border-l border-gray-300"></div>
            <h1 className="text-2xl font-bold text-gray-900">Session Details</h1>
          </div>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${
            session.status === 'completed' ? 'bg-green-100 text-green-800' :
            session.status === 'error' ? 'bg-red-100 text-red-800' :
            session.status === 'active' ? 'bg-blue-100 text-blue-800' :
            'bg-yellow-100 text-yellow-800'
          }`}>
            {session.status}
          </span>
        </div>

        {/* Session Overview */}
        <div className="bg-white rounded-lg shadow-sm border">
          <div className="p-6 border-b">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Session Overview</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="flex items-center space-x-3">
                <User className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-sm font-medium text-gray-600">Agent</p>
                  <p className="text-lg text-gray-900">{session.agentType}</p>
                </div>
              </div>
              
              <div className="flex items-center space-x-3">
                <Activity className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-sm font-medium text-gray-600">Mode</p>
                  <p className="text-lg text-gray-900">{session.mode}</p>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <Calendar className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-sm font-medium text-gray-600">Started</p>
                  <p className="text-lg text-gray-900">{formatDate(session.startTime)}</p>
                </div>
              </div>

              {session.duration && (
                <div className="flex items-center space-x-3">
                  <Clock className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="text-sm font-medium text-gray-600">Duration</p>
                    <p className="text-lg text-gray-900">{formatDuration(session.duration)}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-gray-50 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-blue-600">{session.eventCount || 0}</p>
                <p className="text-sm text-gray-600">Total Events</p>
              </div>
              
              <div className="bg-gray-50 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-green-600">{session.streamEventCount || 0}</p>
                <p className="text-sm text-gray-600">Stream Events</p>
              </div>
              
              <div className="bg-gray-50 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-red-600">{session.errorCount || 0}</p>
                <p className="text-sm text-gray-600">Error Events</p>
              </div>
            </div>

            {session.repoUrl && (
              <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                <p className="text-sm font-medium text-blue-800">Repository</p>
                <p className="text-blue-600">{session.repoUrl}</p>
              </div>
            )}

            {parsedMetadata.model && (
              <div className="mt-4 p-4 bg-purple-50 rounded-lg">
                <p className="text-sm font-medium text-purple-800">Model</p>
                <p className="text-purple-600">{parsedMetadata.model}</p>
              </div>
            )}
          </div>
        </div>

        {/* Session ID */}
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <p className="text-sm font-medium text-gray-600 mb-1">Session ID</p>
          <p className="font-mono text-sm text-gray-900 bg-gray-100 p-2 rounded">{session.id}</p>
        </div>

        {/* Events Timeline */}
        <div className="bg-white rounded-lg shadow-sm border">
          <div className="p-6 border-b">
            <h2 className="text-lg font-semibold text-gray-900">Events Timeline</h2>
            <p className="text-sm text-gray-600">
              {events.length} events • Showing in chronological order
            </p>
          </div>
          
          <div className="max-h-96 overflow-y-auto">
            {events.length > 0 ? (
              <div className="divide-y">
                {events.map((event, index) => {
                  let parsedEventMetadata: any = {}
                  try {
                    parsedEventMetadata = JSON.parse(event.metadata || '{}')
                  } catch (e) {
                    // Ignore parsing errors
                  }

                  return (
                    <div key={event.id} className="p-4 hover:bg-gray-50">
                      <div className="flex items-start space-x-3">
                        <div className="flex-shrink-0">
                          <span className="text-lg">{getEventTypeIcon(event.eventType)}</span>
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-2">
                            <p className={`font-medium capitalize ${getEventTypeColor(event.eventType)}`}>
                              {event.eventType} Event
                            </p>
                            <span className="text-xs text-gray-500">
                              {formatDate(event.timestamp)}
                            </span>
                          </div>
                          
                          <div className="text-sm text-gray-600 space-y-2">
                            <p><span className="font-medium">Prompt:</span> {event.prompt}</p>
                            
                            {event.streamData && (
                              <div>
                                <p className="font-medium">Stream Data:</p>
                                <pre className="mt-1 text-xs bg-gray-100 p-2 rounded overflow-x-auto max-h-32">
                                  {event.streamData}
                                </pre>
                              </div>
                            )}

                            {event.sandboxId && (
                              <p><span className="font-medium">Sandbox:</span> {event.sandboxId}</p>
                            )}

                            {parsedEventMetadata.model && (
                              <p><span className="font-medium">Model:</span> {parsedEventMetadata.model}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="p-8 text-center text-gray-500">
                <Activity className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p>No events recorded for this session</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
} 