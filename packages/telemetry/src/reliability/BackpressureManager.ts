import { EventEmitter } from 'events';

export interface BackpressureConfig {
  highWaterMark: number;
  lowWaterMark: number;
  maxQueueSize?: number;
  strategy?: 'drop-newest' | 'drop-oldest' | 'block';
  onPressure?: (level: number) => void;
  onRelief?: () => void;
}

export interface BackpressureStats {
  currentSize: number;
  highWaterMark: number;
  lowWaterMark: number;
  maxQueueSize?: number;
  droppedCount: number;
  isUnderPressure: boolean;
  pressureLevel: number; // 0-1 scale
}

export class BackpressureManager extends EventEmitter {
  private queue: any[] = [];
  private config: Required<BackpressureConfig>;
  private isUnderPressure = false;
  private droppedCount = 0;
  private processingPaused = false;
  
  constructor(config: BackpressureConfig) {
    super();
    
    this.config = {
      highWaterMark: config.highWaterMark,
      lowWaterMark: config.lowWaterMark,
      maxQueueSize: config.maxQueueSize || config.highWaterMark * 2,
      strategy: config.strategy || 'drop-newest',
      onPressure: config.onPressure || (() => {}),
      onRelief: config.onRelief || (() => {}),
    };
    
    if (this.config.lowWaterMark >= this.config.highWaterMark) {
      throw new Error('lowWaterMark must be less than highWaterMark');
    }
  }
  
  async push<T>(item: T): Promise<boolean> {
    // Check if we're at max capacity
    if (this.config.maxQueueSize && this.queue.length >= this.config.maxQueueSize) {
      return this.handleOverflow(item);
    }
    
    // Add to queue
    this.queue.push(item);
    
    // Check pressure
    this.checkPressure();
    
    return true;
  }
  
  async *consume<T>(): AsyncGenerator<T, void, unknown> {
    while (true) {
      // Wait if processing is paused due to backpressure
      while (this.processingPaused) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Get next item
      const item = this.queue.shift();
      
      if (item === undefined) {
        // Queue is empty, wait for items
        await new Promise(resolve => {
          const checkQueue = () => {
            if (this.queue.length > 0 || this.processingPaused) {
              this.off('item-added', checkQueue);
              resolve(undefined);
            }
          };
          this.on('item-added', checkQueue);
        });
        continue;
      }
      
      // Check if we've dropped below low water mark
      this.checkRelief();
      
      yield item as T;
    }
  }
  
  async drain<T>(): Promise<T[]> {
    const items = [...this.queue];
    this.queue = [];
    this.droppedCount = 0;
    this.checkRelief();
    return items;
  }
  
  private handleOverflow<T>(item: T): boolean {
    switch (this.config.strategy) {
      case 'drop-newest':
        // Drop the new item
        this.droppedCount++;
        this.emit('item-dropped', item, 'newest');
        return false;
      
      case 'drop-oldest':
        // Drop the oldest item and add the new one
        const dropped = this.queue.shift();
        this.queue.push(item);
        this.droppedCount++;
        this.emit('item-dropped', dropped, 'oldest');
        return true;
      
      case 'block':
        // In block mode, we reject the push
        return false;
      
      default:
        return false;
    }
  }
  
  private checkPressure(): void {
    const wasUnderPressure = this.isUnderPressure;
    const queueSize = this.queue.length;
    
    if (queueSize >= this.config.highWaterMark && !this.isUnderPressure) {
      this.isUnderPressure = true;
      const pressureLevel = Math.min(1, queueSize / (this.config.maxQueueSize || this.config.highWaterMark * 2));
      
      this.emit('pressure', pressureLevel);
      this.config.onPressure(pressureLevel);
      
      // In block strategy, pause processing when under pressure
      if (this.config.strategy === 'block') {
        this.processingPaused = true;
      }
    }
    
    // Always emit item-added for consumers
    this.emit('item-added');
  }
  
  private checkRelief(): void {
    const queueSize = this.queue.length;
    
    if (queueSize <= this.config.lowWaterMark && this.isUnderPressure) {
      this.isUnderPressure = false;
      this.processingPaused = false;
      
      this.emit('relief');
      this.config.onRelief();
    }
  }
  
  getStats(): BackpressureStats {
    const currentSize = this.queue.length;
    const pressureLevel = Math.min(1, currentSize / (this.config.maxQueueSize || this.config.highWaterMark * 2));
    
    return {
      currentSize,
      highWaterMark: this.config.highWaterMark,
      lowWaterMark: this.config.lowWaterMark,
      maxQueueSize: this.config.maxQueueSize,
      droppedCount: this.droppedCount,
      isUnderPressure: this.isUnderPressure,
      pressureLevel,
    };
  }
  
  resize(newConfig: Partial<BackpressureConfig>): void {
    if (newConfig.highWaterMark !== undefined) {
      this.config.highWaterMark = newConfig.highWaterMark;
    }
    
    if (newConfig.lowWaterMark !== undefined) {
      this.config.lowWaterMark = newConfig.lowWaterMark;
    }
    
    if (newConfig.maxQueueSize !== undefined) {
      this.config.maxQueueSize = newConfig.maxQueueSize;
    }
    
    // Recheck pressure with new limits
    this.checkPressure();
    this.checkRelief();
  }
  
  clear(): void {
    this.queue = [];
    this.droppedCount = 0;
    this.checkRelief();
  }
  
  shutdown(): void {
    this.clear();
    this.removeAllListeners();
  }
}

// Helper class for managing multiple queues with backpressure
export class BackpressureQueueManager {
  private queues = new Map<string, BackpressureManager>();
  private globalStats = {
    totalDropped: 0,
    queuesUnderPressure: new Set<string>(),
  };
  
  createQueue(name: string, config: BackpressureConfig): BackpressureManager {
    if (this.queues.has(name)) {
      throw new Error(`Queue ${name} already exists`);
    }
    
    const queue = new BackpressureManager({
      ...config,
      onPressure: (level) => {
        this.globalStats.queuesUnderPressure.add(name);
        config.onPressure?.(level);
      },
      onRelief: () => {
        this.globalStats.queuesUnderPressure.delete(name);
        config.onRelief?.();
      },
    });
    
    queue.on('item-dropped', () => {
      this.globalStats.totalDropped++;
    });
    
    this.queues.set(name, queue);
    return queue;
  }
  
  getQueue(name: string): BackpressureManager | undefined {
    return this.queues.get(name);
  }
  
  removeQueue(name: string): void {
    const queue = this.queues.get(name);
    if (queue) {
      queue.shutdown();
      this.queues.delete(name);
      this.globalStats.queuesUnderPressure.delete(name);
    }
  }
  
  getGlobalStats(): {
    totalQueues: number;
    queuesUnderPressure: string[];
    totalDropped: number;
    queueStats: Record<string, BackpressureStats>;
  } {
    const queueStats: Record<string, BackpressureStats> = {};
    
    for (const [name, queue] of this.queues) {
      queueStats[name] = queue.getStats();
    }
    
    return {
      totalQueues: this.queues.size,
      queuesUnderPressure: Array.from(this.globalStats.queuesUnderPressure),
      totalDropped: this.globalStats.totalDropped,
      queueStats,
    };
  }
  
  shutdown(): void {
    for (const queue of this.queues.values()) {
      queue.shutdown();
    }
    this.queues.clear();
    this.globalStats.queuesUnderPressure.clear();
  }
}