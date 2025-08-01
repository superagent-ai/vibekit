import type { 
  TelemetryEvent,
  Metrics,
  AnalyticsConfig,
  TimeRange
} from '../core/types.js';
import { AnalyticsEngine } from './AnalyticsEngine.js';

export interface MetricsSnapshot {
  timestamp: number;
  metrics: Metrics;
  interval: number;
}

export interface MetricsCollectorOptions {
  interval?: number; // Collection interval in ms
  maxSnapshots?: number; // Maximum number of snapshots to keep
  persistSnapshots?: boolean; // Whether to persist snapshots
}

export class MetricsCollector {
  private analyticsEngine: AnalyticsEngine;
  private config: AnalyticsConfig;
  private options: Required<MetricsCollectorOptions>;
  private intervalId?: NodeJS.Timeout;
  private snapshots: MetricsSnapshot[] = [];
  private isRunning = false;
  
  constructor(analyticsEngine: AnalyticsEngine, config: AnalyticsConfig, options?: MetricsCollectorOptions) {
    this.analyticsEngine = analyticsEngine;
    this.config = config;
    this.options = {
      interval: options?.interval || config.metrics?.interval || 60000, // Default 1 minute
      maxSnapshots: options?.maxSnapshots || 1440, // Default 24 hours of minute snapshots
      persistSnapshots: options?.persistSnapshots ?? false,
    };
  }
  
  /**
   * Start collecting metrics periodically
   */
  start(): void {
    if (this.isRunning) {
      return;
    }
    
    if (!this.config.enabled || !this.config.metrics?.enabled) {
      console.warn('Metrics collection is disabled in configuration');
      return;
    }
    
    this.isRunning = true;
    
    // Collect initial snapshot
    this.collectSnapshot();
    
    // Start periodic collection
    this.intervalId = setInterval(() => {
      this.collectSnapshot();
    }, this.options.interval);
  }
  
  /**
   * Stop collecting metrics
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    this.isRunning = false;
  }
  
  /**
   * Collect a single metrics snapshot
   */
  private async collectSnapshot(): Promise<void> {
    try {
      const metrics = await this.analyticsEngine.getMetrics();
      const snapshot: MetricsSnapshot = {
        timestamp: Date.now(),
        metrics,
        interval: this.options.interval,
      };
      
      this.snapshots.push(snapshot);
      
      // Trim old snapshots
      if (this.snapshots.length > this.options.maxSnapshots) {
        this.snapshots = this.snapshots.slice(-this.options.maxSnapshots);
      }
      
      // Persist if configured
      if (this.options.persistSnapshots) {
        await this.persistSnapshot(snapshot);
      }
    } catch (error) {
      console.error('Failed to collect metrics snapshot:', error);
    }
  }
  
  /**
   * Get snapshots within a time range
   */
  getSnapshots(timeRange?: TimeRange): MetricsSnapshot[] {
    if (!timeRange) {
      return [...this.snapshots];
    }
    
    return this.snapshots.filter(snapshot =>
      snapshot.timestamp >= timeRange.start && 
      snapshot.timestamp <= timeRange.end
    );
  }
  
  /**
   * Get the latest snapshot
   */
  getLatestSnapshot(): MetricsSnapshot | null {
    return this.snapshots[this.snapshots.length - 1] || null;
  }
  
  /**
   * Calculate metric changes between two snapshots
   */
  calculateChanges(fromSnapshot: MetricsSnapshot, toSnapshot: MetricsSnapshot): {
    eventsDelta: number;
    sessionsDelta: {
      active: number;
      completed: number;
      errored: number;
    };
    performanceChanges: {
      avgDuration: number;
      errorRate: number;
    };
    timeElapsed: number;
  } {
    const eventsDelta = toSnapshot.metrics.events.total - fromSnapshot.metrics.events.total;
    
    const sessionsDelta = {
      active: toSnapshot.metrics.sessions.active - fromSnapshot.metrics.sessions.active,
      completed: toSnapshot.metrics.sessions.completed - fromSnapshot.metrics.sessions.completed,
      errored: toSnapshot.metrics.sessions.errored - fromSnapshot.metrics.sessions.errored,
    };
    
    const performanceChanges = {
      avgDuration: toSnapshot.metrics.performance.avgDuration - fromSnapshot.metrics.performance.avgDuration,
      errorRate: toSnapshot.metrics.performance.errorRate - fromSnapshot.metrics.performance.errorRate,
    };
    
    const timeElapsed = toSnapshot.timestamp - fromSnapshot.timestamp;
    
    return {
      eventsDelta,
      sessionsDelta,
      performanceChanges,
      timeElapsed,
    };
  }
  
  /**
   * Get rate of change for metrics
   */
  getRate(metric: 'events' | 'errors' | 'sessions', timeWindowMs?: number): number {
    const window = timeWindowMs || 300000; // Default 5 minutes
    const cutoff = Date.now() - window;
    const relevantSnapshots = this.snapshots.filter(s => s.timestamp >= cutoff);
    
    if (relevantSnapshots.length < 2) {
      return 0;
    }
    
    const first = relevantSnapshots[0];
    const last = relevantSnapshots[relevantSnapshots.length - 1];
    const timeDiff = (last.timestamp - first.timestamp) / 1000; // Convert to seconds
    
    if (timeDiff === 0) {
      return 0;
    }
    
    switch (metric) {
      case 'events':
        return (last.metrics.events.total - first.metrics.events.total) / timeDiff;
      case 'errors': {
        const firstErrors = first.metrics.events.byType?.error || 0;
        const lastErrors = last.metrics.events.byType?.error || 0;
        return (lastErrors - firstErrors) / timeDiff;
      }
      case 'sessions': {
        const firstTotal = first.metrics.sessions.active + first.metrics.sessions.completed + first.metrics.sessions.errored;
        const lastTotal = last.metrics.sessions.active + last.metrics.sessions.completed + last.metrics.sessions.errored;
        return (lastTotal - firstTotal) / timeDiff;
      }
      default:
        return 0;
    }
  }
  
  /**
   * Persist snapshot (placeholder for actual implementation)
   */
  private async persistSnapshot(snapshot: MetricsSnapshot): Promise<void> {
    // TODO: Implement persistence to database or file
    // For now, this is a placeholder
    // Snapshot created with timestamp: snapshot.timestamp
  }
  
  /**
   * Clean up resources
   */
  async shutdown(): Promise<void> {
    this.stop();
    this.snapshots = [];
  }
}