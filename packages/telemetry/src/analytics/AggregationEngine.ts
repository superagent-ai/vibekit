import type { 
  TelemetryEvent,
  TimeRange,
  QueryFilter
} from '../core/types.js';

export interface AggregationQuery {
  metrics: AggregationMetric[];
  groupBy?: string[];
  filters?: QueryFilter;
  timeRange?: TimeRange;
  interval?: 'minute' | 'hour' | 'day' | 'week' | 'month';
  limit?: number;
  orderBy?: {
    field: string;
    direction: 'asc' | 'desc';
  };
}

export interface AggregationMetric {
  field: string;
  operation: 'count' | 'sum' | 'avg' | 'min' | 'max' | 'percentile' | 'distinct';
  alias?: string;
  percentile?: number; // For percentile operations
}

export interface AggregationResult {
  data: AggregationRow[];
  metadata: {
    query: AggregationQuery;
    executionTime: number;
    totalRows: number;
    timeRange?: TimeRange;
  };
}

export interface AggregationRow {
  [key: string]: any;
  _time?: number; // For time-based aggregations
}

export class AggregationEngine {
  private events: TelemetryEvent[] = [];
  private indexes: Map<string, Map<any, Set<number>>> = new Map();
  
  constructor() {
    // Initialize indexes for common fields
    this.createIndex('sessionId');
    this.createIndex('eventType');
    this.createIndex('category');
    this.createIndex('action');
  }
  
  /**
   * Add events for aggregation
   */
  addEvents(events: TelemetryEvent[]): void {
    const startIndex = this.events.length;
    this.events.push(...events);
    
    // Update indexes
    for (let i = startIndex; i < this.events.length; i++) {
      this.updateIndexes(this.events[i], i);
    }
  }
  
  /**
   * Create an index for a field
   */
  private createIndex(field: string): void {
    this.indexes.set(field, new Map());
  }
  
  /**
   * Update indexes with a new event
   */
  private updateIndexes(event: TelemetryEvent, index: number): void {
    for (const [field, indexMap] of this.indexes.entries()) {
      const value = this.getFieldValue(event, field);
      if (value !== undefined) {
        if (!indexMap.has(value)) {
          indexMap.set(value, new Set());
        }
        indexMap.get(value)!.add(index);
      }
    }
  }
  
  /**
   * Execute an aggregation query
   */
  async query(query: AggregationQuery): Promise<AggregationResult> {
    const startTime = Date.now();
    
    // Filter events
    let filteredEvents = this.filterEvents(query.filters, query.timeRange);
    
    // Group events
    const groups = this.groupEvents(filteredEvents, query.groupBy, query.interval, query.timeRange);
    
    // Calculate aggregations
    const rows: AggregationRow[] = [];
    
    for (const [groupKey, events] of groups.entries()) {
      const row: AggregationRow = {};
      
      // Add group by fields
      if (query.groupBy) {
        const groupValues = JSON.parse(groupKey);
        query.groupBy.forEach((field, index) => {
          row[field] = groupValues[index];
        });
      }
      
      // Add time field for interval grouping
      if (query.interval && groupKey.startsWith('time:')) {
        row._time = parseInt(groupKey.split(':')[1]);
      }
      
      // Calculate metrics
      for (const metric of query.metrics) {
        const value = this.calculateMetric(events, metric);
        row[metric.alias || `${metric.operation}_${metric.field}`] = value;
      }
      
      rows.push(row);
    }
    
    // Sort results
    if (query.orderBy) {
      rows.sort((a, b) => {
        const aVal = a[query.orderBy!.field];
        const bVal = b[query.orderBy!.field];
        const direction = query.orderBy!.direction === 'asc' ? 1 : -1;
        return (aVal < bVal ? -1 : aVal > bVal ? 1 : 0) * direction;
      });
    }
    
    // Limit results
    const limitedRows = query.limit ? rows.slice(0, query.limit) : rows;
    
    return {
      data: limitedRows,
      metadata: {
        query,
        executionTime: Date.now() - startTime,
        totalRows: rows.length,
        timeRange: query.timeRange,
      },
    };
  }
  
  /**
   * Filter events based on criteria
   */
  private filterEvents(filters?: QueryFilter, timeRange?: TimeRange): TelemetryEvent[] {
    let filtered = this.events;
    
    // Use indexes for efficient filtering
    if (filters?.sessionId && this.indexes.has('sessionId')) {
      const indexes = this.indexes.get('sessionId')!.get(filters.sessionId);
      if (indexes) {
        filtered = Array.from(indexes).map(i => this.events[i]);
      } else {
        return [];
      }
    }
    
    // Apply remaining filters
    return filtered.filter(event => {
      if (filters) {
        if (filters.eventType && event.eventType !== filters.eventType) return false;
        if (filters.category && event.category !== filters.category) return false;
        if (filters.action && event.action !== filters.action) return false;
      }
      
      if (timeRange) {
        if (event.timestamp < timeRange.start || event.timestamp > timeRange.end) return false;
      }
      
      return true;
    });
  }
  
  /**
   * Group events by specified fields
   */
  private groupEvents(
    events: TelemetryEvent[], 
    groupBy?: string[], 
    interval?: string,
    timeRange?: TimeRange
  ): Map<string, TelemetryEvent[]> {
    const groups = new Map<string, TelemetryEvent[]>();
    
    for (const event of events) {
      let key: string;
      
      if (interval && timeRange) {
        // Time-based grouping
        const bucketTime = this.getBucketTime(event.timestamp, interval);
        key = `time:${bucketTime}`;
      } else if (groupBy && groupBy.length > 0) {
        // Field-based grouping
        const values = groupBy.map(field => this.getFieldValue(event, field));
        key = JSON.stringify(values);
      } else {
        // No grouping - all events in one group
        key = 'all';
      }
      
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(event);
    }
    
    return groups;
  }
  
  /**
   * Get bucket time for interval grouping
   */
  private getBucketTime(timestamp: number, interval: string): number {
    const date = new Date(timestamp);
    
    switch (interval) {
      case 'minute':
        date.setSeconds(0, 0);
        break;
      case 'hour':
        date.setMinutes(0, 0, 0);
        break;
      case 'day':
        date.setHours(0, 0, 0, 0);
        break;
      case 'week':
        const dayOfWeek = date.getDay();
        date.setDate(date.getDate() - dayOfWeek);
        date.setHours(0, 0, 0, 0);
        break;
      case 'month':
        date.setDate(1);
        date.setHours(0, 0, 0, 0);
        break;
    }
    
    return date.getTime();
  }
  
  /**
   * Calculate a metric for a group of events
   */
  private calculateMetric(events: TelemetryEvent[], metric: AggregationMetric): any {
    if (events.length === 0) return null;
    
    switch (metric.operation) {
      case 'count':
        return events.length;
      
      case 'sum': {
        let sum = 0;
        for (const event of events) {
          const value = this.getFieldValue(event, metric.field);
          if (typeof value === 'number') sum += value;
        }
        return sum;
      }
      
      case 'avg': {
        let sum = 0;
        let count = 0;
        for (const event of events) {
          const value = this.getFieldValue(event, metric.field);
          if (typeof value === 'number') {
            sum += value;
            count++;
          }
        }
        return count > 0 ? sum / count : null;
      }
      
      case 'min': {
        let min = Infinity;
        for (const event of events) {
          const value = this.getFieldValue(event, metric.field);
          if (typeof value === 'number' && value < min) min = value;
        }
        return min === Infinity ? null : min;
      }
      
      case 'max': {
        let max = -Infinity;
        for (const event of events) {
          const value = this.getFieldValue(event, metric.field);
          if (typeof value === 'number' && value > max) max = value;
        }
        return max === -Infinity ? null : max;
      }
      
      case 'percentile': {
        const values: number[] = [];
        for (const event of events) {
          const value = this.getFieldValue(event, metric.field);
          if (typeof value === 'number') values.push(value);
        }
        if (values.length === 0) return null;
        
        values.sort((a, b) => a - b);
        const percentile = metric.percentile || 50;
        const index = Math.ceil((percentile / 100) * values.length) - 1;
        return values[index];
      }
      
      case 'distinct': {
        const distinctValues = new Set();
        for (const event of events) {
          const value = this.getFieldValue(event, metric.field);
          if (value !== undefined) distinctValues.add(value);
        }
        return distinctValues.size;
      }
      
      default:
        return null;
    }
  }
  
  /**
   * Get field value from event (supports nested paths)
   */
  private getFieldValue(event: TelemetryEvent, field: string): any {
    const parts = field.split('.');
    let value: any = event;
    
    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part];
      } else {
        return undefined;
      }
    }
    
    return value;
  }
  
  /**
   * Get common aggregation queries
   */
  static getCommonQueries(): Record<string, AggregationQuery> {
    return {
      eventsPerSession: {
        metrics: [{ field: 'id', operation: 'count', alias: 'event_count' }],
        groupBy: ['sessionId'],
        orderBy: { field: 'event_count', direction: 'desc' },
      },
      
      errorsByCategory: {
        metrics: [{ field: 'id', operation: 'count', alias: 'error_count' }],
        groupBy: ['category'],
        filters: { eventType: 'error' },
        orderBy: { field: 'error_count', direction: 'desc' },
      },
      
      performanceByHour: {
        metrics: [
          { field: 'duration', operation: 'avg', alias: 'avg_duration' },
          { field: 'duration', operation: 'percentile', percentile: 95, alias: 'p95_duration' },
        ],
        interval: 'hour',
        orderBy: { field: '_time', direction: 'asc' },
      },
      
      topSessions: {
        metrics: [
          { field: 'id', operation: 'count', alias: 'events' },
          { field: 'duration', operation: 'sum', alias: 'total_duration' },
        ],
        groupBy: ['sessionId'],
        orderBy: { field: 'events', direction: 'desc' },
        limit: 10,
      },
    };
  }
  
  /**
   * Clear all events and indexes
   */
  clear(): void {
    this.events = [];
    for (const index of this.indexes.values()) {
      index.clear();
    }
  }
  
  /**
   * Get statistics about the engine
   */
  getStats(): {
    eventCount: number;
    indexCount: number;
    memoryUsage: number;
  } {
    let memoryUsage = this.events.length * 200; // Rough estimate per event
    
    for (const index of this.indexes.values()) {
      memoryUsage += index.size * 100; // Rough estimate per index entry
    }
    
    return {
      eventCount: this.events.length,
      indexCount: this.indexes.size,
      memoryUsage,
    };
  }
  
  /**
   * Clean up resources
   */
  async shutdown(): Promise<void> {
    this.clear();
    this.indexes.clear();
  }
}