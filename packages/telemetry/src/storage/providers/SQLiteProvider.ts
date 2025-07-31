import { DrizzleTelemetryOperations, initializeTelemetryDB, closeTelemetryDB } from '@vibe-kit/db';
import type { 
  NewTelemetryEvent, 
  TelemetryQueryFilter,
  EventType,
  SessionStatus,
  NewTelemetrySession,
  TelemetryEvent as DBTelemetryEvent 
} from '@vibe-kit/db';
import { StorageProvider } from '../StorageProvider.js';
import type { TelemetryEvent, QueryFilter, StorageStats } from '../../core/types.js';

export interface SQLiteConfig {
  path?: string;
  streamBatchSize?: number;
  streamFlushInterval?: number;
  streamBuffering?: boolean;
}

export class SQLiteProvider extends StorageProvider {
  readonly name = 'sqlite';
  readonly supportsQuery = true;
  readonly supportsBatch = true;
  
  private operations: DrizzleTelemetryOperations;
  private config: SQLiteConfig;
  private initialized = false;
  
  constructor(config: SQLiteConfig = {}) {
    super();
    this.config = {
      path: '.vibekit/telemetry.db',
      streamBatchSize: 100,
      streamFlushInterval: 5000,
      streamBuffering: true,
      ...config,
    };
    
    // Initialize the operations with config
    this.operations = new DrizzleTelemetryOperations({
      dbPath: this.config.path,
      streamBatchSize: this.config.streamBatchSize,
      streamFlushIntervalMs: this.config.streamFlushInterval,
      enableWAL: true,
      enableForeignKeys: true,
    });
  }
  
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    // Initialize the database connection
    await initializeTelemetryDB({
      dbPath: this.config.path,
      streamBatchSize: this.config.streamBatchSize,
      streamFlushIntervalMs: this.config.streamFlushInterval,
    });
    
    await this.operations.initialize();
    this.initialized = true;
  }
  
  async shutdown(): Promise<void> {
    if (!this.initialized) return;
    
    // Close the database connection
    await closeTelemetryDB();
    this.initialized = false;
  }
  
  async store(event: TelemetryEvent): Promise<void> {
    // Map telemetry event to DB event format
    const dbEvent = this.mapToDBEvent(event);
    
    // First ensure session exists
    await this.operations.upsertSession({
      id: event.sessionId,
      agentType: event.category,
      mode: event.action,
      status: this.getSessionStatus(event),
      startTime: event.timestamp,
      metadata: event.context ? JSON.stringify(event.context) : undefined,
    });
    
    // Then insert the event
    await this.operations.insertEvent(dbEvent);
  }
  
  async storeBatch(events: TelemetryEvent[]): Promise<void> {
    if (events.length === 0) return;
    
    // Group events by session
    const sessionGroups = new Map<string, TelemetryEvent[]>();
    for (const event of events) {
      const group = sessionGroups.get(event.sessionId) || [];
      group.push(event);
      sessionGroups.set(event.sessionId, group);
    }
    
    // Process each session group
    for (const [sessionId, sessionEvents] of sessionGroups) {
      // Create or update session
      const firstEvent = sessionEvents[0];
      await this.operations.upsertSession({
        id: sessionId,
        agentType: firstEvent.category,
        mode: firstEvent.action,
        status: this.getSessionStatus(sessionEvents[sessionEvents.length - 1]),
        startTime: firstEvent.timestamp,
        metadata: firstEvent.context ? JSON.stringify(firstEvent.context) : undefined,
      });
      
      // Insert events individually since batch insert uses transactions
      // which might not be available in all environments
      for (const event of sessionEvents) {
        const dbEvent = this.mapToDBEvent(event);
        await this.operations.insertEvent(dbEvent);
      }
    }
  }
  
  async query(filter: QueryFilter): Promise<TelemetryEvent[]> {
    const dbFilter: TelemetryQueryFilter = {};
    
    if (filter.sessionId) dbFilter.sessionId = filter.sessionId;
    if (filter.category) dbFilter.agentType = filter.category;
    if (filter.action) dbFilter.mode = filter.action;
    if (filter.eventType) dbFilter.eventType = this.mapEventType(filter.eventType);
    if (filter.timeRange) {
      dbFilter.from = filter.timeRange.start;
      dbFilter.to = filter.timeRange.end;
    }
    if (filter.limit) dbFilter.limit = filter.limit;
    if (filter.offset) dbFilter.offset = filter.offset;
    
    const dbEvents = await this.operations.queryEvents(dbFilter);
    return dbEvents.map(e => this.mapFromDBEvent(e));
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
    // Calculate how old the data should be before cleaning
    const cutoffTime = before.getTime();
    
    // Query for events to delete
    const eventsToDelete = await this.operations.queryEvents({
      to: cutoffTime,
    });
    
    // For now, we don't have a direct delete method, so return count
    // In a real implementation, we'd need to add a deleteEvents method to operations
    return eventsToDelete.length;
  }
  
  async flush(): Promise<void> {
    // Flush buffer for each session if needed
    // The db package doesn't have a flushAllBuffers method
    // This would need to be implemented based on active sessions
  }
  
  // Helper methods to map between telemetry and DB types
  
  private mapToDBEvent(event: TelemetryEvent): NewTelemetryEvent {
    return {
      sessionId: event.sessionId,
      eventType: this.mapEventType(event.eventType),
      agentType: event.category,
      mode: event.action,
      prompt: event.label || '',
      streamData: event.value?.toString(),
      metadata: event.metadata ? JSON.stringify(event.metadata) : undefined,
      timestamp: event.timestamp,
    };
  }
  
  private mapFromDBEvent(dbEvent: DBTelemetryEvent): TelemetryEvent {
    return {
      id: dbEvent.id.toString(),
      sessionId: dbEvent.sessionId,
      eventType: dbEvent.eventType, // DB event type is already a string
      category: dbEvent.agentType,
      action: dbEvent.mode,
      label: dbEvent.prompt || undefined,
      value: dbEvent.streamData ? parseFloat(dbEvent.streamData) : undefined,
      timestamp: dbEvent.timestamp,
      duration: undefined, // Duration is calculated at session level in DB
      metadata: dbEvent.metadata ? JSON.parse(dbEvent.metadata) : undefined,
      context: undefined, // Context is stored at session level in DB
    };
  }
  
  private mapEventType(eventType: string): EventType {
    switch (eventType) {
      case 'start': return 'start';
      case 'stream': return 'stream';
      case 'end': return 'end';
      case 'error': return 'error';
      default: return 'stream'; // Default to stream for custom events
    }
  }
  
  private getSessionStatus(event: TelemetryEvent | TelemetryEvent[]): SessionStatus {
    const lastEvent = Array.isArray(event) ? event[event.length - 1] : event;
    
    switch (lastEvent.eventType) {
      case 'end': return 'completed';
      case 'error': return 'failed';
      default: return 'active';
    }
  }
}