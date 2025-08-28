// Optional Express types - only used if express is available
interface ExpressRequest {
  method: string;
  path: string;
  url?: string;
  [key: string]: any;
}

interface ExpressResponse {
  statusCode: number;
  end: Function;
  status: (code: number) => ExpressResponse;
  json: (data: any) => void;
  get: (header: string) => string | undefined;
  [key: string]: any;
}

interface ExpressNextFunction {
  (): void;
}
import { MonitorService } from '../services/MonitorService.js';
import { RequestMetric, MiddlewareOptions } from '../types/index.js';

/**
 * Express/Next.js middleware for automatic request monitoring
 * Tracks response times, status codes, and request metrics
 */
export function createMonitoringMiddleware(
  monitor: MonitorService,
  options: MiddlewareOptions = {}
): (req: ExpressRequest, res: ExpressResponse, next: ExpressNextFunction) => void {
  const config = {
    sampleRate: options.sampleRate || 1.0,
    includeUserAgent: options.includeUserAgent ?? false,
    includeHeaders: options.includeHeaders ?? false,
    skipPaths: options.skipPaths || [],
    skipMethods: options.skipMethods || [],
    ...options
  };

  return (req: ExpressRequest, res: ExpressResponse, next: ExpressNextFunction): void => {
    const startTime = Date.now();
    
    // Skip monitoring for certain paths or methods
    if (config.skipPaths.some(path => req.path.startsWith(path))) {
      return next();
    }
    
    if (config.skipMethods.includes(req.method.toLowerCase())) {
      return next();
    }

    // Apply sampling
    if (Math.random() > config.sampleRate) {
      return next();
    }

    // Track response when request completes
    const originalEnd = res.end;
    res.end = function(this: ExpressResponse, ...args: any[]) {
      const duration = Date.now() - startTime;
      
      // Create request metric
      const metric: RequestMetric = {
        timestamp: startTime,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration,
        size: parseInt(res.get('content-length') || '0', 10),
      };

      // Record the metric
      monitor.recordRequest(metric);
      
      // Call original end method
      return originalEnd.apply(this, args);
    };

    next();
  };
}

/**
 * Create health check endpoint handler
 */
export function createHealthCheckHandler(
  monitor: MonitorService
): (req: ExpressRequest, res: ExpressResponse) => Promise<void> {
  return async (req: ExpressRequest, res: ExpressResponse): Promise<void> => {
    try {
      const health = await monitor.checkHealth();
      
      const statusCode = health.status === 'healthy' ? 200 : 
                        health.status === 'degraded' ? 200 : 503;
      
      res.status(statusCode).json(health);
    } catch (error) {
      res.status(500).json({
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now()
      });
    }
  };
}

/**
 * Create metrics endpoint handler
 */
export function createMetricsHandler(
  monitor: MonitorService
): (req: ExpressRequest, res: ExpressResponse) => void {
  return (req: ExpressRequest, res: ExpressResponse): void => {
    try {
      const metrics = {
        performance: monitor.getPerformanceMetrics(),
        memory: monitor.getMemoryUsage(),
        storage: monitor.getStorageStats(),
        slowestEndpoints: monitor.getSlowestEndpoints(10),
        recentErrors: monitor.getRecentErrors(10),
      };
      
      res.json(metrics);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now()
      });
    }
  };
}

/**
 * Simple monitoring middleware for Next.js API routes
 */
export function withMonitoring<T extends (...args: any[]) => any>(
  handler: T,
  monitor: MonitorService
): T {
  return (async (req: any, res: any, ...args: any[]) => {
    const startTime = Date.now();
    
    try {
      const result = await handler(req, res, ...args);
      
      // Record successful request
      const metric: RequestMetric = {
        timestamp: startTime,
        method: req.method || 'UNKNOWN',
        path: req.url || req.path || '/unknown',
        statusCode: res.statusCode || 200,
        duration: Date.now() - startTime,
        size: 0, // Not easily available in Next.js
      };
      
      monitor.recordRequest(metric);
      return result;
    } catch (error) {
      // Record error request
      const metric: RequestMetric = {
        timestamp: startTime,
        method: req.method || 'UNKNOWN',
        path: req.url || req.path || '/unknown',
        statusCode: 500,
        duration: Date.now() - startTime,
        size: 0,
      };
      
      monitor.recordRequest(metric);
      monitor.trackError(error instanceof Error ? error : new Error(String(error)));
      
      throw error;
    }
  }) as T;
}