// Main exports for @vibe-kit/monitor package

// Services
export { MonitorService } from './services/MonitorService.js';

// Monitors
export { PerformanceMonitor } from './monitors/PerformanceMonitor.js';

// Storage
export { InMemoryStore } from './storage/InMemoryStore.js';

// Middleware
export { 
  createMonitoringMiddleware,
  createHealthCheckHandler,
  createMetricsHandler,
  withMonitoring
} from './middleware/PerformanceMiddleware.js';

// Types
export type {
  HealthStatus,
  SystemHealth,
  ComponentHealth,
  PerformanceMetrics,
  RequestMetric,
  EndpointMetric,
  MemoryMetrics,
  DiskMetrics,
  ResourceSummary,
  TrackedError,
  CrashedSession,
  RecoveryResult,
  MetricsExport,
  MonitorOptions,
  MiddlewareOptions,
  CircularBuffer,
} from './types/index.js';

// Import for function
import type { MonitorOptions } from './types/index.js';
import { MonitorService } from './services/MonitorService.js';

// Convenience function to create a monitor instance
export function createMonitor(options?: MonitorOptions): MonitorService {
  return new MonitorService(options);
}

// Version
export const version = '0.0.1';