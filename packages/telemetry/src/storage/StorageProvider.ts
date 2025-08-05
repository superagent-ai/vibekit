import type { TelemetryEvent, QueryFilter, StorageStats } from '../core/types.js';

export abstract class StorageProvider {
  abstract readonly name: string;
  abstract readonly supportsQuery: boolean;
  abstract readonly supportsBatch: boolean;
  
  abstract initialize(): Promise<void>;
  abstract store(event: TelemetryEvent): Promise<void>;
  abstract shutdown(): Promise<void>;
  
  // Optional methods with default implementations
  async storeBatch(events: TelemetryEvent[]): Promise<void> {
    if (!this.supportsBatch) {
      // Fallback to individual stores
      for (const event of events) {
        await this.store(event);
      }
      return;
    }
    throw new Error('Batch storage not implemented');
  }
  
  async query(filter: QueryFilter): Promise<TelemetryEvent[]> {
    if (!this.supportsQuery) {
      throw new Error(`Storage provider ${this.name} does not support querying`);
    }
    throw new Error('Query method not implemented');
  }
  
  async getStats(): Promise<StorageStats> {
    return {
      totalEvents: 0,
      diskUsage: 0,
      lastEvent: 0,
    };
  }
  
  async flush(): Promise<void> {
    // Default implementation does nothing
  }
  
  async compact(): Promise<void> {
    // Default implementation does nothing
  }
  
  async clean(before: Date): Promise<number> {
    // Default implementation does nothing
    return 0;
  }
}