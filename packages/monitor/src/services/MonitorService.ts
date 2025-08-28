import { EventEmitter } from 'events';
import { createLogger } from '@vibe-kit/logger';
import { InMemoryStore } from '../storage/InMemoryStore.js';
import { PerformanceMonitor } from '../monitors/PerformanceMonitor.js';
import {
  SystemHealth,
  PerformanceMetrics,
  MemoryMetrics,
  DiskMetrics,
  ResourceSummary,
  TrackedError,
  RequestMetric,
  EndpointMetric,
  MonitorOptions,
  MetricsExport,
  ComponentHealth,
  CrashedSession,
  RecoveryResult,
} from '../types/index.js';

/**
 * Main monitoring service that coordinates all monitoring components
 * Provides a clean API for system health, performance, and resource monitoring
 */
export class MonitorService extends EventEmitter {
  private logger = createLogger('MonitorService');
  private store: InMemoryStore;
  private performanceMonitor: PerformanceMonitor;
  private options: Required<MonitorOptions>;
  private isRunning: boolean = false;
  private startTime: number = Date.now();

  constructor(options: MonitorOptions = {}) {
    super();
    
    this.options = {
      retentionMinutes: options.retentionMinutes || 60,
      sampleRate: options.sampleRate || 1.0,
      enableRecovery: options.enableRecovery ?? true,
      enableErrorTracking: options.enableErrorTracking ?? true,
      maxErrors: options.maxErrors || 1000,
      maxRequests: options.maxRequests || 10000,
    };

    this.store = new InMemoryStore({
      retentionMinutes: this.options.retentionMinutes,
      maxRequests: this.options.maxRequests,
      maxErrors: this.options.maxErrors,
    });

    this.performanceMonitor = new PerformanceMonitor();
    this.setupEventListeners();
  }

  /**
   * Start monitoring
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Monitor service already running');
      return;
    }

    this.logger.info('Starting monitor service', { options: this.options });
    
    try {
      await this.performanceMonitor.start();
      this.isRunning = true;
      this.startTime = Date.now();
      
      this.logger.info('Monitor service started successfully');
      this.emit('started');
    } catch (error) {
      this.logger.error('Failed to start monitor service', { error });
      throw error;
    }
  }

  /**
   * Stop monitoring
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.logger.info('Stopping monitor service');
    
    try {
      await this.performanceMonitor.stop();
      this.isRunning = false;
      
      this.logger.info('Monitor service stopped');
      this.emit('stopped');
    } catch (error) {
      this.logger.error('Error stopping monitor service', { error });
    }
  }

  /**
   * Check overall system health
   */
  async checkHealth(): Promise<SystemHealth> {
    const timestamp = Date.now();
    const uptime = timestamp - this.startTime;
    
    const components: ComponentHealth[] = [
      {
        name: 'performance_monitor',
        status: this.performanceMonitor.isEnabled() ? 'healthy' : 'degraded',
        message: this.performanceMonitor.isEnabled() ? 'Running' : 'Disabled',
        lastCheck: timestamp,
      },
      {
        name: 'memory_store',
        status: 'healthy',
        message: 'Operational',
        details: this.store.getStats(),
        lastCheck: timestamp,
      }
    ];

    // Determine overall status
    const hasUnhealthy = components.some(c => c.status === 'unhealthy');
    const hasDegraded = components.some(c => c.status === 'degraded');
    
    const status = hasUnhealthy ? 'unhealthy' : (hasDegraded ? 'degraded' : 'healthy');

    return {
      status,
      timestamp,
      uptime,
      components,
      metrics: {
        totalRequests: this.store.getStats().requestCount,
        activeRequests: 0, // Would need to track this separately
        requestsPerSecond: this.calculateRequestsPerSecond(),
        averageResponseTime: this.calculateAverageResponseTime(),
        errorRate: this.calculateErrorRate(),
        uptime,
      },
    };
  }

  /**
   * Check specific component health
   */
  async checkComponent(name: string): Promise<ComponentHealth | null> {
    const health = await this.checkHealth();
    return health.components.find(c => c.name === name) || null;
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): PerformanceMetrics {
    const requests = this.store.getRequestMetrics(5); // Last 5 minutes
    
    if (requests.length === 0) {
      return {
        requestsPerSecond: 0,
        averageResponseTime: 0,
        p50ResponseTime: 0,
        p95ResponseTime: 0,
        p99ResponseTime: 0,
        errorRate: 0,
        throughput: 0,
        activeRequests: 0,
      };
    }

    const durations = requests.map(r => r.duration).sort((a, b) => a - b);
    const errorRequests = requests.filter(r => r.statusCode >= 400);
    
    return {
      requestsPerSecond: this.calculateRequestsPerSecond(),
      averageResponseTime: durations.reduce((a, b) => a + b, 0) / durations.length,
      p50ResponseTime: this.getPercentile(durations, 0.5),
      p95ResponseTime: this.getPercentile(durations, 0.95),
      p99ResponseTime: this.getPercentile(durations, 0.99),
      errorRate: errorRequests.length / requests.length,
      throughput: requests.length, // Requests in last 5 minutes
      activeRequests: 0, // Would need separate tracking
    };
  }

  /**
   * Get memory usage
   */
  getMemoryUsage(): MemoryMetrics {
    const usage = process.memoryUsage();
    
    return {
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      rss: usage.rss,
      external: usage.external,
      arrayBuffers: usage.arrayBuffers,
      heapUsedMB: Math.round(usage.heapUsed / 1024 / 1024).toString(),
      heapTotalMB: Math.round(usage.heapTotal / 1024 / 1024).toString(),
      rssMB: Math.round(usage.rss / 1024 / 1024).toString(),
    };
  }

  /**
   * Get request metrics
   */
  getRequestMetrics(minutes?: number): RequestMetric[] {
    return this.store.getRequestMetrics(minutes);
  }

  /**
   * Get slowest endpoints
   */
  getSlowestEndpoints(limit: number = 10): EndpointMetric[] {
    const requests = this.store.getRequestMetrics();
    const endpointMap = new Map<string, {
      durations: number[];
      errorCount: number;
      totalCount: number;
    }>();

    // Group by endpoint
    requests.forEach(req => {
      const key = `${req.method} ${req.path}`;
      if (!endpointMap.has(key)) {
        endpointMap.set(key, { durations: [], errorCount: 0, totalCount: 0 });
      }
      
      const endpoint = endpointMap.get(key)!;
      endpoint.durations.push(req.duration);
      endpoint.totalCount++;
      if (req.statusCode >= 400) {
        endpoint.errorCount++;
      }
    });

    // Calculate metrics and sort
    const endpoints: EndpointMetric[] = [];
    endpointMap.forEach((data, key) => {
      const [method, path] = key.split(' ', 2);
      const avgDuration = data.durations.reduce((a, b) => a + b, 0) / data.durations.length;
      const sortedDurations = data.durations.sort((a, b) => a - b);
      
      endpoints.push({
        method,
        path,
        avgDuration,
        p95Duration: this.getPercentile(sortedDurations, 0.95),
        requestCount: data.totalCount,
        errorCount: data.errorCount,
        errorRate: data.errorCount / data.totalCount,
      });
    });

    return endpoints.sort((a, b) => b.avgDuration - a.avgDuration).slice(0, limit);
  }

  /**
   * Track an error
   */
  trackError(error: Error, context?: any): void {
    if (!this.options.enableErrorTracking) {
      return;
    }

    const trackedError: TrackedError = {
      timestamp: Date.now(),
      error: error.message,
      stack: error.stack,
      context,
      severity: 'medium', // Could be determined based on error type
    };

    this.store.addErrorMetric(trackedError);
    this.emit('error', trackedError);
  }

  /**
   * Get recent errors
   */
  getRecentErrors(limit?: number): TrackedError[] {
    const errors = this.store.getErrorMetrics();
    return limit ? errors.slice(-limit) : errors;
  }

  /**
   * Export all metrics
   */
  exportMetrics(): MetricsExport {
    return {
      timestamp: Date.now(),
      version: '1.0.0',
      systemHealth: {} as SystemHealth, // Would call checkHealth() but it's async
      performance: this.getPerformanceMetrics(),
      memory: this.getMemoryUsage(),
      disk: { vibekitDir: { size: 0, files: 0 }, sessions: { size: 0, files: 0 }, projects: { size: 0, files: 0 }, logs: { size: 0, files: 0 } }, // Placeholder
      errors: this.getRecentErrors(),
      requestMetrics: this.getRequestMetrics(),
    };
  }

  /**
   * Record a request metric
   */
  recordRequest(metric: RequestMetric): void {
    // Apply sampling
    if (Math.random() > this.options.sampleRate) {
      return;
    }

    this.store.addRequestMetric(metric);
    this.emit('request', metric);
  }

  /**
   * Get storage statistics
   */
  getStorageStats() {
    return this.store.getStats();
  }

  /**
   * Clear all metrics
   */
  clearMetrics(): void {
    this.store.clearAll();
    this.logger.info('All metrics cleared');
  }

  /**
   * Setup event listeners for internal components
   */
  private setupEventListeners(): void {
    this.performanceMonitor.on('metric', (metric) => {
      // Convert performance monitor metric to our format if needed
      this.emit('performance', metric);
    });
  }

  /**
   * Calculate requests per second
   */
  private calculateRequestsPerSecond(): number {
    const requests = this.store.getRequestMetrics(1); // Last minute
    return requests.length / 60; // Requests per second
  }

  /**
   * Calculate average response time
   */
  private calculateAverageResponseTime(): number {
    const requests = this.store.getRequestMetrics(5); // Last 5 minutes
    if (requests.length === 0) return 0;
    
    const totalTime = requests.reduce((sum, req) => sum + req.duration, 0);
    return totalTime / requests.length;
  }

  /**
   * Calculate error rate
   */
  private calculateErrorRate(): number {
    const requests = this.store.getRequestMetrics(5); // Last 5 minutes
    if (requests.length === 0) return 0;
    
    const errorCount = requests.filter(req => req.statusCode >= 400).length;
    return errorCount / requests.length;
  }

  /**
   * Calculate percentile from sorted array
   */
  private getPercentile(sortedArray: number[], percentile: number): number {
    if (sortedArray.length === 0) return 0;
    
    const index = Math.ceil(sortedArray.length * percentile) - 1;
    return sortedArray[Math.max(0, index)];
  }

  /**
   * Cleanup resources
   */
  async destroy(): Promise<void> {
    await this.stop();
    this.store.destroy();
    this.removeAllListeners();
  }
}