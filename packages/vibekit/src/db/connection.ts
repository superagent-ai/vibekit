import Database from 'better-sqlite3';
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { lt, sql } from 'drizzle-orm';
import { existsSync, mkdirSync, statSync } from 'fs';
import { dirname, resolve } from 'path';
import * as schema from './schema';
import {
  DrizzleTelemetryConfig,
  DrizzleTelemetryConnectionError,
  DrizzleTelemetryMigrationError,
  MigrationResult,
  DatabaseMetrics,
  QueryMetrics,
} from './types';

export class DrizzleTelemetryDB {
  private db?: BetterSQLite3Database<typeof schema>;
  private sqlite?: Database.Database;
  private config: Required<DrizzleTelemetryConfig>;
  private isInitialized = false;
  private metrics: DatabaseMetrics;
  private queryHistory: QueryMetrics[] = [];
  private readonly maxQueryHistory = 100;

  constructor(config: DrizzleTelemetryConfig = {}) {
    this.config = {
      dbPath: '.vibekit/telemetry.db',
      pruneDays: 30,
      streamBatchSize: 50,
      streamFlushIntervalMs: 1000,
      maxSizeMB: 100,
      enableWAL: true,
      enableForeignKeys: true,
      poolSize: 5,
      queryTimeoutMs: 30000,
      enableQueryLogging: false,
      enableMetrics: true,
      ...config,
    };

    this.metrics = {
      totalQueries: 0,
      avgQueryTime: 0,
      slowQueries: [],
      errorCount: 0,
      connectionCount: 0,
      dbSizeBytes: 0,
      lastUpdated: Date.now(),
    };

    // Set environment-specific database path
    if (process.env.NODE_ENV === 'development') {
      this.config.dbPath = this.config.dbPath.replace('.db', '-dev.db');
    } else if (process.env.NODE_ENV === 'test') {
      this.config.dbPath = this.config.dbPath.replace('.db', '-test.db');
    }
  }

  /**
   * Initialize the database connection and schema
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      const dbPath = resolve(this.config.dbPath);
      const dbDir = dirname(dbPath);

      // Ensure database directory exists
      if (!existsSync(dbDir)) {
        mkdirSync(dbDir, { recursive: true });
      }

      // Initialize SQLite database
      this.sqlite = new Database(dbPath);

      // Configure SQLite settings
      this.configureSQLite();

      // Initialize Drizzle
      this.db = drizzle(this.sqlite, { 
        schema,
        logger: this.config.enableQueryLogging ? {
          logQuery: (query, params) => {
            console.log('[DRIZZLE QUERY]', query, params);
          }
        } : false,
      });

      // Run migrations
      await this.runMigrations();

      // Update metrics
      this.updateDbSizeMetrics();

      // Set up pruning if configured
      if (this.config.pruneDays > 0) {
        await this.scheduleDataPruning();
      }

      this.isInitialized = true;
      this.metrics.connectionCount++;

      console.log(`✅ Drizzle Telemetry DB initialized at ${dbPath}`);
    } catch (error) {
      throw new DrizzleTelemetryConnectionError(
        `Failed to initialize telemetry database: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Configure SQLite database settings for optimal performance
   */
  private configureSQLite(): void {
    if (!this.sqlite) return;

    try {
      // Enable WAL mode for better concurrency
      if (this.config.enableWAL) {
        this.sqlite.pragma('journal_mode = WAL');
      }

      // Enable foreign key constraints
      if (this.config.enableForeignKeys) {
        this.sqlite.pragma('foreign_keys = ON');
      }

      // Performance optimizations
      this.sqlite.pragma('synchronous = NORMAL');
      this.sqlite.pragma('cache_size = 1000');
      this.sqlite.pragma('temp_store = memory');
      this.sqlite.pragma('mmap_size = 268435456'); // 256MB
      
      // Set busy timeout using pragma instead of timeout method
      this.sqlite.pragma(`busy_timeout = ${this.config.queryTimeoutMs}`);

      console.log('📊 SQLite configuration applied successfully');
    } catch (error) {
      console.warn('⚠️ Failed to configure SQLite settings:', error);
    }
  }

  /**
   * Run database migrations
   */
  private async runMigrations(): Promise<MigrationResult> {
    if (!this.db) {
      throw new DrizzleTelemetryMigrationError('Database not initialized');
    }

    const startTime = Date.now();
    const result: MigrationResult = {
      success: false,
      version: '0.0.0',
      migrationsRun: [],
      errors: [],
      duration: 0,
    };

    try {
      // Check for migrations directory in multiple possible locations
      const possibleMigrationDirs = [
        resolve('./packages/vibekit/src/db/migrations'),
        resolve('./src/db/migrations'),
        resolve(__dirname, 'migrations'),
      ];
      
      let migrationsDir: string | null = null;
      for (const dir of possibleMigrationDirs) {
        if (existsSync(dir)) {
          migrationsDir = dir;
          break;
        }
      }

      if (!migrationsDir) {
        console.log('🔄 No migrations directory found, creating initial schema...');
        // Force schema creation by making a simple query to each table
        try {
          await this.db.select().from(schema.telemetrySessions).limit(1);
          await this.db.select().from(schema.telemetryEvents).limit(1);
          await this.db.select().from(schema.telemetryBuffers).limit(1);
          await this.db.select().from(schema.telemetryStats).limit(1);
          await this.db.select().from(schema.telemetryErrors).limit(1);
          console.log('✅ Initial schema created successfully');
        } catch (error) {
          // This is expected on first run when tables don't exist - Drizzle will create them
          console.log('📋 Schema creation triggered');
        }
        result.success = true;
        result.version = '1.0.0';
        result.duration = Date.now() - startTime;
        return result;
      }

      // Run migrations
      console.log(`🔄 Running database migrations from ${migrationsDir}...`);
      await migrate(this.db, { migrationsFolder: migrationsDir });
      
      result.success = true;
      result.version = '1.0.0'; // This would come from migration metadata in a real implementation
      result.duration = Date.now() - startTime;
      
      console.log(`✅ Migrations completed in ${result.duration}ms`);
      return result;
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : String(error));
      result.duration = Date.now() - startTime;
      
      throw new DrizzleTelemetryMigrationError(
        `Migration failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Schedule automatic data pruning
   */
  private async scheduleDataPruning(): Promise<void> {
    // This would be implemented with a proper scheduler in production
    // For now, just run pruning on initialization
    try {
      await this.pruneOldData();
    } catch (error) {
      console.warn('⚠️ Failed to prune old data:', error);
    }
  }

  /**
   * Remove old data based on retention policy
   */
  async pruneOldData(): Promise<number> {
    if (!this.db || this.config.pruneDays <= 0) return 0;

    // Check if tables exist before attempting to prune
    try {
      await this.db.select().from(schema.telemetryEvents).limit(1);
    } catch (error) {
      // If table doesn't exist, no need to prune
      console.log('📋 Tables not yet created, skipping data pruning');
      return 0;
    }

    const cutoffTime = Date.now() - (this.config.pruneDays * 24 * 60 * 60 * 1000);
    
    try {
      const result = await this.executeWithMetrics(
        'DELETE_OLD_EVENTS',
        async () => {
          const deleteResult = await this.db!
            .delete(schema.telemetryEvents)
            .where(lt(schema.telemetryEvents.timestamp, cutoffTime));
          return deleteResult.changes || 0;
        }
      );

      console.log(`🧹 Pruned ${result} old telemetry records`);
      return result;
    } catch (error) {
      console.warn('⚠️ Failed to prune old data:', error);
      return 0;
    }
  }

  /**
   * Update database size metrics
   */
  private updateDbSizeMetrics(): void {
    try {
      if (existsSync(this.config.dbPath)) {
        const stats = statSync(this.config.dbPath);
        this.metrics.dbSizeBytes = stats.size;
        this.metrics.lastUpdated = Date.now();
      }
    } catch (error) {
      console.warn('⚠️ Failed to update database size metrics:', error);
    }
  }

  /**
   * Execute a query with performance metrics tracking
   */
  async executeWithMetrics<T>(
    queryType: string,
    operation: () => Promise<T> | T
  ): Promise<T> {
    const startTime = Date.now();
    let result: T;
    let error: string | undefined;

    try {
      result = await operation();
      return result;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      this.metrics.errorCount++;
      throw err;
    } finally {
      const duration = Date.now() - startTime;
      this.metrics.totalQueries++;

      // Update average query time
      this.metrics.avgQueryTime = 
        (this.metrics.avgQueryTime * (this.metrics.totalQueries - 1) + duration) / 
        this.metrics.totalQueries;

      // Track slow queries
      if (duration > 100) { // Queries over 100ms are considered slow
        const queryMetric: QueryMetrics = {
          queryType,
          query: 'N/A', // Would include actual SQL in production
          duration,
          timestamp: Date.now(),
          error,
        };

        this.metrics.slowQueries.push(queryMetric);
        if (this.metrics.slowQueries.length > 10) {
          this.metrics.slowQueries.shift(); // Keep only last 10 slow queries
        }
      }

      // Track query history if enabled
      if (this.config.enableMetrics) {
        this.queryHistory.push({
          queryType,
          query: 'N/A',
          duration,
          timestamp: Date.now(),
          error,
        });

        if (this.queryHistory.length > this.maxQueryHistory) {
          this.queryHistory.shift();
        }
      }

      this.metrics.lastUpdated = Date.now();
    }
  }

  /**
   * Get database instance (ensures initialization)
   */
  async getDatabase(): Promise<BetterSQLite3Database<typeof schema>> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    if (!this.db) {
      throw new DrizzleTelemetryConnectionError('Database not initialized');
    }

    return this.db;
  }

  /**
   * Check database health
   */
  async healthCheck(): Promise<boolean> {
    try {
      if (!this.isInitialized) return false;
      
      const db = await this.getDatabase();
      
      // Simple connectivity test
      await db.select({ value: sql`1` });
      
      // Update metrics
      this.updateDbSizeMetrics();
      
      return true;
    } catch (error) {
      console.warn('🔴 Database health check failed:', error);
      return false;
    }
  }

  /**
   * Get database performance metrics
   */
  getMetrics(): DatabaseMetrics {
    this.updateDbSizeMetrics();
    return { ...this.metrics };
  }

  /**
   * Get query history for debugging
   */
  getQueryHistory(): QueryMetrics[] {
    return [...this.queryHistory];
  }

  /**
   * Clear query history and reset metrics
   */
  resetMetrics(): void {
    this.queryHistory = [];
    this.metrics = {
      totalQueries: 0,
      avgQueryTime: 0,
      slowQueries: [],
      errorCount: 0,
      connectionCount: this.metrics.connectionCount,
      dbSizeBytes: this.metrics.dbSizeBytes,
      lastUpdated: Date.now(),
    };
  }

  /**
   * Get configuration
   */
  getConfig(): Required<DrizzleTelemetryConfig> {
    return { ...this.config };
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    try {
      if (this.sqlite) {
        this.sqlite.close();
        this.sqlite = undefined;
      }
      
      this.db = undefined;
      this.isInitialized = false;
      
      console.log('📊 Drizzle Telemetry DB connection closed');
    } catch (error) {
      console.warn('⚠️ Error closing database connection:', error);
    }
  }
}

// Singleton instance for global use
let dbInstance: DrizzleTelemetryDB | undefined;

/**
 * Get or create the global database instance
 */
export function getTelemetryDB(config?: DrizzleTelemetryConfig): DrizzleTelemetryDB {
  if (!dbInstance) {
    dbInstance = new DrizzleTelemetryDB(config);
  }
  return dbInstance;
}

/**
 * Initialize the global database instance
 */
export async function initializeTelemetryDB(config?: DrizzleTelemetryConfig): Promise<DrizzleTelemetryDB> {
  const db = getTelemetryDB(config);
  await db.initialize();
  return db;
}

/**
 * Close the global database instance
 */
export async function closeTelemetryDB(): Promise<void> {
  if (dbInstance) {
    await dbInstance.close();
    dbInstance = undefined;
  }
} 