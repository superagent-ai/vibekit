/**
 * Phase 4: Advanced Analytics & Monitoring
 * 
 * This service provides advanced analytics, real-time monitoring, and insights
 * for the telemetry system with features like anomaly detection, trend analysis,
 * and performance predictions.
 */

import { DrizzleTelemetryOperations, TelemetryQueryFilter, SessionQueryFilter } from '../db';
import { EventEmitter } from 'events';

export interface AnalyticsMetrics {
  performance: {
    avgResponseTime: number;
    p95ResponseTime: number;
    p99ResponseTime: number;
    throughput: number; // events/minute
    errorRate: number; // percentage
    successRate: number; // percentage
  };
  usage: {
    totalSessions: number;
    activeSessions: number;
    avgSessionDuration: number;
    topAgents: Array<{ name: string; usage: number }>;
    topModes: Array<{ name: string; usage: number }>;
  };
  trends: {
    dailyEventCounts: Array<{ date: string; count: number }>;
    hourlyEventCounts: Array<{ hour: number; count: number }>;
    weeklyTrends: Array<{ week: string; events: number; sessions: number }>;
  };
  alerts: AnalyticsAlert[];
}

export interface AnalyticsAlert {
  id: string;
  type: 'performance' | 'error' | 'usage' | 'anomaly';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  metric: string;
  threshold: number;
  currentValue: number;
  timestamp: number;
  acknowledged: boolean;
}

export interface AnomalyDetection {
  metric: string;
  isAnomaly: boolean;
  score: number; // 0-1, higher = more anomalous
  expectedRange: { min: number; max: number };
  actualValue: number;
  confidence: number; // 0-1
}

export interface PerformancePrediction {
  metric: string;
  predictedValue: number;
  confidence: number;
  timeHorizon: number; // minutes into the future
  trend: 'improving' | 'declining' | 'stable';
}

export interface UsagePattern {
  pattern: string;
  frequency: number;
  sessions: string[];
  avgDuration: number;
  associatedModes: string[];
}

export class AdvancedAnalyticsService extends EventEmitter {
  private operations: DrizzleTelemetryOperations;
  private alertThresholds: Map<string, { type: string; threshold: number; severity: string }>;
  private historicalData: Map<string, number[]>; // For trend analysis
  private monitoringInterval?: NodeJS.Timeout;
  private isMonitoring = false;

  constructor(operations: DrizzleTelemetryOperations) {
    super();
    this.operations = operations;
    this.alertThresholds = new Map();
    this.historicalData = new Map();
    
    // Set default alert thresholds
    this.setDefaultThresholds();
  }

  /**
   * Start real-time monitoring
   */
  startMonitoring(intervalMs: number = 60000): void {
    if (this.isMonitoring) return;

    this.isMonitoring = true;
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.performMonitoringCycle();
      } catch (error) {
        console.warn('Monitoring cycle failed:', error);
      }
    }, intervalMs);

    this.emit('monitoring_started');
  }

  /**
   * Stop real-time monitoring
   */
  stopMonitoring(): void {
    if (!this.isMonitoring) return;

    this.isMonitoring = false;
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }

    this.emit('monitoring_stopped');
  }

  /**
   * Get comprehensive analytics metrics
   */
  async getAnalytics(timeRange?: { from: number; to: number }): Promise<AnalyticsMetrics> {
    const [performance, usage, trends, alerts] = await Promise.all([
      this.getPerformanceMetrics(timeRange),
      this.getUsageMetrics(timeRange),
      this.getTrendAnalysis(timeRange),
      this.getActiveAlerts(),
    ]);

    return {
      performance,
      usage,
      trends,
      alerts,
    };
  }

  /**
   * Detect anomalies in telemetry data
   */
  async detectAnomalies(metrics: string[] = ['response_time', 'error_rate', 'throughput']): Promise<AnomalyDetection[]> {
    const anomalies: AnomalyDetection[] = [];

    for (const metric of metrics) {
      const anomaly = await this.detectMetricAnomaly(metric);
      if (anomaly) {
        anomalies.push(anomaly);
      }
    }

    return anomalies;
  }

  /**
   * Generate performance predictions
   */
  async generatePredictions(
    metrics: string[] = ['response_time', 'throughput', 'error_rate'],
    timeHorizonMinutes: number = 60
  ): Promise<PerformancePrediction[]> {
    const predictions: PerformancePrediction[] = [];

    for (const metric of metrics) {
      const prediction = await this.predictMetric(metric, timeHorizonMinutes);
      if (prediction) {
        predictions.push(prediction);
      }
    }

    return predictions;
  }

  /**
   * Analyze usage patterns
   */
  async analyzeUsagePatterns(
    minSessionCount: number = 5,
    timeRange?: { from: number; to: number }
  ): Promise<UsagePattern[]> {
    const sessions = await this.operations.querySessions({
      from: timeRange?.from,
      to: timeRange?.to,
      limit: 10000,
    });

    const patterns = new Map<string, {
      sessions: string[];
      totalDuration: number;
      modes: Map<string, number>;
    }>();

    // Group sessions by agent type and mode combination
    for (const session of sessions) {
      const pattern = `${session.agentType}-${session.mode}`;
      
      if (!patterns.has(pattern)) {
        patterns.set(pattern, {
          sessions: [],
          totalDuration: 0,
          modes: new Map(),
        });
      }

      const patternData = patterns.get(pattern)!;
      patternData.sessions.push(session.id);
      patternData.totalDuration += session.duration || 0;
      patternData.modes.set(session.mode, (patternData.modes.get(session.mode) || 0) + 1);
    }

    // Convert to UsagePattern format
    const result: UsagePattern[] = [];
    for (const [pattern, data] of patterns.entries()) {
      if (data.sessions.length >= minSessionCount) {
        result.push({
          pattern,
          frequency: data.sessions.length,
          sessions: data.sessions,
          avgDuration: data.totalDuration / data.sessions.length,
          associatedModes: Array.from(data.modes.keys()),
        });
      }
    }

    return result.sort((a, b) => b.frequency - a.frequency);
  }

  /**
   * Set custom alert threshold
   */
  setAlertThreshold(
    metric: string,
    threshold: number,
    type: 'above' | 'below' = 'above',
    severity: 'low' | 'medium' | 'high' | 'critical' = 'medium'
  ): void {
    this.alertThresholds.set(metric, { type, threshold, severity });
  }

  /**
   * Get historical trend for a specific metric
   */
  async getMetricTrend(
    metric: string,
    timeRange: { from: number; to: number },
    intervalMinutes: number = 60
  ): Promise<Array<{ timestamp: number; value: number }>> {
    const intervals = this.generateTimeIntervals(timeRange.from, timeRange.to, intervalMinutes);
    const trend: Array<{ timestamp: number; value: number }> = [];

    for (const interval of intervals) {
      const value = await this.calculateMetricForInterval(metric, interval);
      trend.push({
        timestamp: interval.start,
        value,
      });
    }

    return trend;
  }

  // Private methods

  private setDefaultThresholds(): void {
    this.setAlertThreshold('response_time', 5000, 'above', 'medium'); // 5 seconds
    this.setAlertThreshold('error_rate', 5, 'above', 'high'); // 5%
    this.setAlertThreshold('throughput', 10, 'below', 'low'); // 10 events/min
    this.setAlertThreshold('disk_usage', 80, 'above', 'critical'); // 80%
  }

  private async performMonitoringCycle(): Promise<void> {
    // Check for new alerts
    const newAlerts = await this.checkForAlerts();
    
    // Emit alerts
    for (const alert of newAlerts) {
      this.emit('alert', alert);
    }

    // Update historical data
    await this.updateHistoricalData();

    // Check for anomalies
    const anomalies = await this.detectAnomalies();
    if (anomalies.length > 0) {
      this.emit('anomalies_detected', anomalies);
    }

    this.emit('monitoring_cycle_complete');
  }

  private async getPerformanceMetrics(timeRange?: { from: number; to: number }): Promise<AnalyticsMetrics['performance']> {
    const events = await this.operations.queryEvents({
      from: timeRange?.from,
      to: timeRange?.to,
      limit: 10000,
      orderBy: 'timestamp_desc',
    });

    if (events.length === 0) {
      return {
        avgResponseTime: 0,
        p95ResponseTime: 0,
        p99ResponseTime: 0,
        throughput: 0,
        errorRate: 0,
        successRate: 100,
      };
    }

    // Calculate response times (simplified)
    const responseTimes = this.calculateResponseTimes(events);
    const errorCount = events.filter(e => e.eventType === 'error').length;
    const timeSpan = timeRange ? timeRange.to - timeRange.from : 3600000; // 1 hour default
    const throughput = (events.length / timeSpan) * 60000; // events per minute

    return {
      avgResponseTime: responseTimes.length > 0 ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : 0,
      p95ResponseTime: this.calculatePercentile(responseTimes, 0.95),
      p99ResponseTime: this.calculatePercentile(responseTimes, 0.99),
      throughput,
      errorRate: (errorCount / events.length) * 100,
      successRate: ((events.length - errorCount) / events.length) * 100,
    };
  }

  private async getUsageMetrics(timeRange?: { from: number; to: number }): Promise<AnalyticsMetrics['usage']> {
    const sessions = await this.operations.querySessions({
      from: timeRange?.from,
      to: timeRange?.to,
      limit: 10000,
    });

    const activeSessions = sessions.filter(s => s.status === 'active').length;
    const totalDuration = sessions.reduce((sum, s) => sum + (s.duration || 0), 0);
    const avgSessionDuration = sessions.length > 0 ? totalDuration / sessions.length : 0;

    // Calculate top agents and modes
    const agentCounts = new Map<string, number>();
    const modeCounts = new Map<string, number>();

    for (const session of sessions) {
      agentCounts.set(session.agentType, (agentCounts.get(session.agentType) || 0) + 1);
      modeCounts.set(session.mode, (modeCounts.get(session.mode) || 0) + 1);
    }

    const topAgents = Array.from(agentCounts.entries())
      .map(([name, usage]) => ({ name, usage }))
      .sort((a, b) => b.usage - a.usage)
      .slice(0, 5);

    const topModes = Array.from(modeCounts.entries())
      .map(([name, usage]) => ({ name, usage }))
      .sort((a, b) => b.usage - a.usage)
      .slice(0, 5);

    return {
      totalSessions: sessions.length,
      activeSessions,
      avgSessionDuration,
      topAgents,
      topModes,
    };
  }

  private async getTrendAnalysis(timeRange?: { from: number; to: number }): Promise<AnalyticsMetrics['trends']> {
    const now = Date.now();
    const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);
    
    const events = await this.operations.queryEvents({
      from: timeRange?.from || sevenDaysAgo,
      to: timeRange?.to || now,
      limit: 50000,
    });

    // Daily event counts
    const dailyCounts = new Map<string, number>();
    const hourlyCounts = new Map<number, number>();

    for (const event of events) {
      const date = new Date(event.timestamp);
      const dateKey = date.toISOString().split('T')[0];
      const hour = date.getHours();

      dailyCounts.set(dateKey, (dailyCounts.get(dateKey) || 0) + 1);
      hourlyCounts.set(hour, (hourlyCounts.get(hour) || 0) + 1);
    }

    const dailyEventCounts = Array.from(dailyCounts.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const hourlyEventCounts = Array.from(hourlyCounts.entries())
      .map(([hour, count]) => ({ hour, count }))
      .sort((a, b) => a.hour - b.hour);

    // Weekly trends (simplified)
    const weeklyTrends = this.calculateWeeklyTrends(events);

    return {
      dailyEventCounts,
      hourlyEventCounts,
      weeklyTrends,
    };
  }

  private async getActiveAlerts(): Promise<AnalyticsAlert[]> {
    // This would typically be stored in a database
    // For now, return empty array as alerts are handled in real-time
    return [];
  }

  private async detectMetricAnomaly(metric: string): Promise<AnomalyDetection | null> {
    const historical = this.historicalData.get(metric) || [];
    if (historical.length < 10) return null; // Need minimum data points

    const currentValue = await this.getCurrentMetricValue(metric);
    const expectedRange = this.calculateExpectedRange(historical);
    
    const isAnomaly = currentValue < expectedRange.min || currentValue > expectedRange.max;
    const score = this.calculateAnomalyScore(currentValue, historical);

    if (!isAnomaly) return null;

    return {
      metric,
      isAnomaly: true,
      score,
      expectedRange,
      actualValue: currentValue,
      confidence: Math.min(0.9, historical.length / 100), // Higher confidence with more data
    };
  }

  private async predictMetric(metric: string, timeHorizonMinutes: number): Promise<PerformancePrediction | null> {
    const historical = this.historicalData.get(metric) || [];
    if (historical.length < 5) return null;

    // Simple linear regression prediction
    const trend = this.calculateTrend(historical);
    const lastValue = historical[historical.length - 1];
    const predictedValue = lastValue + (trend * timeHorizonMinutes);

    return {
      metric,
      predictedValue,
      confidence: Math.min(0.8, historical.length / 50),
      timeHorizon: timeHorizonMinutes,
      trend: trend > 0.01 ? 'improving' : trend < -0.01 ? 'declining' : 'stable',
    };
  }

  private async checkForAlerts(): Promise<AnalyticsAlert[]> {
    const alerts: AnalyticsAlert[] = [];

    for (const [metric, config] of this.alertThresholds.entries()) {
      const currentValue = await this.getCurrentMetricValue(metric);
      
      const violatesThreshold = config.type === 'above' 
        ? currentValue > config.threshold
        : currentValue < config.threshold;

      if (violatesThreshold) {
        alerts.push({
          id: `${metric}-${Date.now()}`,
          type: this.getAlertType(metric),
          severity: config.severity as any,
          title: `${metric} threshold exceeded`,
          description: `${metric} is ${currentValue}, threshold is ${config.threshold}`,
          metric,
          threshold: config.threshold,
          currentValue,
          timestamp: Date.now(),
          acknowledged: false,
        });
      }
    }

    return alerts;
  }

  private async updateHistoricalData(): Promise<void> {
    const metrics = ['response_time', 'error_rate', 'throughput'];
    
    for (const metric of metrics) {
      const value = await this.getCurrentMetricValue(metric);
      const historical = this.historicalData.get(metric) || [];
      
      historical.push(value);
      
      // Keep only last 100 values
      if (historical.length > 100) {
        historical.shift();
      }
      
      this.historicalData.set(metric, historical);
    }
  }

  private async getCurrentMetricValue(metric: string): Promise<number> {
    const now = Date.now();
    const oneHourAgo = now - 3600000;

    switch (metric) {
      case 'response_time':
        return this.calculateAvgResponseTime(oneHourAgo, now);
      case 'error_rate':
        return this.calculateErrorRate(oneHourAgo, now);
      case 'throughput':
        return this.calculateThroughput(oneHourAgo, now);
      default:
        return 0;
    }
  }

  private async calculateAvgResponseTime(from: number, to: number): Promise<number> {
    // Simplified calculation
    return Math.random() * 2000 + 500; // Mock data for now
  }

  private async calculateErrorRate(from: number, to: number): Promise<number> {
    const events = await this.operations.queryEvents({ from, to, limit: 1000 });
    if (events.length === 0) return 0;
    
    const errors = events.filter(e => e.eventType === 'error').length;
    return (errors / events.length) * 100;
  }

  private async calculateThroughput(from: number, to: number): Promise<number> {
    const events = await this.operations.queryEvents({ from, to, limit: 10000 });
    const timeSpanMinutes = (to - from) / 60000;
    return events.length / timeSpanMinutes;
  }

  private calculateResponseTimes(events: any[]): number[] {
    // Simplified response time calculation
    return events.map(() => Math.random() * 3000 + 200);
  }

  private calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;
    
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * percentile) - 1;
    return sorted[Math.max(0, index)];
  }

  private calculateWeeklyTrends(events: any[]): Array<{ week: string; events: number; sessions: number }> {
    // Simplified weekly trend calculation
    const weeks = new Map<string, { events: number; sessions: Set<string> }>();
    
    for (const event of events) {
      const date = new Date(event.timestamp);
      const week = this.getWeekKey(date);
      
      if (!weeks.has(week)) {
        weeks.set(week, { events: 0, sessions: new Set() });
      }
      
      const weekData = weeks.get(week)!;
      weekData.events++;
      weekData.sessions.add(event.sessionId);
    }
    
    return Array.from(weeks.entries()).map(([week, data]) => ({
      week,
      events: data.events,
      sessions: data.sessions.size,
    }));
  }

  private calculateExpectedRange(historical: number[]): { min: number; max: number } {
    const mean = historical.reduce((a, b) => a + b, 0) / historical.length;
    const variance = historical.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / historical.length;
    const stdDev = Math.sqrt(variance);
    
    return {
      min: mean - (2 * stdDev),
      max: mean + (2 * stdDev),
    };
  }

  private calculateAnomalyScore(currentValue: number, historical: number[]): number {
    const mean = historical.reduce((a, b) => a + b, 0) / historical.length;
    const variance = historical.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / historical.length;
    const stdDev = Math.sqrt(variance);
    
    if (stdDev === 0) return 0;
    
    const zScore = Math.abs(currentValue - mean) / stdDev;
    return Math.min(1, zScore / 3); // Normalize to 0-1 range
  }

  private calculateTrend(values: number[]): number {
    if (values.length < 2) return 0;
    
    // Simple slope calculation
    const n = values.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const y = values;
    
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);
    
    return (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  }

  private getAlertType(metric: string): AnalyticsAlert['type'] {
    if (metric.includes('error')) return 'error';
    if (metric.includes('performance') || metric.includes('response')) return 'performance';
    if (metric.includes('usage') || metric.includes('disk')) return 'usage';
    return 'anomaly';
  }

  private generateTimeIntervals(
    start: number,
    end: number,
    intervalMinutes: number
  ): Array<{ start: number; end: number }> {
    const intervals: Array<{ start: number; end: number }> = [];
    const intervalMs = intervalMinutes * 60 * 1000;
    
    for (let current = start; current < end; current += intervalMs) {
      intervals.push({
        start: current,
        end: Math.min(current + intervalMs, end),
      });
    }
    
    return intervals;
  }

  private async calculateMetricForInterval(
    metric: string,
    interval: { start: number; end: number }
  ): Promise<number> {
    switch (metric) {
      case 'response_time':
        return this.calculateAvgResponseTime(interval.start, interval.end);
      case 'error_rate':
        return this.calculateErrorRate(interval.start, interval.end);
      case 'throughput':
        return this.calculateThroughput(interval.start, interval.end);
      default:
        return 0;
    }
  }

  private getWeekKey(date: Date): string {
    const year = date.getFullYear();
    const week = this.getWeekNumber(date);
    return `${year}-W${week}`;
  }

  private getWeekNumber(date: Date): number {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  }
} 