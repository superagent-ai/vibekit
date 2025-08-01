import type { 
  HealthStatus, 
  AnalyticsDashboard, 
  MetricsResponse, 
  QueryResult,
  FilterOptions 
} from './types'

export class TelemetryAPI {
  private baseURL: string

  constructor(baseURL?: string) {
    this.baseURL = baseURL || import.meta.env.VITE_TELEMETRY_API_URL || 'http://localhost:3000'
  }

  async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseURL}${endpoint}`
    
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      ...options,
    })

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`)
    }

    return response.json()
  }

  async getHealth(): Promise<HealthStatus> {
    console.log('📊 Fetching health status...')
    return this.request<HealthStatus>('/health')
  }

  async getMetrics(): Promise<MetricsResponse> {
    console.log('📈 Fetching metrics...')
    return this.request<MetricsResponse>('/metrics')
  }

  async getAnalytics(window: 'hour' | 'day' | 'week' = 'day'): Promise<AnalyticsDashboard> {
    console.log(`📊 Fetching analytics (${window})...`)
    return this.request<AnalyticsDashboard>(`/analytics?window=${window}`)
  }

  async querySessions(filters: FilterOptions = {}): Promise<QueryResult> {
    console.log('📋 Fetching sessions...', filters)
    const params = new URLSearchParams()
    
    if (filters.agentType) params.append('agent', filters.agentType)
    if (filters.sessionId) params.append('session', filters.sessionId)
    if (filters.timeRange?.from) {
      params.append('since', filters.timeRange.from.toISOString())
    }
    if (filters.timeRange?.to) {
      params.append('until', filters.timeRange.to.toISOString())
    }

    const queryString = params.toString()
    const endpoint = queryString ? `/query?${queryString}` : '/query'
    
    return this.request<QueryResult>(endpoint)
  }

  async getApiInfo(): Promise<any> {
    return this.request<any>('/')
  }

  // Get recent events from metrics and analytics data
  async getEvents(): Promise<any[]> {
    try {
      // Since there's no events endpoint, we'll create events from session activity
      const query = await this.querySessions().catch(() => ({ results: [] }))
      
      // Create synthetic events from session data and real-time metrics
      const events: any[] = []
      
      // Add recent session events
      const sessions = query.results || []
      sessions.slice(0, 20).forEach((session) => {
      if (session.startTime) {
        events.push({
          event_type: 'session_start',
          session_id: session.id,
          agent_type: session.agentType,
          timestamp: new Date(session.startTime).toISOString(),
          data: {
            mode: session.mode,
            repoUrl: session.repoUrl,
            metadata: session.metadata
          }
        })
      }
      
      if (session.endTime) {
        events.push({
          event_type: 'session_end',
          session_id: session.id,
          agent_type: session.agentType,
          timestamp: new Date(session.endTime).toISOString(),
          data: {
            status: session.status,
            duration: session.endTime - session.startTime,
            eventCount: session.eventCount
          }
        })
      }
      
      if (session.status === 'error') {
        events.push({
          event_type: 'error',
          session_id: session.id,
          agent_type: session.agentType,
          timestamp: new Date(session.startTime || session.createdAt).toISOString(),
          data: {
            error_type: 'session_error',
            metadata: session.metadata
          }
        })
      }
    })
    
    // Sort by timestamp (newest first)
    return events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    } catch (error) {
      console.warn('Failed to generate synthetic events:', error)
      return []
    }
  }
}

// Create a singleton instance
export const telemetryAPI = new TelemetryAPI() 