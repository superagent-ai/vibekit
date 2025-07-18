import Database, { Statement } from "better-sqlite3";
import { readdir, stat, mkdir } from "fs/promises";
import { dirname, resolve } from "path";
import { existsSync } from "fs";
import {
  LocalStoreConfig,
  TelemetryRecord,
  TelemetryQueryFilter,
  TelemetryStats,
  TelemetryDBError,
  TelemetryDBInitError,
  TelemetryDBQueryError,
} from "../types/telemetry-storage";

const DB_SCHEMA = `
  CREATE TABLE IF NOT EXISTS telemetry (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sessionId TEXT NOT NULL,
    eventType TEXT NOT NULL CHECK (eventType IN ('start', 'stream', 'end', 'error')),
    agentType TEXT NOT NULL,
    mode TEXT NOT NULL,
    prompt TEXT NOT NULL,
    streamData TEXT,
    sandboxId TEXT,
    repoUrl TEXT,
    metadata TEXT,
    timestamp INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_timestamp ON telemetry(timestamp);
  CREATE INDEX IF NOT EXISTS idx_session ON telemetry(sessionId);
  CREATE INDEX IF NOT EXISTS idx_event_type ON telemetry(eventType);
  CREATE INDEX IF NOT EXISTS idx_agent_type ON telemetry(agentType);
`;

export class TelemetryDB {
  private config: LocalStoreConfig;
  private db?: Database.Database;
  private insertStatement?: Statement;
  private isInitialized = false;
  private readonly maxRetries = 3;
  private readonly retryDelay = 100; // ms

  constructor(config: LocalStoreConfig) {
    this.config = {
      path: ".vibekit/telemetry.db",
      streamBatchSize: 50,
      streamFlushIntervalMs: 1000,
      ...config,
    };
  }

  /**
   * Lazy initialization of the database connection and schema
   */
  private async ensureDatabase(): Promise<void> {
    if (this.isInitialized) return;

    try {
      const dbPath = resolve(this.config.path!);
      const dbDir = dirname(dbPath);

      // Ensure directory exists
      if (!existsSync(dbDir)) {
        await mkdir(dbDir, { recursive: true });
      }

      // Initialize database
      this.db = new Database(dbPath);
      
      // Enable WAL mode for better performance with concurrent access
      this.db.pragma("journal_mode = WAL");
      this.db.pragma("synchronous = NORMAL");
      this.db.pragma("cache_size = 1000");
      
      // Create schema
      this.db.exec(DB_SCHEMA);
      
      // Prepare statements
      this.prepareStatements();
      
      // Prune old records if configured
      if (this.config.pruneDays) {
        await this.pruneOldRecords();
      }
      
      this.isInitialized = true;
    } catch (error) {
      throw new TelemetryDBInitError(
        `Failed to initialize telemetry database: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Prepare frequently used SQL statements for better performance
   */
  private prepareStatements(): void {
    if (!this.db) throw new TelemetryDBError("Database not initialized");

    this.insertStatement = this.db.prepare(`
      INSERT INTO telemetry (
        sessionId, eventType, agentType, mode, prompt,
        streamData, sandboxId, repoUrl, metadata, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
  }

  /**
   * Delete records older than configured retention period
   */
  private async pruneOldRecords(): Promise<void> {
    if (!this.db || !this.config.pruneDays) return;

    const cutoffTime = Date.now() - (this.config.pruneDays * 24 * 60 * 60 * 1000);
    
    try {
      const result = this.db.prepare("DELETE FROM telemetry WHERE timestamp < ?").run(cutoffTime);
      if (result.changes > 0) {
        console.log(`Pruned ${result.changes} old telemetry records`);
      }
    } catch (error) {
      console.warn("Failed to prune old telemetry records:", error);
    }
  }

  /**
   * Safely serialize metadata to JSON string
   */
  private serializeMetadata(metadata?: Record<string, any>): string | null {
    if (!metadata || Object.keys(metadata).length === 0) return null;
    
    try {
      return JSON.stringify(metadata);
    } catch (error) {
      console.warn("Failed to serialize telemetry metadata:", error);
      return null;
    }
  }

  /**
   * Safely serialize any value to string format for database storage
   */
  private serializeValue(value: any): string | null {
    if (value === null || value === undefined) return null;
    
    // If it's already a string, return it
    if (typeof value === 'string') return value;
    
    // For objects, arrays, or other complex types, serialize to JSON
    try {
      return JSON.stringify(value);
    } catch (error) {
      console.warn("Failed to serialize telemetry value:", error);
      return String(value); // Fallback to string conversion
    }
  }

  /**
   * Safely deserialize metadata from JSON string
   */
  private deserializeMetadata(metadata: string | null): Record<string, any> | undefined {
    if (!metadata) return undefined;
    
    try {
      return JSON.parse(metadata);
    } catch (error) {
      console.warn("Failed to deserialize telemetry metadata:", error);
      return undefined;
    }
  }

  /**
   * Execute operation with retry logic for transient failures
   */
  private async withRetry<T>(operation: () => T): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Check if error is retryable (SQLITE_BUSY, SQLITE_LOCKED)
        const isRetryable = lastError.message.includes('SQLITE_BUSY') || 
                           lastError.message.includes('SQLITE_LOCKED');
        
        if (!isRetryable || attempt === this.maxRetries) {
          throw lastError;
        }
        
        // Wait before retry with exponential backoff
        await new Promise(resolve => setTimeout(resolve, this.retryDelay * attempt));
      }
    }
    
    throw lastError!;
  }

  /**
   * Insert a single telemetry event
   */
  async insertEvent(record: Omit<TelemetryRecord, 'id'>): Promise<void> {
    await this.ensureDatabase();
    
    if (!this.db || !this.insertStatement) {
      throw new TelemetryDBError("Database not properly initialized");
    }

    try {
      await this.withRetry(() => {
        // Ensure all values are properly serialized
        const values = [
          record.sessionId,
          record.eventType,
          record.agentType,
          record.mode,
          this.serializeValue(record.prompt),
          this.serializeValue(record.streamData),
          record.sandboxId || null,
          record.repoUrl || null,
          this.serializeMetadata(record.metadata),
          record.timestamp
        ];
        

        this.insertStatement!.run(...values);
      });
    } catch (error) {
      throw new TelemetryDBError(
        `Failed to insert telemetry event: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Insert multiple telemetry events in a transaction
   */
  async insertBatch(records: Array<Omit<TelemetryRecord, 'id'>>): Promise<void> {
    if (records.length === 0) return;
    
    await this.ensureDatabase();
    
    if (!this.db || !this.insertStatement) {
      throw new TelemetryDBError("Database not properly initialized");
    }

    try {
      await this.withRetry(() => {
        const transaction = this.db!.transaction((records: Array<Omit<TelemetryRecord, 'id'>>) => {
          for (const record of records) {
            // Ensure all values are properly serialized
            const values = [
              record.sessionId,
              record.eventType,
              record.agentType,
              record.mode,
              this.serializeValue(record.prompt),
              this.serializeValue(record.streamData),
              record.sandboxId || null,
              record.repoUrl || null,
              this.serializeMetadata(record.metadata),
              record.timestamp
            ];
            
            this.insertStatement!.run(...values);
          }
        });
        
        transaction(records);
      });
    } catch (error) {
      throw new TelemetryDBError(
        `Failed to insert telemetry batch: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Query telemetry events with optional filters
   */
  async getEvents(filter: TelemetryQueryFilter = {}): Promise<TelemetryRecord[]> {
    await this.ensureDatabase();
    
    if (!this.db) {
      throw new TelemetryDBError("Database not initialized");
    }

    try {
      let query = "SELECT * FROM telemetry WHERE 1=1";
      const params: any[] = [];

      // Build WHERE clause
      if (filter.from !== undefined) {
        query += " AND timestamp >= ?";
        params.push(filter.from);
      }
      
      if (filter.to !== undefined) {
        query += " AND timestamp <= ?";
        params.push(filter.to);
      }
      
      if (filter.sessionId) {
        query += " AND sessionId = ?";
        params.push(filter.sessionId);
      }
      
      if (filter.eventType) {
        query += " AND eventType = ?";
        params.push(filter.eventType);
      }
      
      if (filter.agentType) {
        query += " AND agentType = ?";
        params.push(filter.agentType);
      }
      
      if (filter.mode) {
        query += " AND mode = ?";
        params.push(filter.mode);
      }

      // Add ordering
      const orderBy = filter.orderBy === "timestamp_asc" ? "timestamp ASC" : "timestamp DESC";
      query += ` ORDER BY ${orderBy}`;

      // Add pagination
      if (filter.limit !== undefined) {
        query += " LIMIT ?";
        params.push(filter.limit);
        
        if (filter.offset !== undefined) {
          query += " OFFSET ?";
          params.push(filter.offset);
        }
      }

      const rows = this.db.prepare(query).all(...params) as any[];
      
      return rows.map(row => ({
        id: row.id,
        sessionId: row.sessionId,
        eventType: row.eventType,
        agentType: row.agentType,
        mode: row.mode,
        prompt: row.prompt,
        streamData: row.streamData || undefined,
        sandboxId: row.sandboxId || undefined,
        repoUrl: row.repoUrl || undefined,
        metadata: this.deserializeMetadata(row.metadata),
        timestamp: row.timestamp,
      }));
    } catch (error) {
      throw new TelemetryDBQueryError(
        `Failed to query telemetry events: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Get database statistics
   */
  async getStats(): Promise<TelemetryStats> {
    await this.ensureDatabase();
    
    if (!this.db) {
      throw new TelemetryDBError("Database not initialized");
    }

    try {
      // Total events
      const totalResult = this.db.prepare("SELECT COUNT(*) as count FROM telemetry").get() as { count: number };
      const totalEvents = totalResult.count;

      // Events by type
      const typeResults = this.db.prepare("SELECT eventType, COUNT(*) as count FROM telemetry GROUP BY eventType").all() as Array<{ eventType: string; count: number }>;
      const eventCounts = typeResults.reduce((acc, row) => {
        acc[row.eventType] = row.count;
        return acc;
      }, {} as Record<string, number>);

      // Events by agent type
      const agentResults = this.db.prepare("SELECT agentType, COUNT(*) as count FROM telemetry GROUP BY agentType").all() as Array<{ agentType: string; count: number }>;
      const agentCounts = agentResults.reduce((acc, row) => {
        acc[row.agentType] = row.count;
        return acc;
      }, {} as Record<string, number>);

      // Date range
      const rangeResult = this.db.prepare("SELECT MIN(timestamp) as earliest, MAX(timestamp) as latest FROM telemetry").get() as { earliest: number | null; latest: number | null };
      const dateRange = {
        earliest: rangeResult.earliest || 0,
        latest: rangeResult.latest || 0,
      };

      // Unique sessions
      const sessionResult = this.db.prepare("SELECT COUNT(DISTINCT sessionId) as count FROM telemetry").get() as { count: number };
      const uniqueSessions = sessionResult.count;

      // Database file size
      let dbSizeBytes = 0;
      try {
        const stats = await stat(resolve(this.config.path!));
        dbSizeBytes = stats.size;
      } catch (error) {
        // File might not exist yet, size remains 0
      }

      return {
        totalEvents,
        eventCounts,
        agentBreakdown: agentCounts,
        dateRange,
        dbSizeBytes,
        uniqueSessions,
      };
    } catch (error) {
      throw new TelemetryDBQueryError(
        `Failed to get telemetry stats: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Clear all telemetry data
   */
  async clear(): Promise<void> {
    await this.ensureDatabase();
    
    if (!this.db) {
      throw new TelemetryDBError("Database not initialized");
    }

    try {
      await this.withRetry(() => {
        this.db!.prepare("DELETE FROM telemetry").run();
        this.db!.prepare("VACUUM").run(); // Reclaim space
      });
    } catch (error) {
      throw new TelemetryDBError(
        `Failed to clear telemetry data: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Check if database connection is healthy
   */
  async healthCheck(): Promise<boolean> {
    try {
      // If explicitly closed, don't reinitialize
      if (!this.isInitialized && this.db === undefined) {
        return false;
      }
      
      await this.ensureDatabase();
      if (!this.db) return false;
      
      // Simple query to test connection
      this.db.prepare("SELECT 1").get();
      return true;
    } catch (error) {
      console.warn("Telemetry database health check failed:", error);
      return false;
    }
  }

  /**
   * Close database connection and cleanup resources
   */
  async close(): Promise<void> {
    try {
      // Clear statement reference (better-sqlite3 doesn't require explicit finalization)
      this.insertStatement = undefined;
      
      if (this.db) {
        this.db.close();
        this.db = undefined;
      }
      
      this.isInitialized = false;
    } catch (error) {
      console.warn("Error closing telemetry database:", error);
    }
  }
} 