/**
 * Comprehensive Health Check System
 * 
 * Provides detailed health status monitoring for all system components
 * including memory, connections, sessions, and external dependencies.
 */

import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { performance } from 'perf_hooks';
import { createLogger } from './structured-logger';
import { memoryMonitor, MemoryPressureLevel } from './memory-monitor';
import { shutdownCoordinator } from './shutdown-coordinator';
import { SessionManager } from './session-manager';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const logger = createLogger('HealthCheck');

/**
 * Health status levels
 */
export enum HealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy',
  CRITICAL = 'critical'
}

/**
 * Component health information
 */
export interface ComponentHealth {
  name: string;
  status: HealthStatus;
  message: string;
  metrics?: Record<string, any>;
  lastCheck: number;
  responseTime?: number;
}

/**
 * System health report
 */
export interface HealthReport {
  status: HealthStatus;
  timestamp: number;
  uptime: number;
  components: ComponentHealth[];
  metrics: {
    memory: MemoryMetrics;
    connections: ConnectionMetrics;
    disk: DiskMetrics;
    process: ProcessMetrics;
  };
  checks: {
    readiness: boolean;
    liveness: boolean;
  };
}

/**
 * Memory metrics
 */
interface MemoryMetrics {
  heapUsed: number;
  heapTotal: number;
  rss: number;
  external: number;
  usagePercent: number;
  pressureLevel: MemoryPressureLevel;
}

/**
 * Connection metrics
 */
interface ConnectionMetrics {
  active: number;
  maxAllowed: number;
  utilizationPercent: number;
  streams: number;
  websockets: number;
}

/**
 * Disk metrics
 */
interface DiskMetrics {
  available: number;
  used: number;
  usagePercent: number;
  vibekitDir?: {
    size: number;
    files: number;
  };
}

/**
 * Process metrics
 */
interface ProcessMetrics {
  pid: number;
  uptime: number;
  cpuUsage: NodeJS.CpuUsage;
  handles: number;
  requests: number;
}

/**
 * Health check configuration
 */
export interface HealthCheckConfig {
  checkInterval?: number;        // How often to run checks (ms)
  componentTimeout?: number;      // Timeout for individual component checks (ms)
  diskThreshold?: number;        // Disk usage threshold (0-1)
  memoryThreshold?: number;      // Memory usage threshold (0-1)
  connectionThreshold?: number;   // Connection usage threshold (0-1)
}

/**
 * Health Check implementation
 */
export class HealthCheck {
  private static instance: HealthCheck;
  private config: Required<HealthCheckConfig>;
  private lastReport: HealthReport | null = null;
  private checkInterval: NodeJS.Timeout | null = null;
  private isChecking = false;
  private componentCheckers = new Map<string, () => Promise<ComponentHealth>>();
  private startTime = Date.now();
  private requestCount = 0;
  
  // Cached metrics
  private activeConnections = 0;
  private activeStreams = 0;
  private activeWebsockets = 0;
  
  private constructor(config: HealthCheckConfig = {}) {
    this.config = {
      checkInterval: config.checkInterval ?? 30000, // 30 seconds
      componentTimeout: config.componentTimeout ?? 5000, // 5 seconds
      diskThreshold: config.diskThreshold ?? 0.90, // 90% disk usage
      memoryThreshold: config.memoryThreshold ?? 0.85, // 85% memory usage
      connectionThreshold: config.connectionThreshold ?? 0.80 // 80% connection usage
    };
    
    this.registerDefaultCheckers();
  }
  
  /**
   * Get singleton instance
   */
  static getInstance(config?: HealthCheckConfig): HealthCheck {
    if (!HealthCheck.instance) {
      HealthCheck.instance = new HealthCheck(config);
    }
    return HealthCheck.instance;
  }
  
  /**
   * Register default component checkers
   */
  private registerDefaultCheckers(): void {
    // Memory health check
    this.registerChecker('memory', async () => {
      const memStats = memoryMonitor.getMemoryStats();
      const status = this.getMemoryHealthStatus(memStats.usagePercent);
      
      return {
        name: 'memory',
        status,
        message: this.getMemoryMessage(status, memStats.usagePercent),
        metrics: {
          heapUsed: memStats.heapUsed,
          heapTotal: memStats.heapTotal,
          usagePercent: memStats.usagePercent,
          pressureLevel: memStats.pressureLevel
        },
        lastCheck: Date.now()
      };
    });
    
    // Session Manager health check
    this.registerChecker('sessions', async () => {
      try {
        const stats = await SessionManager.getStats();
        const status = stats.activeSessions > 100 ? HealthStatus.DEGRADED : HealthStatus.HEALTHY;
        
        return {
          name: 'sessions',
          status,
          message: `${stats.activeSessions} active sessions`,
          metrics: {
            active: stats.activeSessions,
            total: stats.totalSessions,
            abandoned: stats.abandonedSessions
          },
          lastCheck: Date.now()
        };
      } catch (error) {
        return {
          name: 'sessions',
          status: HealthStatus.UNHEALTHY,
          message: 'Failed to get session stats',
          lastCheck: Date.now()
        };
      }
    });
    
    // Disk space health check
    this.registerChecker('disk', async () => {
      try {
        const diskMetrics = await this.getDiskMetrics();
        const status = this.getDiskHealthStatus(diskMetrics.usagePercent);
        
        return {
          name: 'disk',
          status,
          message: this.getDiskMessage(status, diskMetrics.usagePercent),
          metrics: diskMetrics,
          lastCheck: Date.now()
        };
      } catch (error) {
        return {
          name: 'disk',
          status: HealthStatus.UNHEALTHY,
          message: 'Failed to check disk space',
          lastCheck: Date.now()
        };
      }
    });
    
    // Docker health check
    this.registerChecker('docker', async () => {
      try {
        const startTime = performance.now();
        await execAsync('docker version --format "{{.Server.Version}}"');
        const responseTime = performance.now() - startTime;
        
        return {
          name: 'docker',
          status: HealthStatus.HEALTHY,
          message: 'Docker is available',
          responseTime,
          lastCheck: Date.now()
        };
      } catch (error) {
        return {
          name: 'docker',
          status: HealthStatus.UNHEALTHY,
          message: 'Docker is not available',
          lastCheck: Date.now()
        };
      }
    });
    
    // File system health check
    this.registerChecker('filesystem', async () => {
      try {
        const vibekitDir = path.join(os.homedir(), '.vibekit');
        const startTime = performance.now();
        
        // Test read/write access
        const testFile = path.join(vibekitDir, '.health-check');
        await fs.writeFile(testFile, Date.now().toString());
        const content = await fs.readFile(testFile, 'utf-8');
        await fs.unlink(testFile);
        
        const responseTime = performance.now() - startTime;
        
        return {
          name: 'filesystem',
          status: HealthStatus.HEALTHY,
          message: 'File system is accessible',
          responseTime,
          lastCheck: Date.now()
        };
      } catch (error) {
        return {
          name: 'filesystem',
          status: HealthStatus.CRITICAL,
          message: 'File system is not accessible',
          lastCheck: Date.now()
        };
      }
    });
    
    // Shutdown status check
    this.registerChecker('shutdown', async () => {
      const isShuttingDown = shutdownCoordinator.isShutdownInProgress();
      
      return {
        name: 'shutdown',
        status: isShuttingDown ? HealthStatus.UNHEALTHY : HealthStatus.HEALTHY,
        message: isShuttingDown ? 'System is shutting down' : 'System is running',
        metrics: isShuttingDown ? shutdownCoordinator.getStatus() : undefined,
        lastCheck: Date.now()
      };
    });
  }
  
  /**
   * Register a component health checker
   */
  registerChecker(name: string, checker: () => Promise<ComponentHealth>): void {
    this.componentCheckers.set(name, checker);
    logger.info('Registered health checker', { component: name });
  }
  
  /**
   * Run all health checks
   */
  async check(): Promise<HealthReport> {
    if (this.isChecking) {
      // Return cached report if check is in progress
      if (this.lastReport) {
        return this.lastReport;
      }
    }
    
    this.isChecking = true;
    const checkStartTime = performance.now();
    
    try {
      // Run all component checks in parallel with timeout
      const componentPromises = Array.from(this.componentCheckers.entries()).map(
        async ([name, checker]) => {
          try {
            const timeoutPromise = new Promise<ComponentHealth>((_, reject) => {
              setTimeout(() => reject(new Error('Check timeout')), this.config.componentTimeout);
            });
            
            const result = await Promise.race([checker(), timeoutPromise]);
            result.responseTime = performance.now() - checkStartTime;
            return result;
          } catch (error) {
            logger.error('Component health check failed', error, { component: name });
            return {
              name,
              status: HealthStatus.UNHEALTHY,
              message: 'Health check failed',
              lastCheck: Date.now()
            };
          }
        }
      );
      
      const components = await Promise.all(componentPromises);
      
      // Get system metrics
      const metrics = await this.getSystemMetrics();
      
      // Determine overall status
      const overallStatus = this.determineOverallStatus(components);
      
      // Check readiness and liveness
      const readiness = this.checkReadiness(overallStatus, components);
      const liveness = this.checkLiveness(overallStatus);
      
      this.lastReport = {
        status: overallStatus,
        timestamp: Date.now(),
        uptime: Date.now() - this.startTime,
        components,
        metrics,
        checks: {
          readiness,
          liveness
        }
      };
      
      const checkDuration = performance.now() - checkStartTime;
      logger.info('Health check completed', {
        status: overallStatus,
        durationMs: checkDuration,
        componentCount: components.length
      });
      
      return this.lastReport;
      
    } finally {
      this.isChecking = false;
    }
  }
  
  /**
   * Get system metrics
   */
  private async getSystemMetrics(): Promise<HealthReport['metrics']> {
    const memStats = memoryMonitor.getMemoryStats();
    const diskMetrics = await this.getDiskMetrics();
    
    return {
      memory: {
        heapUsed: memStats.heapUsed,
        heapTotal: memStats.heapTotal,
        rss: memStats.rss,
        external: memStats.external,
        usagePercent: memStats.usagePercent,
        pressureLevel: memStats.pressureLevel
      },
      connections: {
        active: this.activeConnections,
        maxAllowed: 100, // From MAX_CONCURRENT_CONNECTIONS
        utilizationPercent: this.activeConnections / 100,
        streams: this.activeStreams,
        websockets: this.activeWebsockets
      },
      disk: diskMetrics,
      process: {
        pid: process.pid,
        uptime: process.uptime(),
        cpuUsage: process.cpuUsage(),
        handles: (process as any)._getActiveHandles?.()?.length || 0,
        requests: this.requestCount
      }
    };
  }
  
  /**
   * Get disk metrics
   */
  private async getDiskMetrics(): Promise<DiskMetrics> {
    try {
      // Get disk usage (platform-specific)
      let diskUsage: { available: number; used: number; total: number };
      
      if (process.platform === 'darwin' || process.platform === 'linux') {
        const { stdout } = await execAsync('df -k /');
        const lines = stdout.trim().split('\n');
        const values = lines[1].split(/\s+/);
        const total = parseInt(values[1]) * 1024;
        const used = parseInt(values[2]) * 1024;
        const available = parseInt(values[3]) * 1024;
        diskUsage = { total, used, available };
      } else {
        // Windows or unsupported platform
        diskUsage = { total: 0, used: 0, available: 0 };
      }
      
      // Get VibeKit directory size
      let vibekitDirStats;
      try {
        const vibekitDir = path.join(os.homedir(), '.vibekit');
        const stats = await this.getDirectorySize(vibekitDir);
        vibekitDirStats = stats;
      } catch {
        // Directory might not exist
      }
      
      return {
        available: diskUsage.available,
        used: diskUsage.used,
        usagePercent: diskUsage.total > 0 ? diskUsage.used / diskUsage.total : 0,
        vibekitDir: vibekitDirStats
      };
    } catch (error) {
      logger.error('Failed to get disk metrics', error);
      return {
        available: 0,
        used: 0,
        usagePercent: 0,
        vibekitDir: undefined
      };
    }
  }
  
  /**
   * Get directory size
   */
  private async getDirectorySize(dir: string): Promise<{ size: number; files: number }> {
    let totalSize = 0;
    let fileCount = 0;
    
    async function walkDir(currentPath: string): Promise<void> {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);
        
        if (entry.isDirectory()) {
          await walkDir(fullPath);
        } else {
          const stats = await fs.stat(fullPath);
          totalSize += stats.size;
          fileCount++;
        }
      }
    }
    
    await walkDir(dir);
    return { size: totalSize, files: fileCount };
  }
  
  /**
   * Determine overall health status
   */
  private determineOverallStatus(components: ComponentHealth[]): HealthStatus {
    const statuses = components.map(c => c.status);
    
    if (statuses.includes(HealthStatus.CRITICAL)) {
      return HealthStatus.CRITICAL;
    }
    if (statuses.includes(HealthStatus.UNHEALTHY)) {
      return HealthStatus.UNHEALTHY;
    }
    if (statuses.includes(HealthStatus.DEGRADED)) {
      return HealthStatus.DEGRADED;
    }
    return HealthStatus.HEALTHY;
  }
  
  /**
   * Check readiness (ready to accept traffic)
   */
  private checkReadiness(overallStatus: HealthStatus, components: ComponentHealth[]): boolean {
    // System is ready if not critical and essential components are healthy
    if (overallStatus === HealthStatus.CRITICAL) {
      return false;
    }
    
    // Check essential components
    const essentialComponents = ['filesystem', 'memory', 'shutdown'];
    const essentialStatuses = components
      .filter(c => essentialComponents.includes(c.name))
      .map(c => c.status);
    
    return !essentialStatuses.includes(HealthStatus.CRITICAL) &&
           !essentialStatuses.includes(HealthStatus.UNHEALTHY);
  }
  
  /**
   * Check liveness (application is alive)
   */
  private checkLiveness(overallStatus: HealthStatus): boolean {
    // Application is alive if not in critical state
    return overallStatus !== HealthStatus.CRITICAL;
  }
  
  /**
   * Get memory health status
   */
  private getMemoryHealthStatus(usagePercent: number): HealthStatus {
    if (usagePercent >= 0.95) return HealthStatus.CRITICAL;
    if (usagePercent >= this.config.memoryThreshold) return HealthStatus.UNHEALTHY;
    if (usagePercent >= 0.70) return HealthStatus.DEGRADED;
    return HealthStatus.HEALTHY;
  }
  
  /**
   * Get memory message
   */
  private getMemoryMessage(status: HealthStatus, usagePercent: number): string {
    const percent = (usagePercent * 100).toFixed(1);
    switch (status) {
      case HealthStatus.CRITICAL:
        return `Critical memory usage: ${percent}%`;
      case HealthStatus.UNHEALTHY:
        return `High memory usage: ${percent}%`;
      case HealthStatus.DEGRADED:
        return `Moderate memory usage: ${percent}%`;
      default:
        return `Memory usage: ${percent}%`;
    }
  }
  
  /**
   * Get disk health status
   */
  private getDiskHealthStatus(usagePercent: number): HealthStatus {
    if (usagePercent >= 0.95) return HealthStatus.CRITICAL;
    if (usagePercent >= this.config.diskThreshold) return HealthStatus.UNHEALTHY;
    if (usagePercent >= 0.80) return HealthStatus.DEGRADED;
    return HealthStatus.HEALTHY;
  }
  
  /**
   * Get disk message
   */
  private getDiskMessage(status: HealthStatus, usagePercent: number): string {
    const percent = (usagePercent * 100).toFixed(1);
    switch (status) {
      case HealthStatus.CRITICAL:
        return `Critical disk usage: ${percent}%`;
      case HealthStatus.UNHEALTHY:
        return `High disk usage: ${percent}%`;
      case HealthStatus.DEGRADED:
        return `Moderate disk usage: ${percent}%`;
      default:
        return `Disk usage: ${percent}%`;
    }
  }
  
  /**
   * Start periodic health checks
   */
  start(): void {
    if (this.checkInterval) {
      return; // Already running
    }
    
    logger.info('Starting periodic health checks', {
      interval: this.config.checkInterval
    });
    
    // Initial check
    this.check().catch(err => logger.error('Health check failed', err));
    
    // Periodic checks
    this.checkInterval = setInterval(() => {
      this.check().catch(err => logger.error('Health check failed', err));
    }, this.config.checkInterval);
  }
  
  /**
   * Stop periodic health checks
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    
    logger.info('Stopped periodic health checks');
  }
  
  /**
   * Update connection metrics
   */
  updateConnectionMetrics(connections: number, streams: number, websockets: number): void {
    this.activeConnections = connections;
    this.activeStreams = streams;
    this.activeWebsockets = websockets;
  }
  
  /**
   * Increment request count
   */
  incrementRequestCount(): void {
    this.requestCount++;
  }
  
  /**
   * Get last health report
   */
  getLastReport(): HealthReport | null {
    return this.lastReport;
  }
  
  /**
   * Express/Next.js middleware for health endpoint
   */
  async handleHealthRequest(endpoint: 'health' | 'ready' | 'live'): Promise<{
    status: number;
    body: any;
  }> {
    const report = await this.check();
    
    switch (endpoint) {
      case 'ready':
        return {
          status: report.checks.readiness ? 200 : 503,
          body: {
            ready: report.checks.readiness,
            status: report.status,
            timestamp: report.timestamp
          }
        };
      
      case 'live':
        return {
          status: report.checks.liveness ? 200 : 503,
          body: {
            alive: report.checks.liveness,
            status: report.status,
            timestamp: report.timestamp
          }
        };
      
      case 'health':
      default:
        const statusCode = report.status === HealthStatus.HEALTHY ? 200 :
                          report.status === HealthStatus.DEGRADED ? 200 :
                          report.status === HealthStatus.UNHEALTHY ? 503 : 503;
        
        return {
          status: statusCode,
          body: report
        };
    }
  }
}

// Export singleton instance
export const healthCheck = HealthCheck.getInstance();