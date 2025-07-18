/**
 * Phase 4.5: Performance Monitor
 * 
 * Real-time performance monitoring, metrics collection, and automated
 * alerting system for database and system performance optimization.
 */

import { EventEmitter } from 'events';
import { QueryPerformanceAnalyzer, PerformanceMetrics } from './query-performance-analyzer';
import { SmartBatchProcessor, BatchMetrics } from './smart-batch-processor';
import { AdvancedMemoryManager, ResourceUsage } from './advanced-memory-manager';

export interface MonitorConfig {
  metricsIntervalMs: number;
  alertThresholds: AlertThresholds;
  retentionPeriodMs: number;
  enableRealTimeAlerts: boolean;
  enablePredictiveAnalysis: boolean;
  enableAutoTuning: boolean;
  exportMetricsPath?: string;
}

export interface AlertThresholds {
  memoryUsageMB: number;
  avgQueryTimeMs: number;
  errorRatePercent: number;
  throughputDropPercent: number;
  connectionPoolUtilization: number;
  cacheHitRatePercent: number;
  queueBacklogCount: number;
}

export interface SystemMetrics {
  timestamp: number;
  cpu: {
    usage: number;
    loadAverage: number[];
  };
  memory: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
    free: number;
    total: number;
  };
  performance: {
    queryMetrics: PerformanceMetrics;
    batchMetrics: BatchMetrics;
    resourceUsage: ResourceUsage;
  };
  alerts: Alert[];
  predictions: PerformancePrediction[];
}

export interface Alert {
  id: string;
  timestamp: number;
  level: 'info' | 'warning' | 'error' | 'critical';
  type: string;
  message: string;
  metric: string;
  currentValue: number;
  threshold: number;
  recommendations: string[];
  resolved: boolean;
  resolvedAt?: number;
}

export interface PerformancePrediction {
  metric: string;
  currentValue: number;
  predictedValue: number;
  timeHorizonMs: number;
  confidence: number;
  trend: 'improving' | 'stable' | 'degrading';
  recommendations: string[];
}

export interface PerformanceTrend {
  metric: string;
  values: Array<{ timestamp: number; value: number }>;
  slope: number;
  r2: number; // Correlation coefficient
  prediction: number;
}

export interface OptimizationRecommendation {
  type: 'configuration' | 'query' | 'memory' | 'connection' | 'batch';
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  impact: string;
  effort: 'low' | 'medium' | 'high';
  implementation: string[];
  estimatedImprovement: string;
}

export class PerformanceMonitor extends EventEmitter {
  private config: MonitorConfig;
  private queryAnalyzer?: QueryPerformanceAnalyzer;
  private batchProcessor?: SmartBatchProcessor<any, any>;
  private memoryManager?: AdvancedMemoryManager;
  private metricsHistory: SystemMetrics[];
  private activeAlerts: Map<string, Alert>;
  private monitoringTimer?: NodeJS.Timeout;
  private alertIdCounter: number;
  private isMonitoring: boolean;

  constructor(config: Partial<MonitorConfig> = {}) {
    super();

    this.config = {
      metricsIntervalMs: config.metricsIntervalMs || 30000, // 30 seconds
      retentionPeriodMs: config.retentionPeriodMs || 86400000, // 24 hours
      enableRealTimeAlerts: config.enableRealTimeAlerts ?? true,
      enablePredictiveAnalysis: config.enablePredictiveAnalysis ?? true,
      enableAutoTuning: config.enableAutoTuning ?? false,
      exportMetricsPath: config.exportMetricsPath,
      alertThresholds: {
        memoryUsageMB: config.alertThresholds?.memoryUsageMB || 400,
        avgQueryTimeMs: config.alertThresholds?.avgQueryTimeMs || 1000,
        errorRatePercent: config.alertThresholds?.errorRatePercent || 5,
        throughputDropPercent: config.alertThresholds?.throughputDropPercent || 20,
        connectionPoolUtilization: config.alertThresholds?.connectionPoolUtilization || 80,
        cacheHitRatePercent: config.alertThresholds?.cacheHitRatePercent || 70,
        queueBacklogCount: config.alertThresholds?.queueBacklogCount || 1000,
      },
    };

    this.metricsHistory = [];
    this.activeAlerts = new Map();
    this.alertIdCounter = 0;
    this.isMonitoring = false;
  }

  /**
   * Register performance components for monitoring
   */
  registerComponents(components: {
    queryAnalyzer?: QueryPerformanceAnalyzer;
    batchProcessor?: SmartBatchProcessor<any, any>;
    memoryManager?: AdvancedMemoryManager;
  }): void {
    this.queryAnalyzer = components.queryAnalyzer;
    this.batchProcessor = components.batchProcessor;
    this.memoryManager = components.memoryManager;

    // Set up event listeners for real-time monitoring
    this.setupEventListeners();
  }

  /**
   * Start performance monitoring
   */
  start(): void {
    if (this.isMonitoring) return;

    this.isMonitoring = true;
    this.monitoringTimer = setInterval(() => {
      this.collectMetrics();
    }, this.config.metricsIntervalMs);

    this.emit('monitoring_started');
  }

  /**
   * Stop performance monitoring
   */
  stop(): void {
    if (!this.isMonitoring) return;

    this.isMonitoring = false;
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
    }

    this.emit('monitoring_stopped');
  }

  /**
   * Collect comprehensive system metrics
   */
  private async collectMetrics(): Promise<void> {
    const timestamp = Date.now();
    
    // Get system metrics
    const cpuUsage = process.cpuUsage();
    const memUsage = process.memoryUsage();

    // Get performance metrics from components
    const queryMetrics = this.queryAnalyzer?.getPerformanceMetrics() || this.getEmptyQueryMetrics();
    const batchMetrics = this.batchProcessor?.getMetrics() || this.getEmptyBatchMetrics();
    const resourceUsage = this.memoryManager?.getResourceUsage() || this.getEmptyResourceUsage();

    // Generate alerts
    const alerts = this.generateAlerts(queryMetrics, batchMetrics, resourceUsage, memUsage);

    // Generate predictions if enabled
    const predictions = this.config.enablePredictiveAnalysis 
      ? this.generatePredictions()
      : [];

    const metrics: SystemMetrics = {
      timestamp,
      cpu: {
        usage: this.calculateCPUUsage(cpuUsage),
        loadAverage: process.platform !== 'win32' ? require('os').loadavg() : [0, 0, 0],
      },
      memory: {
        heapUsed: Math.round(memUsage.heapUsed / (1024 * 1024)),
        heapTotal: Math.round(memUsage.heapTotal / (1024 * 1024)),
        external: Math.round(memUsage.external / (1024 * 1024)),
        rss: Math.round(memUsage.rss / (1024 * 1024)),
        free: Math.round(require('os').freemem() / (1024 * 1024)),
        total: Math.round(require('os').totalmem() / (1024 * 1024)),
      },
      performance: {
        queryMetrics,
        batchMetrics,
        resourceUsage,
      },
      alerts,
      predictions,
    };

    // Store metrics
    this.metricsHistory.push(metrics);
    this.cleanupOldMetrics();

    // Emit metrics for real-time monitoring
    this.emit('metrics_collected', metrics);

    // Process alerts
    this.processAlerts(alerts);

    // Perform auto-tuning if enabled
    if (this.config.enableAutoTuning) {
      this.performAutoTuning(metrics);
    }

    // Export metrics if path configured
    if (this.config.exportMetricsPath) {
      this.exportMetrics(metrics);
    }
  }

  /**
   * Generate alerts based on current metrics
   */
  private generateAlerts(
    queryMetrics: PerformanceMetrics,
    batchMetrics: BatchMetrics,
    resourceUsage: ResourceUsage,
    memUsage: NodeJS.MemoryUsage
  ): Alert[] {
    const alerts: Alert[] = [];
    const now = Date.now();

    // Memory usage alerts
    const heapUsedMB = Math.round(memUsage.heapUsed / (1024 * 1024));
    if (heapUsedMB > this.config.alertThresholds.memoryUsageMB) {
      alerts.push(this.createAlert(
        'memory_usage',
        heapUsedMB > this.config.alertThresholds.memoryUsageMB * 1.5 ? 'critical' : 'warning',
        'High memory usage detected',
        'memory.heapUsed',
        heapUsedMB,
        this.config.alertThresholds.memoryUsageMB,
        [
          'Consider enabling garbage collection hints',
          'Review memory cleanup intervals',
          'Check for memory leaks in application code',
        ]
      ));
    }

    // Query performance alerts
    if (queryMetrics.avgExecutionTime > this.config.alertThresholds.avgQueryTimeMs) {
      alerts.push(this.createAlert(
        'slow_queries',
        queryMetrics.avgExecutionTime > this.config.alertThresholds.avgQueryTimeMs * 2 ? 'error' : 'warning',
        'Slow query performance detected',
        'queries.avgExecutionTime',
        queryMetrics.avgExecutionTime,
        this.config.alertThresholds.avgQueryTimeMs,
        [
          'Review query execution plans',
          'Consider adding database indexes',
          'Enable query result caching',
        ]
      ));
    }

    // Cache hit rate alerts
    if (queryMetrics.cacheStats.hitRate < this.config.alertThresholds.cacheHitRatePercent) {
      alerts.push(this.createAlert(
        'low_cache_hit_rate',
        'warning',
        'Low cache hit rate detected',
        'cache.hitRate',
        queryMetrics.cacheStats.hitRate,
        this.config.alertThresholds.cacheHitRatePercent,
        [
          'Increase cache size limits',
          'Review cache TTL settings',
          'Optimize caching strategy',
        ]
      ));
    }

    // Batch processing alerts
    if (batchMetrics.backpressureEvents > 0) {
      alerts.push(this.createAlert(
        'batch_backpressure',
        batchMetrics.backpressureEvents > 10 ? 'error' : 'warning',
        'Batch processing backpressure detected',
        'batch.backpressureEvents',
        batchMetrics.backpressureEvents,
        0,
        [
          'Increase batch processing capacity',
          'Review batch size configuration',
          'Consider scaling processing resources',
        ]
      ));
    }

    // Connection pool alerts
    const poolUtilization = (resourceUsage.connections.active / resourceUsage.connections.total) * 100;
    if (poolUtilization > this.config.alertThresholds.connectionPoolUtilization) {
      alerts.push(this.createAlert(
        'high_connection_usage',
        poolUtilization > 95 ? 'critical' : 'warning',
        'High connection pool utilization',
        'connections.utilization',
        poolUtilization,
        this.config.alertThresholds.connectionPoolUtilization,
        [
          'Increase connection pool size',
          'Review connection usage patterns',
          'Optimize connection lifecycle management',
        ]
      ));
    }

    return alerts;
  }

  /**
   * Generate performance predictions
   */
  private generatePredictions(): PerformancePrediction[] {
    if (this.metricsHistory.length < 10) {
      return []; // Need more data for predictions
    }

    const predictions: PerformancePrediction[] = [];
    const recentMetrics = this.metricsHistory.slice(-20);

    // Predict memory usage trend
    const memoryTrend = this.calculateTrend(
      recentMetrics.map(m => ({ timestamp: m.timestamp, value: m.memory.heapUsed }))
    );
    
    if (memoryTrend.slope > 0.1) { // Increasing memory usage
      const timeToThreshold = this.calculateTimeToThreshold(
        memoryTrend,
        this.config.alertThresholds.memoryUsageMB
      );
      
      predictions.push({
        metric: 'memory.heapUsed',
        currentValue: recentMetrics[recentMetrics.length - 1].memory.heapUsed,
        predictedValue: memoryTrend.prediction,
        timeHorizonMs: timeToThreshold,
        confidence: memoryTrend.r2,
        trend: memoryTrend.slope > 0 ? 'degrading' : 'improving',
        recommendations: [
          'Monitor memory usage closely',
          'Prepare memory optimization strategies',
          'Consider increasing memory allocation',
        ],
      });
    }

    // Predict query performance trend
    const queryTimes = recentMetrics.map(m => ({
      timestamp: m.timestamp,
      value: m.performance.queryMetrics.avgExecutionTime || 0,
    }));
    
    const queryTrend = this.calculateTrend(queryTimes);
    if (Math.abs(queryTrend.slope) > 0.05) {
      predictions.push({
        metric: 'queries.avgExecutionTime',
        currentValue: queryTimes[queryTimes.length - 1].value,
        predictedValue: queryTrend.prediction,
        timeHorizonMs: 3600000, // 1 hour prediction
        confidence: queryTrend.r2,
        trend: queryTrend.slope > 0 ? 'degrading' : 'improving',
        recommendations: queryTrend.slope > 0 ? [
          'Review query optimization opportunities',
          'Monitor database index usage',
          'Consider query result caching',
        ] : [
          'Current optimization strategies are working',
          'Continue monitoring performance',
        ],
      });
    }

    return predictions;
  }

  /**
   * Calculate performance trend using linear regression
   */
  private calculateTrend(dataPoints: Array<{ timestamp: number; value: number }>): PerformanceTrend {
    if (dataPoints.length < 2) {
      return {
        metric: 'unknown',
        values: dataPoints,
        slope: 0,
        r2: 0,
        prediction: dataPoints[0]?.value || 0,
      };
    }

    // Normalize timestamps to reduce numerical issues
    const startTime = dataPoints[0].timestamp;
    const normalizedPoints = dataPoints.map(p => ({
      x: (p.timestamp - startTime) / 1000, // Convert to seconds
      y: p.value,
    }));

    // Calculate linear regression
    const n = normalizedPoints.length;
    const sumX = normalizedPoints.reduce((sum, p) => sum + p.x, 0);
    const sumY = normalizedPoints.reduce((sum, p) => sum + p.y, 0);
    const sumXY = normalizedPoints.reduce((sum, p) => sum + p.x * p.y, 0);
    const sumXX = normalizedPoints.reduce((sum, p) => sum + p.x * p.x, 0);
    const sumYY = normalizedPoints.reduce((sum, p) => sum + p.y * p.y, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Calculate R-squared
    const meanY = sumY / n;
    const ssRes = normalizedPoints.reduce((sum, p) => {
      const predicted = slope * p.x + intercept;
      return sum + Math.pow(p.y - predicted, 2);
    }, 0);
    const ssTot = normalizedPoints.reduce((sum, p) => {
      return sum + Math.pow(p.y - meanY, 2);
    }, 0);
    const r2 = ssTot > 0 ? 1 - (ssRes / ssTot) : 0;

    // Predict value 1 hour from now
    const futureTime = (Date.now() - startTime) / 1000 + 3600; // 1 hour from now
    const prediction = slope * futureTime + intercept;

    return {
      metric: 'trend',
      values: dataPoints,
      slope,
      r2,
      prediction: Math.max(0, prediction), // Ensure positive prediction
    };
  }

  /**
   * Calculate time until a threshold is reached
   */
  private calculateTimeToThreshold(trend: PerformanceTrend, threshold: number): number {
    if (trend.slope <= 0) return Infinity; // Never reach threshold if decreasing

    const currentValue = trend.values[trend.values.length - 1].value;
    const timeToThreshold = (threshold - currentValue) / trend.slope;
    return Math.max(0, timeToThreshold * 1000); // Convert to milliseconds
  }

  /**
   * Create alert object
   */
  private createAlert(
    type: string,
    level: Alert['level'],
    message: string,
    metric: string,
    currentValue: number,
    threshold: number,
    recommendations: string[]
  ): Alert {
    return {
      id: `alert_${++this.alertIdCounter}_${Date.now()}`,
      timestamp: Date.now(),
      level,
      type,
      message,
      metric,
      currentValue,
      threshold,
      recommendations,
      resolved: false,
    };
  }

  /**
   * Process and manage alerts
   */
  private processAlerts(newAlerts: Alert[]): void {
    for (const alert of newAlerts) {
      const existingAlert = Array.from(this.activeAlerts.values())
        .find(a => a.type === alert.type && !a.resolved);

      if (existingAlert) {
        // Update existing alert
        existingAlert.currentValue = alert.currentValue;
        existingAlert.timestamp = alert.timestamp;
      } else {
        // Add new alert
        this.activeAlerts.set(alert.id, alert);
        
        if (this.config.enableRealTimeAlerts) {
          this.emit('alert_triggered', alert);
        }
      }
    }

    // Check for resolved alerts
    this.checkResolvedAlerts();
  }

  /**
   * Check if any alerts have been resolved
   */
  private checkResolvedAlerts(): void {
    const now = Date.now();
    
    for (const [alertId, alert] of this.activeAlerts.entries()) {
      if (alert.resolved) continue;

      let isResolved = false;

      // Check resolution conditions based on alert type
      switch (alert.type) {
        case 'memory_usage':
          const currentMemory = this.metricsHistory[this.metricsHistory.length - 1]?.memory.heapUsed || 0;
          isResolved = currentMemory < alert.threshold * 0.9; // 10% buffer
          break;
        case 'slow_queries':
          const currentQueryTime = this.queryAnalyzer?.getPerformanceMetrics().avgExecutionTime || 0;
          isResolved = currentQueryTime < alert.threshold * 0.9;
          break;
        case 'low_cache_hit_rate':
          const currentHitRate = this.queryAnalyzer?.getCacheStats().hitRate || 0;
          isResolved = currentHitRate > alert.threshold * 1.1; // 10% buffer
          break;
      }

      if (isResolved) {
        alert.resolved = true;
        alert.resolvedAt = now;
        this.emit('alert_resolved', alert);
      }
    }

    // Clean up old resolved alerts
    for (const [alertId, alert] of this.activeAlerts.entries()) {
      if (alert.resolved && alert.resolvedAt && (now - alert.resolvedAt) > 3600000) {
        this.activeAlerts.delete(alertId);
      }
    }
  }

  /**
   * Perform automatic tuning based on metrics
   */
  private performAutoTuning(metrics: SystemMetrics): void {
    const recommendations = this.generateOptimizationRecommendations(metrics);
    
    for (const recommendation of recommendations) {
      if (recommendation.priority === 'critical' && recommendation.type === 'configuration') {
        this.applyAutoTuning(recommendation, metrics);
      }
    }
  }

  /**
   * Apply automatic tuning recommendations
   */
  private applyAutoTuning(recommendation: OptimizationRecommendation, metrics: SystemMetrics): void {
    // Example auto-tuning actions
    if (recommendation.title.includes('memory cleanup')) {
      this.memoryManager?.forceCleanup();
    } else if (recommendation.title.includes('cache size') && this.queryAnalyzer) {
      // Auto-adjust cache configuration
      this.queryAnalyzer.optimizeCache();
    }

    this.emit('auto_tuning_applied', { recommendation, metrics });
  }

  /**
   * Generate optimization recommendations
   */
  generateOptimizationRecommendations(metrics?: SystemMetrics): OptimizationRecommendation[] {
    const currentMetrics = metrics || this.getCurrentMetrics();
    const recommendations: OptimizationRecommendation[] = [];

    if (!currentMetrics) return recommendations;

    // Memory optimization recommendations
    if (currentMetrics.memory.heapUsed > this.config.alertThresholds.memoryUsageMB) {
      recommendations.push({
        type: 'memory',
        priority: currentMetrics.memory.heapUsed > this.config.alertThresholds.memoryUsageMB * 1.5 ? 'critical' : 'high',
        title: 'Optimize Memory Usage',
        description: 'High memory usage detected. Consider memory optimization strategies.',
        impact: 'Improved performance and reduced memory pressure',
        effort: 'medium',
        implementation: [
          'Enable aggressive garbage collection',
          'Reduce cache sizes',
          'Optimize data structures',
          'Review memory cleanup intervals',
        ],
        estimatedImprovement: '20-40% memory reduction',
      });
    }

    // Query optimization recommendations
    const avgQueryTime = currentMetrics.performance.queryMetrics.avgExecutionTime;
    if (avgQueryTime > this.config.alertThresholds.avgQueryTimeMs) {
      recommendations.push({
        type: 'query',
        priority: 'high',
        title: 'Optimize Query Performance',
        description: 'Slow query execution detected. Database optimization needed.',
        impact: 'Faster response times and better throughput',
        effort: 'medium',
        implementation: [
          'Analyze query execution plans',
          'Add database indexes',
          'Enable query result caching',
          'Optimize query structure',
        ],
        estimatedImprovement: '30-60% query performance improvement',
      });
    }

    // Batch processing recommendations
    const batchMetrics = currentMetrics.performance.batchMetrics;
    if (batchMetrics.backpressureEvents > 5) {
      recommendations.push({
        type: 'batch',
        priority: 'medium',
        title: 'Optimize Batch Processing',
        description: 'Batch processing backpressure detected. Scaling needed.',
        impact: 'Improved throughput and reduced queue buildup',
        effort: 'low',
        implementation: [
          'Increase batch sizes',
          'Adjust flush intervals',
          'Scale processing capacity',
          'Optimize batch algorithms',
        ],
        estimatedImprovement: '25-50% batch throughput improvement',
      });
    }

    return recommendations;
  }

  /**
   * Setup event listeners for real-time monitoring
   */
  private setupEventListeners(): void {
    // Batch processor events (extends EventEmitter)
    if (this.batchProcessor) {
      this.batchProcessor.on('backpressure', (data) => {
        this.emit('performance_event', { type: 'backpressure', data });
      });
    }

    // Memory manager events (extends EventEmitter)
    if (this.memoryManager) {
      this.memoryManager.on('memory_pressure', (data) => {
        this.emit('performance_event', { type: 'memory_pressure', data });
      });
    }
  }

  /**
   * Helper methods
   */
  private calculateCPUUsage(cpuUsage: NodeJS.CpuUsage): number {
    // Simple CPU usage calculation - would need more sophisticated implementation
    return (cpuUsage.user + cpuUsage.system) / 1000000; // Convert to seconds
  }

  private cleanupOldMetrics(): void {
    const cutoff = Date.now() - this.config.retentionPeriodMs;
    this.metricsHistory = this.metricsHistory.filter(m => m.timestamp > cutoff);
  }

  private getCurrentMetrics(): SystemMetrics | null {
    return this.metricsHistory[this.metricsHistory.length - 1] || null;
  }

  private exportMetrics(metrics: SystemMetrics): void {
    // Implementation would export metrics to file or external system
    // For now, just emit an event
    this.emit('metrics_exported', { metrics, path: this.config.exportMetricsPath });
  }

  // Default empty metrics for when components aren't registered
  private getEmptyQueryMetrics(): PerformanceMetrics {
    return {
      queryCount: 0,
      totalExecutionTime: 0,
      avgExecutionTime: 0,
      slowQueries: [],
      cacheStats: {
        hits: 0,
        misses: 0,
        hitRate: 0,
        totalSize: 0,
        entryCount: 0,
        evictions: 0,
        avgAccessTime: 0,
      },
      indexEfficiency: {},
    };
  }

  private getEmptyBatchMetrics(): BatchMetrics {
    return {
      totalBatches: 0,
      totalItems: 0,
      avgBatchSize: 0,
      avgProcessingTime: 0,
      successRate: 100,
      backpressureEvents: 0,
      memoryUsageMB: 0,
      throughputPerSecond: 0,
      lastTuningAdjustment: Date.now(),
    };
  }

  private getEmptyResourceUsage(): ResourceUsage {
    return {
      memory: {
        heapUsed: 0,
        heapTotal: 0,
        external: 0,
        rss: 0,
        buffers: 0,
        connectionPool: 0,
        statementCache: 0,
        resultCache: 0,
        totalManaged: 0,
      },
      connections: {
        active: 0,
        idle: 0,
        total: 0,
        created: 0,
        destroyed: 0,
        errors: 0,
        avgConnectionTime: 0,
        avgQueryTime: 0,
      },
      statements: {
        cached: 0,
        active: 0,
        totalExecutions: 0,
        cacheHitRate: 0,
      },
      performance: {
        avgQueryTime: 0,
        slowQueries: 0,
        memoryPressureEvents: 0,
        cleanupCycles: 0,
      },
    };
  }

  /**
   * Get current active alerts
   */
  getActiveAlerts(): Alert[] {
    return Array.from(this.activeAlerts.values()).filter(a => !a.resolved);
  }

  /**
   * Get metrics history
   */
  getMetricsHistory(limit?: number): SystemMetrics[] {
    return limit ? this.metricsHistory.slice(-limit) : [...this.metricsHistory];
  }

  /**
   * Get performance summary
   */
  getPerformanceSummary(): {
    currentMetrics: SystemMetrics | null;
    activeAlerts: Alert[];
    predictions: PerformancePrediction[];
    recommendations: OptimizationRecommendation[];
  } {
    const currentMetrics = this.getCurrentMetrics();
    return {
      currentMetrics,
      activeAlerts: this.getActiveAlerts(),
      predictions: currentMetrics?.predictions || [],
      recommendations: this.generateOptimizationRecommendations(currentMetrics || undefined),
    };
  }

  /**
   * Shutdown monitoring
   */
  async shutdown(): Promise<void> {
    this.stop();
    this.removeAllListeners();
    this.activeAlerts.clear();
    this.metricsHistory = [];
    this.emit('shutdown');
  }
} 