/**
 * Phase 4.5: Query Performance Analyzer
 * 
 * Advanced query analysis with EXPLAIN plans, performance metrics,
 * and intelligent caching for optimal database performance.
 */

import { Database } from 'better-sqlite3';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { SQL } from 'drizzle-orm';

export interface QueryPlan {
  id: number;
  parent: number;
  notused: number;
  detail: string;
}

export interface QueryAnalysis {
  query: string;
  queryHash: string;
  plan: QueryPlan[];
  estimatedCost: number;
  indexUsage: string[];
  scanTypes: string[];
  recommendations: string[];
  executionTime?: number;
  cacheHit?: boolean;
}

export interface CacheEntry<T = any> {
  data: T;
  createdAt: number;
  lastAccessed: number;
  accessCount: number;
  size: number;
  ttl: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  totalSize: number;
  entryCount: number;
  evictions: number;
  avgAccessTime: number;
}

export interface PerformanceMetrics {
  queryCount: number;
  totalExecutionTime: number;
  avgExecutionTime: number;
  slowQueries: Array<{
    query: string;
    executionTime: number;
    timestamp: number;
  }>;
  cacheStats: CacheStats;
  indexEfficiency: Record<string, number>;
}

export class QueryPerformanceAnalyzer {
  private db: Database;
  private drizzleDb: BetterSQLite3Database<any>;
  private queryCache: Map<string, CacheEntry>;
  private maxCacheSize: number;
  private defaultTTL: number;
  private performanceMetrics: PerformanceMetrics;
  private slowQueryThreshold: number;

  constructor(
    db: Database,
    drizzleDb: BetterSQLite3Database<any>,
    options: {
      maxCacheSize?: number;
      defaultTTL?: number;
      slowQueryThreshold?: number;
    } = {}
  ) {
    this.db = db;
    this.drizzleDb = drizzleDb;
    this.queryCache = new Map();
    this.maxCacheSize = options.maxCacheSize || 500;
    this.defaultTTL = options.defaultTTL || 300000; // 5 minutes
    this.slowQueryThreshold = options.slowQueryThreshold || 100; // 100ms

    this.performanceMetrics = {
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

  /**
   * Analyze query execution plan
   */
  async analyzeQuery(query: string, params: any[] = []): Promise<QueryAnalysis> {
    const queryHash = this.hashQuery(query, params);
    
    try {
      // Get query plan using EXPLAIN QUERY PLAN
      const planQuery = `EXPLAIN QUERY PLAN ${query}`;
      const plan = this.db.prepare(planQuery).all(...params) as QueryPlan[];

      // Analyze plan for performance insights
      const analysis: QueryAnalysis = {
        query,
        queryHash,
        plan,
        estimatedCost: this.calculateEstimatedCost(plan),
        indexUsage: this.extractIndexUsage(plan),
        scanTypes: this.extractScanTypes(plan),
        recommendations: this.generateRecommendations(plan),
      };

      return analysis;
    } catch (error) {
      console.warn('Failed to analyze query:', error);
      return {
        query,
        queryHash,
        plan: [],
        estimatedCost: 0,
        indexUsage: [],
        scanTypes: ['UNKNOWN'],
        recommendations: ['Query analysis failed'],
      };
    }
  }

  /**
   * Execute query with performance tracking and caching
   */
  async executeWithCache<T>(
    queryFn: () => Promise<T> | T,
    cacheKey: string,
    ttl: number = this.defaultTTL
  ): Promise<T> {
    const startTime = process.hrtime.bigint();
    
    // Check cache first
    const cached = this.getCached<T>(cacheKey);
    if (cached) {
      this.performanceMetrics.cacheStats.hits++;
      this.updateCacheStats();
      // Still track cache hit timing
      const endTime = process.hrtime.bigint();
      const executionTime = Math.max(1, Number(endTime - startTime) / 1000000);
      this.updatePerformanceMetrics(executionTime, cacheKey);
      return cached;
    }

    // Cache miss - execute query
    this.performanceMetrics.cacheStats.misses++;
    
    try {
      const result = await queryFn();
      const endTime = process.hrtime.bigint();
      const executionTime = Math.max(1, Number(endTime - startTime) / 1000000);
      
      // Update performance metrics
      this.updatePerformanceMetrics(executionTime, cacheKey);
      
      // Cache the result
      this.setCached(cacheKey, result, ttl);
      
      return result;
    } catch (error) {
      const endTime = process.hrtime.bigint();
      const executionTime = Math.max(1, Number(endTime - startTime) / 1000000);
      this.updatePerformanceMetrics(executionTime, cacheKey);
      throw error;
    }
  }

  /**
   * Execute query with automatic performance analysis
   */
  async executeWithAnalysis<T>(
    query: string,
    params: any[],
    executor: () => Promise<T> | T
  ): Promise<{ result: T; analysis: QueryAnalysis }> {
    const startTime = process.hrtime.bigint();
    
    // Get query analysis
    const analysis = await this.analyzeQuery(query, params);
    
    // Execute the query
    const result = await executor();
    
    // Add execution time to analysis (high-resolution timing with minimum 1ms)
    const endTime = process.hrtime.bigint();
    analysis.executionTime = Math.max(1, Number(endTime - startTime) / 1000000);
    
    // Update performance metrics
    this.updatePerformanceMetrics(analysis.executionTime, query);
    
    // Track slow queries
    if (analysis.executionTime > this.slowQueryThreshold) {
      this.performanceMetrics.slowQueries.push({
        query,
        executionTime: analysis.executionTime,
        timestamp: Date.now(),
      });
      
      // Keep only last 100 slow queries
      if (this.performanceMetrics.slowQueries.length > 100) {
        this.performanceMetrics.slowQueries.shift();
      }
    }
    
    return { result, analysis };
  }

  /**
   * Get cached result
   */
  private getCached<T>(key: string): T | null {
    const entry = this.queryCache.get(key);
    if (!entry) return null;

    const now = Date.now();
    
    // Check TTL
    if (now - entry.createdAt > entry.ttl) {
      this.queryCache.delete(key);
      return null;
    }

    // Update access stats
    entry.lastAccessed = now;
    entry.accessCount++;
    
    return entry.data as T;
  }

  /**
   * Set cached result with LRU eviction
   */
  private setCached<T>(key: string, data: T, ttl: number): void {
    const now = Date.now();
    const size = this.estimateDataSize(data);
    
    // Check if we need to evict entries
    if (this.queryCache.size >= this.maxCacheSize) {
      this.evictLRU();
    }

    this.queryCache.set(key, {
      data,
      createdAt: now,
      lastAccessed: now,
      accessCount: 1,
      size,
      ttl,
    });

    this.updateCacheStats();
  }

  /**
   * Evict least recently used cache entry
   */
  private evictLRU(): void {
    let oldestKey = '';
    let oldestTime = Date.now();

    for (const [key, entry] of this.queryCache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.queryCache.delete(oldestKey);
      this.performanceMetrics.cacheStats.evictions++;
    }
  }

  /**
   * Calculate estimated query cost from plan
   */
  private calculateEstimatedCost(plan: QueryPlan[]): number {
    let cost = 0;
    
    for (const step of plan) {
      const detail = step.detail.toLowerCase();
      
      // Assign costs based on operation types
      if (detail.includes('scan table')) {
        cost += 100; // Full table scan is expensive
      } else if (detail.includes('search table')) {
        cost += 10; // Index search is cheaper
      } else if (detail.includes('using index')) {
        cost += 1; // Index-only operations are fastest
      } else if (detail.includes('sort')) {
        cost += 50; // Sorting adds cost
      } else if (detail.includes('temp')) {
        cost += 75; // Temporary tables are expensive
      } else {
        cost += 5; // Default cost for other operations
      }
    }
    
    return cost;
  }

  /**
   * Extract index usage from query plan
   */
  private extractIndexUsage(plan: QueryPlan[]): string[] {
    const indexes: string[] = [];
    
    for (const step of plan) {
      const detail = step.detail.toLowerCase();
      
      // Look for index usage patterns
      const indexMatch = detail.match(/using index ([a-zA-Z_][a-zA-Z0-9_]*)/);
      if (indexMatch) {
        indexes.push(indexMatch[1]);
      }
      
      // Look for automatic index usage
      if (detail.includes('automatic covering index')) {
        indexes.push('AUTOMATIC_COVERING_INDEX');
      }
    }
    
    return [...new Set(indexes)]; // Remove duplicates
  }

  /**
   * Extract scan types from query plan
   */
  private extractScanTypes(plan: QueryPlan[]): string[] {
    const scanTypes: string[] = [];
    
    for (const step of plan) {
      const detail = step.detail.toLowerCase();
      
      if (detail.includes('scan table')) {
        scanTypes.push('TABLE_SCAN');
      } else if (detail.includes('search table')) {
        scanTypes.push('INDEX_SEARCH');
      } else if (detail.includes('using index')) {
        scanTypes.push('INDEX_ONLY');
      } else if (detail.includes('using covering index')) {
        scanTypes.push('COVERING_INDEX');
      }
    }
    
    return [...new Set(scanTypes)];
  }

  /**
   * Generate performance recommendations
   */
  private generateRecommendations(plan: QueryPlan[]): string[] {
    const recommendations: string[] = [];
    const scanTypes = this.extractScanTypes(plan);
    
    // Check for table scans
    if (scanTypes.includes('TABLE_SCAN')) {
      recommendations.push('Consider adding indexes to avoid full table scans');
    }
    
    // Check for complex operations
    const hasSort = plan.some(step => step.detail.toLowerCase().includes('sort'));
    if (hasSort) {
      recommendations.push('Consider adding indexes on columns used in ORDER BY clauses');
    }
    
    const hasTemp = plan.some(step => step.detail.toLowerCase().includes('temp'));
    if (hasTemp) {
      recommendations.push('Query uses temporary tables - consider query optimization');
    }
    
    // Check for subqueries
    const hasSubquery = plan.some(step => step.detail.toLowerCase().includes('scalar subquery'));
    if (hasSubquery) {
      recommendations.push('Consider converting scalar subqueries to JOINs for better performance');
    }
    
    return recommendations;
  }

  /**
   * Update performance metrics
   */
  private updatePerformanceMetrics(executionTime: number, queryId: string): void {
    this.performanceMetrics.queryCount++;
    this.performanceMetrics.totalExecutionTime += executionTime;
    this.performanceMetrics.avgExecutionTime = 
      this.performanceMetrics.totalExecutionTime / this.performanceMetrics.queryCount;
  }

  /**
   * Update cache statistics
   */
  private updateCacheStats(): void {
    const stats = this.performanceMetrics.cacheStats;
    const total = stats.hits + stats.misses;
    
    stats.hitRate = total > 0 ? (stats.hits / total) * 100 : 0;
    stats.entryCount = this.queryCache.size;
    stats.totalSize = Array.from(this.queryCache.values())
      .reduce((total, entry) => total + entry.size, 0);
  }

  /**
   * Hash query for caching
   */
  private hashQuery(query: string, params: any[]): string {
    const content = query + JSON.stringify(params);
    let hash = 0;
    
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return hash.toString(36);
  }

  /**
   * Estimate data size for cache management
   */
  private estimateDataSize(data: any): number {
    const json = JSON.stringify(data);
    return json.length * 2; // Rough estimate of string size in bytes
  }

  /**
   * Get current performance metrics
   */
  getPerformanceMetrics(): PerformanceMetrics {
    this.updateCacheStats();
    return { ...this.performanceMetrics };
  }

  /**
   * Clear all cached data
   */
  clearCache(): void {
    this.queryCache.clear();
    this.performanceMetrics.cacheStats.evictions += this.performanceMetrics.cacheStats.entryCount;
    this.updateCacheStats();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): CacheStats {
    this.updateCacheStats();
    return { ...this.performanceMetrics.cacheStats };
  }

  /**
   * Optimize query cache by removing expired entries
   */
  optimizeCache(): void {
    const now = Date.now();
    let removedCount = 0;

    for (const [key, entry] of this.queryCache.entries()) {
      if (now - entry.createdAt > entry.ttl) {
        this.queryCache.delete(key);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      this.performanceMetrics.cacheStats.evictions += removedCount;
      this.updateCacheStats();
    }
  }

  /**
   * Get slow query analysis
   */
  getSlowQueryAnalysis(): {
    count: number;
    avgTime: number;
    patterns: Record<string, number>;
  } {
    const slowQueries = this.performanceMetrics.slowQueries;
    const patterns: Record<string, number> = {};
    
    // Analyze patterns in slow queries
    for (const sq of slowQueries) {
      const pattern = this.extractQueryPattern(sq.query);
      patterns[pattern] = (patterns[pattern] || 0) + 1;
    }
    
    const avgTime = slowQueries.length > 0
      ? slowQueries.reduce((sum, sq) => sum + sq.executionTime, 0) / slowQueries.length
      : 0;
    
    return {
      count: slowQueries.length,
      avgTime,
      patterns,
    };
  }

  /**
   * Extract query pattern for analysis
   */
  private extractQueryPattern(query: string): string {
    // Normalize query by removing specific values
    return query
      .replace(/\b\d+\b/g, '?')           // Replace numbers with ?
      .replace(/'[^']*'/g, '?')           // Replace strings with ?
      .replace(/\s+/g, ' ')               // Normalize whitespace
      .trim()
      .substring(0, 50);                  // Truncate for grouping
  }
} 