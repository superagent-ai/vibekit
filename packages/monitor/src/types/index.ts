/**
 * System monitoring types for @vibe-kit/monitor
 */

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface SystemHealth {
  status: HealthStatus;
  timestamp: number;
  uptime: number;
  components: ComponentHealth[];
  metrics: SystemMetrics;
}

export interface ComponentHealth {
  name: string;
  status: HealthStatus;
  message: string;
  details?: Record<string, any>;
  lastCheck?: number;
  errors?: string[];
}

export interface SystemMetrics {
  totalRequests: number;
  activeRequests: number;
  requestsPerSecond: number;
  averageResponseTime: number;
  errorRate: number;
  uptime: number;
}

export interface PerformanceMetrics {
  requestsPerSecond: number;
  averageResponseTime: number;
  p50ResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  errorRate: number;
  throughput: number;
  activeRequests: number;
}

export interface RequestMetric {
  timestamp: number;
  method: string;
  path: string;
  statusCode: number;
  duration: number;
  size: number;
}

export interface EndpointMetric {
  path: string;
  method: string;
  avgDuration: number;
  p95Duration: number;
  requestCount: number;
  errorCount: number;
  errorRate: number;
}

export interface MemoryMetrics {
  heapUsed: number;
  heapTotal: number;
  rss: number;
  external: number;
  arrayBuffers: number;
  heapUsedMB: string;
  heapTotalMB: string;
  rssMB: string;
}

export interface DiskMetrics {
  vibekitDir: {
    size: number;
    files: number;
  };
  sessions: {
    size: number;
    files: number;
  };
  projects: {
    size: number;
    files: number;
  };
  logs: {
    size: number;
    files: number;
  };
}

export interface ResourceSummary {
  memory: MemoryMetrics;
  disk: DiskMetrics;
  cpu?: {
    usage: number;
    load: number[];
  };
  network?: {
    bytesIn: number;
    bytesOut: number;
  };
}

export interface TrackedError {
  timestamp: number;
  error: string;
  stack?: string;
  context?: any;
  component?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface CrashedSession {
  sessionId: string;
  timestamp: number;
  projectId?: string;
  lastActivity?: number;
  lockFile?: string;
  canRecover: boolean;
}

export interface RecoveryResult {
  sessionId: string;
  success: boolean;
  actions: string[];
  errors?: string[];
}

export interface MetricsExport {
  timestamp: number;
  version: string;
  systemHealth: SystemHealth;
  performance: PerformanceMetrics;
  memory: MemoryMetrics;
  disk: DiskMetrics;
  errors: TrackedError[];
  requestMetrics: RequestMetric[];
}

export interface MonitorOptions {
  retentionMinutes?: number;
  sampleRate?: number;
  enableRecovery?: boolean;
  enableErrorTracking?: boolean;
  maxErrors?: number;
  maxRequests?: number;
}

export interface MiddlewareOptions {
  sampleRate?: number;
  includeUserAgent?: boolean;
  includeHeaders?: boolean;
  skipPaths?: string[];
  skipMethods?: string[];
}

export interface CircularBuffer<T> {
  add(item: T): void;
  getAll(): T[];
  getLast(count: number): T[];
  clear(): void;
  size(): number;
}