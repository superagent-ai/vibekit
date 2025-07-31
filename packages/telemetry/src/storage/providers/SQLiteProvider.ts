import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq, and, gte, lte, desc } from 'drizzle-orm';
import { StorageProvider } from '../StorageProvider.js';
import type { TelemetryEvent, QueryFilter, StorageStats } from '../../core/types.js';
import { telemetryEvents } from '../schema/telemetry.js';

export interface SQLiteConfig {
  path?: string;
  streamBatchSize?: number;
  streamFlushInterval?: number;
  streamBuffering?: boolean;
}

interface StreamBuffer {
  events: TelemetryEvent[];
  lastFlush: number;
}

export class SQLiteProvider extends StorageProvider {
  readonly name = 'sqlite';
  readonly supportsQuery = true;
  readonly supportsBatch = true;
  
  private db: ReturnType<typeof drizzle>;
  private sqlite: Database.Database;
  private config: SQLiteConfig;
  private streamBuffer: Map<string, StreamBuffer> = new Map();
  private flushInterval?: NodeJS.Timeout;
  
  constructor(config: SQLiteConfig = {}) {
    super();
    this.config = {
      path: '.vibekit/telemetry.db',
      streamBatchSize: 100,
      streamFlushInterval: 5000,
      streamBuffering: true,
      ...config,
    };
  }
  
  async initialize(): Promise<void> {
    // Ensure directory exists
    const path = this.config.path!;
    const dir = path.substring(0, path.lastIndexOf('/'));
    if (dir) {
      const fs = await import('fs');
      await fs.promises.mkdir(dir, { recursive: true });
    }
    
    // Create database connection
    this.sqlite = new Database(path);
    this.db = drizzle(this.sqlite);
    
    // Run migrations
    await this.runMigrations();
    
    // Setup indexes
    await this.createIndexes();
    
    // Start buffer flush interval
    if (this.config.streamBuffering) {
      this.startBufferFlush();
    }
  }
  
  private async runMigrations(): Promise<void> {
    // Create tables if they don't exist
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS telemetry_events (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        category TEXT NOT NULL,
        action TEXT NOT NULL,
        label TEXT,
        value REAL,
        timestamp INTEGER NOT NULL,
        duration INTEGER,
        metadata TEXT,
        context TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      );
    `);
    
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS telemetry_sessions (
        id TEXT PRIMARY KEY,
        start_time INTEGER NOT NULL,
        end_time INTEGER,
        status TEXT NOT NULL,
        event_count INTEGER DEFAULT 0,
        error_count INTEGER DEFAULT 0,
        metadata TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      );
    `);
  }
  
  private async createIndexes(): Promise<void> {
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_session_id ON telemetry_events(session_id);',
      'CREATE INDEX IF NOT EXISTS idx_timestamp ON telemetry_events(timestamp);',
      'CREATE INDEX IF NOT EXISTS idx_category ON telemetry_events(category);',
      'CREATE INDEX IF NOT EXISTS idx_event_type ON telemetry_events(event_type);',
      'CREATE INDEX IF NOT EXISTS idx_category_action ON telemetry_events(category, action);',
    ];
    
    for (const index of indexes) {
      this.sqlite.exec(index);
    }
  }
  
  private startBufferFlush(): void {
    this.flushInterval = setInterval(() => {
      this.flushAllBuffers().catch(console.error);
    }, this.config.streamFlushInterval!);
  }
  
  async store(event: TelemetryEvent): Promise<void> {
    // Handle stream events with buffering
    if (event.eventType === 'stream' && this.config.streamBuffering) {
      return this.bufferStreamEvent(event);
    }
    
    // Store directly for other event types
    const eventData = {
      id: event.id!,
      sessionId: event.sessionId,
      eventType: event.eventType,
      category: event.category,
      action: event.action,
      label: event.label,
      value: event.value,
      timestamp: event.timestamp,
      duration: event.duration,
      metadata: event.metadata ? JSON.stringify(event.metadata) : null,
      context: event.context ? JSON.stringify(event.context) : null,
    };
    
    await this.db.insert(telemetryEvents).values(eventData);
  }
  
  async storeBatch(events: TelemetryEvent[]): Promise<void> {
    const transaction = this.sqlite.transaction((events: TelemetryEvent[]) => {
      for (const event of events) {
        const eventData = {
          id: event.id!,
          sessionId: event.sessionId,
          eventType: event.eventType,
          category: event.category,
          action: event.action,
          label: event.label,
          value: event.value,
          timestamp: event.timestamp,
          duration: event.duration,
          metadata: event.metadata ? JSON.stringify(event.metadata) : null,
          context: event.context ? JSON.stringify(event.context) : null,
        };
        
        this.db.insert(telemetryEvents).values(eventData).run();
      }
    });
    
    transaction(events);
  }
  
  async query(filter: QueryFilter): Promise<TelemetryEvent[]> {
    let query = this.db.select().from(telemetryEvents);
    
    const conditions = [];
    
    if (filter.sessionId) {
      conditions.push(eq(telemetryEvents.sessionId, filter.sessionId));
    }
    if (filter.category) {
      conditions.push(eq(telemetryEvents.category, filter.category));
    }
    if (filter.action) {
      conditions.push(eq(telemetryEvents.action, filter.action));
    }
    if (filter.eventType) {
      conditions.push(eq(telemetryEvents.eventType, filter.eventType));
    }
    if (filter.timeRange) {
      conditions.push(
        and(
          gte(telemetryEvents.timestamp, filter.timeRange.start),
          lte(telemetryEvents.timestamp, filter.timeRange.end)
        )
      );
    }
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }
    
    // Apply sorting and pagination
    query = query.orderBy(desc(telemetryEvents.timestamp));
    
    if (filter.limit) {
      query = query.limit(filter.limit);
    }
    if (filter.offset) {
      query = query.offset(filter.offset);
    }
    
    const results = await query;
    
    return results.map(row => ({
      id: row.id,
      sessionId: row.sessionId,
      eventType: row.eventType as any,
      category: row.category,
      action: row.action,
      label: row.label || undefined,
      value: row.value || undefined,
      timestamp: row.timestamp,
      duration: row.duration || undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      context: row.context ? JSON.parse(row.context) : undefined,
    }));
  }
  
  async getStats(): Promise<StorageStats> {
    const countResult = await this.db
      .select({ count: 'count(*)' })
      .from(telemetryEvents);
    
    const lastEventResult = await this.db
      .select({ timestamp: telemetryEvents.timestamp })
      .from(telemetryEvents)
      .orderBy(desc(telemetryEvents.timestamp))
      .limit(1);
    
    // Get database file size
    let diskUsage = 0;
    try {
      const fs = await import('fs');
      const stats = await fs.promises.stat(this.config.path!);
      diskUsage = stats.size;
    } catch {
      // Ignore errors
    }
    
    return {
      totalEvents: parseInt(countResult[0]?.count as string) || 0,
      diskUsage,
      lastEvent: lastEventResult[0]?.timestamp || 0,
    };
  }
  
  private async bufferStreamEvent(event: TelemetryEvent): Promise<void> {
    const buffer = this.streamBuffer.get(event.sessionId) || {
      events: [],
      lastFlush: Date.now(),
    };
    
    buffer.events.push(event);
    
    // Flush if buffer is full or time elapsed
    if (
      buffer.events.length >= this.config.streamBatchSize! ||
      Date.now() - buffer.lastFlush > this.config.streamFlushInterval!
    ) {
      await this.flushBuffer(event.sessionId);
    } else {
      this.streamBuffer.set(event.sessionId, buffer);
    }
  }
  
  private async flushBuffer(sessionId: string): Promise<void> {
    const buffer = this.streamBuffer.get(sessionId);
    if (!buffer || buffer.events.length === 0) return;
    
    try {
      await this.storeBatch(buffer.events);
      this.streamBuffer.delete(sessionId);
    } catch (error) {
      // Keep events in buffer for retry
      console.error('Failed to flush buffer for session', sessionId, error);
    }
  }
  
  private async flushAllBuffers(): Promise<void> {
    const promises = Array.from(this.streamBuffer.keys()).map(sessionId =>
      this.flushBuffer(sessionId)
    );
    await Promise.all(promises);
  }
  
  async flush(): Promise<void> {
    if (this.config.streamBuffering) {
      await this.flushAllBuffers();
    }
  }
  
  async clean(before: Date): Promise<number> {
    const result = this.sqlite
      .prepare('DELETE FROM telemetry_events WHERE timestamp < ?')
      .run(before.getTime());
    
    return result.changes;
  }
  
  async shutdown(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    
    await this.flush();
    
    if (this.sqlite) {
      this.sqlite.close();
    }
  }
}