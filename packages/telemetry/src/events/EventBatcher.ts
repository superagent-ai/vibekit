import type { TelemetryEvent } from '../core/types.js';
import { EventEmitter } from 'events';

export interface BatcherOptions {
  maxBatchSize?: number;
  maxWaitTime?: number; // milliseconds
  flushOnShutdown?: boolean;
  onBatch?: (batch: TelemetryEvent[]) => void | Promise<void>;
  onError?: (error: Error, batch: TelemetryEvent[]) => void;
}

export interface BatchStatistics {
  totalEvents: number;
  totalBatches: number;
  currentBatchSize: number;
  largestBatch: number;
  averageBatchSize: number;
  flushCount: number;
  errorCount: number;
}

export class EventBatcher extends EventEmitter {
  private batch: TelemetryEvent[] = [];
  private options: Required<BatcherOptions>;
  private flushTimer?: NodeJS.Timeout;
  private statistics: BatchStatistics = {
    totalEvents: 0,
    totalBatches: 0,
    currentBatchSize: 0,
    largestBatch: 0,
    averageBatchSize: 0,
    flushCount: 0,
    errorCount: 0,
  };
  private isShuttingDown = false;
  
  constructor(options: BatcherOptions = {}) {
    super();
    
    this.options = {
      maxBatchSize: options.maxBatchSize || 100,
      maxWaitTime: options.maxWaitTime || 5000,
      flushOnShutdown: options.flushOnShutdown !== false,
      onBatch: options.onBatch || (() => {}),
      onError: options.onError || ((error) => console.error('Batch error:', error)),
    };
    
    if (this.options.flushOnShutdown) {
      this.setupShutdownHandlers();
    }
  }
  
  /**
   * Add an event to the batch
   */
  add(event: TelemetryEvent): void {
    if (this.isShuttingDown) {
      throw new Error('Batcher is shutting down');
    }
    
    this.batch.push(event);
    this.statistics.totalEvents++;
    this.statistics.currentBatchSize = this.batch.length;
    
    // Start timer if this is the first event in the batch
    if (this.batch.length === 1) {
      this.startFlushTimer();
    }
    
    // Flush if batch is full
    if (this.batch.length >= this.options.maxBatchSize) {
      this.flush();
    }
  }
  
  /**
   * Add multiple events to the batch
   */
  addBatch(events: TelemetryEvent[]): void {
    if (this.isShuttingDown) {
      throw new Error('Batcher is shutting down');
    }
    
    // If adding all events would exceed max size, split them
    if (this.batch.length + events.length > this.options.maxBatchSize) {
      const spaceLeft = this.options.maxBatchSize - this.batch.length;
      
      // Add what fits in current batch
      if (spaceLeft > 0) {
        this.batch.push(...events.slice(0, spaceLeft));
        this.statistics.totalEvents += spaceLeft;
      }
      
      // Flush current batch
      this.flush();
      
      // Process remaining events
      const remaining = events.slice(spaceLeft);
      while (remaining.length > 0) {
        const batchEvents = remaining.splice(0, this.options.maxBatchSize);
        this.batch = batchEvents;
        this.statistics.totalEvents += batchEvents.length;
        
        if (this.batch.length === this.options.maxBatchSize) {
          this.flush();
        }
      }
    } else {
      // All events fit in current batch
      this.batch.push(...events);
      this.statistics.totalEvents += events.length;
    }
    
    this.statistics.currentBatchSize = this.batch.length;
    
    // Start timer if needed
    if (this.batch.length > 0 && !this.flushTimer) {
      this.startFlushTimer();
    }
    
    // Flush if batch is full
    if (this.batch.length >= this.options.maxBatchSize) {
      this.flush();
    }
  }
  
  /**
   * Flush the current batch
   */
  async flush(): Promise<void> {
    if (this.batch.length === 0) {
      return;
    }
    
    // Clear timer
    this.stopFlushTimer();
    
    // Get current batch and reset
    const currentBatch = this.batch;
    this.batch = [];
    
    // Update statistics
    this.statistics.totalBatches++;
    this.statistics.flushCount++;
    this.statistics.currentBatchSize = 0;
    
    if (currentBatch.length > this.statistics.largestBatch) {
      this.statistics.largestBatch = currentBatch.length;
    }
    
    this.statistics.averageBatchSize = 
      this.statistics.totalEvents / this.statistics.totalBatches;
    
    // Process batch
    try {
      this.emit('batch', currentBatch);
      await Promise.resolve(this.options.onBatch(currentBatch));
      this.emit('flush', currentBatch.length);
    } catch (error) {
      this.statistics.errorCount++;
      this.options.onError(error as Error, currentBatch);
      this.emit('error', error, currentBatch);
    }
  }
  
  /**
   * Get current batch size
   */
  size(): number {
    return this.batch.length;
  }
  
  /**
   * Get batch statistics
   */
  getStatistics(): BatchStatistics {
    return { ...this.statistics };
  }
  
  /**
   * Reset statistics
   */
  resetStatistics(): void {
    this.statistics = {
      totalEvents: 0,
      totalBatches: 0,
      currentBatchSize: this.batch.length,
      largestBatch: 0,
      averageBatchSize: 0,
      flushCount: 0,
      errorCount: 0,
    };
  }
  
  /**
   * Shutdown the batcher
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    this.stopFlushTimer();
    
    if (this.options.flushOnShutdown && this.batch.length > 0) {
      await this.flush();
    }
    
    this.removeAllListeners();
  }
  
  private startFlushTimer(): void {
    if (this.flushTimer) {
      return;
    }
    
    this.flushTimer = setTimeout(() => {
      this.flush();
    }, this.options.maxWaitTime);
  }
  
  private stopFlushTimer(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }
  }
  
  private setupShutdownHandlers(): void {
    const shutdownHandler = async () => {
      await this.shutdown();
    };
    
    process.on('SIGINT', shutdownHandler);
    process.on('SIGTERM', shutdownHandler);
    process.on('beforeExit', shutdownHandler);
  }
}

/**
 * Multi-channel batcher for routing events to different batches
 */
export class MultiChannelBatcher {
  private batchers = new Map<string, EventBatcher>();
  private defaultBatcher: EventBatcher;
  private router: (event: TelemetryEvent) => string;
  private readonly maxChannels: number;
  private channelCounter = 0;
  
  constructor(
    router: (event: TelemetryEvent) => string,
    defaultOptions: BatcherOptions = {},
    maxChannels = 100 // Prevent unbounded channel growth
  ) {
    this.router = router;
    this.defaultBatcher = new EventBatcher(defaultOptions);
    this.maxChannels = maxChannels;
  }
  
  /**
   * Configure a specific channel
   */
  configureChannel(channel: string, options: BatcherOptions): void {
    if (this.batchers.has(channel)) {
      throw new Error(`Channel ${channel} already exists`);
    }
    
    if (this.batchers.size >= this.maxChannels) {
      console.warn(`[MultiChannelBatcher] Maximum channels (${this.maxChannels}) reached, using default batcher for channel: ${channel}`);
      return;
    }
    
    this.batchers.set(channel, new EventBatcher(options));
  }
  
  /**
   * Add an event to the appropriate channel
   */
  add(event: TelemetryEvent): void {
    const channel = this.router(event);
    let batcher = this.batchers.get(channel);
    
    if (!batcher) {
      // Auto-create channel if under limit
      if (this.batchers.size < this.maxChannels) {
        batcher = new EventBatcher();
        this.batchers.set(channel, batcher);
        this.channelCounter++;
        
        // Log when approaching limit
        if (this.batchers.size > this.maxChannels * 0.8) {
          console.warn(`[MultiChannelBatcher] Approaching max channels: ${this.batchers.size}/${this.maxChannels}`);
        }
      } else {
        // Use default batcher when at capacity
        batcher = this.defaultBatcher;
      }
    }
    
    batcher.add(event);
  }
  
  /**
   * Add multiple events
   */
  addBatch(events: TelemetryEvent[]): void {
    // Group events by channel
    const channelEvents = new Map<string, TelemetryEvent[]>();
    
    for (const event of events) {
      const channel = this.router(event);
      const channelBatch = channelEvents.get(channel) || [];
      channelBatch.push(event);
      channelEvents.set(channel, channelBatch);
    }
    
    // Add to appropriate batchers
    for (const [channel, batch] of channelEvents) {
      const batcher = this.batchers.get(channel) || this.defaultBatcher;
      batcher.addBatch(batch);
    }
  }
  
  /**
   * Flush all channels
   */
  async flushAll(): Promise<void> {
    const flushPromises: Promise<void>[] = [
      this.defaultBatcher.flush(),
    ];
    
    for (const batcher of this.batchers.values()) {
      flushPromises.push(batcher.flush());
    }
    
    await Promise.all(flushPromises);
  }
  
  /**
   * Flush a specific channel
   */
  async flushChannel(channel: string): Promise<void> {
    const batcher = this.batchers.get(channel) || this.defaultBatcher;
    await batcher.flush();
  }
  
  /**
   * Get statistics for all channels
   */
  getAllStatistics(): Record<string, BatchStatistics> {
    const stats: Record<string, BatchStatistics> = {
      default: this.defaultBatcher.getStatistics(),
    };
    
    for (const [channel, batcher] of this.batchers) {
      stats[channel] = batcher.getStatistics();
    }
    
    return stats;
  }
  
  /**
   * Shutdown all batchers
   */
  async shutdown(): Promise<void> {
    const shutdownPromises: Promise<void>[] = [
      this.defaultBatcher.shutdown(),
    ];
    
    for (const batcher of this.batchers.values()) {
      shutdownPromises.push(batcher.shutdown());
    }
    
    await Promise.all(shutdownPromises);
  }
}

// Common routing strategies
export const CommonRouters = {
  /**
   * Route by event category
   */
  byCategory: (): (event: TelemetryEvent) => string => {
    return (event) => event.category;
  },
  
  /**
   * Route by event type
   */
  byType: (): (event: TelemetryEvent) => string => {
    return (event) => event.eventType;
  },
  
  /**
   * Route by severity (for error events)
   */
  bySeverity: (): (event: TelemetryEvent) => string => {
    return (event) => {
      if (event.eventType === 'error' && event.metadata?.severity) {
        return `error_${event.metadata.severity}`;
      }
      return 'default';
    };
  },
  
  /**
   * Route by custom field
   */
  byField: (field: string): (event: TelemetryEvent) => string => {
    return (event) => {
      const value = event.metadata?.[field];
      return value ? String(value) : 'default';
    };
  },
};