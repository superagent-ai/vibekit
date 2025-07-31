import { StorageProvider } from '../StorageProvider.js';
import type { TelemetryEvent, QueryFilter, StorageStats } from '../../core/types.js';

export interface MemoryConfig {
  maxEvents?: number;
  maxAge?: number; // milliseconds
}

export class MemoryProvider extends StorageProvider {
  readonly name = 'memory';
  readonly supportsQuery = true;
  readonly supportsBatch = true;
  
  private events: TelemetryEvent[] = [];
  private config: MemoryConfig;
  
  constructor(config: MemoryConfig = {}) {
    super();
    this.config = {
      maxEvents: 10000,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      ...config,
    };
  }
  
  async initialize(): Promise<void> {
    // Nothing to initialize for memory storage
  }
  
  async store(event: TelemetryEvent): Promise<void> {
    this.events.push(event);
    this.cleanup();
  }
  
  async storeBatch(events: TelemetryEvent[]): Promise<void> {
    this.events.push(...events);
    this.cleanup();
  }
  
  async query(filter: QueryFilter): Promise<TelemetryEvent[]> {
    let filtered = [...this.events];
    
    if (filter.sessionId) {
      filtered = filtered.filter(e => e.sessionId === filter.sessionId);
    }
    
    if (filter.category) {
      filtered = filtered.filter(e => e.category === filter.category);
    }
    
    if (filter.action) {
      filtered = filtered.filter(e => e.action === filter.action);
    }
    
    if (filter.eventType) {
      filtered = filtered.filter(e => e.eventType === filter.eventType);
    }
    
    if (filter.timeRange) {
      filtered = filtered.filter(e => 
        e.timestamp >= filter.timeRange!.start && 
        e.timestamp <= filter.timeRange!.end
      );
    }
    
    // Sort by timestamp descending
    filtered.sort((a, b) => b.timestamp - a.timestamp);
    
    // Apply pagination
    if (filter.offset) {
      filtered = filtered.slice(filter.offset);
    }
    
    if (filter.limit) {
      filtered = filtered.slice(0, filter.limit);
    }
    
    return filtered;
  }
  
  async getStats(): Promise<StorageStats> {
    const totalEvents = this.events.length;
    const lastEvent = this.events.length > 0 
      ? Math.max(...this.events.map(e => e.timestamp))
      : 0;
    
    // Rough estimate of memory usage
    const eventSize = JSON.stringify(this.events[0] || {}).length;
    const diskUsage = totalEvents * eventSize;
    
    return {
      totalEvents,
      diskUsage,
      lastEvent,
    };
  }
  
  async clean(before: Date): Promise<number> {
    const beforeTimestamp = before.getTime();
    const initialCount = this.events.length;
    
    this.events = this.events.filter(e => e.timestamp >= beforeTimestamp);
    
    return initialCount - this.events.length;
  }
  
  private cleanup(): void {
    // Remove old events if over limit
    if (this.events.length > this.config.maxEvents!) {
      this.events = this.events
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, this.config.maxEvents!);
    }
    
    // Remove events older than maxAge
    if (this.config.maxAge) {
      const cutoff = Date.now() - this.config.maxAge;
      this.events = this.events.filter(e => e.timestamp >= cutoff);
    }
  }
  
  async shutdown(): Promise<void> {
    this.events = [];
  }
}