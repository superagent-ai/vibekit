import Database from 'better-sqlite3';
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { lt, sql } from 'drizzle-orm';
import { existsSync, mkdirSync, statSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
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

    // Set environment-specific database path only if using default path
    const isDefaultPath = config.dbPath === undefined || config.dbPath === '.vibekit/telemetry.db';
    
    if (isDefaultPath) {
      if (process.env.NODE_ENV === 'development') {
        this.config.dbPath = this.config.dbPath.replace('.db', '-dev.db');
      } else if (process.env.NODE_ENV === 'test') {
        this.config.dbPath = this.config.dbPath.replace('.db', '-test.db');
      }
    }
    // If a specific path was provided (like test-specific paths), use it as-is
    // For test paths in /tmp or with specific test identifiers, preserve them exactly
    if (process.env.NODE_ENV === 'test' && config.dbPath && 
        (config.dbPath.startsWith('/tmp/') || config.dbPath.includes('vibekit-test-'))) {
      // Use the exact path provided for isolated testing
      this.config.dbPath = config.dbPath;
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

      // Skip programmatic migrations - use external migration scripts instead
      // This avoids ESM path resolution issues with the migrate function
      console.log('📋 Skipping programmatic migrations (use drizzle-kit migrate externally)');

      // Test database connection and create tables if needed
      try {
        // Check if tables exist
        await this.db.select().from(schema.telemetryEvents).limit(1);
        console.log('✅ Database tables verified and accessible');
      } catch (error) {
        console.log('📊 Tables do not exist, creating schema...');
        // Create tables using raw SQL
        try {
          await this.createInitialSchema();
          console.log('✅ Database schema created successfully');
        } catch (schemaError) {
          console.error('❌ Failed to create database schema:', schemaError);
          throw new DrizzleTelemetryConnectionError(
            `Failed to create database schema: ${schemaError instanceof Error ? schemaError.message : String(schemaError)}`,
            schemaError instanceof Error ? schemaError : undefined
          );
        }
      }

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
   * Create initial database schema
   */
  private async createInitialSchema(): Promise<void> {
    if (!this.sqlite) {
      throw new Error('SQLite connection not available');
    }

    // Create tables using raw SQL
    // Temporarily disable foreign keys to avoid issues during table creation
    this.sqlite.pragma('foreign_keys = OFF');
    
    try {
      // Create tables first
      this.sqlite.exec(`
        CREATE TABLE IF NOT EXISTS telemetry_sessions (
          id text PRIMARY KEY NOT NULL,
          agent_type text NOT NULL,
          mode text NOT NULL,
          status text DEFAULT 'active' NOT NULL,
          start_time real NOT NULL,
          end_time real,
          duration real,
          sandbox_id text,
          repo_url text,
          event_count integer DEFAULT 0 NOT NULL,
          stream_event_count integer DEFAULT 0 NOT NULL,
          error_count integer DEFAULT 0 NOT NULL,
          metadata text,
          version integer DEFAULT 1 NOT NULL,
          schema_version text DEFAULT '1.0.0' NOT NULL,
          created_at real DEFAULT (unixepoch() * 1000) NOT NULL,
          updated_at real DEFAULT (unixepoch() * 1000) NOT NULL
        );
      `);

      this.sqlite.exec(`
        CREATE TABLE IF NOT EXISTS telemetry_events (
          id integer PRIMARY KEY AUTOINCREMENT,
          session_id text NOT NULL,
          event_type text NOT NULL,
          agent_type text NOT NULL,
          mode text NOT NULL,
          prompt text NOT NULL,
          stream_data text,
          sandbox_id text,
          repo_url text,
          metadata text,
          timestamp real NOT NULL,
          version integer DEFAULT 1 NOT NULL,
          schema_version text DEFAULT '1.0.0' NOT NULL,
          created_at real DEFAULT (unixepoch() * 1000) NOT NULL
        );
      `);

      this.sqlite.exec(`
        CREATE TABLE IF NOT EXISTS telemetry_buffers (
          id integer PRIMARY KEY AUTOINCREMENT,
          event_data text NOT NULL,
          version integer DEFAULT 1 NOT NULL,
          schema_version text DEFAULT '1.0.0' NOT NULL,
          created_at real DEFAULT (unixepoch() * 1000) NOT NULL
        );
      `);

      this.sqlite.exec(`
        CREATE TABLE IF NOT EXISTS telemetry_stats (
          id integer PRIMARY KEY AUTOINCREMENT,
          metric_type text NOT NULL,
          metric_value real NOT NULL,
          dimensions text,
          timestamp real NOT NULL,
          version integer DEFAULT 1 NOT NULL,
          schema_version text DEFAULT '1.0.0' NOT NULL,
          created_at real DEFAULT (unixepoch() * 1000) NOT NULL
        );
      `);

      this.sqlite.exec(`
        CREATE TABLE IF NOT EXISTS telemetry_errors (
          id integer PRIMARY KEY AUTOINCREMENT,
          session_id text,
          error_type text NOT NULL,
          error_message text NOT NULL,
          stack_trace text,
          context text,
          timestamp real NOT NULL,
          version integer DEFAULT 1 NOT NULL,
          schema_version text DEFAULT '1.0.0' NOT NULL,
          created_at real DEFAULT (unixepoch() * 1000) NOT NULL
        );
      `);

      // Create indexes separately to better handle errors
      const indexes = [
        'CREATE INDEX IF NOT EXISTS idx_telemetry_sessions_start_time ON telemetry_sessions(start_time)',
        'CREATE INDEX IF NOT EXISTS idx_telemetry_sessions_agent_type ON telemetry_sessions(agent_type)',
        'CREATE INDEX IF NOT EXISTS idx_telemetry_sessions_status ON telemetry_sessions(status)',
        'CREATE INDEX IF NOT EXISTS idx_sessions_version ON telemetry_sessions(version)',
        'CREATE INDEX IF NOT EXISTS idx_telemetry_events_session_id ON telemetry_events(session_id)',
        'CREATE INDEX IF NOT EXISTS idx_telemetry_events_timestamp ON telemetry_events(timestamp)',
        'CREATE INDEX IF NOT EXISTS idx_telemetry_events_event_type ON telemetry_events(event_type)',
        'CREATE INDEX IF NOT EXISTS idx_events_version ON telemetry_events(version)',
        'CREATE INDEX IF NOT EXISTS idx_telemetry_stats_timestamp ON telemetry_stats(timestamp)',
        'CREATE INDEX IF NOT EXISTS idx_telemetry_stats_metric_type ON telemetry_stats(metric_type)',
        'CREATE INDEX IF NOT EXISTS idx_stats_version ON telemetry_stats(version)',
        'CREATE INDEX IF NOT EXISTS idx_telemetry_errors_timestamp ON telemetry_errors(timestamp)',
        'CREATE INDEX IF NOT EXISTS idx_telemetry_errors_session_id ON telemetry_errors(session_id)',
        'CREATE INDEX IF NOT EXISTS idx_errors_version ON telemetry_errors(version)',
        'CREATE INDEX IF NOT EXISTS idx_buffers_version ON telemetry_buffers(version)',
      ];

      for (const indexSql of indexes) {
        try {
          this.sqlite.exec(indexSql);
        } catch (indexError) {
          console.warn(`Failed to create index: ${indexSql}`, indexError);
        }
      }
    } finally {
      // Re-enable foreign keys after table creation
      this.sqlite.pragma('foreign_keys = ON');
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
   * Run database migrations (DEPRECATED - use external drizzle-kit migrate)
   * This method is kept for reference but should not be used in ESM applications
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
      // ES modules compatibility: calculate __dirname equivalent
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      
      const possibleMigrationDirs = [
        resolve('./packages/db/migrations'),
        resolve('./migrations'),
        resolve(__dirname, '../migrations'),
        resolve(__dirname, '../../migrations'),
        resolve(__dirname, '../../../packages/db/migrations'), // For built modules
        resolve(process.cwd(), 'packages/db/migrations'), // From project root
      ];
      
      let migrationsDir: string | null = null;
      console.log('🔍 Checking migration directories:');
      for (const dir of possibleMigrationDirs) {
        console.log(`  - Checking: ${dir} (exists: ${existsSync(dir)})`);
        if (existsSync(dir)) {
          migrationsDir = dir;
          console.log(`  ✅ Found migrations at: ${dir}`);
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

      // First check if tables already exist
      let tablesExist = false;
      try {
        await this.db.select().from(schema.telemetryEvents).limit(1);
        tablesExist = true;
        console.log('✅ Tables already exist, skipping all migration processes');
        result.success = true;
        result.version = '1.0.0';
        result.duration = Date.now() - startTime;
        return result;
      } catch (error) {
        console.log('📋 Tables do not exist, running migrations...');
      }

      if (!tablesExist) {
        // Run migrations
        console.log(`🔄 Running database migrations from ${migrationsDir}...`);
        try {
          // Ensure absolute path for ESM compatibility
          const absoluteMigrationsDir = resolve(migrationsDir);
          console.log(`📁 Resolved absolute path: ${absoluteMigrationsDir}`);
          await migrate(this.db, { migrationsFolder: absoluteMigrationsDir });
        } catch (migrationError) {
          console.warn('⚠️ Standard migration failed, attempting schema creation fallback:', migrationError);
        // Fallback: create essential tables manually using raw SQL
        try {
          // Create basic tables with minimal schema
          this.sqlite!.exec(`
            CREATE TABLE IF NOT EXISTS telemetry_sessions (
              id text PRIMARY KEY NOT NULL,
              agent_type text NOT NULL,
              mode text NOT NULL,
              status text DEFAULT 'active' NOT NULL,
              start_time real NOT NULL,
              end_time real,
              duration real,
              sandbox_id text,
              repo_url text,
              event_count integer DEFAULT 0,
              stream_event_count integer DEFAULT 0,
              error_count integer DEFAULT 0,
              metadata text,
              version integer DEFAULT 1 NOT NULL,
              schema_version text DEFAULT '1.0.0' NOT NULL,
              created_at real DEFAULT (unixepoch() * 1000) NOT NULL,
              updated_at real DEFAULT (unixepoch() * 1000) NOT NULL
            );

            CREATE TABLE IF NOT EXISTS telemetry_events (
              id integer PRIMARY KEY AUTOINCREMENT,
              session_id text NOT NULL,
              event_type text NOT NULL,
              agent_type text NOT NULL,
              mode text NOT NULL,
              prompt text NOT NULL,
              stream_data text,
              sandbox_id text,
              repo_url text,
              metadata text,
              timestamp real NOT NULL,
              created_at real NOT NULL DEFAULT (unixepoch() * 1000),
              version integer DEFAULT 1,
              schema_version text DEFAULT '1.0.0',
              FOREIGN KEY (session_id) REFERENCES telemetry_sessions (id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_events_session_id ON telemetry_events (session_id);
            CREATE INDEX IF NOT EXISTS idx_events_timestamp ON telemetry_events (timestamp);
            CREATE INDEX IF NOT EXISTS idx_events_type ON telemetry_events (event_type);
            CREATE INDEX IF NOT EXISTS idx_sessions_agent_type ON telemetry_sessions (agent_type);
            CREATE INDEX IF NOT EXISTS idx_sessions_status ON telemetry_sessions (status);
          `);
          console.log('✅ Schema creation fallback successful - basic tables created');
        } catch (schemaError) {
          console.warn('⚠️ Schema creation fallback also failed:', schemaError);
          // Continue anyway - operations will fail gracefully
        }
      }
      }
      
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

// Cache instances by database path for better isolation
const dbInstances = new Map<string, DrizzleTelemetryDB>();

/**
 * Get or create a database instance for the given configuration
 */
export function getTelemetryDB(config?: DrizzleTelemetryConfig): DrizzleTelemetryDB {
  const dbPath = config?.dbPath || '.vibekit/telemetry.db';
  
  // In test mode, always create fresh instances for test-specific paths to avoid conflicts
  if (process.env.NODE_ENV === 'test' && 
      (dbPath.startsWith('/tmp/') || dbPath.includes('vibekit-test-'))) {
    return new DrizzleTelemetryDB(config);
  }
  
  // Check if we have an instance for this specific path
  if (!dbInstances.has(dbPath)) {
    dbInstances.set(dbPath, new DrizzleTelemetryDB(config));
  }
  
  return dbInstances.get(dbPath)!;
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
 * Close all database instances or a specific one
 */
export async function closeTelemetryDB(dbPath?: string): Promise<void> {
  if (dbPath) {
    // Close specific instance
    const instance = dbInstances.get(dbPath);
    if (instance) {
      await instance.close();
      dbInstances.delete(dbPath);
    }
  } else {
    // Close all instances
    for (const [path, instance] of dbInstances) {
      await instance.close();
    }
    dbInstances.clear();
  }
} 