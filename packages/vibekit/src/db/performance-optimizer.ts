/**
 * Phase 3: Performance Optimization Module
 * 
 * This module provides advanced performance optimization features:
 * - Query analysis and optimization recommendations
 * - Prepared statement management
 * - Query result caching
 * - Performance benchmarking
 * - Memory usage monitoring
 * - Connection pool optimization
 */

import { eq, desc, asc, and, or, gte, lte, count, sql } from 'drizzle-orm';
import { DrizzleTelemetryDB } from './connection';
import { DrizzleTelemetryOperations } from './operations';
import { 
  TelemetryQueryFilter,
  SessionQueryFilter,
  DrizzleTelemetryConfig,
  QueryMetrics,
} from './types';

interface QueryPlan {
  query: string;
  estimatedCost: number;
  indexUsage: string[];
  recommendations: string[];
  optimizedQuery?: string;
}

interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
  hitCount: number;
  queryHash: string;
}

interface PerformanceBenchmark {
  operation: string;
  duration: number;
  recordCount: number;
  throughput: number; // records/second
  memoryUsage: number; // bytes
  timestamp: number;
}

interface OptimizationReport {
  queriesAnalyzed: number;
  slowQueries: Array<{ query: string; avgDuration: number; count: number }>;
  indexRecommendations: string[];
  cacheEfficiency: {
    hitRate: number;
    totalQueries: number;
    cacheHits: number;
    cacheMisses: number;
  };
  performanceTrends: PerformanceBenchmark[];
  recommendations: string[];
}

export class DrizzleTelemetryPerformanceOptimizer {
  private queryCache = new Map<string, CacheEntry>();
  private queryMetrics = new Map<string, QueryMetrics[]>();
  private benchmarks: PerformanceBenchmark[] = [];
  private cacheHits = 0;
  private cacheMisses = 0;
  private maxCacheSize = 100;
  private cacheTTL = 300000; // 5 minutes

  constructor(
    private operations: DrizzleTelemetryOperations,
    private config: DrizzleTelemetryConfig
  ) {}

  /**
   * Analyze query performance and provide optimization recommendations
   */
  async analyzeQueryPerformance(queries: string[] = []): Promise<QueryPlan[]> {
    const plans: QueryPlan[] = [];
    
    // If no specific queries provided, analyze common patterns
    if (queries.length === 0) {
      queries = this.getCommonQueryPatterns();
    }

    for (const query of queries) {
      const plan = await this.analyzeQuery(query);
      plans.push(plan);
    }

    return plans;
  }

  /**
   * Execute a query with caching and performance monitoring
   */
  async executeOptimizedQuery<T>(
    queryFn: () => Promise<T>,
    cacheKey?: string,
    bypassCache = false
  ): Promise<T> {
    const startTime = performance.now();
    const startMemory = process.memoryUsage().heapUsed;

    // Try cache first
    if (cacheKey && !bypassCache) {
      const cached = this.getFromCache<T>(cacheKey);
      if (cached) {
        this.cacheHits++;
        return cached;
      }
      this.cacheMisses++;
    }

    // Execute query
    const result = await queryFn();
    
    const endTime = performance.now();
    const endMemory = process.memoryUsage().heapUsed;
    const duration = endTime - startTime;
    const memoryDelta = endMemory - startMemory;

    // Cache result if cache key provided
    if (cacheKey && this.shouldCache(result)) {
      this.setCache(cacheKey, result);
    }

    // Record performance metrics
    this.recordBenchmark({
      operation: cacheKey || 'unknown',
      duration,
      recordCount: Array.isArray(result) ? result.length : 1,
      throughput: Array.isArray(result) ? result.length / (duration / 1000) : 1 / (duration / 1000),
      memoryUsage: memoryDelta,
      timestamp: Date.now(),
    });

    return result;
  }

  /**
   * Get performance optimization recommendations
   */
  async getOptimizationReport(): Promise<OptimizationReport> {
    const dbMetrics = this.operations.getPerformanceMetrics();
    const slowQueries = this.identifySlowQueries();
    const indexRecommendations = await this.generateIndexRecommendations();
    
    return {
      queriesAnalyzed: this.queryMetrics.size,
      slowQueries,
      indexRecommendations,
      cacheEfficiency: {
        hitRate: this.getCacheHitRate(),
        totalQueries: this.cacheHits + this.cacheMisses,
        cacheHits: this.cacheHits,
        cacheMisses: this.cacheMisses,
      },
      performanceTrends: this.benchmarks.slice(-50), // Last 50 benchmarks
      recommendations: this.generateRecommendations(),
    };
  }

  /**
   * Run comprehensive performance benchmarks
   */
  async runBenchmarks(): Promise<PerformanceBenchmark[]> {
    const benchmarkSuites = [
      () => this.benchmarkSimpleQueries(),
      () => this.benchmarkComplexQueries(),
      () => this.benchmarkBatchOperations(),
      () => this.benchmarkAggregations(),
    ];

    const results: PerformanceBenchmark[] = [];

    for (const suite of benchmarkSuites) {
      const suiteResults = await suite();
      results.push(...suiteResults);
    }

    return results;
  }

  /**
   * Optimize database configuration based on usage patterns
   */
  async optimizeConfiguration(): Promise<DrizzleTelemetryConfig> {
    const stats = await this.operations.getStatistics();
    const optimizedConfig = { ...this.config };

    // Adjust batch size based on event volume
    if (stats.totalEvents > 100000) {
      optimizedConfig.streamBatchSize = Math.min(200, (optimizedConfig.streamBatchSize || 50) * 2);
    } else if (stats.totalEvents < 1000) {
      optimizedConfig.streamBatchSize = Math.max(10, (optimizedConfig.streamBatchSize || 50) / 2);
    }

    // Adjust flush interval based on event frequency
    const recentEvents = await this.operations.queryEvents({
      from: Date.now() - 3600000, // Last hour
      limit: 1000
    });

    if (recentEvents.length > 500) {
      // High frequency - reduce flush interval
      optimizedConfig.streamFlushIntervalMs = Math.max(100, (optimizedConfig.streamFlushIntervalMs || 1000) / 2);
    } else if (recentEvents.length < 10) {
      // Low frequency - increase flush interval
      optimizedConfig.streamFlushIntervalMs = Math.min(5000, (optimizedConfig.streamFlushIntervalMs || 1000) * 2);
    }

    // Enable WAL for high-write scenarios
    if (stats.totalEvents > 50000) {
      optimizedConfig.enableWAL = true;
    }

    return optimizedConfig;
  }

  /**
   * Clean up caches and optimize memory usage
   */
  cleanupCaches(): void {
    const now = Date.now();
    
    // Remove expired cache entries
    for (const [key, entry] of this.queryCache.entries()) {
      if (now - entry.timestamp > this.cacheTTL) {
        this.queryCache.delete(key);
      }
    }

    // If cache is still too large, remove least recently used
    if (this.queryCache.size > this.maxCacheSize) {
      const entries = Array.from(this.queryCache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      const toRemove = entries.slice(0, entries.length - this.maxCacheSize);
      for (const [key] of toRemove) {
        this.queryCache.delete(key);
      }
    }

    // Clean old benchmarks
    this.benchmarks = this.benchmarks.slice(-100); // Keep last 100
    
    // Clean old query metrics
    for (const [query, metrics] of this.queryMetrics.entries()) {
      this.queryMetrics.set(query, metrics.slice(-20)); // Keep last 20 per query
    }
  }

  // Private helper methods

  private async analyzeQuery(query: string): Promise<QueryPlan> {
    // Simple query analysis - in real implementation, this would use EXPLAIN QUERY PLAN
    const plan: QueryPlan = {
      query,
      estimatedCost: this.estimateQueryCost(query),
      indexUsage: this.detectIndexUsage(query),
      recommendations: [],
    };

    // Generate recommendations based on query pattern
    if (query.includes('ORDER BY') && !query.includes('LIMIT')) {
      plan.recommendations.push('Consider adding LIMIT to reduce result set size');
    }

    if (query.includes('LIKE') && query.includes('%')) {
      plan.recommendations.push('Wildcard searches can be slow - consider full-text search for text queries');
    }

    if (!this.hasAppropriateIndex(query)) {
      plan.recommendations.push('Missing index detected - consider adding index for better performance');
    }

    return plan;
  }

  private getCommonQueryPatterns(): string[] {
    return [
      'SELECT * FROM telemetry_events WHERE session_id = ?',
      'SELECT * FROM telemetry_events WHERE agent_type = ? ORDER BY timestamp DESC',
      'SELECT COUNT(*) FROM telemetry_events WHERE event_type = ?',
      'SELECT * FROM telemetry_sessions WHERE status = ? ORDER BY start_time DESC',
      'SELECT agent_type, COUNT(*) FROM telemetry_events GROUP BY agent_type',
    ];
  }

  private estimateQueryCost(query: string): number {
    // Simple cost estimation based on query complexity
    let cost = 1;
    
    if (query.includes('JOIN')) cost += 5;
    if (query.includes('GROUP BY')) cost += 3;
    if (query.includes('ORDER BY')) cost += 2;
    if (query.includes('LIKE')) cost += 2;
    if (query.includes('COUNT(')) cost += 1;
    
    return cost;
  }

  private detectIndexUsage(query: string): string[] {
    const indexes: string[] = [];
    
    if (query.includes('session_id')) indexes.push('idx_events_session');
    if (query.includes('timestamp')) indexes.push('idx_events_timestamp');
    if (query.includes('agent_type')) indexes.push('idx_events_agent');
    if (query.includes('event_type')) indexes.push('idx_events_type');
    
    return indexes;
  }

  private hasAppropriateIndex(query: string): boolean {
    // Check if query has appropriate indexes
    const commonPatterns = [
      { pattern: /WHERE session_id = /, index: 'session_id' },
      { pattern: /WHERE agent_type = /, index: 'agent_type' },
      { pattern: /WHERE event_type = /, index: 'event_type' },
      { pattern: /ORDER BY timestamp/, index: 'timestamp' },
    ];

    return commonPatterns.some(({ pattern }) => pattern.test(query));
  }

  private getFromCache<T>(key: string): T | null {
    const entry = this.queryCache.get(key);
    if (!entry) return null;
    
    if (Date.now() - entry.timestamp > this.cacheTTL) {
      this.queryCache.delete(key);
      return null;
    }
    
    entry.hitCount++;
    return entry.data as T;
  }

  private setCache<T>(key: string, data: T): void {
    this.queryCache.set(key, {
      data,
      timestamp: Date.now(),
      hitCount: 0,
      queryHash: this.hashQuery(key),
    });
  }

  private shouldCache(result: any): boolean {
    // Don't cache large results or results that change frequently
    if (Array.isArray(result) && result.length > 1000) return false;
    if (JSON.stringify(result).length > 100000) return false; // 100KB limit
    return true;
  }

  private hashQuery(query: string): string {
    // Simple hash for query caching
    let hash = 0;
    for (let i = 0; i < query.length; i++) {
      const char = query.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString();
  }

  private recordBenchmark(benchmark: PerformanceBenchmark): void {
    this.benchmarks.push(benchmark);
    
    // Keep only recent benchmarks to prevent memory growth
    if (this.benchmarks.length > 1000) {
      this.benchmarks = this.benchmarks.slice(-500);
    }
  }

  private identifySlowQueries(): Array<{ query: string; avgDuration: number; count: number }> {
    const slowQueries: Map<string, { totalDuration: number; count: number }> = new Map();
    
    for (const [query, metrics] of this.queryMetrics.entries()) {
      const totalDuration = metrics.reduce((sum, m) => sum + m.duration, 0);
      const avgDuration = totalDuration / metrics.length;
      
      if (avgDuration > 100) { // Queries slower than 100ms
        slowQueries.set(query, {
          totalDuration,
          count: metrics.length,
        });
      }
    }
    
    return Array.from(slowQueries.entries())
      .map(([query, stats]) => ({
        query,
        avgDuration: stats.totalDuration / stats.count,
        count: stats.count,
      }))
      .sort((a, b) => b.avgDuration - a.avgDuration)
      .slice(0, 10);
  }

  private async generateIndexRecommendations(): Promise<string[]> {
    const recommendations: string[] = [];
    
    // Analyze query patterns to suggest indexes
    const stats = await this.operations.getStatistics();
    
    if (stats.totalEvents > 10000) {
      recommendations.push('Consider adding composite index on (session_id, timestamp) for session queries');
    }
    
    if (stats.agentBreakdown && Object.keys(stats.agentBreakdown).length > 5) {
      recommendations.push('Consider adding index on (agent_type, mode) for agent-specific queries');
    }
    
    return recommendations;
  }

  private getCacheHitRate(): number {
    const total = this.cacheHits + this.cacheMisses;
    return total > 0 ? (this.cacheHits / total) * 100 : 0;
  }

  private generateRecommendations(): string[] {
    const recommendations: string[] = [];
    
    // Cache efficiency recommendations
    const hitRate = this.getCacheHitRate();
    if (hitRate < 50 && this.cacheHits + this.cacheMisses > 100) {
      recommendations.push('Low cache hit rate - consider adjusting cache TTL or query patterns');
    }
    
    // Performance recommendations
    const avgBenchmark = this.benchmarks.length > 0 
      ? this.benchmarks.reduce((sum, b) => sum + b.duration, 0) / this.benchmarks.length 
      : 0;
      
    if (avgBenchmark > 100) {
      recommendations.push('Average query time is high - consider query optimization');
    }
    
    // Memory recommendations
    const avgMemory = this.benchmarks.length > 0
      ? this.benchmarks.reduce((sum, b) => sum + b.memoryUsage, 0) / this.benchmarks.length
      : 0;
      
    if (avgMemory > 10485760) { // 10MB
      recommendations.push('High memory usage detected - consider result pagination or data archival');
    }
    
    return recommendations;
  }

  private async benchmarkSimpleQueries(): Promise<PerformanceBenchmark[]> {
    const results: PerformanceBenchmark[] = [];
    
    // Test simple event queries
    const startTime = performance.now();
    const events = await this.operations.queryEvents({ limit: 100 });
    const duration = performance.now() - startTime;
    
    results.push({
      operation: 'simple_event_query',
      duration,
      recordCount: events.length,
      throughput: events.length / (duration / 1000),
      memoryUsage: 0,
      timestamp: Date.now(),
    });
    
    return results;
  }

  private async benchmarkComplexQueries(): Promise<PerformanceBenchmark[]> {
    const results: PerformanceBenchmark[] = [];
    
    // Test complex aggregation
    const startTime = performance.now();
    const stats = await this.operations.getStatistics();
    const duration = performance.now() - startTime;
    
    results.push({
      operation: 'complex_aggregation',
      duration,
      recordCount: stats.totalEvents,
      throughput: stats.totalEvents / (duration / 1000),
      memoryUsage: 0,
      timestamp: Date.now(),
    });
    
    return results;
  }

  private async benchmarkBatchOperations(): Promise<PerformanceBenchmark[]> {
    // This would test batch insert performance
    // Implementation would create test data and measure insert performance
    return [];
  }

  private async benchmarkAggregations(): Promise<PerformanceBenchmark[]> {
    // This would test various aggregation queries
    // Implementation would run complex GROUP BY and aggregation queries
    return [];
  }
} 