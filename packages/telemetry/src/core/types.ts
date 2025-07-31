export interface TelemetryEvent {
  id?: string;
  sessionId: string;
  eventType: 'start' | 'stream' | 'end' | 'error' | 'custom';
  category: string;      // Generic category (replaces agentType)
  action: string;        // Generic action (replaces mode)
  label?: string;        // Optional label (replaces prompt)
  value?: number;        // Optional numeric value
  timestamp: number;
  duration?: number;
  metadata?: Record<string, any>;
  context?: TelemetryContext;
}

export interface TelemetryContext {
  userId?: string;
  organizationId?: string;
  environment?: string;
  version?: string;
  platform?: string;
  custom?: Record<string, any>;
}

export interface TelemetryConfig {
  // Core configuration
  serviceName: string;
  serviceVersion: string;
  environment?: string;
  
  // Storage configuration
  storage?: StorageConfig[];
  
  // Streaming configuration
  streaming?: StreamingConfig;
  
  // Security configuration
  security?: SecurityConfig;
  
  // Reliability configuration
  reliability?: ReliabilityConfig;
  
  // Analytics configuration
  analytics?: AnalyticsConfig;
  
  // Dashboard configuration
  dashboard?: DashboardConfig;
  
  // Plugin configuration
  plugins?: Plugin[];
}

export interface StorageConfig {
  type: 'sqlite' | 'otlp' | 'memory' | 'custom';
  enabled: boolean;
  options?: any;
}

export interface StreamingConfig {
  enabled: boolean;
  type: 'websocket' | 'sse' | 'grpc';
  port?: number;
  cors?: any;
}

export interface SecurityConfig {
  pii?: {
    enabled: boolean;
    patterns?: Record<string, RegExp>;
  };
  encryption?: {
    enabled: boolean;
    key?: string;
  };
  retention?: {
    enabled: boolean;
    maxAge?: number; // days
  };
}

export interface ReliabilityConfig {
  circuitBreaker?: {
    enabled: boolean;
    threshold?: number;
    timeout?: number;
  };
  rateLimit?: {
    enabled: boolean;
    maxRequests?: number;
    windowMs?: number;
  };
  retry?: {
    enabled: boolean;
    maxRetries?: number;
    backoff?: number;
  };
}

export interface AnalyticsConfig {
  enabled: boolean;
  metrics?: {
    enabled: boolean;
    interval?: number;
  };
  anomaly?: {
    enabled: boolean;
    threshold?: number;
  };
  alerts?: {
    enabled: boolean;
    webhooks?: string[];
  };
}

export interface DashboardConfig {
  enabled: boolean;
  port?: number;
  auth?: {
    enabled: boolean;
    secret?: string;
  };
}

export interface Plugin {
  name: string;
  version: string;
  initialize?(telemetry: any): Promise<void>;
  shutdown?(): Promise<void>;
  beforeTrack?(event: TelemetryEvent): Promise<TelemetryEvent | null>;
  afterTrack?(event: TelemetryEvent): Promise<void>;
}

export interface QueryFilter {
  sessionId?: string;
  category?: string;
  action?: string;
  eventType?: string;
  timeRange?: {
    start: number;
    end: number;
  };
  limit?: number;
  offset?: number;
}

export interface StorageStats {
  totalEvents: number;
  diskUsage: number;
  lastEvent: number;
}

export interface Metrics {
  events: {
    total: number;
    byType: Record<string, number>;
    byCategory: Record<string, number>;
  };
  sessions: {
    active: number;
    completed: number;
    errored: number;
  };
  performance: {
    avgDuration: number;
    p95Duration: number;
    errorRate: number;
  };
}

export interface TimeRange {
  start: number;
  end: number;
}

export interface InsightOptions {
  timeRange?: TimeRange;
  categories?: string[];
}

export interface Insights {
  metrics: Metrics;
  anomalies: any[];
  trends: any[];
  recommendations: string[];
}

export interface ExportFormat {
  type: 'json' | 'csv' | 'otlp' | 'parquet';
  options?: any;
}

export interface ExportResult {
  format: string;
  data: any;
  size: number;
  exportedAt: number;
}

export interface DashboardOptions {
  port?: number;
  host?: string;
  auth?: {
    enabled: boolean;
    secret?: string;
  };
}