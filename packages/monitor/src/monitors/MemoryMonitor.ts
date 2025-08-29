/**
 * Memory Monitor with Pressure Detection and Automatic Cleanup
 * 
 * Monitors system memory usage and triggers cleanup actions when memory
 * pressure is detected. Implements multiple thresholds for progressive
 * cleanup strategies.
 */

import { EventEmitter } from 'events';
import { createLogger } from './structured-logger';
import v8 from 'v8';
import { performance } from 'perf_hooks';

const logger = createLogger('MemoryMonitor');

/**
 * Memory pressure levels
 */
export enum MemoryPressureLevel {
  NORMAL = 'normal',      // < 70% usage
  MODERATE = 'moderate',  // 70-85% usage
  HIGH = 'high',         // 85-95% usage
  CRITICAL = 'critical'  // > 95% usage
}

/**
 * Memory statistics
 */
export interface MemoryStats {
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
  arrayBuffers: number;
  usagePercent: number;
  pressureLevel: MemoryPressureLevel;
  availableMemory: number;
  timestamp: number;
}

/**
 * Cleanup action interface
 */
export interface CleanupAction {
  name: string;
  priority: number; // Lower number = higher priority
  execute: () => Promise<void>;
  canExecute: () => boolean;
  lastExecuted?: number;
  minInterval?: number; // Minimum time between executions (ms)
}

/**
 * Memory monitor configuration
 */
export interface MemoryMonitorConfig {
  checkInterval?: number;        // How often to check memory (ms)
  thresholds?: {
    moderate?: number;  // Default 0.70 (70%)
    high?: number;      // Default 0.85 (85%)
    critical?: number;  // Default 0.95 (95%)
  };
  maxHeapSize?: number;          // Maximum heap size in bytes
  enableAutoCleanup?: boolean;   // Enable automatic cleanup
  enableGC?: boolean;            // Enable manual garbage collection
}

/**
 * Memory Monitor implementation
 */
export class MemoryMonitor extends EventEmitter {
  private static instance: MemoryMonitor;
  private checkInterval: NodeJS.Timeout | null = null;
  private cleanupActions: CleanupAction[] = [];
  private lastStats: MemoryStats | null = null;
  private isCleaningUp = false;
  private cleanupHistory: Map<string, number> = new Map();
  
  // Configuration
  private readonly config: Required<MemoryMonitorConfig>;
  
  // Memory thresholds
  private readonly thresholds: {
    moderate: number;
    high: number;
    critical: number;
  };
  
  // Performance tracking
  private gcCount = 0;
  private lastGCTime = 0;
  
  private constructor(config: MemoryMonitorConfig = {}) {
    super();
    
    this.config = {
      checkInterval: config.checkInterval ?? 10000, // 10 seconds
      thresholds: config.thresholds ?? {},
      maxHeapSize: config.maxHeapSize ?? this.getMaxHeapSize(),
      enableAutoCleanup: config.enableAutoCleanup ?? true,
      enableGC: config.enableGC ?? global.gc !== undefined
    };
    
    this.thresholds = {
      moderate: this.config.thresholds.moderate ?? 0.70,
      high: this.config.thresholds.high ?? 0.85,
      critical: this.config.thresholds.critical ?? 0.95
    };
    
    // Register default cleanup actions
    this.registerDefaultCleanupActions();
  }
  
  /**
   * Get singleton instance
   */
  static getInstance(config?: MemoryMonitorConfig): MemoryMonitor {
    if (!MemoryMonitor.instance) {
      MemoryMonitor.instance = new MemoryMonitor(config);
    }
    return MemoryMonitor.instance;
  }
  
  /**
   * Start monitoring memory
   */
  start(): void {
    if (this.checkInterval) {
      return; // Already running
    }
    
    logger.info('Starting memory monitor', {
      checkInterval: this.config.checkInterval,
      thresholds: this.thresholds,
      maxHeapSize: this.config.maxHeapSize,
      enableAutoCleanup: this.config.enableAutoCleanup,
      enableGC: this.config.enableGC
    });
    
    // Initial check
    this.checkMemory();
    
    // Start periodic checks
    this.checkInterval = setInterval(() => {
      this.checkMemory();
    }, this.config.checkInterval);
    
    // Handle process events
    this.setupProcessHandlers();
  }
  
  /**
   * Stop monitoring memory
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    
    logger.info('Stopped memory monitor');
  }
  
  /**
   * Check current memory usage
   */
  private async checkMemory(): Promise<void> {
    const stats = this.getMemoryStats();
    this.lastStats = stats;
    
    // Emit stats event
    this.emit('stats', stats);
    
    // Check for pressure level changes
    const previousLevel = this.lastStats?.pressureLevel;
    if (previousLevel && previousLevel !== stats.pressureLevel) {
      logger.warn('Memory pressure level changed', {
        from: previousLevel,
        to: stats.pressureLevel,
        usagePercent: stats.usagePercent
      });
      this.emit('pressure-change', stats.pressureLevel, stats);
    }
    
    // Log if pressure is elevated
    if (stats.pressureLevel !== MemoryPressureLevel.NORMAL) {
      logger.warn('Memory pressure detected', {
        level: stats.pressureLevel,
        heapUsed: this.formatBytes(stats.heapUsed),
        heapTotal: this.formatBytes(stats.heapTotal),
        rss: this.formatBytes(stats.rss),
        usagePercent: `${(stats.usagePercent * 100).toFixed(1)}%`
      });
    }
    
    // Trigger cleanup if needed
    if (this.config.enableAutoCleanup && stats.pressureLevel !== MemoryPressureLevel.NORMAL) {
      await this.triggerCleanup(stats.pressureLevel);
    }
  }
  
  /**
   * Get current memory statistics
   */
  getMemoryStats(): MemoryStats {
    const memUsage = process.memoryUsage();
    const heapStats = v8.getHeapStatistics();
    
    const heapUsed = memUsage.heapUsed;
    const heapTotal = heapStats.heap_size_limit;
    const usagePercent = heapUsed / heapTotal;
    
    // Determine pressure level
    let pressureLevel: MemoryPressureLevel;
    if (usagePercent >= this.thresholds.critical) {
      pressureLevel = MemoryPressureLevel.CRITICAL;
    } else if (usagePercent >= this.thresholds.high) {
      pressureLevel = MemoryPressureLevel.HIGH;
    } else if (usagePercent >= this.thresholds.moderate) {
      pressureLevel = MemoryPressureLevel.MODERATE;
    } else {
      pressureLevel = MemoryPressureLevel.NORMAL;
    }
    
    return {
      heapUsed,
      heapTotal,
      external: memUsage.external,
      rss: memUsage.rss,
      arrayBuffers: memUsage.arrayBuffers,
      usagePercent,
      pressureLevel,
      availableMemory: heapTotal - heapUsed,
      timestamp: Date.now()
    };
  }
  
  /**
   * Register a cleanup action
   */
  registerCleanupAction(action: CleanupAction): void {
    this.cleanupActions.push(action);
    // Sort by priority (lower number = higher priority)
    this.cleanupActions.sort((a, b) => a.priority - b.priority);
    
    logger.info('Registered cleanup action', {
      name: action.name,
      priority: action.priority
    });
  }
  
  /**
   * Trigger cleanup based on pressure level
   */
  private async triggerCleanup(level: MemoryPressureLevel): Promise<void> {
    if (this.isCleaningUp) {
      return; // Already cleaning up
    }
    
    this.isCleaningUp = true;
    const startTime = performance.now();
    
    try {
      logger.info('Starting memory cleanup', { level });
      
      // Determine how many actions to execute based on pressure level
      let actionsToExecute: CleanupAction[] = [];
      
      switch (level) {
        case MemoryPressureLevel.MODERATE:
          // Execute top 1-2 priority actions
          actionsToExecute = this.cleanupActions.slice(0, 2);
          break;
        case MemoryPressureLevel.HIGH:
          // Execute top 3-4 priority actions
          actionsToExecute = this.cleanupActions.slice(0, 4);
          break;
        case MemoryPressureLevel.CRITICAL:
          // Execute all actions
          actionsToExecute = [...this.cleanupActions];
          break;
      }
      
      // Filter actions that can execute
      actionsToExecute = actionsToExecute.filter(action => {
        // Check if action can execute
        if (!action.canExecute()) {
          return false;
        }
        
        // Check minimum interval
        if (action.minInterval) {
          const lastExecuted = this.cleanupHistory.get(action.name) ?? 0;
          if (Date.now() - lastExecuted < action.minInterval) {
            return false;
          }
        }
        
        return true;
      });
      
      // Execute cleanup actions
      for (const action of actionsToExecute) {
        try {
          logger.info('Executing cleanup action', { name: action.name });
          await action.execute();
          this.cleanupHistory.set(action.name, Date.now());
          
          // Emit cleanup event
          this.emit('cleanup', action.name);
        } catch (error) {
          logger.error('Cleanup action failed', error, { action: action.name });
        }
      }
      
      // Force garbage collection if enabled and at high/critical levels
      if (this.config.enableGC && (level === MemoryPressureLevel.HIGH || level === MemoryPressureLevel.CRITICAL)) {
        this.forceGarbageCollection();
      }
      
      const duration = performance.now() - startTime;
      logger.info('Memory cleanup completed', {
        level,
        durationMs: duration,
        actionsExecuted: actionsToExecute.length
      });
      
    } finally {
      this.isCleaningUp = false;
    }
  }
  
  /**
   * Force garbage collection
   */
  private forceGarbageCollection(): void {
    if (!global.gc) {
      return;
    }
    
    const now = Date.now();
    // Don't GC too frequently (max once per minute)
    if (now - this.lastGCTime < 60000) {
      return;
    }
    
    logger.info('Forcing garbage collection');
    global.gc();
    this.gcCount++;
    this.lastGCTime = now;
    
    this.emit('gc', this.gcCount);
  }
  
  /**
   * Register default cleanup actions
   */
  private registerDefaultCleanupActions(): void {
    // Clear require cache
    this.registerCleanupAction({
      name: 'clear-require-cache',
      priority: 10,
      execute: async () => {
        const cacheSize = Object.keys(require.cache).length;
        // Clear non-essential modules from cache
        for (const key of Object.keys(require.cache)) {
          if (key.includes('node_modules') && !key.includes('@vibe-kit')) {
            delete require.cache[key];
          }
        }
        const newCacheSize = Object.keys(require.cache).length;
        logger.info('Cleared require cache', {
          before: cacheSize,
          after: newCacheSize,
          cleared: cacheSize - newCacheSize
        });
      },
      canExecute: () => true,
      minInterval: 300000 // 5 minutes
    });
    
    // Clear old log buffers (from SessionLogger)
    this.registerCleanupAction({
      name: 'clear-log-buffers',
      priority: 5,
      execute: async () => {
        // This will be called by SessionLogger instances
        this.emit('clear-buffers');
      },
      canExecute: () => true,
      minInterval: 60000 // 1 minute
    });
    
    // Clear expired cache entries
    this.registerCleanupAction({
      name: 'clear-expired-cache',
      priority: 3,
      execute: async () => {
        // This will be called by cache managers
        this.emit('clear-cache');
      },
      canExecute: () => true,
      minInterval: 120000 // 2 minutes
    });
  }
  
  /**
   * Setup process event handlers
   */
  private setupProcessHandlers(): void {
    // Monitor for warnings
    process.on('warning', (warning) => {
      if (warning.name === 'MaxListenersExceededWarning') {
        logger.warn('Max listeners exceeded warning', {
          message: warning.message,
          stack: warning.stack
        });
        // Trigger moderate cleanup
        this.triggerCleanup(MemoryPressureLevel.MODERATE);
      }
    });
  }
  
  /**
   * Get maximum heap size
   */
  private getMaxHeapSize(): number {
    const heapStats = v8.getHeapStatistics();
    return heapStats.heap_size_limit;
  }
  
  /**
   * Format bytes to human readable
   */
  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }
  
  /**
   * Get memory monitor status
   */
  getStatus(): {
    running: boolean;
    stats: MemoryStats | null;
    cleanupHistory: Record<string, number>;
    gcCount: number;
    config: MemoryMonitorConfig;
  } {
    return {
      running: this.checkInterval !== null,
      stats: this.lastStats,
      cleanupHistory: Object.fromEntries(this.cleanupHistory),
      gcCount: this.gcCount,
      config: this.config
    };
  }
}

// Export singleton instance
export const memoryMonitor = MemoryMonitor.getInstance();