/**
 * Disk Space Monitor with Alerts
 * 
 * Monitors disk usage and triggers alerts when thresholds are exceeded.
 * Provides automatic cleanup suggestions and actions.
 */

import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { createLogger } from './structured-logger';

const execAsync = promisify(exec);
const logger = createLogger('DiskMonitor');

/**
 * Disk alert levels
 */
export enum DiskAlertLevel {
  NORMAL = 'normal',      // < 70% usage
  WARNING = 'warning',    // 70-85% usage
  CRITICAL = 'critical',  // 85-95% usage
  EMERGENCY = 'emergency' // > 95% usage
}

/**
 * Disk usage statistics
 */
export interface DiskStats {
  total: number;
  used: number;
  available: number;
  usagePercent: number;
  alertLevel: DiskAlertLevel;
  vibekitUsage: {
    total: number;
    sessions: number;
    executions: number;
    analytics: number;
    logs: number;
    checkpoints: number;
  };
  timestamp: number;
}

/**
 * Cleanup action for disk space
 */
export interface DiskCleanupAction {
  name: string;
  description: string;
  estimatedSize: number;
  priority: number;
  execute: () => Promise<number>; // Returns bytes freed
}

/**
 * Disk monitor configuration
 */
export interface DiskMonitorConfig {
  checkInterval?: number;      // How often to check disk usage (ms)
  vibekitDir?: string;        // VibeKit data directory
  thresholds?: {
    warning?: number;   // Default 0.70 (70%)
    critical?: number;  // Default 0.85 (85%)
    emergency?: number; // Default 0.95 (95%)
  };
  autoCleanup?: boolean;      // Enable automatic cleanup
  maxVibekitSize?: number;    // Maximum size for VibeKit directory (bytes)
}

/**
 * Disk Monitor implementation
 */
export class DiskMonitor extends EventEmitter {
  private static instance: DiskMonitor;
  private config: Required<DiskMonitorConfig>;
  private checkInterval: NodeJS.Timeout | null = null;
  private lastStats: DiskStats | null = null;
  private cleanupActions: DiskCleanupAction[] = [];
  private isCleaningUp = false;
  private lastCleanupTime = 0;
  private readonly MIN_CLEANUP_INTERVAL = 300000; // 5 minutes
  
  private readonly thresholds: {
    warning: number;
    critical: number;
    emergency: number;
  };
  
  private constructor(config: DiskMonitorConfig = {}) {
    super();
    
    this.config = {
      checkInterval: config.checkInterval ?? 60000, // 1 minute
      vibekitDir: config.vibekitDir ?? path.join(os.homedir(), '.vibekit'),
      thresholds: config.thresholds ?? {},
      autoCleanup: config.autoCleanup ?? true,
      maxVibekitSize: config.maxVibekitSize ?? 1024 * 1024 * 1024 // 1GB default
    };
    
    this.thresholds = {
      warning: this.config.thresholds.warning ?? 0.70,
      critical: this.config.thresholds.critical ?? 0.85,
      emergency: this.config.thresholds.emergency ?? 0.95
    };
    
    this.registerDefaultCleanupActions();
  }
  
  /**
   * Get singleton instance
   */
  static getInstance(config?: DiskMonitorConfig): DiskMonitor {
    if (!DiskMonitor.instance) {
      DiskMonitor.instance = new DiskMonitor(config);
    }
    return DiskMonitor.instance;
  }
  
  /**
   * Start monitoring disk space
   */
  start(): void {
    if (this.checkInterval) {
      return; // Already running
    }
    
    logger.info('Starting disk monitor', {
      checkInterval: this.config.checkInterval,
      vibekitDir: this.config.vibekitDir,
      thresholds: this.thresholds
    });
    
    // Initial check
    this.checkDiskSpace();
    
    // Periodic checks
    this.checkInterval = setInterval(() => {
      this.checkDiskSpace();
    }, this.config.checkInterval);
  }
  
  /**
   * Stop monitoring disk space
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    
    logger.info('Stopped disk monitor');
  }
  
  /**
   * Check current disk space
   */
  private async checkDiskSpace(): Promise<void> {
    try {
      const stats = await this.getDiskStats();
      this.lastStats = stats;
      
      // Emit stats event
      this.emit('stats', stats);
      
      // Check for alert level changes
      const previousLevel = this.lastStats?.alertLevel;
      if (previousLevel && previousLevel !== stats.alertLevel) {
        logger.warn('Disk alert level changed', {
          from: previousLevel,
          to: stats.alertLevel,
          usagePercent: `${(stats.usagePercent * 100).toFixed(1)}%`
        });
        this.emit('alert-change', stats.alertLevel, stats);
      }
      
      // Log warnings for elevated levels
      if (stats.alertLevel !== DiskAlertLevel.NORMAL) {
        logger.warn('Disk space alert', {
          level: stats.alertLevel,
          used: this.formatBytes(stats.used),
          available: this.formatBytes(stats.available),
          usagePercent: `${(stats.usagePercent * 100).toFixed(1)}%`,
          vibekitUsage: this.formatBytes(stats.vibekitUsage.total)
        });
        
        // Emit alert
        this.emit('alert', stats.alertLevel, stats);
      }
      
      // Check VibeKit directory size
      if (stats.vibekitUsage.total > this.config.maxVibekitSize) {
        logger.warn('VibeKit directory exceeds size limit', {
          current: this.formatBytes(stats.vibekitUsage.total),
          limit: this.formatBytes(this.config.maxVibekitSize)
        });
        this.emit('vibekit-size-exceeded', stats.vibekitUsage);
      }
      
      // Trigger cleanup if needed
      if (this.config.autoCleanup && stats.alertLevel !== DiskAlertLevel.NORMAL) {
        await this.triggerCleanup(stats.alertLevel);
      }
      
    } catch (error) {
      logger.error('Failed to check disk space', error);
      this.emit('error', error);
    }
  }
  
  /**
   * Get disk statistics
   */
  async getDiskStats(): Promise<DiskStats> {
    // Get system disk usage
    const systemDisk = await this.getSystemDiskUsage();
    
    // Get VibeKit directory usage
    const vibekitUsage = await this.getVibekitUsage();
    
    // Determine alert level
    let alertLevel: DiskAlertLevel;
    if (systemDisk.usagePercent >= this.thresholds.emergency) {
      alertLevel = DiskAlertLevel.EMERGENCY;
    } else if (systemDisk.usagePercent >= this.thresholds.critical) {
      alertLevel = DiskAlertLevel.CRITICAL;
    } else if (systemDisk.usagePercent >= this.thresholds.warning) {
      alertLevel = DiskAlertLevel.WARNING;
    } else {
      alertLevel = DiskAlertLevel.NORMAL;
    }
    
    return {
      ...systemDisk,
      alertLevel,
      vibekitUsage,
      timestamp: Date.now()
    };
  }
  
  /**
   * Get system disk usage
   */
  private async getSystemDiskUsage(): Promise<{
    total: number;
    used: number;
    available: number;
    usagePercent: number;
  }> {
    try {
      if (process.platform === 'darwin' || process.platform === 'linux') {
        const { stdout } = await execAsync('df -k /');
        const lines = stdout.trim().split('\n');
        const values = lines[1].split(/\s+/);
        
        const total = parseInt(values[1]) * 1024;
        const used = parseInt(values[2]) * 1024;
        const available = parseInt(values[3]) * 1024;
        const usagePercent = total > 0 ? used / total : 0;
        
        return { total, used, available, usagePercent };
      } else if (process.platform === 'win32') {
        // Windows support using wmic
        const { stdout } = await execAsync(
          'wmic logicaldisk where "DeviceID=\'C:\'" get Size,FreeSpace /format:value'
        );
        const lines = stdout.trim().split('\n');
        let total = 0;
        let free = 0;
        
        for (const line of lines) {
          if (line.startsWith('FreeSpace=')) {
            free = parseInt(line.split('=')[1]) || 0;
          } else if (line.startsWith('Size=')) {
            total = parseInt(line.split('=')[1]) || 0;
          }
        }
        
        const used = total - free;
        const usagePercent = total > 0 ? used / total : 0;
        
        return {
          total,
          used,
          available: free,
          usagePercent
        };
      }
    } catch (error) {
      logger.error('Failed to get system disk usage', error);
    }
    
    // Fallback
    return {
      total: 0,
      used: 0,
      available: 0,
      usagePercent: 0
    };
  }
  
  /**
   * Get VibeKit directory usage
   */
  private async getVibekitUsage(): Promise<{
    total: number;
    sessions: number;
    executions: number;
    analytics: number;
    logs: number;
    checkpoints: number;
  }> {
    const usage = {
      total: 0,
      sessions: 0,
      executions: 0,
      analytics: 0,
      logs: 0,
      checkpoints: 0
    };
    
    try {
      // Check each subdirectory
      const dirs = {
        sessions: path.join(this.config.vibekitDir, 'sessions'),
        executions: path.join(this.config.vibekitDir, 'execution-history'),
        analytics: path.join(this.config.vibekitDir, 'analytics'),
        logs: path.join(this.config.vibekitDir, 'logs'),
        checkpoints: path.join(this.config.vibekitDir, 'checkpoints')
      };
      
      for (const [key, dir] of Object.entries(dirs)) {
        try {
          const size = await this.getDirectorySize(dir);
          usage[key as keyof typeof usage] = size;
          usage.total += size;
        } catch {
          // Directory might not exist
        }
      }
      
      // Also count any other files in the root
      try {
        const files = await fs.readdir(this.config.vibekitDir);
        for (const file of files) {
          const filePath = path.join(this.config.vibekitDir, file);
          const stats = await fs.stat(filePath);
          if (stats.isFile()) {
            usage.total += stats.size;
          }
        }
      } catch {
        // Directory might not exist
      }
      
    } catch (error) {
      logger.error('Failed to get VibeKit usage', error);
    }
    
    return usage;
  }
  
  /**
   * Get directory size recursively
   */
  private async getDirectorySize(dirPath: string): Promise<number> {
    let totalSize = 0;
    
    const items = await fs.readdir(dirPath);
    
    for (const item of items) {
      const itemPath = path.join(dirPath, item);
      const stats = await fs.stat(itemPath);
      
      if (stats.isDirectory()) {
        totalSize += await this.getDirectorySize(itemPath);
      } else {
        totalSize += stats.size;
      }
    }
    
    return totalSize;
  }
  
  /**
   * Register a cleanup action
   */
  registerCleanupAction(action: DiskCleanupAction): void {
    this.cleanupActions.push(action);
    this.cleanupActions.sort((a, b) => a.priority - b.priority);
    
    logger.info('Registered disk cleanup action', {
      name: action.name,
      priority: action.priority
    });
  }
  
  /**
   * Trigger cleanup based on alert level
   */
  private async triggerCleanup(level: DiskAlertLevel): Promise<void> {
    // Check minimum interval
    const now = Date.now();
    if (now - this.lastCleanupTime < this.MIN_CLEANUP_INTERVAL) {
      return;
    }
    
    if (this.isCleaningUp) {
      return;
    }
    
    this.isCleaningUp = true;
    this.lastCleanupTime = now;
    
    try {
      logger.info('Starting disk cleanup', { level });
      
      let totalFreed = 0;
      let actionsToExecute: DiskCleanupAction[] = [];
      
      // Determine cleanup actions based on level
      switch (level) {
        case DiskAlertLevel.WARNING:
          actionsToExecute = this.cleanupActions.slice(0, 2);
          break;
        case DiskAlertLevel.CRITICAL:
          actionsToExecute = this.cleanupActions.slice(0, 4);
          break;
        case DiskAlertLevel.EMERGENCY:
          actionsToExecute = [...this.cleanupActions];
          break;
      }
      
      // Execute cleanup actions
      for (const action of actionsToExecute) {
        try {
          logger.info('Executing disk cleanup action', {
            name: action.name,
            estimatedSize: this.formatBytes(action.estimatedSize)
          });
          
          const freed = await action.execute();
          totalFreed += freed;
          
          logger.info('Disk cleanup action completed', {
            name: action.name,
            freedSpace: this.formatBytes(freed)
          });
          
          this.emit('cleanup', action.name, freed);
        } catch (error) {
          logger.error('Disk cleanup action failed', error, { action: action.name });
        }
      }
      
      logger.info('Disk cleanup completed', {
        level,
        totalFreed: this.formatBytes(totalFreed),
        actionsExecuted: actionsToExecute.length
      });
      
      // Re-check disk space after cleanup
      await this.checkDiskSpace();
      
    } finally {
      this.isCleaningUp = false;
    }
  }
  
  /**
   * Register default cleanup actions
   */
  private registerDefaultCleanupActions(): void {
    // Clean old session logs (> 7 days)
    this.registerCleanupAction({
      name: 'clean-old-sessions',
      description: 'Remove session logs older than 7 days',
      estimatedSize: 100 * 1024 * 1024, // 100MB estimate
      priority: 1,
      execute: async () => {
        const sessionsDir = path.join(this.config.vibekitDir, 'sessions');
        const now = Date.now();
        const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
        let freedSpace = 0;
        
        try {
          const files = await fs.readdir(sessionsDir);
          
          for (const file of files) {
            if (!file.endsWith('.jsonl')) continue;
            
            const filePath = path.join(sessionsDir, file);
            const stats = await fs.stat(filePath);
            
            if (now - stats.mtime.getTime() > maxAge) {
              freedSpace += stats.size;
              await fs.unlink(filePath);
              logger.info('Deleted old session file', { file, age: `${Math.round((now - stats.mtime.getTime()) / (24 * 60 * 60 * 1000))} days` });
            }
          }
        } catch (error) {
          logger.error('Failed to clean old sessions', error);
        }
        
        return freedSpace;
      }
    });
    
    // Clean execution history (> 30 days)
    this.registerCleanupAction({
      name: 'clean-old-executions',
      description: 'Remove execution history older than 30 days',
      estimatedSize: 50 * 1024 * 1024, // 50MB estimate
      priority: 2,
      execute: async () => {
        const executionsDir = path.join(this.config.vibekitDir, 'execution-history');
        const now = Date.now();
        const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
        let freedSpace = 0;
        
        try {
          const files = await fs.readdir(executionsDir);
          
          for (const file of files) {
            const filePath = path.join(executionsDir, file);
            const stats = await fs.stat(filePath);
            
            if (now - stats.mtime.getTime() > maxAge) {
              freedSpace += stats.size;
              await fs.unlink(filePath);
              logger.info('Deleted old execution file', { file });
            }
          }
        } catch (error) {
          logger.error('Failed to clean old executions', error);
        }
        
        return freedSpace;
      }
    });
    
    // Clean temporary checkpoints
    this.registerCleanupAction({
      name: 'clean-checkpoints',
      description: 'Remove temporary checkpoint files',
      estimatedSize: 20 * 1024 * 1024, // 20MB estimate
      priority: 3,
      execute: async () => {
        const checkpointsDir = path.join(this.config.vibekitDir, 'checkpoints');
        let freedSpace = 0;
        
        try {
          const files = await fs.readdir(checkpointsDir);
          
          for (const file of files) {
            if (file.endsWith('.tmp') || file.endsWith('.checkpoint')) {
              const filePath = path.join(checkpointsDir, file);
              const stats = await fs.stat(filePath);
              freedSpace += stats.size;
              await fs.unlink(filePath);
              logger.info('Deleted checkpoint file', { file });
            }
          }
        } catch (error) {
          logger.error('Failed to clean checkpoints', error);
        }
        
        return freedSpace;
      }
    });
    
    // Clean logs directory
    this.registerCleanupAction({
      name: 'clean-logs',
      description: 'Remove old log files',
      estimatedSize: 50 * 1024 * 1024, // 50MB estimate
      priority: 4,
      execute: async () => {
        const logsDir = path.join(this.config.vibekitDir, 'logs');
        const now = Date.now();
        const maxAge = 3 * 24 * 60 * 60 * 1000; // 3 days for logs
        let freedSpace = 0;
        
        try {
          const files = await fs.readdir(logsDir);
          
          for (const file of files) {
            const filePath = path.join(logsDir, file);
            const stats = await fs.stat(filePath);
            
            if (now - stats.mtime.getTime() > maxAge) {
              freedSpace += stats.size;
              await fs.unlink(filePath);
              logger.info('Deleted old log file', { file });
            }
          }
        } catch (error) {
          logger.error('Failed to clean logs', error);
        }
        
        return freedSpace;
      }
    });
  }
  
  /**
   * Format bytes to human readable
   */
  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }
  
  /**
   * Get current status
   */
  getStatus(): {
    running: boolean;
    stats: DiskStats | null;
    isCleaningUp: boolean;
    lastCleanupTime: number;
    config: DiskMonitorConfig;
  } {
    return {
      running: this.checkInterval !== null,
      stats: this.lastStats,
      isCleaningUp: this.isCleaningUp,
      lastCleanupTime: this.lastCleanupTime,
      config: this.config
    };
  }
  
  /**
   * Manually trigger cleanup
   */
  async cleanup(force = false): Promise<number> {
    if (!force && this.isCleaningUp) {
      throw new Error('Cleanup already in progress');
    }
    
    const stats = await this.getDiskStats();
    
    // Force emergency level to run all cleanup actions
    const level = force ? DiskAlertLevel.EMERGENCY : stats.alertLevel;
    
    if (level === DiskAlertLevel.NORMAL && !force) {
      logger.info('Disk space is normal, skipping cleanup');
      return 0;
    }
    
    // Temporarily override last cleanup time
    const savedTime = this.lastCleanupTime;
    this.lastCleanupTime = 0;
    
    try {
      await this.triggerCleanup(level);
      
      // Calculate freed space
      const newStats = await this.getDiskStats();
      const freedSpace = stats.used - newStats.used;
      
      return Math.max(0, freedSpace);
    } finally {
      if (!force) {
        this.lastCleanupTime = savedTime;
      }
    }
  }
}

// Export singleton instance
export const diskMonitor = DiskMonitor.getInstance();