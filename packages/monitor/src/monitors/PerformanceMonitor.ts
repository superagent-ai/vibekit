/**
 * Performance Monitoring System
 * 
 * Tracks and analyzes performance metrics for the VibeKit dashboard
 * including response times, throughput, resource usage, and bottlenecks.
 */

import { EventEmitter } from 'events';
import { performance, PerformanceObserver } from 'perf_hooks';
import os from 'os';
import { createLogger } from '@vibe-kit/logger';

export interface PerformanceMetric {
  name: string;
  value: number;
  unit: string;
  timestamp: number;
  tags?: Record<string, string>;
}

export interface RequestMetrics {
  method: string;
  path: string;
  statusCode: number;
  duration: number;
  timestamp: number;
  memoryUsed: number;
  cpuUsage?: number;
}

export interface ResourceMetrics {
  cpu: {
    usage: number;
    loadAverage: number[];
    cores: number;
  };
  memory: {
    used: number;
    total: number;
    percentage: number;
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
  };
  eventLoop: {
    lag: number;
    utilization: number;
  };
  handles: {
    active: number;
    activeRequests: number;
  };
}

export interface PerformanceSnapshot {
  timestamp: number;
  requests: {
    total: number;
    avgDuration: number;
    p50: number;
    p90: number;
    p95: number;
    p99: number;
    throughput: number;
    errorRate: number;
  };
  resources: ResourceMetrics;
  slowQueries: RequestMetrics[];
  bottlenecks: string[];
}

interface PerformanceThresholds {
  slowRequestMs: number;
  highMemoryPercent: number;
  highCpuPercent: number;
  highEventLoopLagMs: number;
  lowThroughputRps: number;
  highErrorRatePercent: number;
}

/**
 * Performance monitor singleton
 */
export class PerformanceMonitor extends EventEmitter {
  private static instance: PerformanceMonitor;
  
  private enabled: boolean = false;
  private checkInterval: number = 30000; // 30 seconds
  private intervalId?: NodeJS.Timeout;
  
  // Metrics storage
  private requestMetrics: RequestMetrics[] = [];
  private customMetrics: PerformanceMetric[] = [];
  private resourceSnapshots: ResourceMetrics[] = [];
  
  // Performance thresholds
  private thresholds: PerformanceThresholds = {
    slowRequestMs: 1000,
    highMemoryPercent: 80,
    highCpuPercent: 80,
    highEventLoopLagMs: 100,
    lowThroughputRps: 10,
    highErrorRatePercent: 5,
  };
  
  // Event loop monitoring
  private eventLoopLagInterval?: NodeJS.Timeout;
  private lastEventLoopCheck: number = Date.now();
  private eventLoopLag: number = 0;
  
  // Performance observer
  private perfObserver?: PerformanceObserver;
  
  // Statistics
  private startTime: number = Date.now();
  private totalRequests: number = 0;
  private errorRequests: number = 0;
  
  constructor() {
    super();
    this.loadConfiguration();
  }

  /**
   * Check if performance monitoring is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }
  
  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }
  
  /**
   * Load configuration
   */
  private loadConfiguration(): void {
    const config = { enabled: true }; // Default monitoring config
    this.enabled = config.enabled;
    
    // Load custom thresholds from environment
    if (process.env.PERF_SLOW_REQUEST_MS) {
      this.thresholds.slowRequestMs = parseInt(process.env.PERF_SLOW_REQUEST_MS, 10);
    }
    if (process.env.PERF_HIGH_MEMORY_PERCENT) {
      this.thresholds.highMemoryPercent = parseInt(process.env.PERF_HIGH_MEMORY_PERCENT, 10);
    }
    if (process.env.PERF_HIGH_CPU_PERCENT) {
      this.thresholds.highCpuPercent = parseInt(process.env.PERF_HIGH_CPU_PERCENT, 10);
    }
  }
  
  /**
   * Start performance monitoring
   */
  async start(): Promise<void> {
    if (!this.enabled) {
      const logger = createLogger('PerformanceMonitor');
      logger.info('Performance monitoring disabled');
      return;
    }
    
    const logger = createLogger('PerformanceMonitor');
    logger.info('Starting performance monitoring...');
    
    // Start event loop lag monitoring
    this.startEventLoopMonitoring();
    
    // Start performance observer
    this.startPerformanceObserver();
    
    // Start periodic monitoring
    this.intervalId = setInterval(() => {
      this.collectMetrics();
    }, this.checkInterval);
    
    // Initial collection
    await this.collectMetrics();
    
    logger.info('Performance monitoring started');
    this.emit('started');
  }
  
  /**
   * Stop performance monitoring
   */
  async stop(): Promise<void> {
    const logger = createLogger('PerformanceMonitor');
    logger.info('Stopping performance monitoring...');
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    
    if (this.eventLoopLagInterval) {
      clearInterval(this.eventLoopLagInterval);
      this.eventLoopLagInterval = undefined;
    }
    
    if (this.perfObserver) {
      this.perfObserver.disconnect();
      this.perfObserver = undefined;
    }
    
    // Export final metrics
    const snapshot = this.getSnapshot();
    this.emit('stopped', snapshot);
    
    logger.info('Performance monitoring stopped');
  }
  
  /**
   * Start event loop lag monitoring
   */
  private startEventLoopMonitoring(): void {
    // Monitor event loop lag
    this.eventLoopLagInterval = setInterval(() => {
      const now = Date.now();
      const expectedDelay = 100; // Check every 100ms
      const actualDelay = now - this.lastEventLoopCheck;
      
      if (this.lastEventLoopCheck > 0) {
        this.eventLoopLag = Math.max(0, actualDelay - expectedDelay);
      }
      
      this.lastEventLoopCheck = now;
    }, 100);
    
    // Don't block event loop
    this.eventLoopLagInterval.unref();
  }
  
  /**
   * Start performance observer for marks and measures
   */
  private startPerformanceObserver(): void {
    this.perfObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType === 'measure') {
          this.recordCustomMetric({
            name: entry.name,
            value: entry.duration,
            unit: 'ms',
            timestamp: Date.now(),
          });
        }
      }
    });
    
    this.perfObserver.observe({ entryTypes: ['measure'] });
  }
  
  /**
   * Record a request
   */
  recordRequest(metrics: RequestMetrics): void {
    if (!this.enabled) return;
    
    this.requestMetrics.push(metrics);
    this.totalRequests++;
    
    if (metrics.statusCode >= 500) {
      this.errorRequests++;
    }
    
    // Keep only last hour of metrics
    const oneHourAgo = Date.now() - 3600000;
    this.requestMetrics = this.requestMetrics.filter(m => m.timestamp > oneHourAgo);
    
    // Check for slow request
    if (metrics.duration > this.thresholds.slowRequestMs) {
      this.emit('slowRequest', metrics);
    }
    
    // Check for high memory usage
    const memUsage = process.memoryUsage();
    const memPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
    if (memPercent > this.thresholds.highMemoryPercent) {
      this.emit('highMemory', {
        percentage: memPercent,
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
      });
    }
  }
  
  /**
   * Record a custom metric
   */
  recordCustomMetric(metric: PerformanceMetric): void {
    if (!this.enabled) return;
    
    this.customMetrics.push(metric);
    
    // Keep only last hour
    const oneHourAgo = Date.now() - 3600000;
    this.customMetrics = this.customMetrics.filter(m => m.timestamp > oneHourAgo);
  }
  
  /**
   * Mark the start of an operation
   */
  mark(name: string): void {
    if (!this.enabled) return;
    performance.mark(name);
  }
  
  /**
   * Measure between two marks
   */
  measure(name: string, startMark: string, endMark?: string): void {
    if (!this.enabled) return;
    
    if (endMark) {
      performance.measure(name, startMark, endMark);
    } else {
      performance.measure(name, startMark);
    }
  }
  
  /**
   * Collect current metrics
   */
  private async collectMetrics(): Promise<void> {
    const resources = this.getResourceMetrics();
    this.resourceSnapshots.push(resources);
    
    // Keep only last hour
    const oneHourAgo = Date.now() - 3600000;
    this.resourceSnapshots = this.resourceSnapshots.filter(
      s => Date.now() - oneHourAgo < 3600000
    );
    
    // Check thresholds
    this.checkThresholds(resources);
    
    // Emit metrics event
    this.emit('metrics', {
      resources,
      requests: this.getRequestStats(),
      custom: this.customMetrics.slice(-10),
    });
  }
  
  /**
   * Get current resource metrics
   */
  private getResourceMetrics(): ResourceMetrics {
    const memUsage = process.memoryUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    
    // CPU usage (requires previous measurement)
    const cpus = os.cpus();
    let cpuUsage = 0;
    for (const cpu of cpus) {
      const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
      const idle = cpu.times.idle;
      cpuUsage += ((total - idle) / total) * 100;
    }
    cpuUsage = cpuUsage / cpus.length;
    
    return {
      cpu: {
        usage: cpuUsage,
        loadAverage: os.loadavg(),
        cores: cpus.length,
      },
      memory: {
        used: usedMem,
        total: totalMem,
        percentage: (usedMem / totalMem) * 100,
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        external: memUsage.external,
        rss: memUsage.rss,
      },
      eventLoop: {
        lag: this.eventLoopLag,
        utilization: this.eventLoopLag > 0 ? Math.min(100, (this.eventLoopLag / 100) * 100) : 0,
      },
      handles: {
        active: (process as any)._getActiveHandles?.()?.length || 0,
        activeRequests: (process as any)._getActiveRequests?.()?.length || 0,
      },
    };
  }
  
  /**
   * Get request statistics
   */
  private getRequestStats() {
    if (this.requestMetrics.length === 0) {
      return {
        total: 0,
        avgDuration: 0,
        p50: 0,
        p90: 0,
        p95: 0,
        p99: 0,
        throughput: 0,
        errorRate: 0,
      };
    }
    
    const durations = this.requestMetrics.map(m => m.duration).sort((a, b) => a - b);
    const total = this.requestMetrics.length;
    
    // Calculate percentiles
    const p50Index = Math.floor(total * 0.5);
    const p90Index = Math.floor(total * 0.9);
    const p95Index = Math.floor(total * 0.95);
    const p99Index = Math.floor(total * 0.99);
    
    // Calculate throughput (requests per second)
    const timeRange = Date.now() - this.startTime;
    const throughput = (this.totalRequests / timeRange) * 1000;
    
    // Calculate error rate
    const errorRate = this.totalRequests > 0 
      ? (this.errorRequests / this.totalRequests) * 100 
      : 0;
    
    return {
      total: this.totalRequests,
      avgDuration: durations.reduce((a, b) => a + b, 0) / total,
      p50: durations[p50Index] || 0,
      p90: durations[p90Index] || 0,
      p95: durations[p95Index] || 0,
      p99: durations[p99Index] || 0,
      throughput,
      errorRate,
    };
  }
  
  /**
   * Check performance thresholds
   */
  private checkThresholds(resources: ResourceMetrics): void {
    const bottlenecks: string[] = [];
    
    // Check CPU
    if (resources.cpu.usage > this.thresholds.highCpuPercent) {
      bottlenecks.push(`High CPU usage: ${resources.cpu.usage.toFixed(1)}%`);
      this.emit('highCpu', resources.cpu);
    }
    
    // Check memory
    if (resources.memory.percentage > this.thresholds.highMemoryPercent) {
      bottlenecks.push(`High memory usage: ${resources.memory.percentage.toFixed(1)}%`);
      this.emit('highMemory', resources.memory);
    }
    
    // Check event loop lag
    if (resources.eventLoop.lag > this.thresholds.highEventLoopLagMs) {
      bottlenecks.push(`High event loop lag: ${resources.eventLoop.lag}ms`);
      this.emit('highEventLoopLag', resources.eventLoop);
    }
    
    // Check throughput
    const stats = this.getRequestStats();
    if (stats.throughput < this.thresholds.lowThroughputRps && this.totalRequests > 100) {
      bottlenecks.push(`Low throughput: ${stats.throughput.toFixed(2)} req/s`);
      this.emit('lowThroughput', stats.throughput);
    }
    
    // Check error rate
    if (stats.errorRate > this.thresholds.highErrorRatePercent) {
      bottlenecks.push(`High error rate: ${stats.errorRate.toFixed(1)}%`);
      this.emit('highErrorRate', stats.errorRate);
    }
    
    if (bottlenecks.length > 0) {
      this.emit('bottlenecks', bottlenecks);
    }
  }
  
  /**
   * Get performance snapshot
   */
  getSnapshot(): PerformanceSnapshot {
    const resources = this.getResourceMetrics();
    const stats = this.getRequestStats();
    
    // Find slow queries (top 10)
    const slowQueries = [...this.requestMetrics]
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 10);
    
    // Detect bottlenecks
    const bottlenecks: string[] = [];
    
    if (resources.cpu.usage > this.thresholds.highCpuPercent) {
      bottlenecks.push(`High CPU: ${resources.cpu.usage.toFixed(1)}%`);
    }
    if (resources.memory.percentage > this.thresholds.highMemoryPercent) {
      bottlenecks.push(`High memory: ${resources.memory.percentage.toFixed(1)}%`);
    }
    if (resources.eventLoop.lag > this.thresholds.highEventLoopLagMs) {
      bottlenecks.push(`Event loop lag: ${resources.eventLoop.lag}ms`);
    }
    if (stats.errorRate > this.thresholds.highErrorRatePercent) {
      bottlenecks.push(`Error rate: ${stats.errorRate.toFixed(1)}%`);
    }
    
    return {
      timestamp: Date.now(),
      requests: stats,
      resources,
      slowQueries,
      bottlenecks,
    };
  }
  
  /**
   * Get metrics for monitoring dashboard
   */
  getDashboardMetrics() {
    const snapshot = this.getSnapshot();
    
    return {
      performance: {
        requests: {
          total: snapshot.requests.total,
          avgDuration: `${snapshot.requests.avgDuration.toFixed(2)}ms`,
          p50: `${snapshot.requests.p50}ms`,
          p90: `${snapshot.requests.p90}ms`,
          p95: `${snapshot.requests.p95}ms`,
          p99: `${snapshot.requests.p99}ms`,
          throughput: `${snapshot.requests.throughput.toFixed(2)} req/s`,
          errorRate: `${snapshot.requests.errorRate.toFixed(2)}%`,
        },
        resources: {
          cpu: `${snapshot.resources.cpu.usage.toFixed(1)}%`,
          memory: `${snapshot.resources.memory.percentage.toFixed(1)}%`,
          heapUsed: `${(snapshot.resources.memory.heapUsed / 1024 / 1024).toFixed(2)}MB`,
          eventLoopLag: `${snapshot.resources.eventLoop.lag}ms`,
          activeHandles: snapshot.resources.handles.active,
        },
        bottlenecks: snapshot.bottlenecks,
        slowestEndpoints: snapshot.slowQueries.map(q => ({
          path: q.path,
          method: q.method,
          duration: `${q.duration}ms`,
        })),
      },
      uptime: Date.now() - this.startTime,
    };
  }
  
  /**
   * Clear all metrics
   */
  clearMetrics(): void {
    this.requestMetrics = [];
    this.customMetrics = [];
    this.resourceSnapshots = [];
    this.totalRequests = 0;
    this.errorRequests = 0;
    this.startTime = Date.now();
  }
  
  /**
   * Export metrics
   */
  exportMetrics(): {
    requests: RequestMetrics[];
    custom: PerformanceMetric[];
    resources: ResourceMetrics[];
    snapshot: PerformanceSnapshot;
  } {
    return {
      requests: [...this.requestMetrics],
      custom: [...this.customMetrics],
      resources: [...this.resourceSnapshots],
      snapshot: this.getSnapshot(),
    };
  }
}

// Export singleton instance
export const performanceMonitor = PerformanceMonitor.getInstance();

// Convenience functions
export function recordRequest(metrics: RequestMetrics): void {
  performanceMonitor.recordRequest(metrics);
}

export function recordMetric(metric: PerformanceMetric): void {
  performanceMonitor.recordCustomMetric(metric);
}

export function perfMark(name: string): void {
  performanceMonitor.mark(name);
}

export function perfMeasure(name: string, startMark: string, endMark?: string): void {
  performanceMonitor.measure(name, startMark, endMark);
}

export function getPerformanceSnapshot(): PerformanceSnapshot {
  return performanceMonitor.getSnapshot();
}

export function getPerformanceDashboard() {
  return performanceMonitor.getDashboardMetrics();
}