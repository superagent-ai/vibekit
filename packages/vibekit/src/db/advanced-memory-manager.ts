/**
 * Phase 4.5: Advanced Memory Manager
 * 
 * Comprehensive memory management with connection pooling, resource monitoring,
 * automatic cleanup, and intelligent memory optimization for database operations.
 */

import Database from 'better-sqlite3';
import { EventEmitter } from 'events';

export interface MemoryConfig {
  maxHeapMB: number;
  warningThresholdMB: number;
  cleanupIntervalMs: number;
  connectionPoolSize: number;
  connectionTimeoutMs: number;
  enableGCHints: boolean;
  statementCacheSize: number;
  resultSetCacheSize: number;
}

export interface ConnectionStats {
  active: number;
  idle: number;
  total: number;
  created: number;
  destroyed: number;
  errors: number;
  avgConnectionTime: number;
  avgQueryTime: number;
}

export interface MemoryStats {
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
  buffers: number;
  connectionPool: number;
  statementCache: number;
  resultCache: number;
  totalManaged: number;
}

export interface ResourceUsage {
  memory: MemoryStats;
  connections: ConnectionStats;
  statements: {
    cached: number;
    active: number;
    totalExecutions: number;
    cacheHitRate: number;
  };
  performance: {
    avgQueryTime: number;
    slowQueries: number;
    memoryPressureEvents: number;
    cleanupCycles: number;
  };
}

interface PooledConnection {
  database: Database.Database;
  id: string;
  createdAt: number;
  lastUsed: number;
  queryCount: number;
  isActive: boolean;
  totalQueryTime: number;
}

interface CachedStatement {
  statement: any; // prepared statement
  sql: string;
  createdAt: number;
  lastUsed: number;
  executionCount: number;
  avgExecutionTime: number;
}

interface CachedResult {
  data: any;
  sql: string;
  params: any[];
  createdAt: number;
  lastAccessed: number;
  accessCount: number;
  size: number;
  ttl: number;
}

export class AdvancedMemoryManager extends EventEmitter {
  private config: MemoryConfig;
  private connectionPool: Map<string, PooledConnection>;
  private idleConnections: Set<string>;
  private statementCache: Map<string, CachedStatement>;
  private resultCache: Map<string, CachedResult>;
  private cleanupTimer?: NodeJS.Timeout;
  private monitoringTimer?: NodeJS.Timeout;
  private stats: ResourceUsage;
  private lastGCTime: number;
  private connectionIdCounter: number;

  constructor(config: Partial<MemoryConfig> = {}) {
    super();

    this.config = {
      maxHeapMB: config.maxHeapMB || 512,
      warningThresholdMB: config.warningThresholdMB || 400,
      cleanupIntervalMs: config.cleanupIntervalMs || 30000,
      connectionPoolSize: config.connectionPoolSize || 10,
      connectionTimeoutMs: config.connectionTimeoutMs || 30000,
      enableGCHints: config.enableGCHints ?? true,
      statementCacheSize: config.statementCacheSize || 1000,
      resultSetCacheSize: config.resultSetCacheSize || 500,
    };

    this.connectionPool = new Map();
    this.idleConnections = new Set();
    this.statementCache = new Map();
    this.resultCache = new Map();
    this.lastGCTime = Date.now();
    this.connectionIdCounter = 0;

    this.stats = {
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

    this.startCleanupTimer();
    this.startMonitoring();
  }

  /**
   * Create or get a database connection from the pool
   */
  async getConnection(dbPath: string): Promise<PooledConnection> {
    const now = Date.now();

    // Try to get an idle connection first
    for (const connectionId of this.idleConnections) {
      const conn = this.connectionPool.get(connectionId);
      if (conn && !conn.isActive) {
        conn.isActive = true;
        conn.lastUsed = now;
        this.idleConnections.delete(connectionId);
        this.updateConnectionStats();
        return conn;
      }
    }

    // Create new connection if pool not full
    if (this.connectionPool.size < this.config.connectionPoolSize) {
      return this.createConnection(dbPath);
    }

    // Wait for connection to become available
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout - no connections available'));
      }, this.config.connectionTimeoutMs);

      const checkForConnection = () => {
        for (const connectionId of this.idleConnections) {
          const conn = this.connectionPool.get(connectionId);
          if (conn && !conn.isActive) {
            clearTimeout(timeout);
            conn.isActive = true;
            conn.lastUsed = now;
            this.idleConnections.delete(connectionId);
            this.updateConnectionStats();
            resolve(conn);
            return;
          }
        }
        // Check again in 50ms
        setTimeout(checkForConnection, 50);
      };

      checkForConnection();
    });
  }

  /**
   * Return connection to the pool
   */
  releaseConnection(connection: PooledConnection): void {
    connection.isActive = false;
    connection.lastUsed = Date.now();
    this.idleConnections.add(connection.id);
    this.updateConnectionStats();
  }

  /**
   * Create a new database connection
   */
  private createConnection(dbPath: string): PooledConnection {
    const startTime = Date.now();
    const connectionId = `conn_${++this.connectionIdCounter}_${Date.now()}`;

    try {
      const database = new Database(dbPath);
      
      // Configure database for optimal performance
      database.pragma('journal_mode = WAL');
      database.pragma('synchronous = NORMAL');
      database.pragma('cache_size = -16000'); // 16MB cache
      database.pragma('temp_store = MEMORY');
      database.pragma('mmap_size = 268435456'); // 256MB memory mapping

      const connection: PooledConnection = {
        database,
        id: connectionId,
        createdAt: Date.now(),
        lastUsed: Date.now(),
        queryCount: 0,
        isActive: true,
        totalQueryTime: 0,
      };

      this.connectionPool.set(connectionId, connection);
      this.stats.connections.created++;
      this.stats.connections.total++;

      // Update average connection time
      const connectionTime = Date.now() - startTime;
      this.updateConnectionTime(connectionTime);

      this.emit('connection_created', { connectionId, connectionTime });

      return connection;

    } catch (error) {
      this.stats.connections.errors++;
      this.emit('connection_error', { error, dbPath });
      throw error;
    }
  }

  /**
   * Get or create cached prepared statement
   */
  getCachedStatement(connection: PooledConnection, sql: string): any {
    const statementKey = this.hashStatement(sql);
    let cached = this.statementCache.get(statementKey);

    if (cached) {
      cached.lastUsed = Date.now();
      cached.executionCount++;
      this.stats.statements.totalExecutions++;
      return cached.statement;
    }

    // Create new statement
    try {
      const statement = connection.database.prepare(sql);
      cached = {
        statement,
        sql,
        createdAt: Date.now(),
        lastUsed: Date.now(),
        executionCount: 1,
        avgExecutionTime: 0,
      };

      // Evict old statements if cache is full
      if (this.statementCache.size >= this.config.statementCacheSize) {
        this.evictOldestStatement();
      }

      this.statementCache.set(statementKey, cached);
      this.stats.statements.cached = this.statementCache.size;
      this.stats.statements.totalExecutions++;

      return statement;

    } catch (error) {
      this.emit('statement_error', { error, sql });
      throw error;
    }
  }

  /**
   * Execute query with performance tracking
   */
  async executeQuery<T>(
    connection: PooledConnection,
    sql: string,
    params: any[] = [],
    cacheResults: boolean = false
  ): Promise<T> {
    const startTime = process.hrtime.bigint();
    const statement = this.getCachedStatement(connection, sql);

    try {
      // Check result cache first
      if (cacheResults) {
        const cachedResult = this.getCachedResult(sql, params);
        if (cachedResult) {
          // Still count as query execution for tracking
          const endTime = process.hrtime.bigint();
          const executionTime = Math.max(1, Number(endTime - startTime) / 1000000); // Convert to ms, minimum 1ms
          connection.queryCount++;
          connection.totalQueryTime += executionTime;
          this.updateQueryStats(executionTime);
          return cachedResult;
        }
      }

      // Execute query
      const result = statement.all(...params);
      const endTime = process.hrtime.bigint();
      const executionTime = Math.max(1, Number(endTime - startTime) / 1000000); // Convert to ms, minimum 1ms

      // Update connection statistics
      connection.queryCount++;
      connection.totalQueryTime += executionTime;
      
      // Update statement statistics
      const statementKey = this.hashStatement(sql);
      const cached = this.statementCache.get(statementKey);
      if (cached) {
        const totalTime = cached.avgExecutionTime * (cached.executionCount - 1) + executionTime;
        cached.avgExecutionTime = totalTime / cached.executionCount;
      }

      // Track slow queries
      if (executionTime > 1000) {
        this.stats.performance.slowQueries++;
        this.emit('slow_query', { sql, params, executionTime });
      }

      // Cache result if requested
      if (cacheResults) {
        this.setCachedResult(sql, params, result);
      }

      this.updateQueryStats(executionTime);
      return result as T;

    } catch (error) {
      const endTime = process.hrtime.bigint();
      const executionTime = Math.max(1, Number(endTime - startTime) / 1000000); // Convert to ms, minimum 1ms
      // Still track failed queries
      connection.queryCount++;
      connection.totalQueryTime += executionTime;
      this.updateQueryStats(executionTime);
      
      this.emit('query_error', { error, sql, params });
      throw error;
    }
  }

  /**
   * Get cached query result
   */
  private getCachedResult(sql: string, params: any[]): any | null {
    const cacheKey = this.hashQuery(sql, params);
    const cached = this.resultCache.get(cacheKey);

    if (!cached) return null;

    const now = Date.now();
    if (now - cached.createdAt > cached.ttl) {
      this.resultCache.delete(cacheKey);
      return null;
    }

    cached.lastAccessed = now;
    cached.accessCount++;
    return cached.data;
  }

  /**
   * Cache query result
   */
  private setCachedResult(sql: string, params: any[], result: any): void {
    if (this.resultCache.size >= this.config.resultSetCacheSize) {
      this.evictOldestResult();
    }

    const cacheKey = this.hashQuery(sql, params);
    const size = this.estimateResultSize(result);
    
    this.resultCache.set(cacheKey, {
      data: result,
      sql,
      params,
      createdAt: Date.now(),
      lastAccessed: Date.now(),
      accessCount: 1,
      size,
      ttl: 300000, // 5 minutes default TTL
    });
  }

  /**
   * Get current memory statistics
   */
  getMemoryStats(): MemoryStats {
    const memUsage = process.memoryUsage();
    
    this.stats.memory = {
      heapUsed: Math.round(memUsage.heapUsed / (1024 * 1024)),
      heapTotal: Math.round(memUsage.heapTotal / (1024 * 1024)),
      external: Math.round(memUsage.external / (1024 * 1024)),
      rss: Math.round(memUsage.rss / (1024 * 1024)),
      buffers: Math.round((memUsage.arrayBuffers || 0) / (1024 * 1024)),
      connectionPool: this.estimateConnectionPoolSize(),
      statementCache: this.estimateStatementCacheSize(),
      resultCache: this.estimateResultCacheSize(),
      totalManaged: 0,
    };

    this.stats.memory.totalManaged = 
      this.stats.memory.connectionPool + 
      this.stats.memory.statementCache + 
      this.stats.memory.resultCache;

    return this.stats.memory;
  }

  /**
   * Get current resource usage
   */
  getResourceUsage(): ResourceUsage {
    this.getMemoryStats();
    this.updateConnectionStats();
    this.updateStatementStats();
    return { ...this.stats };
  }

  /**
   * Force memory cleanup
   */
  async forceCleanup(): Promise<void> {
    const startTime = Date.now();
    
    // Close idle connections beyond minimum
    await this.cleanupIdleConnections();
    
    // Clean statement cache
    this.cleanupStatementCache();
    
    // Clean result cache
    this.cleanupResultCache();
    
    // Trigger garbage collection if enabled
    if (this.config.enableGCHints && global.gc) {
      global.gc();
      this.lastGCTime = Date.now();
    }

    this.stats.performance.cleanupCycles++;
    const cleanupTime = Date.now() - startTime;
    
    this.emit('cleanup_completed', {
      duration: cleanupTime,
      memoryFreed: this.estimateMemoryFreed(),
    });
  }

  /**
   * Check memory pressure and take action
   */
  private checkMemoryPressure(): void {
    const memStats = this.getMemoryStats();
    
    if (memStats.heapUsed > this.config.warningThresholdMB) {
      this.stats.performance.memoryPressureEvents++;
      this.emit('memory_pressure', memStats);
      
      // Aggressive cleanup under memory pressure
      if (memStats.heapUsed > this.config.maxHeapMB * 0.9) {
        this.forceCleanup();
      }
    }
  }

  /**
   * Start cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.performRoutineCleanup();
    }, this.config.cleanupIntervalMs);
  }

  /**
   * Start memory monitoring
   */
  private startMonitoring(): void {
    this.monitoringTimer = setInterval(() => {
      this.checkMemoryPressure();
      this.updateAllStats();
    }, 10000); // Monitor every 10 seconds
  }

  /**
   * Perform routine maintenance cleanup
   */
  private async performRoutineCleanup(): Promise<void> {
    // Clean up expired cache entries
    this.cleanupExpiredResults();
    
    // Close connections that have been idle too long
    await this.cleanupIdleConnections();
    
    // Clean up old statement cache entries
    this.cleanupOldStatements();
    
    // Suggest GC if memory usage is high
    if (this.shouldTriggerGC()) {
      if (this.config.enableGCHints && global.gc) {
        global.gc();
        this.lastGCTime = Date.now();
      }
    }
  }

  /**
   * Cleanup idle connections
   */
  private async cleanupIdleConnections(): Promise<void> {
    const now = Date.now();
    const maxIdleTime = this.config.connectionTimeoutMs;
    const minConnections = Math.ceil(this.config.connectionPoolSize * 0.3);
    
    const connectionsToClose: string[] = [];
    
    for (const connectionId of this.idleConnections) {
      const conn = this.connectionPool.get(connectionId);
      if (conn && now - conn.lastUsed > maxIdleTime && 
          this.connectionPool.size > minConnections) {
        connectionsToClose.push(connectionId);
      }
    }

    for (const connectionId of connectionsToClose) {
      const conn = this.connectionPool.get(connectionId);
      if (conn) {
        try {
          conn.database.close();
          this.connectionPool.delete(connectionId);
          this.idleConnections.delete(connectionId);
          this.stats.connections.destroyed++;
          this.stats.connections.total--;
        } catch (error) {
          this.emit('connection_cleanup_error', { error, connectionId });
        }
      }
    }
  }

  /**
   * Update various statistics
   */
  private updateAllStats(): void {
    this.updateConnectionStats();
    this.updateStatementStats();
    this.updatePerformanceStats();
  }

  private updateConnectionStats(): void {
    this.stats.connections.active = Array.from(this.connectionPool.values())
      .filter(conn => conn.isActive).length;
    this.stats.connections.idle = this.idleConnections.size;
    this.stats.connections.total = this.connectionPool.size;

    // Calculate average query time across all connections
    const connections = Array.from(this.connectionPool.values());
    if (connections.length > 0) {
      const totalQueries = connections.reduce((sum, conn) => sum + conn.queryCount, 0);
      const totalTime = connections.reduce((sum, conn) => sum + conn.totalQueryTime, 0);
      this.stats.connections.avgQueryTime = totalQueries > 0 ? totalTime / totalQueries : 0;
    }
  }

  private updateStatementStats(): void {
    this.stats.statements.cached = this.statementCache.size;
    this.stats.statements.active = Array.from(this.statementCache.values())
      .filter(stmt => Date.now() - stmt.lastUsed < 60000).length;
    
    const totalExecs = Array.from(this.statementCache.values())
      .reduce((sum, stmt) => sum + stmt.executionCount, 0);
    this.stats.statements.cacheHitRate = totalExecs > 0 
      ? (this.stats.statements.totalExecutions / totalExecs) * 100 
      : 0;
  }

  private updatePerformanceStats(): void {
    // Update from recent query executions
    const connections = Array.from(this.connectionPool.values());
    if (connections.length > 0) {
      const avgQueryTime = connections.reduce((sum, conn) => {
        return sum + (conn.queryCount > 0 ? conn.totalQueryTime / conn.queryCount : 0);
      }, 0) / connections.length;
      
      this.stats.performance.avgQueryTime = avgQueryTime;
    }
  }

  private updateConnectionTime(connectionTime: number): void {
    const totalConnections = this.stats.connections.created;
    this.stats.connections.avgConnectionTime = 
      (this.stats.connections.avgConnectionTime * (totalConnections - 1) + connectionTime) / totalConnections;
  }

  private updateQueryStats(executionTime: number): void {
    // Update rolling average for performance stats
    const alpha = 0.1; // Exponential moving average factor
    this.stats.performance.avgQueryTime = 
      this.stats.performance.avgQueryTime * (1 - alpha) + executionTime * alpha;
  }

  // Helper methods for cleanup and maintenance
  private cleanupExpiredResults(): void {
    const now = Date.now();
    for (const [key, cached] of this.resultCache.entries()) {
      if (now - cached.createdAt > cached.ttl) {
        this.resultCache.delete(key);
      }
    }
  }

  private cleanupStatementCache(): void {
    if (this.statementCache.size <= this.config.statementCacheSize) return;
    
    const statements = Array.from(this.statementCache.entries())
      .sort(([, a], [, b]) => a.lastUsed - b.lastUsed);
    
    const toRemove = statements.slice(0, statements.length - this.config.statementCacheSize);
    for (const [key] of toRemove) {
      this.statementCache.delete(key);
    }
  }

  private cleanupResultCache(): void {
    if (this.resultCache.size <= this.config.resultSetCacheSize) return;
    
    const results = Array.from(this.resultCache.entries())
      .sort(([, a], [, b]) => a.lastAccessed - b.lastAccessed);
    
    const toRemove = results.slice(0, results.length - this.config.resultSetCacheSize);
    for (const [key] of toRemove) {
      this.resultCache.delete(key);
    }
  }

  private cleanupOldStatements(): void {
    const now = Date.now();
    const maxAge = 3600000; // 1 hour
    
    for (const [key, stmt] of this.statementCache.entries()) {
      if (now - stmt.lastUsed > maxAge) {
        this.statementCache.delete(key);
      }
    }
  }

  private evictOldestStatement(): void {
    let oldestKey = '';
    let oldestTime = Date.now();
    
    for (const [key, stmt] of this.statementCache.entries()) {
      if (stmt.lastUsed < oldestTime) {
        oldestTime = stmt.lastUsed;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      this.statementCache.delete(oldestKey);
    }
  }

  private evictOldestResult(): void {
    let oldestKey = '';
    let oldestTime = Date.now();
    
    for (const [key, result] of this.resultCache.entries()) {
      if (result.lastAccessed < oldestTime) {
        oldestTime = result.lastAccessed;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      this.resultCache.delete(oldestKey);
    }
  }

  private shouldTriggerGC(): boolean {
    const memStats = this.getMemoryStats();
    const timeSinceLastGC = Date.now() - this.lastGCTime;
    
    return (
      memStats.heapUsed > this.config.warningThresholdMB &&
      timeSinceLastGC > 60000 // At least 1 minute since last GC
    );
  }

  // Estimation methods
  private estimateConnectionPoolSize(): number {
    return this.connectionPool.size * 2; // Rough estimate: 2MB per connection
  }

  private estimateStatementCacheSize(): number {
    return Math.round(this.statementCache.size * 0.1); // Rough estimate: 100KB per statement
  }

  private estimateResultCacheSize(): number {
    return Array.from(this.resultCache.values())
      .reduce((total, cached) => total + cached.size, 0) / (1024 * 1024); // Convert to MB
  }

  private estimateResultSize(result: any): number {
    return JSON.stringify(result).length * 2; // Rough estimate
  }

  private estimateMemoryFreed(): number {
    // This would need more sophisticated tracking in a real implementation
    return 5; // Placeholder: 5MB freed
  }

  private hashStatement(sql: string): string {
    let hash = 0;
    for (let i = 0; i < sql.length; i++) {
      const char = sql.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  private hashQuery(sql: string, params: any[]): string {
    const content = sql + JSON.stringify(params);
    return this.hashStatement(content);
  }

  /**
   * Shutdown and cleanup all resources
   */
  async shutdown(): Promise<void> {
    // Clear timers
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
    }

    // Close all connections
    for (const [connectionId, conn] of this.connectionPool.entries()) {
      try {
        conn.database.close();
        this.stats.connections.destroyed++;
      } catch (error) {
        console.warn(`Failed to close connection ${connectionId}:`, error);
      }
    }

    // Clear all caches
    this.connectionPool.clear();
    this.idleConnections.clear();
    this.statementCache.clear();
    this.resultCache.clear();

    this.emit('shutdown');
  }
} 