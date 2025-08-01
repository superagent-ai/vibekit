import { StorageProvider } from '../StorageProvider.js';
import type { TelemetryEvent, QueryFilter, StorageStats } from '../../core/types.js';

export interface MemoryConfig {
  maxEvents?: number;
  maxAge?: number; // milliseconds
  cleanupInterval?: number; // milliseconds
  enableTrimLogging?: boolean;
}

export class MemoryProvider extends StorageProvider {
  readonly name = 'memory';
  readonly supportsQuery = true;
  readonly supportsBatch = true;
  
  private events: TelemetryEvent[] = [];
  private config: Required<MemoryConfig>;
  private cleanupTimer?: NodeJS.Timeout;
  private operationCounter = 0;
  
  constructor(config: MemoryConfig = {}) {
    super();
    this.config = {
      maxEvents: config.maxEvents || 10000,
      maxAge: config.maxAge || 24 * 60 * 60 * 1000, // 24 hours
      cleanupInterval: config.cleanupInterval || 300000, // 5 minutes
      enableTrimLogging: config.enableTrimLogging ?? true,
    };
    
    // Start periodic cleanup
    this.startPeriodicCleanup();
  }
  
  async initialize(): Promise<void> {
    // Nothing to initialize for memory storage
  }
  
  async store(event: TelemetryEvent): Promise<void> {
    this.events.push(event);
    this.operationCounter++;
    
    // Trigger cleanup every 100 operations to prevent excessive growth
    if (this.operationCounter % 100 === 0) {
      this.cleanup();
    }
  }
  
  async storeBatch(events: TelemetryEvent[]): Promise<void> {
    this.events.push(...events);
    this.operationCounter += events.length;
    
    // Always cleanup after batch operations
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
    const initialCount = this.events.length;
    
    // Remove events older than maxAge first (more efficient)
    if (this.config.maxAge) {
      const cutoff = Date.now() - this.config.maxAge;
      this.events = this.events.filter(e => e.timestamp >= cutoff);
    }
    
    // Remove old events if still over limit (keep most recent)
    if (this.events.length > this.config.maxEvents) {
      // Sort by timestamp descending to keep most recent
      this.events.sort((a, b) => b.timestamp - a.timestamp);
      const trimmed = this.events.slice(0, this.config.maxEvents);
      this.events = trimmed;
      
      if (this.config.enableTrimLogging) {
        const removedCount = initialCount - this.events.length;
        console.warn(`[MemoryProvider] Trimmed ${removedCount} events, current size: ${this.events.length}/${this.config.maxEvents}`);
      }
    }
  }

  private startPeriodicCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupInterval);
  }

  private stopPeriodicCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }
  
  /**
   * Get memory usage statistics
   */
  getMemoryStats(): {
    eventCount: number;
    maxEvents: number;
    utilizationPercent: number;
    estimatedMemoryBytes: number;
  } {
    const eventCount = this.events.length;
    const utilizationPercent = (eventCount / this.config.maxEvents) * 100;
    
    // Rough estimate of memory usage (assumes ~500 bytes per event on average)
    const estimatedMemoryBytes = eventCount * 500;
    
    return {
      eventCount,
      maxEvents: this.config.maxEvents,
      utilizationPercent,
      estimatedMemoryBytes,
    };
  }
  
  async shutdown(): Promise<void> {
    this.stopPeriodicCleanup();
    this.events = [];
  }
}