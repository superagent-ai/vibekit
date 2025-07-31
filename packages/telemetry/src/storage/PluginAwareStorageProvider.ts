import type { TelemetryEvent, QueryFilter, StorageStats } from '../core/types.js';
import type { StorageProvider } from './StorageProvider.js';
import type { PluginManager } from '../plugins/PluginManager.js';

/**
 * Wrapper for storage providers that integrates with the plugin system
 */
export class PluginAwareStorageProvider implements StorageProvider {
  constructor(
    private provider: StorageProvider,
    private pluginManager: PluginManager
  ) {}
  
  get name(): string {
    return this.provider.name;
  }
  
  get supportsQuery(): boolean {
    return this.provider.supportsQuery;
  }
  
  get supportsBatch(): boolean {
    return this.provider.supportsBatch;
  }
  
  async initialize(): Promise<void> {
    return this.provider.initialize();
  }
  
  async store(event: TelemetryEvent): Promise<void> {
    const events = [event];
    
    try {
      // Execute beforeStore hooks
      const processedEvents = await this.pluginManager.executeStorageHooks(
        'beforeStore',
        [events, this.name],
        this.name
      );
      
      if (!processedEvents || processedEvents.length === 0) {
        return; // Event was filtered out
      }
      
      // Store the event
      await this.provider.store(processedEvents[0]);
      
      // Execute afterStore hooks
      await this.pluginManager.executeStorageHooks(
        'afterStore',
        [processedEvents, this.name, undefined],
        this.name
      );
    } catch (error) {
      // Execute error hooks
      await this.pluginManager.executeStorageHooks(
        'onStorageError',
        [error, events, this.name],
        this.name
      );
      throw error;
    }
  }
  
  async storeBatch(events: TelemetryEvent[]): Promise<void> {
    try {
      // Execute beforeStore hooks
      const processedEvents = await this.pluginManager.executeStorageHooks(
        'beforeStore',
        [events, this.name],
        this.name
      );
      
      if (!processedEvents || processedEvents.length === 0) {
        return; // All events were filtered out
      }
      
      // Store the batch
      await this.provider.storeBatch(processedEvents);
      
      // Execute afterStore hooks
      await this.pluginManager.executeStorageHooks(
        'afterStore',
        [processedEvents, this.name, undefined],
        this.name
      );
    } catch (error) {
      // Execute error hooks
      await this.pluginManager.executeStorageHooks(
        'onStorageError',
        [error, events, this.name],
        this.name
      );
      throw error;
    }
  }
  
  async query(filter: QueryFilter): Promise<TelemetryEvent[]> {
    try {
      // Execute beforeQuery hooks
      const processedFilter = await this.pluginManager.executeQueryHooks(
        'beforeQuery',
        [filter, this.name],
        this.name
      );
      
      // Execute the query
      const results = await this.provider.query(processedFilter);
      
      // Execute afterQuery hooks
      const processedResults = await this.pluginManager.executeQueryHooks(
        'afterQuery',
        [results, processedFilter, this.name],
        this.name
      );
      
      // Transform results if needed
      const transformedResults = await this.pluginManager.executeQueryHooks(
        'transformQueryResult',
        [processedResults, processedFilter],
        this.name
      );
      
      return transformedResults || processedResults;
    } catch (error) {
      // Execute error hooks
      await this.pluginManager.executeQueryHooks(
        'onQueryError',
        [error, filter, this.name],
        this.name
      );
      throw error;
    }
  }
  
  async getStats(): Promise<StorageStats> {
    return this.provider.getStats();
  }
  
  async flush(): Promise<void> {
    return this.provider.flush();
  }
  
  async compact(): Promise<void> {
    return this.provider.compact();
  }
  
  async clean(before: Date): Promise<number> {
    const filter = { before };
    
    try {
      // Execute beforeDelete hooks
      const processedFilter = await this.pluginManager.executeStorageHooks(
        'beforeDelete',
        [filter, this.name],
        this.name
      );
      
      // Clean data
      const result = await this.provider.clean(processedFilter.before || before);
      
      // Execute afterDelete hooks
      await this.pluginManager.executeStorageHooks(
        'afterDelete',
        [filter, result, this.name],
        this.name
      );
      
      return result;
    } catch (error) {
      throw error;
    }
  }
  
  async shutdown(): Promise<void> {
    return this.provider.shutdown();
  }
}