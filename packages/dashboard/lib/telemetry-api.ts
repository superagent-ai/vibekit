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
    this.baseURL = baseURL || process.env.NEXT_PUBLIC_TELEMETRY_API_URL || 'http://localhost:3000'
  }

  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
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
    return this.request<HealthStatus>('/health')
  }

  async getMetrics(): Promise<MetricsResponse> {
    return this.request<MetricsResponse>('/metrics')
  }

  async getAnalytics(window: 'hour' | 'day' | 'week' = 'day'): Promise<AnalyticsDashboard> {
    return this.request<AnalyticsDashboard>(`/analytics?window=${window}`)
  }

  async querySessions(filters: FilterOptions = {}): Promise<QueryResult> {
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
}

// Create a singleton instance
export const telemetryAPI = new TelemetryAPI() 