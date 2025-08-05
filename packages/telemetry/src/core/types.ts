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
  
  // API server configuration
  api?: APIConfig;
  
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
  enabled?: boolean;
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
  enabled?: boolean;
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

export interface APIConfig {
  enabled: boolean;
  port?: number;
  host?: string;
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
  description?: string;
  
  // Lifecycle hooks
  initialize?(telemetry: any): Promise<void>;
  shutdown?(): Promise<void>;
  
  // Event tracking hooks
  beforeTrack?(event: TelemetryEvent): Promise<TelemetryEvent | null>;
  afterTrack?(event: TelemetryEvent): Promise<void>;
  
  // Storage hooks
  beforeStore?(events: TelemetryEvent[], provider: string, context?: any): Promise<TelemetryEvent[]>;
  afterStore?(events: TelemetryEvent[], provider: string, result?: any, context?: any): Promise<void>;
  onStorageError?(error: Error, events: TelemetryEvent[], provider: string, context?: any): Promise<void>;
  registerStorageProvider?(register: (name: string, provider: any) => void): void;
  
  // Query hooks
  beforeQuery?(filter: QueryFilter, provider: string, context?: any): Promise<QueryFilter>;
  afterQuery?(results: TelemetryEvent[], filter: QueryFilter, provider: string, context?: any): Promise<TelemetryEvent[]>;
  onQueryError?(error: Error, filter: QueryFilter, provider: string, context?: any): Promise<void>;
  transformQueryResult?(result: any, filter: QueryFilter, context?: any): Promise<any>;
  
  // Export hooks
  beforeExport?(events: TelemetryEvent[], format: ExportFormat | string, options?: any, context?: any): Promise<TelemetryEvent[]>;
  afterExport?(result: ExportResult, format: ExportFormat | string, options?: any, context?: any): Promise<void>;
  onExportError?(error: Error, format: ExportFormat | string, options?: any, context?: any): Promise<void>;
  registerExporter?(register: (format: string, exporter: any) => void): void;
  
  // Analytics hooks
  beforeAnalytics?(operation: string, params: any): Promise<any>;
  afterAnalytics?(operation: string, result: any, params: any): Promise<any>;
  
  // Custom hooks for extensibility
  hooks?: {
    [key: string]: (...args: any[]) => any | Promise<any>;
  };
}

export interface QueryFilter {
  sessionId?: string;
  userId?: string;
  startTime?: number;
  endTime?: number;
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

export type ExportFormat = 'json' | 'csv' | 'otlp' | 'parquet';

export interface ExportResult {
  success: boolean;
  format: ExportFormat | string;
  data: any;
  size?: number;
  exportedAt?: number | string;
  metadata?: {
    totalEvents?: number;
    exportedAt?: string;
    [key: string]: any;
  };
}

export interface DashboardOptions {
  port?: number;
  host?: string;
  auth?: {
    enabled: boolean;
    secret?: string;
  };
  cors?: {
    origin: string | string[] | boolean;
    credentials?: boolean;
    methods?: string[];
    allowedHeaders?: string[];
  };
  enableDashboard?: boolean;
  enableWebSocket?: boolean;
  enableDatabaseWatcher?: boolean;
}