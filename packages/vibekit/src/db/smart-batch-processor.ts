/**
 * Phase 4.5: Smart Batch Processor
 * 
 * Intelligent batching algorithms with auto-tuning, backpressure handling,
 * and adaptive performance optimization for high-throughput operations.
 */

import { EventEmitter } from 'events';

export interface BatchConfig {
  minBatchSize: number;
  maxBatchSize: number;
  flushIntervalMs: number;
  maxMemoryMB: number;
  autoTuningEnabled: boolean;
  backpressureThreshold: number;
}

export interface BatchItem<T> {
  data: T;
  timestamp: number;
  priority: number;
  retryCount: number;
  callback?: (error?: Error, result?: any) => void;
}

export interface BatchMetrics {
  totalBatches: number;
  totalItems: number;
  avgBatchSize: number;
  avgProcessingTime: number;
  successRate: number;
  backpressureEvents: number;
  memoryUsageMB: number;
  throughputPerSecond: number;
  lastTuningAdjustment: number;
}

export interface ProcessingResult<R> {
  success: boolean;
  result?: R;
  error?: Error;
  processingTime: number;
  batchSize: number;
}

export interface AutoTuningParams {
  targetThroughput: number;
  maxLatencyMs: number;
  memoryBudgetMB: number;
  tuningIntervalMs: number;
  adjustmentFactor: number;
}

export class SmartBatchProcessor<T, R> extends EventEmitter {
  private config: BatchConfig;
  private autoTuning: AutoTuningParams;
  private pendingItems: BatchItem<T>[];
  private processingQueue: Array<BatchItem<T>[]>;
  private isProcessing: boolean;
  private flushTimer?: NodeJS.Timeout;
  private metrics: BatchMetrics;
  private performanceHistory: Array<{
    timestamp: number;
    batchSize: number;
    processingTime: number;
    throughput: number;
    memoryUsage: number;
  }>;
  private backpressureActive: boolean;
  private maxRetries: number;

  constructor(
    private processor: (items: T[]) => Promise<R>,
    config: Partial<BatchConfig> = {},
    autoTuning: Partial<AutoTuningParams> = {}
  ) {
    super();

    this.config = {
      minBatchSize: config.minBatchSize || 10,
      maxBatchSize: config.maxBatchSize || 100,
      flushIntervalMs: config.flushIntervalMs || 1000,
      maxMemoryMB: config.maxMemoryMB || 100,
      autoTuningEnabled: config.autoTuningEnabled ?? true,
      backpressureThreshold: config.backpressureThreshold || 0.8,
    };

    this.autoTuning = {
      targetThroughput: autoTuning.targetThroughput || 1000,
      maxLatencyMs: autoTuning.maxLatencyMs || 5000,
      memoryBudgetMB: autoTuning.memoryBudgetMB || 50,
      tuningIntervalMs: autoTuning.tuningIntervalMs || 30000,
      adjustmentFactor: autoTuning.adjustmentFactor || 0.1,
    };

    this.pendingItems = [];
    this.processingQueue = [];
    this.isProcessing = false;
    this.backpressureActive = false;
    this.maxRetries = 3;

    this.metrics = {
      totalBatches: 0,
      totalItems: 0,
      avgBatchSize: 0,
      avgProcessingTime: 0,
      successRate: 100,
      backpressureEvents: 0,
      memoryUsageMB: 0,
      throughputPerSecond: 0,
      lastTuningAdjustment: Date.now(),
    };

    this.performanceHistory = [];

    this.startFlushTimer();
    if (this.config.autoTuningEnabled) {
      this.startAutoTuning();
    }
  }

  /**
   * Add item to batch queue
   */
  async add(
    item: T,
    priority: number = 0,
    callback?: (error?: Error, result?: any) => void
  ): Promise<void> {
    // Check backpressure
    if (this.isBackpressureActive()) {
      this.metrics.backpressureEvents++;
      this.emit('backpressure', {
        queueSize: this.pendingItems.length,
        memoryUsage: this.getCurrentMemoryUsage(),
      });

      // Wait for backpressure to subside or reject if too many items
      if (this.pendingItems.length > this.config.maxBatchSize * 10) {
        const error = new Error('Queue full - backpressure threshold exceeded');
        if (callback) callback(error);
        throw error;
      }

      // Implement exponential backoff
      await this.waitForBackpressureRelief();
    }

    const batchItem: BatchItem<T> = {
      data: item,
      timestamp: Date.now(),
      priority,
      retryCount: 0,
      callback,
    };

    // Insert with priority (higher priority first)
    const insertIndex = this.findInsertPosition(batchItem);
    this.pendingItems.splice(insertIndex, 0, batchItem);

    this.updateMemoryMetrics();

    // Trigger immediate flush if batch is full or high priority
    if (
      this.pendingItems.length >= this.config.maxBatchSize ||
      (priority > 5 && this.pendingItems.length >= this.config.minBatchSize)
    ) {
      await this.flush();
    }
  }

  /**
   * Force flush all pending items
   */
  async flush(): Promise<void> {
    if (this.pendingItems.length === 0 || this.isProcessing) {
      return;
    }

    // Create batch from pending items
    const batchSize = Math.min(this.pendingItems.length, this.config.maxBatchSize);
    const batch = this.pendingItems.splice(0, batchSize);

    this.processingQueue.push(batch);
    this.processBatches();
  }

  /**
   * Process batches from the queue
   */
  private async processBatches(): Promise<void> {
    if (this.isProcessing || this.processingQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.processingQueue.length > 0) {
      const batch = this.processingQueue.shift()!;
      await this.processBatch(batch);
    }

    this.isProcessing = false;
  }

  /**
   * Process a single batch
   */
  private async processBatch(batch: BatchItem<T>[]): Promise<void> {
    const startTime = Date.now();
    const items = batch.map(item => item.data);

    try {
      // Process the batch
      const result = await this.processor(items);
      const processingTime = Date.now() - startTime;

      // Update metrics
      this.updateSuccessMetrics(batch.length, processingTime);

      // Record performance data
      this.recordPerformance(batch.length, processingTime);

      // Notify callbacks of success
      batch.forEach(item => {
        if (item.callback) {
          item.callback(undefined, result);
        }
      });

      this.emit('batch_processed', {
        batchSize: batch.length,
        processingTime,
        success: true,
      });

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      // Update failure metrics
      this.updateFailureMetrics(batch.length, processingTime);

      // Handle retries
      await this.handleBatchFailure(batch, error as Error);

      this.emit('batch_failed', {
        batchSize: batch.length,
        processingTime,
        error,
      });
    }
  }

  /**
   * Handle batch processing failure with retry logic
   */
  private async handleBatchFailure(batch: BatchItem<T>[], error: Error): Promise<void> {
    const retryableBatch: BatchItem<T>[] = [];
    const failedBatch: BatchItem<T>[] = [];

    for (const item of batch) {
      if (item.retryCount < this.maxRetries) {
        item.retryCount++;
        retryableBatch.push(item);
      } else {
        failedBatch.push(item);
        if (item.callback) {
          item.callback(error);
        }
      }
    }

    // Re-queue retryable items with exponential backoff
    if (retryableBatch.length > 0) {
      const delay = Math.min(100 * Math.pow(2, retryableBatch[0].retryCount), 1000); // Faster retries for tests
      setTimeout(() => {
        this.processingQueue.unshift(retryableBatch);
        this.processBatches();
      }, delay);
    }
  }

  /**
   * Check if backpressure should be active
   */
  private isBackpressureActive(): boolean {
    const memoryUsage = this.getCurrentMemoryUsage();
    const queuePressure = this.pendingItems.length / (this.config.maxBatchSize * 5);
    
    this.backpressureActive = 
      memoryUsage > this.config.maxMemoryMB * this.config.backpressureThreshold ||
      queuePressure > this.config.backpressureThreshold;

    return this.backpressureActive;
  }

  /**
   * Wait for backpressure to subside
   */
  private async waitForBackpressureRelief(): Promise<void> {
    let attempts = 0;
    const maxAttempts = 10;

    while (this.isBackpressureActive() && attempts < maxAttempts) {
      const delay = Math.min(100 * Math.pow(1.5, attempts), 2000);
      await new Promise(resolve => setTimeout(resolve, delay));
      attempts++;
    }
  }

  /**
   * Find insertion position for priority-based ordering
   */
  private findInsertPosition(item: BatchItem<T>): number {
    let left = 0;
    let right = this.pendingItems.length;

    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      if (this.pendingItems[mid].priority >= item.priority) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }

    return left;
  }

  /**
   * Update memory usage metrics
   */
  private updateMemoryMetrics(): void {
    this.metrics.memoryUsageMB = this.getCurrentMemoryUsage();
  }

  /**
   * Get current memory usage estimate
   */
  private getCurrentMemoryUsage(): number {
    // Rough estimate: each item ~1KB, plus overhead
    const itemCount = this.pendingItems.length + 
      this.processingQueue.reduce((sum, batch) => sum + batch.length, 0);
    
    return (itemCount * 1024) / (1024 * 1024); // Convert to MB
  }

  /**
   * Update metrics for successful batch processing
   */
  private updateSuccessMetrics(batchSize: number, processingTime: number): void {
    this.metrics.totalBatches++;
    this.metrics.totalItems += batchSize;
    
    // Update rolling averages
    const totalBatches = this.metrics.totalBatches;
    this.metrics.avgBatchSize = 
      (this.metrics.avgBatchSize * (totalBatches - 1) + batchSize) / totalBatches;
    
    this.metrics.avgProcessingTime = 
      (this.metrics.avgProcessingTime * (totalBatches - 1) + processingTime) / totalBatches;

    // Update success rate (weighted towards recent batches)
    this.metrics.successRate = Math.min(100, this.metrics.successRate * 0.95 + 5);
  }

  /**
   * Update metrics for failed batch processing
   */
  private updateFailureMetrics(batchSize: number, processingTime: number): void {
    this.metrics.totalBatches++;
    
    // Decrease success rate
    this.metrics.successRate = Math.max(0, this.metrics.successRate * 0.9);
  }

  /**
   * Record performance data for auto-tuning
   */
  private recordPerformance(batchSize: number, processingTime: number): void {
    const now = Date.now();
    const throughput = (batchSize / processingTime) * 1000; // items per second

    this.performanceHistory.push({
      timestamp: now,
      batchSize,
      processingTime,
      throughput,
      memoryUsage: this.getCurrentMemoryUsage(),
    });

    // Keep only last hour of data
    const oneHourAgo = now - 3600000;
    this.performanceHistory = this.performanceHistory.filter(
      record => record.timestamp > oneHourAgo
    );

    // Update current throughput metric
    const recentHistory = this.performanceHistory.slice(-10);
    this.metrics.throughputPerSecond = recentHistory.length > 0
      ? recentHistory.reduce((sum, record) => sum + record.throughput, 0) / recentHistory.length
      : 0;
  }

  /**
   * Start auto-tuning process
   */
  private startAutoTuning(): void {
    setInterval(() => {
      this.performAutoTuning();
    }, this.autoTuning.tuningIntervalMs);
  }

  /**
   * Perform auto-tuning based on performance history
   */
  private performAutoTuning(): void {
    if (this.performanceHistory.length < 5) {
      return; // Need more data
    }

    const recentPerformance = this.performanceHistory.slice(-20);
    const avgThroughput = recentPerformance.reduce((sum, p) => sum + p.throughput, 0) / recentPerformance.length;
    const avgLatency = recentPerformance.reduce((sum, p) => sum + p.processingTime, 0) / recentPerformance.length;
    const avgMemory = recentPerformance.reduce((sum, p) => sum + p.memoryUsage, 0) / recentPerformance.length;

    const adjustmentNeeded = this.calculateAdjustment(avgThroughput, avgLatency, avgMemory);
    
    if (adjustmentNeeded.batchSize !== 0) {
      this.adjustBatchSize(adjustmentNeeded.batchSize);
      this.metrics.lastTuningAdjustment = Date.now();
      
      this.emit('auto_tuning', {
        adjustment: adjustmentNeeded,
        currentConfig: { ...this.config },
        metrics: { avgThroughput, avgLatency, avgMemory },
      });
    }
  }

  /**
   * Calculate needed adjustments based on performance
   */
  private calculateAdjustment(
    avgThroughput: number,
    avgLatency: number,
    avgMemory: number
  ): { batchSize: number; flushInterval: number } {
    const adjustment = { batchSize: 0, flushInterval: 0 };

    // Adjust batch size based on throughput and latency
    if (avgThroughput < this.autoTuning.targetThroughput * 0.8) {
      // Low throughput - try larger batches if latency allows
      if (avgLatency < this.autoTuning.maxLatencyMs * 0.7) {
        adjustment.batchSize = Math.ceil(this.config.maxBatchSize * this.autoTuning.adjustmentFactor);
      }
    } else if (avgLatency > this.autoTuning.maxLatencyMs) {
      // High latency - reduce batch size
      adjustment.batchSize = -Math.ceil(this.config.maxBatchSize * this.autoTuning.adjustmentFactor);
    }

    // Adjust for memory pressure
    if (avgMemory > this.autoTuning.memoryBudgetMB * 0.8) {
      adjustment.batchSize = Math.min(adjustment.batchSize, -Math.ceil(this.config.maxBatchSize * 0.1));
    }

    return adjustment;
  }

  /**
   * Adjust batch size within bounds
   */
  private adjustBatchSize(delta: number): void {
    const newMaxBatchSize = Math.max(
      this.config.minBatchSize,
      Math.min(1000, this.config.maxBatchSize + delta)
    );

    const newMinBatchSize = Math.max(
      1,
      Math.min(newMaxBatchSize / 2, this.config.minBatchSize + Math.floor(delta / 2))
    );

    this.config.maxBatchSize = newMaxBatchSize;
    this.config.minBatchSize = newMinBatchSize;
  }

  /**
   * Start flush timer
   */
  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      if (this.pendingItems.length >= this.config.minBatchSize) {
        this.flush();
      }
    }, this.config.flushIntervalMs);
  }

  /**
   * Get current metrics
   */
  getMetrics(): BatchMetrics {
    this.updateMemoryMetrics();
    return { ...this.metrics };
  }

  /**
   * Get current configuration
   */
  getConfig(): BatchConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<BatchConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Restart timer if interval changed
    if (newConfig.flushIntervalMs) {
      if (this.flushTimer) {
        clearInterval(this.flushTimer);
      }
      this.startFlushTimer();
    }
  }

  /**
   * Get performance history
   */
  getPerformanceHistory(): Array<{
    timestamp: number;
    batchSize: number;
    processingTime: number;
    throughput: number;
    memoryUsage: number;
  }> {
    return [...this.performanceHistory];
  }

  /**
   * Shutdown the processor gracefully
   */
  async shutdown(): Promise<void> {
    // Clear timer
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    // Flush remaining items
    await this.flush();

    // Wait for processing to complete
    while (this.isProcessing || this.processingQueue.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.emit('shutdown');
  }
} 