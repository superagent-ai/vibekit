import type { 
  TelemetryEvent,
  AnalyticsConfig,
  TimeRange
} from '../core/types.js';

export interface Anomaly {
  id: string;
  type: 'spike' | 'drop' | 'pattern' | 'threshold';
  severity: 'low' | 'medium' | 'high' | 'critical';
  metric: string;
  value: number;
  baseline: number;
  deviation: number;
  timestamp: number;
  sessionId?: string;
  message: string;
  context?: Record<string, any>;
}

export interface AnomalyDetectorOptions {
  threshold?: number; // Standard deviations for anomaly detection
  windowSize?: number; // Number of data points for baseline
  minDataPoints?: number; // Minimum points needed before detection
  sensitivityMap?: Record<string, number>; // Custom thresholds per metric
}

interface MetricStats {
  values: number[];
  timestamps: number[];
  mean: number;
  stdDev: number;
  lastUpdate: number;
}

export class AnomalyDetector {
  private config: AnalyticsConfig;
  private options: Required<AnomalyDetectorOptions>;
  private metricStats: Map<string, MetricStats> = new Map();
  private anomalies: Anomaly[] = [];
  private listeners: Array<(anomaly: Anomaly) => void> = [];
  
  constructor(config: AnalyticsConfig, options?: AnomalyDetectorOptions) {
    this.config = config;
    this.options = {
      threshold: options?.threshold || config.anomaly?.threshold || 3, // 3 std devs
      windowSize: options?.windowSize || 100,
      minDataPoints: options?.minDataPoints || 10,
      sensitivityMap: options?.sensitivityMap || {
        'errors.rate': 2, // More sensitive to error spikes
        'performance.p95': 2.5,
        'sessions.errored': 2,
      },
    };
  }
  
  /**
   * Process an event for anomaly detection
   */
  async processEvent(event: TelemetryEvent): Promise<Anomaly[]> {
    if (!this.config.enabled || !this.config.anomaly?.enabled) {
      return [];
    }
    
    const detectedAnomalies: Anomaly[] = [];
    
    // Extract metrics from event
    const metrics = this.extractMetrics(event);
    
    // Check each metric for anomalies
    for (const [metricName, value] of Object.entries(metrics)) {
      const anomaly = this.checkMetric(metricName, value, event.timestamp, event.sessionId);
      if (anomaly) {
        detectedAnomalies.push(anomaly);
        this.anomalies.push(anomaly);
        this.notifyListeners(anomaly);
      }
    }
    
    // Clean old anomalies (keep last 1000)
    if (this.anomalies.length > 1000) {
      this.anomalies = this.anomalies.slice(-1000);
    }
    
    return detectedAnomalies;
  }
  
  /**
   * Extract metrics from an event
   */
  private extractMetrics(event: TelemetryEvent): Record<string, number> {
    const metrics: Record<string, number> = {};
    
    // Event type metrics
    metrics[`events.${event.eventType}`] = 1;
    metrics[`events.${event.category}.${event.action}`] = 1;
    
    // Performance metrics
    if (event.duration !== undefined) {
      metrics['performance.duration'] = event.duration;
      metrics[`performance.${event.category}.duration`] = event.duration;
    }
    
    // Error metrics
    if (event.eventType === 'error') {
      metrics['errors.count'] = 1;
      metrics[`errors.${event.category}`] = 1;
    }
    
    // Custom metrics from event metadata
    if (event.metadata?.metrics) {
      Object.entries(event.metadata.metrics).forEach(([key, value]) => {
        if (typeof value === 'number') {
          metrics[`custom.${key}`] = value;
        }
      });
    }
    
    return metrics;
  }
  
  /**
   * Check a metric for anomalies
   */
  private checkMetric(
    metricName: string, 
    value: number, 
    timestamp: number,
    sessionId?: string
  ): Anomaly | null {
    // Get or create metric stats
    let stats = this.metricStats.get(metricName);
    if (!stats) {
      stats = {
        values: [],
        timestamps: [],
        mean: 0,
        stdDev: 0,
        lastUpdate: timestamp,
      };
      this.metricStats.set(metricName, stats);
    }
    
    // Add new value
    stats.values.push(value);
    stats.timestamps.push(timestamp);
    
    // Maintain window size
    if (stats.values.length > this.options.windowSize) {
      stats.values.shift();
      stats.timestamps.shift();
    }
    
    // Need minimum data points
    if (stats.values.length < this.options.minDataPoints) {
      return null;
    }
    
    // Calculate statistics
    const { mean, stdDev } = this.calculateStats(stats.values);
    stats.mean = mean;
    stats.stdDev = stdDev;
    stats.lastUpdate = timestamp;
    
    // Get threshold for this metric
    const threshold = this.options.sensitivityMap[metricName] || this.options.threshold;
    
    // Check for anomaly
    const deviation = Math.abs(value - mean) / stdDev;
    if (deviation > threshold) {
      const anomalyType = this.classifyAnomaly(value, mean, stats.values);
      const severity = this.calculateSeverity(deviation, threshold);
      
      return {
        id: `${metricName}-${timestamp}`,
        type: anomalyType,
        severity,
        metric: metricName,
        value,
        baseline: mean,
        deviation,
        timestamp,
        sessionId,
        message: this.generateMessage(metricName, value, mean, anomalyType, severity),
        context: {
          stdDev,
          threshold,
          dataPoints: stats.values.length,
        },
      };
    }
    
    return null;
  }
  
  /**
   * Calculate mean and standard deviation
   */
  private calculateStats(values: number[]): { mean: number; stdDev: number } {
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    
    return { mean, stdDev };
  }
  
  /**
   * Classify the type of anomaly
   */
  private classifyAnomaly(value: number, mean: number, history: number[]): Anomaly['type'] {
    const recentValues = history.slice(-5);
    const recentTrend = recentValues.every((v, i) => i === 0 || v >= recentValues[i - 1]);
    
    if (value > mean) {
      return recentTrend ? 'pattern' : 'spike';
    } else {
      return 'drop';
    }
  }
  
  /**
   * Calculate anomaly severity
   */
  private calculateSeverity(deviation: number, threshold: number): Anomaly['severity'] {
    const ratio = deviation / threshold;
    
    if (ratio > 3) return 'critical';
    if (ratio > 2) return 'high';
    if (ratio > 1.5) return 'medium';
    return 'low';
  }
  
  /**
   * Generate human-readable message for anomaly
   */
  private generateMessage(
    metric: string, 
    value: number, 
    baseline: number,
    type: Anomaly['type'],
    severity: Anomaly['severity']
  ): string {
    const percentChange = ((value - baseline) / baseline * 100).toFixed(1);
    const direction = value > baseline ? 'above' : 'below';
    
    const metricDisplay = metric.replace(/\./g, ' ');
    const severityText = severity.charAt(0).toUpperCase() + severity.slice(1);
    
    switch (type) {
      case 'spike':
        return `${severityText} spike detected in ${metricDisplay}: ${value.toFixed(2)} (${percentChange}% ${direction} baseline)`;
      case 'drop':
        return `${severityText} drop detected in ${metricDisplay}: ${value.toFixed(2)} (${percentChange}% ${direction} baseline)`;
      case 'pattern':
        return `${severityText} pattern anomaly in ${metricDisplay}: sustained increase to ${value.toFixed(2)}`;
      case 'threshold':
        return `${severityText} threshold breach in ${metricDisplay}: ${value.toFixed(2)} exceeds limit`;
    }
  }
  
  /**
   * Get anomalies within a time range
   */
  getAnomalies(timeRange?: TimeRange, severity?: Anomaly['severity'][]): Anomaly[] {
    let filtered = this.anomalies;
    
    if (timeRange) {
      filtered = filtered.filter(a => 
        a.timestamp >= timeRange.start && a.timestamp <= timeRange.end
      );
    }
    
    if (severity && severity.length > 0) {
      filtered = filtered.filter(a => severity.includes(a.severity));
    }
    
    return filtered;
  }
  
  /**
   * Register a listener for anomaly detection
   */
  onAnomaly(listener: (anomaly: Anomaly) => void): () => void {
    this.listeners.push(listener);
    
    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }
  
  /**
   * Notify all listeners of an anomaly
   */
  private notifyListeners(anomaly: Anomaly): void {
    this.listeners.forEach(listener => {
      try {
        listener(anomaly);
      } catch (error) {
        console.error('Error in anomaly listener:', error);
      }
    });
  }
  
  /**
   * Get metric statistics
   */
  getMetricStats(metricName: string): MetricStats | null {
    return this.metricStats.get(metricName) || null;
  }
  
  /**
   * Reset detector state
   */
  reset(): void {
    this.metricStats.clear();
    this.anomalies = [];
  }
  
  /**
   * Clean up resources
   */
  async shutdown(): Promise<void> {
    this.listeners = [];
    this.reset();
  }
}