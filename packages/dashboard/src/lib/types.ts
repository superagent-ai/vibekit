export interface TelemetryMetric {
  metric: string
  value: number
  type: 'counter' | 'gauge'
}

export interface HealthCheck {
  status: string
  latency?: number
  error?: string
  activeConnections?: number
  isOpen?: boolean
  failureCount?: number
  queueSize?: number
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy'
  timestamp?: string
  service?: string
  database?: HealthCheck
  analytics?: {
    status: string
    enabled: boolean
    source: string
  }
  export?: {
    status: string
    enabled: boolean
    formats: string[]
  }
  metrics?: TelemetryMetric[]
  uptime?: number
  memory?: {
    rss: number
    heapTotal: number
    heapUsed: number
    external: number
    arrayBuffers: number
  }
  details?: {
    initialized?: boolean
    providers?: {
      storage?: Array<{
        name?: string
        type?: string
        status?: string
        error?: string
      }>
    }
    reliability?: {
      errors?: {
        recent?: number
        bySeverity?: {
          critical?: number
          high?: number
          medium?: number
          low?: number
        }
      }
      circuitBreakers?: Record<string, {
        state?: string
        failureCount?: number
      }>
    }
    memory?: {
      heapUsedMB?: number
      heapTotalMB?: number
      percentage?: number
    }
    timestamp?: string
  }
}

export interface SessionSummary {
  id: string
  agentType: string
  mode: string
  status: string
  startTime: number
  endTime: number | null
  duration: number | null
  eventCount: number
  streamEventCount: number
  errorCount: number
  sandboxId: string | null
  repoUrl: string | null
  metadata: string | null
  createdAt: number
  updatedAt: number
  version: number
  schemaVersion: string
}

export interface AnalyticsDashboard {
  timeWindow: string
  overview: {
    totalSessions: number
    totalEvents: number
    avgResponseTime: number
    errorRate: number
    throughput: number
  }
  health: {
    status: string
    checks: Record<string, HealthCheck>
  }
  realTime: TelemetryMetric[]
  performance: any[]
  sessionSummaries: SessionSummary[]
  anomalies: any[]
  topAgents: any[]
  message: string
  source: string
  lastUpdated: number
}

export interface MetricsResponse {
  realTime: TelemetryMetric[]
  performance: {
    avgLatency: number
    p95Latency: number
    throughput: number
  }
  events: {
    total: number
    start: number
    stream: number
    end: number
    error: number
  }
  errors: {
    total: number
    circuitBreakerTrips: number
    rateLimitHits: number
    retryQueueOverflows: number
  }
  health: {
    uptime: number
    lastHealthCheck: number
  }
  timestamp: string
  server: {
    uptime: number
    memory: Record<string, number>
    cpu: Record<string, number>
  }
}

export interface QueryResult {
  results: SessionSummary[]
  query: Record<string, string>
  count: number
  timestamp: string
}

export interface TimeRange {
  from: Date
  to: Date
  label: string
}

export interface FilterOptions {
  agentType?: string
  sessionId?: string
  status?: string
  timeRange?: TimeRange
}

export interface ChartDataPoint {
  timestamp: number
  value: number
  label?: string
} 