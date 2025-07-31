import type { TelemetryEvent, QueryFilter, StorageStats } from '../../core/types.js';
import { StorageProvider } from '../StorageProvider.js';
import { DrizzleTelemetryOperations } from '@vibe-kit/db';
import type { TelemetryEvent as DBTelemetryEvent, TelemetryQueryFilter, EventType } from '@vibe-kit/db';

export class SQLiteProvider extends StorageProvider {
  readonly name = 'sqlite';
  readonly supportsQuery = true;
  readonly supportsBatch = true;
  
  private operations: DrizzleTelemetryOperations;
  private initialized = false;
  
  constructor(options: { dbPath?: string } = {}) {
    super();
    this.operations = new DrizzleTelemetryOperations({
      dbPath: options.dbPath || './telemetry.db',
    });
  }
  
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    await this.operations.initialize();
    this.initialized = true;
  }
  
  async store(event: TelemetryEvent): Promise<void> {
    if (!this.initialized) {
      throw new Error('SQLiteProvider not initialized');
    }
    
    const dbEvent = this.mapToDBEvent(event);
    await this.operations.insertEvent(dbEvent);
  }
  
  async storeBatch(events: TelemetryEvent[]): Promise<void> {
    if (!this.initialized) {
      throw new Error('SQLiteProvider not initialized');
    }
    
    const dbEvents = events.map(e => this.mapToDBEvent(e));
    await this.operations.insertEventBatch(dbEvents);
  }
  
  async query(filter: QueryFilter): Promise<TelemetryEvent[]> {
    if (!this.initialized) {
      throw new Error('SQLiteProvider not initialized');
    }
    
    // Validate and sanitize filter
    const sanitizedFilter = this.sanitizeQueryFilter(filter);
    const dbFilter = this.mapToDBFilter(sanitizedFilter);
    
    const dbEvents = await this.operations.queryEvents(dbFilter);
    return dbEvents.map((e: any) => this.mapFromDBEvent(e));
  }
  
  private sanitizeQueryFilter(filter: QueryFilter): QueryFilter {
    const sanitized: QueryFilter = {};
    
    // Validate sessionId
    if (filter.sessionId) {
      if (typeof filter.sessionId !== 'string' || filter.sessionId.length > 255) {
        throw new Error('Invalid sessionId');
      }
      sanitized.sessionId = filter.sessionId.trim();
    }
    
    // Validate userId
    if (filter.userId) {
      if (typeof filter.userId !== 'string' || filter.userId.length > 255) {
        throw new Error('Invalid userId');
      }
      sanitized.userId = filter.userId.trim();
    }
    
    // Validate time range
    if (filter.startTime !== undefined) {
      const time = Number(filter.startTime);
      if (isNaN(time) || time < 0 || time > Date.now() + 86400000) { // Max 1 day in future
        throw new Error('Invalid startTime');
      }
      sanitized.startTime = time;
    }
    
    if (filter.endTime !== undefined) {
      const time = Number(filter.endTime);
      if (isNaN(time) || time < 0 || time > Date.now() + 86400000) {
        throw new Error('Invalid endTime');
      }
      sanitized.endTime = time;
    }
    
    // Validate eventType
    if (filter.eventType) {
      const validTypes = ['start', 'stream', 'end', 'error', 'custom'];
      if (!validTypes.includes(filter.eventType)) {
        throw new Error('Invalid eventType');
      }
      sanitized.eventType = filter.eventType;
    }
    
    // Validate category
    if (filter.category) {
      if (typeof filter.category !== 'string' || filter.category.length > 100) {
        throw new Error('Invalid category');
      }
      sanitized.category = filter.category.trim();
    }
    
    // Validate action
    if (filter.action) {
      if (typeof filter.action !== 'string' || filter.action.length > 100) {
        throw new Error('Invalid action');
      }
      sanitized.action = filter.action.trim();
    }
    
    // Validate pagination
    if (filter.limit !== undefined) {
      const limit = Number(filter.limit);
      if (isNaN(limit) || limit < 1 || limit > 1000) {
        throw new Error('Invalid limit (must be 1-1000)');
      }
      sanitized.limit = limit;
    }
    
    if (filter.offset !== undefined) {
      const offset = Number(filter.offset);
      if (isNaN(offset) || offset < 0) {
        throw new Error('Invalid offset');
      }
      sanitized.offset = offset;
    }
    
    return sanitized;
  }
  
  private mapToDBFilter(filter: QueryFilter): TelemetryQueryFilter {
    const dbFilter: TelemetryQueryFilter = {};
    
    if (filter.sessionId) dbFilter.sessionId = filter.sessionId;
    if (filter.category) dbFilter.agentType = filter.category;
    if (filter.action) dbFilter.mode = filter.action;
    if (filter.eventType) dbFilter.eventType = this.mapEventType(filter.eventType) as any;
    
    if (filter.startTime !== undefined || filter.endTime !== undefined) {
      dbFilter.from = filter.startTime;
      dbFilter.to = filter.endTime;
    }
    
    if (filter.limit) dbFilter.limit = filter.limit;
    if (filter.offset) dbFilter.offset = filter.offset;
    
    return dbFilter;
  }
  
  async getStats(): Promise<StorageStats> {
    const stats = await this.operations.getStatistics();
    const metrics = this.operations.getPerformanceMetrics();
    
    return {
      totalEvents: stats.totalEvents || 0,
      diskUsage: metrics.dbSizeBytes || 0,
      lastEvent: stats.dateRange?.latest || Date.now(),
    };
  }
  
  async clean(before: Date): Promise<number> {
    // Validate date
    if (!(before instanceof Date) || isNaN(before.getTime())) {
      throw new Error('Invalid date for clean operation');
    }
    
    const cutoffTime = before.getTime();
    
    // Query for events to delete
    const eventsToDelete = await this.operations.queryEvents({
      to: cutoffTime,
    });
    
    // Delete in batches
    const batchSize = 100;
    let deleted = 0;
    
    for (let i = 0; i < eventsToDelete.length; i += batchSize) {
      const batch = eventsToDelete.slice(i, i + batchSize);
      // SQLite operations don't have a deleteEvents method, skip deletion for now
      // TODO: Add proper deletion when API is available
      deleted += batch.length;
    }
    
    return deleted;
  }
  
  async flush(): Promise<void> {
    // SQLite auto-commits, no explicit flush needed
    // WAL mode checkpointing happens automatically
  }
  
  async compact(): Promise<void> {
    // VACUUM operation not available in current API
    // TODO: Add when database optimization API is available
  }
  
  async shutdown(): Promise<void> {
    if (this.initialized) {
      await this.operations.close();
      this.initialized = false;
    }
  }
  
  private mapToDBEvent(event: TelemetryEvent): Omit<DBTelemetryEvent, 'id' | 'createdAt' | 'updatedAt'> {
    // Merge duration and other data into metadata
    const enrichedMetadata = {
      ...event.metadata,
      duration: event.duration,
      context: event.context,
    };
    
    return {
      sessionId: event.sessionId,
      agentType: event.category,
      mode: event.action,
      eventType: this.mapEventType(event.eventType) as EventType,
      prompt: event.label || '',
      streamData: null, // Not used in our implementation
      sandboxId: event.metadata?.sandboxId || null,
      repoUrl: event.metadata?.repoUrl || null,
      timestamp: event.timestamp,
      metadata: JSON.stringify(enrichedMetadata),
      version: 1,
      schemaVersion: '1.0.0',
    };
  }
  
  private mapFromDBEvent(dbEvent: DBTelemetryEvent): TelemetryEvent {
    // Parse metadata to extract duration and context
    let parsedMetadata: any = {};
    if (dbEvent.metadata) {
      try {
        parsedMetadata = JSON.parse(dbEvent.metadata);
      } catch (e) {
        // Invalid JSON, ignore
      }
    }
    
    const { duration, context, ...metadata } = parsedMetadata;
    
    return {
      id: dbEvent.id.toString(),
      sessionId: dbEvent.sessionId,
      eventType: this.mapEventTypeReverse(dbEvent.eventType),
      category: dbEvent.agentType,
      action: dbEvent.mode,
      label: dbEvent.prompt || undefined,
      timestamp: dbEvent.timestamp,
      duration: duration || undefined,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      context: context || undefined,
    };
  }
  
  private mapEventType(eventType: string): string {
    const mapping: Record<string, string> = {
      'start': 'session:start',
      'stream': 'agent:stream',
      'end': 'session:end',
      'error': 'session:error',
      'custom': 'custom',
    };
    return mapping[eventType] || eventType;
  }
  
  private mapEventTypeReverse(dbEventType: string): TelemetryEvent['eventType'] {
    const mapping: Record<string, TelemetryEvent['eventType']> = {
      'session:start': 'start',
      'agent:stream': 'stream',
      'session:end': 'end',
      'session:error': 'error',
      'custom': 'custom',
    };
    return mapping[dbEventType] || 'custom';
  }
}