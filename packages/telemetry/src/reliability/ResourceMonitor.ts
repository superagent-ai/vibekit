import { EventEmitter } from 'events';
import * as os from 'os';

export interface ResourceThresholds {
  cpu?: {
    warning: number; // percentage
    critical: number;
  };
  memory?: {
    warning: number; // percentage
    critical: number;
  };
  eventLoop?: {
    warning: number; // milliseconds
    critical: number;
  };
  gc?: {
    warning: number; // frequency per minute
    critical: number;
  };
}

export interface ResourceMetrics {
  timestamp: number;
  cpu: {
    usage: number;
    user: number;
    system: number;
  };
  memory: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
    percentage: number;
  };
  eventLoop: {
    latency: number;
    utilization: number;
  };
  gc?: {
    count: number;
    duration: number;
    type: string;
  };
  system: {
    loadAverage: number[];
    freeMemory: number;
    totalMemory: number;
  };
}

export interface ResourceAlert {
  type: 'cpu' | 'memory' | 'eventLoop' | 'gc';
  severity: 'warning' | 'critical';
  value: number;
  threshold: number;
  message: string;
  timestamp: number;
}

export class ResourceMonitor extends EventEmitter {
  private thresholds: Required<ResourceThresholds>;
  private metrics: ResourceMetrics[] = [];
  private monitorInterval?: NodeJS.Timeout;
  private eventLoopMonitor?: NodeJS.Timeout;
  private lastEventLoopCheck = Date.now();
  private gcStats = {
    count: 0,
    lastMinute: [] as number[],
  };
  private lastCpuUsage = process.cpuUsage();
  private lastCpuTime = Date.now();
  private isMonitoring = false;
  
  constructor(thresholds: ResourceThresholds = {}) {
    super();
    
    this.thresholds = {
      cpu: thresholds.cpu || { warning: 70, critical: 90 },
      memory: thresholds.memory || { warning: 70, critical: 85 },
      eventLoop: thresholds.eventLoop || { warning: 100, critical: 250 },
      gc: thresholds.gc || { warning: 10, critical: 20 },
    };
    
    this.setupGCMonitoring();
  }
  
  private setupGCMonitoring(): void {
    try {
      // Try to enable GC stats if available
      const perfHooks = require('perf_hooks');
      const obs = new perfHooks.PerformanceObserver((list: any) => {
        const entries = list.getEntries();
        entries.forEach((entry: any) => {
          if (entry.name === 'gc') {
            this.gcStats.count++;
            this.gcStats.lastMinute.push(Date.now());
            
            // Clean old entries
            const oneMinuteAgo = Date.now() - 60000;
            this.gcStats.lastMinute = this.gcStats.lastMinute.filter(
              time => time > oneMinuteAgo
            );
            
            this.emit('gc', {
              count: this.gcStats.count,
              duration: entry.duration,
              type: entry.detail?.kind || 'unknown',
            });
          }
        });
      });
      
      obs.observe({ entryTypes: ['gc'] });
    } catch (error) {
      // GC monitoring not available
      console.debug('GC monitoring not available');
    }
  }
  
  start(intervalMs: number = 5000): void {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    
    // Start event loop monitoring
    this.monitorEventLoop();
    
    // Start resource monitoring
    this.monitorInterval = setInterval(() => {
      this.collectMetrics();
    }, intervalMs);
    
    // Collect initial metrics
    this.collectMetrics();
  }
  
  stop(): void {
    this.isMonitoring = false;
    
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = undefined;
    }
    
    if (this.eventLoopMonitor) {
      clearTimeout(this.eventLoopMonitor);
      this.eventLoopMonitor = undefined;
    }
  }
  
  private monitorEventLoop(): void {
    const checkEventLoop = () => {
      const start = Date.now();
      
      setImmediate(() => {
        const latency = Date.now() - start;
        this.lastEventLoopCheck = Date.now();
        
        // Check threshold
        if (latency > this.thresholds.eventLoop.critical) {
          this.emitAlert({
            type: 'eventLoop',
            severity: 'critical',
            value: latency,
            threshold: this.thresholds.eventLoop.critical,
            message: `Event loop latency critical: ${latency}ms`,
            timestamp: Date.now(),
          });
        } else if (latency > this.thresholds.eventLoop.warning) {
          this.emitAlert({
            type: 'eventLoop',
            severity: 'warning',
            value: latency,
            threshold: this.thresholds.eventLoop.warning,
            message: `Event loop latency warning: ${latency}ms`,
            timestamp: Date.now(),
          });
        }
        
        if (this.isMonitoring) {
          this.eventLoopMonitor = setTimeout(checkEventLoop, 1000);
        }
      });
    };
    
    checkEventLoop();
  }
  
  private collectMetrics(): void {
    const currentCpuUsage = process.cpuUsage();
    const currentTime = Date.now();
    
    // Calculate CPU usage
    const userDelta = currentCpuUsage.user - this.lastCpuUsage.user;
    const systemDelta = currentCpuUsage.system - this.lastCpuUsage.system;
    const timeDelta = (currentTime - this.lastCpuTime) * 1000; // Convert to microseconds
    
    const cpuUser = (userDelta / timeDelta) * 100;
    const cpuSystem = (systemDelta / timeDelta) * 100;
    const cpuTotal = cpuUser + cpuSystem;
    
    // Memory metrics
    const memUsage = process.memoryUsage();
    const totalSystemMemory = os.totalmem();
    const memoryPercentage = (memUsage.rss / totalSystemMemory) * 100;
    
    // Event loop metrics (approximate)
    const eventLoopLatency = Date.now() - this.lastEventLoopCheck;
    const eventLoopUtilization = Math.min(100, (eventLoopLatency / 1000) * 100);
    
    const metrics: ResourceMetrics = {
      timestamp: currentTime,
      cpu: {
        usage: cpuTotal,
        user: cpuUser,
        system: cpuSystem,
      },
      memory: {
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        external: memUsage.external,
        rss: memUsage.rss,
        percentage: memoryPercentage,
      },
      eventLoop: {
        latency: eventLoopLatency,
        utilization: eventLoopUtilization,
      },
      system: {
        loadAverage: os.loadavg(),
        freeMemory: os.freemem(),
        totalMemory: totalSystemMemory,
      },
    };
    
    // Add GC stats if available
    if (this.gcStats.lastMinute.length > 0) {
      metrics.gc = {
        count: this.gcStats.count,
        duration: 0, // Would need to track this
        type: 'mixed',
      };
    }
    
    // Store metrics
    this.metrics.push(metrics);
    
    // Keep only last 1000 metrics
    if (this.metrics.length > 1000) {
      this.metrics = this.metrics.slice(-1000);
    }
    
    // Check thresholds
    this.checkThresholds(metrics);
    
    // Update for next iteration
    this.lastCpuUsage = currentCpuUsage;
    this.lastCpuTime = currentTime;
    
    // Emit metrics
    this.emit('metrics', metrics);
  }
  
  private checkThresholds(metrics: ResourceMetrics): void {
    // CPU threshold
    if (metrics.cpu.usage > this.thresholds.cpu.critical) {
      this.emitAlert({
        type: 'cpu',
        severity: 'critical',
        value: metrics.cpu.usage,
        threshold: this.thresholds.cpu.critical,
        message: `CPU usage critical: ${metrics.cpu.usage.toFixed(1)}%`,
        timestamp: Date.now(),
      });
    } else if (metrics.cpu.usage > this.thresholds.cpu.warning) {
      this.emitAlert({
        type: 'cpu',
        severity: 'warning',
        value: metrics.cpu.usage,
        threshold: this.thresholds.cpu.warning,
        message: `CPU usage warning: ${metrics.cpu.usage.toFixed(1)}%`,
        timestamp: Date.now(),
      });
    }
    
    // Memory threshold
    const heapPercentage = (metrics.memory.heapUsed / metrics.memory.heapTotal) * 100;
    if (heapPercentage > this.thresholds.memory.critical) {
      this.emitAlert({
        type: 'memory',
        severity: 'critical',
        value: heapPercentage,
        threshold: this.thresholds.memory.critical,
        message: `Heap memory critical: ${heapPercentage.toFixed(1)}%`,
        timestamp: Date.now(),
      });
    } else if (heapPercentage > this.thresholds.memory.warning) {
      this.emitAlert({
        type: 'memory',
        severity: 'warning',
        value: heapPercentage,
        threshold: this.thresholds.memory.warning,
        message: `Heap memory warning: ${heapPercentage.toFixed(1)}%`,
        timestamp: Date.now(),
      });
    }
    
    // GC threshold
    if (this.gcStats.lastMinute.length > this.thresholds.gc.critical) {
      this.emitAlert({
        type: 'gc',
        severity: 'critical',
        value: this.gcStats.lastMinute.length,
        threshold: this.thresholds.gc.critical,
        message: `GC frequency critical: ${this.gcStats.lastMinute.length} collections/min`,
        timestamp: Date.now(),
      });
    } else if (this.gcStats.lastMinute.length > this.thresholds.gc.warning) {
      this.emitAlert({
        type: 'gc',
        severity: 'warning',
        value: this.gcStats.lastMinute.length,
        threshold: this.thresholds.gc.warning,
        message: `GC frequency warning: ${this.gcStats.lastMinute.length} collections/min`,
        timestamp: Date.now(),
      });
    }
  }
  
  private emitAlert(alert: ResourceAlert): void {
    this.emit('alert', alert);
  }
  
  getLatestMetrics(): ResourceMetrics | null {
    return this.metrics[this.metrics.length - 1] || null;
  }
  
  getMetricsHistory(duration: number = 300000): ResourceMetrics[] {
    const cutoff = Date.now() - duration;
    return this.metrics.filter(m => m.timestamp >= cutoff);
  }
  
  getAverageMetrics(duration: number = 300000): Partial<ResourceMetrics> | null {
    const history = this.getMetricsHistory(duration);
    if (history.length === 0) return null;
    
    const sum = history.reduce((acc, metrics) => ({
      cpu: {
        usage: acc.cpu.usage + metrics.cpu.usage,
        user: acc.cpu.user + metrics.cpu.user,
        system: acc.cpu.system + metrics.cpu.system,
      },
      memory: {
        heapUsed: acc.memory.heapUsed + metrics.memory.heapUsed,
        heapTotal: acc.memory.heapTotal + metrics.memory.heapTotal,
        percentage: acc.memory.percentage + metrics.memory.percentage,
      },
      eventLoop: {
        latency: acc.eventLoop.latency + metrics.eventLoop.latency,
        utilization: acc.eventLoop.utilization + metrics.eventLoop.utilization,
      },
    }), {
      cpu: { usage: 0, user: 0, system: 0 },
      memory: { heapUsed: 0, heapTotal: 0, percentage: 0 },
      eventLoop: { latency: 0, utilization: 0 },
    });
    
    const count = history.length;
    
    return {
      cpu: {
        usage: sum.cpu.usage / count,
        user: sum.cpu.user / count,
        system: sum.cpu.system / count,
      },
      memory: {
        heapUsed: sum.memory.heapUsed / count,
        heapTotal: sum.memory.heapTotal / count,
        external: 0,
        rss: 0,
        percentage: sum.memory.percentage / count,
      },
      eventLoop: {
        latency: sum.eventLoop.latency / count,
        utilization: sum.eventLoop.utilization / count,
      },
    };
  }
  
  getPeakMetrics(duration: number = 300000): Partial<ResourceMetrics> | null {
    const history = this.getMetricsHistory(duration);
    if (history.length === 0) return null;
    
    return {
      cpu: {
        usage: Math.max(...history.map(m => m.cpu.usage)),
        user: Math.max(...history.map(m => m.cpu.user)),
        system: Math.max(...history.map(m => m.cpu.system)),
      },
      memory: {
        heapUsed: Math.max(...history.map(m => m.memory.heapUsed)),
        heapTotal: Math.max(...history.map(m => m.memory.heapTotal)),
        external: Math.max(...history.map(m => m.memory.external)),
        rss: Math.max(...history.map(m => m.memory.rss)),
        percentage: Math.max(...history.map(m => m.memory.percentage)),
      },
      eventLoop: {
        latency: Math.max(...history.map(m => m.eventLoop.latency)),
        utilization: Math.max(...history.map(m => m.eventLoop.utilization)),
      },
    };
  }
  
  updateThresholds(newThresholds: ResourceThresholds): void {
    this.thresholds = {
      ...this.thresholds,
      ...newThresholds,
    };
  }
  
  shutdown(): void {
    this.stop();
    this.metrics = [];
    this.removeAllListeners();
  }
}