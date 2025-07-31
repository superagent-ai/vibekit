import type { Plugin, TelemetryEvent, QueryFilter } from '../../core/types.js';
import type { HookContext } from '../hooks/types.js';

/**
 * Example plugin that adds caching to queries
 */
export class CachePlugin implements Plugin {
  name = 'cache-plugin';
  version = '1.0.0';
  description = 'Adds query result caching for improved performance';
  
  private cache = new Map<string, { data: TelemetryEvent[]; timestamp: number }>();
  private ttl: number;
  private maxSize: number;
  
  constructor(options: { ttl?: number; maxSize?: number } = {}) {
    this.ttl = options.ttl || 300000; // 5 minutes default
    this.maxSize = options.maxSize || 100; // 100 cache entries max
  }
  
  async initialize(telemetry: any): Promise<void> {
    console.log(`${this.name} initialized with TTL: ${this.ttl}ms`);
  }
  
  async beforeQuery(
    filter: QueryFilter,
    provider: string,
    context: HookContext
  ): Promise<QueryFilter> {
    // Pass through the filter unchanged
    return filter;
  }
  
  async afterQuery(
    results: TelemetryEvent[],
    filter: QueryFilter,
    provider: string,
    context: HookContext
  ): Promise<TelemetryEvent[]> {
    const cacheKey = this.getCacheKey(filter, provider);
    
    // Check if we have a cached result
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.ttl) {
      console.log(`Cache hit for query: ${cacheKey}`);
      return cached.data;
    }
    
    // Cache the new result
    this.cache.set(cacheKey, {
      data: results,
      timestamp: Date.now(),
    });
    
    // Evict old entries if cache is too large
    if (this.cache.size > this.maxSize) {
      const oldestKey = Array.from(this.cache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp)[0][0];
      this.cache.delete(oldestKey);
    }
    
    return results;
  }
  
  async shutdown(): Promise<void> {
    this.cache.clear();
    console.log(`${this.name} shutdown complete`);
  }
  
  private getCacheKey(filter: QueryFilter, provider: string): string {
    return `${provider}:${JSON.stringify(filter)}`;
  }
  
  // Custom hook to clear cache
  hooks = {
    clearCache: () => {
      this.cache.clear();
      console.log('Cache cleared');
    },
    
    getCacheStats: () => {
      return {
        size: this.cache.size,
        entries: Array.from(this.cache.entries()).map(([key, value]) => ({
          key,
          age: Date.now() - value.timestamp,
          itemCount: value.data.length,
        })),
      };
    },
  };
}