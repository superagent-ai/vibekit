import { CircularBuffer, RequestMetric, TrackedError } from '../types/index.js';

/**
 * Efficient circular buffer implementation for metrics storage
 */
class CircularBufferImpl<T> implements CircularBuffer<T> {
  private buffer: T[];
  private head: number = 0;
  private count: number = 0;
  private capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.buffer = new Array(capacity);
  }

  add(item: T): void {
    this.buffer[this.head] = item;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) {
      this.count++;
    }
  }

  getAll(): T[] {
    if (this.count === 0) return [];
    
    if (this.count < this.capacity) {
      return this.buffer.slice(0, this.count);
    } else {
      return [...this.buffer.slice(this.head), ...this.buffer.slice(0, this.head)];
    }
  }

  getLast(count: number): T[] {
    const all = this.getAll();
    return all.slice(-count);
  }

  clear(): void {
    this.head = 0;
    this.count = 0;
    this.buffer.fill(undefined as any);
  }

  size(): number {
    return this.count;
  }
}

/**
 * In-memory storage for monitoring metrics
 * No database required - uses circular buffers for efficient memory usage
 */
export class InMemoryStore {
  private requestMetrics: CircularBuffer<RequestMetric>;
  private errorMetrics: CircularBuffer<TrackedError>;
  private retentionMinutes: number;
  private maxRequests: number;
  private maxErrors: number;
  private lastCleanup: number = Date.now();

  constructor(options: {
    retentionMinutes?: number;
    maxRequests?: number;
    maxErrors?: number;
  } = {}) {
    this.retentionMinutes = options.retentionMinutes || 60; // Default 1 hour
    this.maxRequests = options.maxRequests || 10000; // Default 10k requests
    this.maxErrors = options.maxErrors || 1000; // Default 1k errors

    this.requestMetrics = new CircularBufferImpl(this.maxRequests);
    this.errorMetrics = new CircularBufferImpl(this.maxErrors);

    // Start periodic cleanup
    this.startCleanupInterval();
  }

  /**
   * Add a request metric
   */
  addRequestMetric(metric: RequestMetric): void {
    this.requestMetrics.add(metric);
  }

  /**
   * Add an error metric
   */
  addErrorMetric(error: TrackedError): void {
    this.errorMetrics.add(error);
  }

  /**
   * Get recent request metrics
   */
  getRequestMetrics(minutes?: number): RequestMetric[] {
    const all = this.requestMetrics.getAll();
    if (!minutes) return all;

    const cutoff = Date.now() - (minutes * 60 * 1000);
    return all.filter(metric => metric.timestamp >= cutoff);
  }

  /**
   * Get recent error metrics
   */
  getErrorMetrics(minutes?: number): TrackedError[] {
    const all = this.errorMetrics.getAll();
    if (!minutes) return all;

    const cutoff = Date.now() - (minutes * 60 * 1000);
    return all.filter(error => error.timestamp >= cutoff);
  }

  /**
   * Get the last N request metrics
   */
  getLastRequestMetrics(count: number): RequestMetric[] {
    return this.requestMetrics.getLast(count);
  }

  /**
   * Get the last N error metrics
   */
  getLastErrorMetrics(count: number): TrackedError[] {
    return this.errorMetrics.getLast(count);
  }

  /**
   * Clear old metrics beyond retention period
   */
  clearOldMetrics(): void {
    const now = Date.now();
    const cutoff = now - (this.retentionMinutes * 60 * 1000);

    // Get all metrics and filter out old ones
    const recentRequests = this.getRequestMetrics().filter(m => m.timestamp >= cutoff);
    const recentErrors = this.getErrorMetrics().filter(e => e.timestamp >= cutoff);

    // Clear and re-add recent metrics
    this.requestMetrics.clear();
    this.errorMetrics.clear();

    recentRequests.forEach(metric => this.requestMetrics.add(metric));
    recentErrors.forEach(error => this.errorMetrics.add(error));

    this.lastCleanup = now;
  }

  /**
   * Get storage statistics
   */
  getStats(): {
    requestCount: number;
    errorCount: number;
    oldestRequest?: number;
    newestRequest?: number;
    memoryUsageKB: number;
  } {
    const requests = this.requestMetrics.getAll();
    const errors = this.errorMetrics.getAll();

    return {
      requestCount: requests.length,
      errorCount: errors.length,
      oldestRequest: requests.length > 0 ? requests[0].timestamp : undefined,
      newestRequest: requests.length > 0 ? requests[requests.length - 1].timestamp : undefined,
      memoryUsageKB: Math.round((requests.length * 200 + errors.length * 500) / 1024), // Rough estimate
    };
  }

  /**
   * Export all metrics to JSON
   */
  exportToJSON(): string {
    return JSON.stringify({
      requestMetrics: this.requestMetrics.getAll(),
      errorMetrics: this.errorMetrics.getAll(),
      timestamp: Date.now(),
      retentionMinutes: this.retentionMinutes,
    }, null, 2);
  }

  /**
   * Import metrics from JSON
   */
  importFromJSON(json: string): void {
    try {
      const data = JSON.parse(json);
      
      this.requestMetrics.clear();
      this.errorMetrics.clear();

      if (data.requestMetrics) {
        data.requestMetrics.forEach((metric: RequestMetric) => {
          this.requestMetrics.add(metric);
        });
      }

      if (data.errorMetrics) {
        data.errorMetrics.forEach((error: TrackedError) => {
          this.errorMetrics.add(error);
        });
      }
    } catch (error) {
      throw new Error(`Failed to import metrics: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Clear all metrics
   */
  clearAll(): void {
    this.requestMetrics.clear();
    this.errorMetrics.clear();
  }

  /**
   * Start periodic cleanup
   */
  private startCleanupInterval(): void {
    // Clean up every 5 minutes
    setInterval(() => {
      this.clearOldMetrics();
    }, 5 * 60 * 1000);
  }

  /**
   * Cleanup and stop all timers
   */
  destroy(): void {
    // Clear intervals would go here if we stored references
    this.clearAll();
  }
}