import type { 
  TelemetryEvent,
  Metrics,
  TimeRange
} from '../core/types.js';
import { EventEmitter } from 'events';

export interface RealtimeMetrics {
  eventsPerSecond: number;
  eventsPerMinute: number;
  activeSessionCount: number;
  errorRate: number;
  avgResponseTime: number;
  topCategories: Array<{ category: string; count: number }>;
  topActions: Array<{ action: string; count: number }>;
  recentErrors: Array<{ timestamp: number; category: string; message?: string }>;
}

export interface RealtimeSubscription {
  id: string;
  metric: string;
  callback: (data: any) => void;
  interval?: number;
  filter?: (event: TelemetryEvent) => boolean;
}

export interface StreamOptions {
  windowSize?: number; // Time window in ms
  updateInterval?: number; // Update frequency in ms
  maxEvents?: number; // Max events to keep in memory
}

export class RealtimeAnalytics extends EventEmitter {
  private events: TelemetryEvent[] = [];
  private sessions = new Map<string, { startTime: number; lastActivity: number; status: string }>();
  private subscriptions = new Map<string, RealtimeSubscription>();
  private updateInterval?: NodeJS.Timeout;
  private metricsCache: RealtimeMetrics;
  private options: Required<StreamOptions>;
  
  constructor(options?: StreamOptions) {
    super();
    
    this.options = {
      windowSize: options?.windowSize || 300000, // 5 minutes
      updateInterval: options?.updateInterval || 1000, // 1 second
      maxEvents: options?.maxEvents || 10000,
    };
    
    this.metricsCache = this.createEmptyMetrics();
    this.startUpdateLoop();
  }
  
  /**
   * Process a new event in real-time
   */
  processEvent(event: TelemetryEvent): void {
    // First prune old events to ensure we have space
    this.pruneOldEvents();
    
    // Check if we're at max capacity even after pruning
    if (this.events.length >= this.options.maxEvents) {
      // Remove oldest event to make room
      this.events.shift();
    }
    
    // Add to events array
    this.events.push(event);
    
    // Update session tracking
    this.updateSessionTracking(event);
    
    // Emit event for subscribers
    this.emit('event', event);
    
    // Check subscriptions
    this.checkSubscriptions(event);
  }
  
  /**
   * Update session tracking
   */
  private updateSessionTracking(event: TelemetryEvent): void {
    const session = this.sessions.get(event.sessionId) || {
      startTime: event.timestamp,
      lastActivity: event.timestamp,
      status: 'active',
    };
    
    session.lastActivity = event.timestamp;
    
    if (event.eventType === 'end') {
      session.status = 'completed';
    } else if (event.eventType === 'error') {
      session.status = 'errored';
    }
    
    this.sessions.set(event.sessionId, session);
    
    // Clean up old sessions (inactive for more than window size)
    const cutoff = Date.now() - this.options.windowSize;
    const sessionsToDelete: string[] = [];
    for (const [sessionId, sessionData] of this.sessions.entries()) {
      if (sessionData.lastActivity < cutoff) {
        sessionsToDelete.push(sessionId);
      }
    }
    // Delete after iteration to avoid iterator invalidation
    sessionsToDelete.forEach(id => this.sessions.delete(id));
  }
  
  /**
   * Prune events outside the time window
   */
  private pruneOldEvents(): void {
    const cutoff = Date.now() - this.options.windowSize;
    
    // Remove old events
    let firstValidIndex = 0;
    for (let i = 0; i < this.events.length; i++) {
      if (this.events[i].timestamp >= cutoff) {
        firstValidIndex = i;
        break;
      }
    }
    
    if (firstValidIndex > 0) {
      this.events = this.events.slice(firstValidIndex);
    }
    
    // Also enforce max events limit
    if (this.events.length > this.options.maxEvents) {
      this.events = this.events.slice(-this.options.maxEvents);
    }
  }
  
  /**
   * Start the update loop for real-time metrics
   */
  private startUpdateLoop(): void {
    this.updateInterval = setInterval(() => {
      this.updateMetrics();
      this.emit('metrics', this.metricsCache);
    }, this.options.updateInterval);
  }
  
  /**
   * Update real-time metrics
   */
  private updateMetrics(): void {
    const now = Date.now();
    const oneSecondAgo = now - 1000;
    const oneMinuteAgo = now - 60000;
    
    // Use binary search for better performance with sorted arrays
    const findFirstAfter = (timestamp: number): number => {
      let left = 0;
      let right = this.events.length;
      while (left < right) {
        const mid = Math.floor((left + right) / 2);
        if (this.events[mid].timestamp < timestamp) {
          left = mid + 1;
        } else {
          right = mid;
        }
      }
      return left;
    };
    
    const secondIndex = findFirstAfter(oneSecondAgo);
    const minuteIndex = findFirstAfter(oneMinuteAgo);
    
    // Events per second
    this.metricsCache.eventsPerSecond = this.events.length - secondIndex;
    
    // Events per minute  
    const eventsLastMinute = this.events.slice(minuteIndex);
    this.metricsCache.eventsPerMinute = eventsLastMinute.length;
    
    // Active sessions
    this.metricsCache.activeSessionCount = Array.from(this.sessions.values())
      .filter(s => s.status === 'active').length;
    
    // Error rate
    const errorCount = eventsLastMinute.filter(e => e.eventType === 'error').length;
    this.metricsCache.errorRate = eventsLastMinute.length > 0 
      ? errorCount / eventsLastMinute.length 
      : 0;
    
    // Average response time
    const durations = eventsLastMinute
      .filter(e => e.duration !== undefined)
      .map(e => e.duration!);
    this.metricsCache.avgResponseTime = durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;
    
    // Top categories
    const categoryCounts = new Map<string, number>();
    eventsLastMinute.forEach(e => {
      categoryCounts.set(e.category, (categoryCounts.get(e.category) || 0) + 1);
    });
    this.metricsCache.topCategories = Array.from(categoryCounts.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    
    // Top actions
    const actionCounts = new Map<string, number>();
    eventsLastMinute.forEach(e => {
      actionCounts.set(e.action, (actionCounts.get(e.action) || 0) + 1);
    });
    this.metricsCache.topActions = Array.from(actionCounts.entries())
      .map(([action, count]) => ({ action, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    
    // Recent errors
    this.metricsCache.recentErrors = eventsLastMinute
      .filter(e => e.eventType === 'error')
      .map(e => ({
        timestamp: e.timestamp,
        category: e.category,
        message: e.metadata?.error?.message,
      }))
      .slice(-10);
  }
  
  /**
   * Subscribe to a specific metric
   */
  subscribe(
    metric: string, 
    callback: (data: any) => void,
    options?: {
      interval?: number;
      filter?: (event: TelemetryEvent) => boolean;
    }
  ): string {
    const id = `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const subscription: RealtimeSubscription = {
      id,
      metric,
      callback,
      interval: options?.interval,
      filter: options?.filter,
    };
    
    this.subscriptions.set(id, subscription);
    
    // Set up interval if specified
    if (subscription.interval) {
      const intervalId = setInterval(() => {
        const data = this.getMetricData(metric);
        callback(data);
      }, subscription.interval);
      
      // Store interval ID for cleanup
      (subscription as any).intervalId = intervalId;
    }
    
    return id;
  }
  
  /**
   * Unsubscribe from a metric
   */
  unsubscribe(subscriptionId: string): void {
    const subscription = this.subscriptions.get(subscriptionId);
    if (subscription) {
      // Clear interval if exists
      if ((subscription as any).intervalId) {
        clearInterval((subscription as any).intervalId);
      }
      this.subscriptions.delete(subscriptionId);
    }
  }
  
  /**
   * Check subscriptions for a new event
   */
  private checkSubscriptions(event: TelemetryEvent): void {
    for (const subscription of this.subscriptions.values()) {
      // Apply filter if specified
      if (subscription.filter && !subscription.filter(event)) {
        continue;
      }
      
      // For non-interval subscriptions, send updates on matching events
      if (!subscription.interval) {
        const data = this.getMetricData(subscription.metric, event);
        subscription.callback(data);
      }
    }
  }
  
  /**
   * Get data for a specific metric
   */
  private getMetricData(metric: string, event?: TelemetryEvent): any {
    switch (metric) {
      case 'eventsPerSecond':
        return this.metricsCache.eventsPerSecond;
      
      case 'eventsPerMinute':
        return this.metricsCache.eventsPerMinute;
      
      case 'activeSessionCount':
        return this.metricsCache.activeSessionCount;
      
      case 'errorRate':
        return this.metricsCache.errorRate;
      
      case 'avgResponseTime':
        return this.metricsCache.avgResponseTime;
      
      case 'topCategories':
        return this.metricsCache.topCategories;
      
      case 'topActions':
        return this.metricsCache.topActions;
      
      case 'recentErrors':
        return this.metricsCache.recentErrors;
      
      case 'metrics':
        return this.metricsCache;
      
      case 'event':
        return event;
      
      default:
        // Custom metric - calculate from recent events
        const recentEvents = this.events.slice(-100);
        return {
          metric,
          count: recentEvents.length,
          timestamp: Date.now(),
        };
    }
  }
  
  /**
   * Get current real-time metrics
   */
  getMetrics(): RealtimeMetrics {
    return { ...this.metricsCache };
  }
  
  /**
   * Get events within a time range
   */
  getEvents(timeRange?: TimeRange): TelemetryEvent[] {
    if (!timeRange) {
      return [...this.events];
    }
    
    return this.events.filter(e => 
      e.timestamp >= timeRange.start && e.timestamp <= timeRange.end
    );
  }
  
  /**
   * Get active sessions
   */
  getActiveSessions(): Array<{
    sessionId: string;
    startTime: number;
    lastActivity: number;
    duration: number;
    status: string;
  }> {
    return Array.from(this.sessions.entries()).map(([sessionId, data]) => ({
      sessionId,
      ...data,
      duration: data.lastActivity - data.startTime,
    }));
  }
  
  /**
   * Create empty metrics object
   */
  private createEmptyMetrics(): RealtimeMetrics {
    return {
      eventsPerSecond: 0,
      eventsPerMinute: 0,
      activeSessionCount: 0,
      errorRate: 0,
      avgResponseTime: 0,
      topCategories: [],
      topActions: [],
      recentErrors: [],
    };
  }
  
  /**
   * Clean up resources
   */
  async shutdown(): Promise<void> {
    // Stop update loop first to prevent new events during cleanup
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = undefined;
    }
    
    // Clear all subscriptions
    for (const subscription of this.subscriptions.values()) {
      if ((subscription as any).intervalId) {
        clearInterval((subscription as any).intervalId);
      }
    }
    
    // Clear data efficiently
    this.events.length = 0; // More efficient than reassigning
    this.sessions.clear();
    this.subscriptions.clear();
    
    // Remove all listeners
    this.removeAllListeners();
  }
}