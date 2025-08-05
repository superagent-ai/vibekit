import type { TelemetryEvent } from '../core/types.js';

export type FilterPredicate = (event: TelemetryEvent) => boolean | Promise<boolean>;

export interface FilterRule {
  name: string;
  predicate: FilterPredicate;
  mode: 'include' | 'exclude';
}

export interface FilterOptions {
  defaultMode?: 'include' | 'exclude';
  async?: boolean;
}

export class EventFilter {
  private rules: FilterRule[] = [];
  private options: Required<FilterOptions>;
  
  constructor(options: FilterOptions = {}) {
    this.options = {
      defaultMode: options.defaultMode || 'include',
      async: options.async || false,
    };
  }
  
  /**
   * Add a filter rule
   */
  addRule(name: string, predicate: FilterPredicate, mode?: 'include' | 'exclude'): void {
    this.rules.push({
      name,
      predicate,
      mode: mode || this.options.defaultMode,
    });
  }
  
  /**
   * Remove a filter rule by name
   */
  removeRule(name: string): void {
    this.rules = this.rules.filter(rule => rule.name !== name);
  }
  
  /**
   * Clear all rules
   */
  clearRules(): void {
    this.rules = [];
  }
  
  /**
   * Check if an event passes all filters
   */
  async passes(event: TelemetryEvent): Promise<boolean> {
    if (this.rules.length === 0) {
      return true;
    }
    
    const includeRules = this.rules.filter(r => r.mode === 'include');
    const excludeRules = this.rules.filter(r => r.mode === 'exclude');
    
    // If there are include rules, at least one must pass
    if (includeRules.length > 0) {
      const includeResults = await Promise.all(
        includeRules.map(rule => Promise.resolve(rule.predicate(event)))
      );
      
      if (!includeResults.some(result => result)) {
        return false;
      }
    }
    
    // No exclude rules must pass
    if (excludeRules.length > 0) {
      const excludeResults = await Promise.all(
        excludeRules.map(rule => Promise.resolve(rule.predicate(event)))
      );
      
      if (excludeResults.some(result => result)) {
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * Filter a batch of events
   */
  async filter(events: TelemetryEvent[]): Promise<TelemetryEvent[]> {
    if (this.options.async) {
      const results = await Promise.all(
        events.map(async event => ({
          event,
          passes: await this.passes(event),
        }))
      );
      
      return results
        .filter(result => result.passes)
        .map(result => result.event);
    } else {
      const filtered: TelemetryEvent[] = [];
      
      for (const event of events) {
        if (await this.passes(event)) {
          filtered.push(event);
        }
      }
      
      return filtered;
    }
  }
  
  /**
   * Create a composite filter from multiple filters
   */
  static compose(mode: 'and' | 'or', ...filters: EventFilter[]): EventFilter {
    const composite = new EventFilter();
    
    composite.addRule('composite', async (event) => {
      const results = await Promise.all(
        filters.map(filter => filter.passes(event))
      );
      
      if (mode === 'and') {
        return results.every(r => r);
      } else {
        return results.some(r => r);
      }
    });
    
    return composite;
  }
  
  /**
   * Get filter statistics
   */
  getStats(): {
    totalRules: number;
    includeRules: number;
    excludeRules: number;
    rules: Array<{ name: string; mode: string }>;
  } {
    return {
      totalRules: this.rules.length,
      includeRules: this.rules.filter(r => r.mode === 'include').length,
      excludeRules: this.rules.filter(r => r.mode === 'exclude').length,
      rules: this.rules.map(r => ({ name: r.name, mode: r.mode })),
    };
  }
}

// Common filter predicates
export const CommonFilters = {
  /**
   * Filter by event type
   */
  byType: (types: TelemetryEvent['eventType'][]): FilterPredicate => {
    const typeSet = new Set(types);
    return (event) => typeSet.has(event.eventType);
  },
  
  /**
   * Filter by category
   */
  byCategory: (categories: string[]): FilterPredicate => {
    const categorySet = new Set(categories);
    return (event) => categorySet.has(event.category);
  },
  
  /**
   * Filter by action
   */
  byAction: (actions: string[]): FilterPredicate => {
    const actionSet = new Set(actions);
    return (event) => actionSet.has(event.action);
  },
  
  /**
   * Filter by time range
   */
  byTimeRange: (startTime: number, endTime: number): FilterPredicate => {
    return (event) => event.timestamp >= startTime && event.timestamp <= endTime;
  },
  
  /**
   * Filter by session
   */
  bySession: (sessionIds: string[]): FilterPredicate => {
    const sessionSet = new Set(sessionIds);
    return (event) => sessionSet.has(event.sessionId);
  },
  
  /**
   * Filter by user
   */
  byUser: (userIds: string[]): FilterPredicate => {
    const userSet = new Set(userIds);
    return (event) => {
      const userId = event.context?.userId;
      return userId ? userSet.has(userId) : false;
    };
  },
  
  /**
   * Filter by metadata field
   */
  byMetadata: (field: string, value: any): FilterPredicate => {
    return (event) => {
      if (!event.metadata) return false;
      return event.metadata[field] === value;
    };
  },
  
  /**
   * Filter by metadata field existence
   */
  hasMetadata: (field: string): FilterPredicate => {
    return (event) => {
      if (!event.metadata) return false;
      return field in event.metadata;
    };
  },
  
  /**
   * Filter by duration
   */
  byDuration: (minMs?: number, maxMs?: number): FilterPredicate => {
    return (event) => {
      if (event.duration === undefined) return false;
      if (minMs !== undefined && event.duration < minMs) return false;
      if (maxMs !== undefined && event.duration > maxMs) return false;
      return true;
    };
  },
  
  /**
   * Filter by error events
   */
  errors: (): FilterPredicate => {
    return (event) => event.eventType === 'error';
  },
  
  /**
   * Filter by custom predicate on metadata
   */
  byCustom: (predicate: (metadata?: Record<string, any>) => boolean): FilterPredicate => {
    return (event) => {
      if (!event.metadata) return false;
      return predicate(event.metadata);
    };
  },
  
  /**
   * Rate limit filter (only allow N events per time window)
   */
  rateLimit: (maxEvents: number, windowMs: number): FilterPredicate => {
    const eventCounts = new Map<string, number[]>();
    
    return (event) => {
      const key = `${event.category}:${event.action}`;
      const now = Date.now();
      const cutoff = now - windowMs;
      
      // Get or create event timestamps for this key
      let timestamps = eventCounts.get(key) || [];
      
      // Remove old timestamps
      timestamps = timestamps.filter(t => t > cutoff);
      
      // Check if we're at the limit
      if (timestamps.length >= maxEvents) {
        return false;
      }
      
      // Add this event
      timestamps.push(now);
      eventCounts.set(key, timestamps);
      
      // Periodically clean up old entries
      if (Math.random() < 0.01) { // 1% chance
        for (const [k, v] of eventCounts.entries()) {
          const filtered = v.filter(t => t > cutoff);
          if (filtered.length === 0) {
            eventCounts.delete(k);
          } else {
            eventCounts.set(k, filtered);
          }
        }
      }
      
      return true;
    };
  },
};