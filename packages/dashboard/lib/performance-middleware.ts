/**
 * Performance Tracking Middleware
 * 
 * Next.js middleware for tracking request performance metrics
 */

import { NextRequest, NextResponse } from 'next/server';
import { recordRequest, perfMark, perfMeasure } from './performance-monitor';

export interface PerformanceContext {
  startTime: number;
  startMark: string;
  memoryStart: number;
  path: string;
  method: string;
}

/**
 * Performance tracking for Next.js API routes
 */
export function withPerformanceTracking<T extends any[]>(
  handler: (request: NextRequest, ...args: T) => Promise<NextResponse>
) {
  return async (request: NextRequest, ...args: T): Promise<NextResponse> => {
    const url = new URL(request.url);
    
    // Skip for health checks
    if (url.pathname === '/api/health-simple') {
      return handler(request, ...args);
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
      path: url.pathname,
      method: request.method,
    };
    
    try {
      // Execute the handler
      const response = await handler(request, ...args);
      
      // Mark request end
      const endMark = `request-${startTime}-end`;
      perfMark(endMark);
      
      // Measure request duration
      perfMeasure(`request-${request.method}-${url.pathname}`, startMark, endMark);
      
      // Calculate metrics
      const duration = Date.now() - startTime;
      const memoryEnd = process.memoryUsage().heapUsed;
      const memoryUsed = memoryEnd - memoryStart;
      
      // Record request metrics
      recordRequest({
        method: request.method,
        path: url.pathname,
        statusCode: response.status,
        duration,
        timestamp: startTime,
        memoryUsed,
      });
      
      return response;
    } catch (error) {
      // Mark request end even on error
      const endMark = `request-${startTime}-end`;
      perfMark(endMark);
      
      const duration = Date.now() - startTime;
      const memoryEnd = process.memoryUsage().heapUsed;
      const memoryUsed = memoryEnd - memoryStart;
      
      // Record failed request metrics
      recordRequest({
        method: request.method,
        path: url.pathname,
        statusCode: 500,
        duration,
        timestamp: startTime,
        memoryUsed,
      });
      
      throw error;
    }
  };
}

/**
 * Create performance tracking utilities for specific operations
 */
export function createPerformanceMarkers(request: NextRequest) {
  const url = new URL(request.url);
  const startTime = Date.now();
  const startMark = `request-${startTime}-start`;
  
  // Add API-specific marks
  if (url.pathname.includes('/execution-history')) {
    perfMark('execution-history-query');
  } else if (url.pathname.includes('/sessions')) {
    perfMark('session-operation');
  } else if (url.pathname.includes('/projects')) {
    perfMark('project-operation');
  }
  
  return { startTime, startMark, path: url.pathname };
}

/**
 * Log slow requests
 */
export function logSlowRequest(
  request: NextRequest,
  response: NextResponse,
  duration: number,
  thresholdMs: number = 1000
) {
  if (duration > thresholdMs) {
    const url = new URL(request.url);
    console.warn(`⚠️  Slow request detected: ${request.method} ${url.pathname} took ${duration}ms`);
    
    // Log additional details
    console.warn('  Details:', {
      userAgent: request.headers.get('user-agent'),
      query: url.searchParams.toString(),
      status: response.status,
    });
  }
}

/**
 * Monitor memory usage for requests
 */
export function monitorMemoryUsage(
  request: NextRequest,
  memoryStart: number
) {
  // Check memory before processing
  const memBefore = process.memoryUsage();
  const heapPercent = (memBefore.heapUsed / memBefore.heapTotal) * 100;
  
  if (heapPercent > 80) {
    console.warn(`⚠️  High memory usage before request: ${heapPercent.toFixed(1)}%`);
  }
  
  return {
    checkMemoryAfter: () => {
      const memAfter = process.memoryUsage();
      const memDelta = memAfter.heapUsed - memoryStart;
      
      if (memDelta > 50 * 1024 * 1024) { // 50MB
        const url = new URL(request.url);
        console.warn(`⚠️  Large memory allocation in request: ${(memDelta / 1024 / 1024).toFixed(2)}MB`);
        console.warn('  Request:', request.method, url.pathname);
      }
      
      return memDelta;
    }
  };
}

/**
 * Enhanced performance wrapper with all features
 */
export function withFullPerformanceTracking<T extends any[]>(
  handler: (request: NextRequest, ...args: T) => Promise<NextResponse>,
  options: {
    slowRequestThreshold?: number;
    enableMemoryTracking?: boolean;
    enableProfiling?: boolean;
  } = {}
) {
  const {
    slowRequestThreshold = 1000,
    enableMemoryTracking = true,
    enableProfiling = process.env.NODE_ENV === 'development'
  } = options;
  
  return async (request: NextRequest, ...args: T): Promise<NextResponse> => {
    const url = new URL(request.url);
    const startTime = Date.now();
    const memoryStart = process.memoryUsage().heapUsed;
    
    // Skip for health checks
    if (url.pathname === '/api/health-simple') {
      return handler(request, ...args);
    }
    
    // Create performance markers
    const markers = createPerformanceMarkers(request);
    
    // Memory monitoring
    const memoryMonitor = enableMemoryTracking 
      ? monitorMemoryUsage(request, memoryStart)
      : null;
    
    // Profiling setup
    if (enableProfiling) {
      const profilingRoutes = [
        '/api/execution-history',
        '/api/monitoring/dashboard', 
        '/api/sessions',
      ];
      
      if (profilingRoutes.some(route => url.pathname.startsWith(route))) {
        console.log(`📊 Profiling request: ${request.method} ${url.pathname}`);
      }
    }
    
    try {
      const response = await handler(request, ...args);
      const duration = Date.now() - startTime;
      
      // Record metrics
      recordRequest({
        method: request.method,
        path: url.pathname,
        statusCode: response.status,
        duration,
        timestamp: startTime,
        memoryUsed: memoryMonitor?.checkMemoryAfter() || 0,
      });
      
      // Log slow requests
      logSlowRequest(request, response, duration, slowRequestThreshold);
      
      // Profiling output
      if (enableProfiling) {
        console.log(`📊 Request completed: ${request.method} ${url.pathname} - ${duration}ms - ${response.status}`);
      }
      
      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Record failed request
      recordRequest({
        method: request.method,
        path: url.pathname,
        statusCode: 500,
        duration,
        timestamp: startTime,
        memoryUsed: memoryMonitor?.checkMemoryAfter() || 0,
      });
      
      throw error;
    }
  };
}