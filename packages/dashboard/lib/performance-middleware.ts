/**
 * Performance Tracking Middleware
 * 
 * Express middleware for tracking request performance metrics
 */

import { Request, Response, NextFunction } from 'express';
import { recordRequest, perfMark, perfMeasure } from './performance-monitor';

export interface PerformanceContext {
  startTime: number;
  startMark: string;
  memoryStart: number;
  path: string;
  method: string;
}

/**
 * Performance tracking middleware
 */
export function performanceMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Skip for health checks
    if (req.path === '/api/health-simple') {
      return next();
    }
    
    const startTime = Date.now();
    const startMark = `request-${startTime}-start`;
    const memoryStart = process.memoryUsage().heapUsed;
    
    // Mark request start
    perfMark(startMark);
    
    // Store context
    const context: PerformanceContext = {
      startTime,
      startMark,
      memoryStart,
      path: req.path,
      method: req.method,
    };
    
    // Store in request
    (req as any).perfContext = context;
    
    // Override res.end to capture response
    const originalEnd = res.end;
    res.end = function(...args: any[]) {
      // Mark request end
      const endMark = `request-${startTime}-end`;
      perfMark(endMark);
      
      // Measure request duration
      perfMeasure(`request-${req.method}-${req.path}`, startMark, endMark);
      
      // Calculate metrics
      const duration = Date.now() - startTime;
      const memoryEnd = process.memoryUsage().heapUsed;
      const memoryUsed = memoryEnd - memoryStart;
      
      // Record request metrics
      recordRequest({
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration,
        timestamp: startTime,
        memoryUsed,
      });
      
      // Call original end
      return originalEnd.apply(res, args);
    };
    
    next();
  };
}

/**
 * API-specific performance tracking
 */
export function apiPerformanceMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Only track API routes
    if (!req.path.startsWith('/api/')) {
      return next();
    }
    
    const context = (req as any).perfContext as PerformanceContext;
    if (!context) {
      return next();
    }
    
    // Add API-specific marks
    perfMark(`api-${context.startMark}`);
    
    // Track specific API operations
    if (req.path.includes('/execution-history')) {
      perfMark('execution-history-query');
    } else if (req.path.includes('/sessions')) {
      perfMark('session-operation');
    } else if (req.path.includes('/projects')) {
      perfMark('project-operation');
    }
    
    next();
  };
}

/**
 * Slow request logger
 */
export function slowRequestLogger(thresholdMs: number = 1000) {
  return (req: Request, res: Response, next: NextFunction) => {
    const context = (req as any).perfContext as PerformanceContext;
    if (!context) {
      return next();
    }
    
    // Override res.end to check duration
    const originalEnd = res.end;
    res.end = function(...args: any[]) {
      const duration = Date.now() - context.startTime;
      
      if (duration > thresholdMs) {
        console.warn(`⚠️  Slow request detected: ${req.method} ${req.path} took ${duration}ms`);
        
        // Log additional details
        console.warn('  Details:', {
          userAgent: req.headers['user-agent'],
          ip: req.ip,
          query: req.query,
          bodySize: JSON.stringify(req.body || {}).length,
        });
      }
      
      return originalEnd.apply(res, args);
    };
    
    next();
  };
}

/**
 * Memory usage tracker
 */
export function memoryUsageTracker() {
  return (req: Request, res: Response, next: NextFunction) => {
    const context = (req as any).perfContext as PerformanceContext;
    if (!context) {
      return next();
    }
    
    // Check memory before processing
    const memBefore = process.memoryUsage();
    const heapPercent = (memBefore.heapUsed / memBefore.heapTotal) * 100;
    
    if (heapPercent > 80) {
      console.warn(`⚠️  High memory usage before request: ${heapPercent.toFixed(1)}%`);
    }
    
    // Override res.end to check memory after
    const originalEnd = res.end;
    res.end = function(...args: any[]) {
      const memAfter = process.memoryUsage();
      const memDelta = memAfter.heapUsed - context.memoryStart;
      
      if (memDelta > 50 * 1024 * 1024) { // 50MB
        console.warn(`⚠️  Large memory allocation in request: ${(memDelta / 1024 / 1024).toFixed(2)}MB`);
        console.warn('  Request:', req.method, req.path);
      }
      
      return originalEnd.apply(res, args);
    };
    
    next();
  };
}

/**
 * Request profiler for development
 */
export function requestProfiler(options: { enabled?: boolean } = {}) {
  const enabled = options.enabled ?? (process.env.NODE_ENV === 'development');
  
  return (req: Request, res: Response, next: NextFunction) => {
    if (!enabled) {
      return next();
    }
    
    const context = (req as any).perfContext as PerformanceContext;
    if (!context) {
      return next();
    }
    
    // Profile specific routes
    const profilingRoutes = [
      '/api/execution-history',
      '/api/monitoring/dashboard',
      '/api/sessions',
    ];
    
    const shouldProfile = profilingRoutes.some(route => req.path.startsWith(route));
    if (!shouldProfile) {
      return next();
    }
    
    console.log(`📊 Profiling request: ${req.method} ${req.path}`);
    
    // Capture detailed timing
    const timings: Record<string, number> = {
      start: Date.now(),
    };
    
    // Hook into response stages
    res.on('finish', () => {
      timings.finish = Date.now();
      const total = timings.finish - timings.start;
      
      console.log(`📊 Request profile for ${req.path}:`);
      console.log(`  Total time: ${total}ms`);
      console.log(`  Status: ${res.statusCode}`);
      console.log(`  Memory delta: ${((process.memoryUsage().heapUsed - context.memoryStart) / 1024 / 1024).toFixed(2)}MB`);
    });
    
    next();
  };
}