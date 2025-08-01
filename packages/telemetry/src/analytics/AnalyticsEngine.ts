import type { 
  TelemetryEvent, 
  AnalyticsConfig, 
  Metrics, 
  Insights, 
  InsightOptions, 
  TimeRange 
} from '../core/types.js';

interface TimeSeriesData {
  timestamp: number;
  value: number;
  metadata?: any;
}

interface MetricBucket {
  timestamp: number;
  count: number;
  sum: number;
  min: number;
  max: number;
  events: string[]; // event IDs for debugging
}

export class AnalyticsEngine {
  private config: AnalyticsConfig;
  private metrics: Map<string, number> = new Map();
  private events: TelemetryEvent[] = [];
  private timeSeries: Map<string, TimeSeriesData[]> = new Map();
  private buckets: Map<string, MetricBucket[]> = new Map();
  private readonly bucketSizeMs = 60000; // 1 minute buckets
  private readonly maxBuckets = 1440; // Keep 24 hours of data
  
  constructor(config: AnalyticsConfig) {
    this.config = config;
  }
  
  async initialize(): Promise<void> {
    // Initialize analytics engine
  }
  
  async process(event: TelemetryEvent): Promise<void> {
    // Store event for analytics
    this.events.push(event);
    
    // Update metrics
    this.updateMetrics(event);
    
    // Update time series data
    this.updateTimeSeries(event);
    
    // Update bucketed metrics
    this.updateBuckets(event);
    
    // Keep only recent events (last 1000 for performance)
    if (this.events.length > 1000) {
      this.events = this.events.slice(-1000);
    }
    
    // Clean old buckets
    this.cleanOldBuckets();
  }
  
  private updateMetrics(event: TelemetryEvent): void {
    // Update counters
    this.incrementMetric('events.total');
    this.incrementMetric(`events.${event.eventType}`);
    this.incrementMetric(`events.${event.category}`);
    this.incrementMetric(`events.${event.category}.${event.action}`);
    
    if (event.eventType === 'error') {
      this.incrementMetric('errors.total');
      this.incrementMetric(`errors.${event.category}`);
    }
  }
  
  private incrementMetric(key: string, value: number = 1): void {
    this.metrics.set(key, (this.metrics.get(key) || 0) + value);
  }
  
  private updateTimeSeries(event: TelemetryEvent): void {
    const timestamp = event.timestamp;
    
    // Track events per minute
    this.addTimeSeriesPoint('events.rate', timestamp, 1);
    this.addTimeSeriesPoint(`events.${event.eventType}.rate`, timestamp, 1);
    this.addTimeSeriesPoint(`events.${event.category}.rate`, timestamp, 1);
    
    // Track response times if available
    if (event.duration) {
      this.addTimeSeriesPoint('performance.duration', timestamp, event.duration);
      this.addTimeSeriesPoint(`performance.${event.category}.duration`, timestamp, event.duration);
    }
    
    // Track errors
    if (event.eventType === 'error') {
      this.addTimeSeriesPoint('errors.rate', timestamp, 1);
    }
  }
  
  private addTimeSeriesPoint(metric: string, timestamp: number, value: number, metadata?: any): void {
    if (!this.timeSeries.has(metric)) {
      this.timeSeries.set(metric, []);
    }
    
    const series = this.timeSeries.get(metric)!;
    series.push({ timestamp, value, metadata });
    
    // Keep only last 1000 points per metric
    if (series.length > 1000) {
      series.splice(0, series.length - 1000);
    }
  }
  
  private updateBuckets(event: TelemetryEvent): void {
    const bucketTimestamp = Math.floor(event.timestamp / this.bucketSizeMs) * this.bucketSizeMs;
    
    // Update event count bucket
    this.updateBucket('events.count', bucketTimestamp, 1, event.id || '');
    this.updateBucket(`events.${event.eventType}.count`, bucketTimestamp, 1, event.id || '');
    this.updateBucket(`events.${event.category}.count`, bucketTimestamp, 1, event.id || '');
    
    // Update duration buckets if available
    if (event.duration) {
      this.updateBucket('performance.duration', bucketTimestamp, event.duration, event.id || '');
      this.updateBucket(`performance.${event.category}.duration`, bucketTimestamp, event.duration, event.id || '');
    }
  }
  
  private updateBucket(metric: string, timestamp: number, value: number, eventId: string): void {
    if (!this.buckets.has(metric)) {
      this.buckets.set(metric, []);
    }
    
    const buckets = this.buckets.get(metric)!;
    let bucket = buckets.find(b => b.timestamp === timestamp);
    
    if (!bucket) {
      bucket = {
        timestamp,
        count: 0,
        sum: 0,
        min: Number.MAX_VALUE,
        max: Number.MIN_VALUE,
        events: []
      };
      buckets.push(bucket);
      
      // Keep buckets sorted by timestamp
      buckets.sort((a, b) => a.timestamp - b.timestamp);
    }
    
    bucket.count++;
    bucket.sum += value;
    bucket.min = Math.min(bucket.min, value);
    bucket.max = Math.max(bucket.max, value);
    bucket.events.push(eventId);
  }
  
  private cleanOldBuckets(): void {
    const cutoffTime = Date.now() - (this.maxBuckets * this.bucketSizeMs);
    
    for (const [metric, buckets] of this.buckets.entries()) {
      const validBuckets = buckets.filter(b => b.timestamp >= cutoffTime);
      this.buckets.set(metric, validBuckets);
    }
  }
  
  async getMetrics(timeRange?: TimeRange): Promise<Metrics> {
    let filteredEvents = this.events;
    
    if (timeRange) {
      filteredEvents = this.events.filter(e => 
        e.timestamp >= timeRange.start && e.timestamp <= timeRange.end
      );
    }
    
    const eventsByType: Record<string, number> = {};
    const eventsByCategory: Record<string, number> = {};
    const sessions = new Set<string>();
    const completedSessions = new Set<string>();
    const erroredSessions = new Set<string>();
    const durations: number[] = [];
    let errorCount = 0;
    
    for (const event of filteredEvents) {
      eventsByType[event.eventType] = (eventsByType[event.eventType] || 0) + 1;
      eventsByCategory[event.category] = (eventsByCategory[event.category] || 0) + 1;
      
      sessions.add(event.sessionId);
      
      if (event.eventType === 'end') {
        completedSessions.add(event.sessionId);
      }
      
      if (event.eventType === 'error') {
        errorCount++;
        erroredSessions.add(event.sessionId);
      }
      
      if (event.duration) {
        durations.push(event.duration);
      }
    }
    
    const avgDuration = durations.length > 0 
      ? durations.reduce((a, b) => a + b, 0) / durations.length 
      : 0;
    
    const p95Duration = durations.length > 0
      ? durations.sort((a, b) => a - b)[Math.floor(durations.length * 0.95)]
      : 0;
    
    const errorRate = filteredEvents.length > 0 
      ? errorCount / filteredEvents.length 
      : 0;
    
    return {
      events: {
        total: filteredEvents.length,
        byType: eventsByType,
        byCategory: eventsByCategory,
      },
      sessions: {
        active: sessions.size - completedSessions.size - erroredSessions.size,
        completed: completedSessions.size,
        errored: erroredSessions.size,
      },
      performance: {
        avgDuration,
        p95Duration,
        errorRate,
      },
    };
  }
  
  async getInsights(options?: InsightOptions): Promise<Insights> {
    const metrics = await this.getMetrics(options?.timeRange);
    
    return {
      metrics,
      anomalies: this.detectAnomalies(options?.timeRange),
      trends: this.analyzeTrends(options?.timeRange),
      recommendations: this.generateRecommendations(metrics),
    };
  }
  
  // New method to get time series data
  getTimeSeries(metric: string, timeRange?: TimeRange): TimeSeriesData[] {
    const series = this.timeSeries.get(metric) || [];
    
    if (!timeRange) {
      return series;
    }
    
    return series.filter(point => 
      point.timestamp >= timeRange.start && point.timestamp <= timeRange.end
    );
  }
  
  // New method to get aggregated bucket data
  getBucketData(metric: string, timeRange?: TimeRange): MetricBucket[] {
    const buckets = this.buckets.get(metric) || [];
    
    if (!timeRange) {
      return buckets;
    }
    
    return buckets.filter(bucket => 
      bucket.timestamp >= timeRange.start && bucket.timestamp <= timeRange.end
    );
  }
  
  private detectAnomalies(timeRange?: TimeRange): Array<{type: string, metric: string, value: number, threshold: number, timestamp: number}> {
    const anomalies: Array<{type: string, metric: string, value: number, threshold: number, timestamp: number}> = [];
    
    // Check error rate spikes
    const errorSeries = this.getTimeSeries('errors.rate', timeRange);
    if (errorSeries.length > 10) {
      const recentErrors = errorSeries.slice(-10);
      const avgErrors = recentErrors.reduce((sum, point) => sum + point.value, 0) / recentErrors.length;
      const latest = errorSeries[errorSeries.length - 1];
      
      if (latest.value > avgErrors * 3) { // 3x spike threshold
        anomalies.push({
          type: 'spike',
          metric: 'errors.rate',
          value: latest.value,
          threshold: avgErrors * 3,
          timestamp: latest.timestamp
        });
      }
    }
    
    // Check duration spikes
    const durationSeries = this.getTimeSeries('performance.duration', timeRange);
    if (durationSeries.length > 10) {
      const recentDurations = durationSeries.slice(-10);
      const avgDuration = recentDurations.reduce((sum, point) => sum + point.value, 0) / recentDurations.length;
      const latest = durationSeries[durationSeries.length - 1];
      
      if (latest.value > avgDuration * 2) { // 2x spike threshold for duration
        anomalies.push({
          type: 'spike',
          metric: 'performance.duration',
          value: latest.value,
          threshold: avgDuration * 2,
          timestamp: latest.timestamp
        });
      }
    }
    
    return anomalies;
  }
  
  private analyzeTrends(timeRange?: TimeRange): Array<{metric: string, direction: 'up' | 'down' | 'stable', slope: number, confidence: number}> {
    const trends: Array<{metric: string, direction: 'up' | 'down' | 'stable', slope: number, confidence: number}> = [];
    
    const metricsToAnalyze = ['events.rate', 'errors.rate', 'performance.duration'];
    
    for (const metric of metricsToAnalyze) {
      const series = this.getTimeSeries(metric, timeRange);
      if (series.length < 5) continue; // Need at least 5 points
      
      // Simple linear regression to detect trends
      const n = series.length;
      const sumX = series.reduce((sum, _, i) => sum + i, 0);
      const sumY = series.reduce((sum, point) => sum + point.value, 0);
      const sumXY = series.reduce((sum, point, i) => sum + (i * point.value), 0);
      const sumXX = series.reduce((sum, _, i) => sum + (i * i), 0);
      
      const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
      const intercept = (sumY - slope * sumX) / n;
      
      // Calculate R-squared for confidence
      const yMean = sumY / n;
      const ssTotal = series.reduce((sum, point) => sum + Math.pow(point.value - yMean, 2), 0);
      const ssRes = series.reduce((sum, point, i) => {
        const predicted = slope * i + intercept;
        return sum + Math.pow(point.value - predicted, 2);
      }, 0);
      const rSquared = 1 - (ssRes / ssTotal);
      
      const direction = Math.abs(slope) < 0.01 ? 'stable' : (slope > 0 ? 'up' : 'down');
      
      trends.push({
        metric,
        direction,
        slope,
        confidence: Math.max(0, Math.min(1, rSquared)) // Clamp between 0 and 1
      });
    }
    
    return trends;
  }
  
  private generateRecommendations(metrics: Metrics): string[] {
    const recommendations: string[] = [];
    
    if (metrics.performance.errorRate > 0.1) {
      recommendations.push('High error rate detected. Consider investigating error patterns.');
    }
    
    if (metrics.performance.avgDuration > 10000) {
      recommendations.push('Average duration is high. Consider optimizing performance.');
    }
    
    if (metrics.sessions.errored > metrics.sessions.completed) {
      recommendations.push('More sessions are erroring than completing. Review error handling.');
    }
    
    return recommendations;
  }
  
  async shutdown(): Promise<void> {
    this.events = [];
    this.metrics.clear();
    this.timeSeries.clear();
    this.buckets.clear();
  }
}