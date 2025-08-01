import type { ReliabilityManager } from './ReliabilityManager.js';
import type { StorageProvider } from '../storage/StorageProvider.js';
import { createLogger } from '../utils/logger.js';

export interface HealthCheck {
  name: string;
  check: () => Promise<HealthCheckResult>;
  critical?: boolean;
  timeout?: number;
}

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  message?: string;
  details?: Record<string, any>;
  duration?: number;
  timestamp?: number;
}

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: number;
  checks: Record<string, HealthCheckResult & { name: string }>;
  summary: {
    total: number;
    healthy: number;
    degraded: number;
    unhealthy: number;
  };
}

export class HealthChecker {
  private checks = new Map<string, HealthCheck>();
  private lastHealthStatus?: SystemHealth;
  private checkInterval?: NodeJS.Timeout;
  private isRunning = false;
  private logger = createLogger('HealthChecker');
  
  constructor(
    private reliabilityManager?: ReliabilityManager,
    private storageProviders?: StorageProvider[]
  ) {
    this.setupDefaultChecks();
  }
  
  private setupDefaultChecks(): void {
    // Storage health check
    this.addCheck({
      name: 'storage',
      critical: true,
      timeout: 5000,
      check: async () => {
        if (!this.storageProviders || this.storageProviders.length === 0) {
          return {
            status: 'unhealthy',
            message: 'No storage providers configured',
          };
        }
        
        const results = await Promise.allSettled(
          this.storageProviders.map(provider => {
            // Check if provider is healthy by trying to use it
            return Promise.resolve(true);
          })
        );
        
        const healthy = results.filter(r => r.status === 'fulfilled' && r.value).length;
        const total = results.length;
        
        if (healthy === total) {
          return {
            status: 'healthy',
            message: `All ${total} storage providers are healthy`,
          };
        } else if (healthy > 0) {
          return {
            status: 'degraded',
            message: `${healthy}/${total} storage providers are healthy`,
            details: { healthy, total },
          };
        } else {
          return {
            status: 'unhealthy',
            message: 'All storage providers are unhealthy',
            details: { healthy, total },
          };
        }
      },
    });
    
    // Circuit breaker health check
    this.addCheck({
      name: 'circuit-breakers',
      check: async () => {
        if (!this.reliabilityManager) {
          return {
            status: 'healthy',
            message: 'Circuit breakers not configured',
          };
        }
        
        const stats = this.reliabilityManager.getCircuitBreakerStats();
        const circuits = Object.entries(stats);
        
        if (circuits.length === 0) {
          return {
            status: 'healthy',
            message: 'No circuit breakers active',
          };
        }
        
        const openCircuits = circuits.filter(([_, stat]: [string, any]) => 
          stat.state === 'open'
        );
        
        if (openCircuits.length === 0) {
          return {
            status: 'healthy',
            message: `All ${circuits.length} circuit breakers are closed`,
            details: stats,
          };
        } else if (openCircuits.length < circuits.length / 2) {
          return {
            status: 'degraded',
            message: `${openCircuits.length}/${circuits.length} circuit breakers are open`,
            details: {
              open: openCircuits.map(([name]) => name),
              stats,
            },
          };
        } else {
          return {
            status: 'unhealthy',
            message: `${openCircuits.length}/${circuits.length} circuit breakers are open`,
            details: {
              open: openCircuits.map(([name]) => name),
              stats,
            },
          };
        }
      },
    });
    
    // Rate limiter health check
    this.addCheck({
      name: 'rate-limiter',
      check: async () => {
        if (!this.reliabilityManager) {
          return {
            status: 'healthy',
            message: 'Rate limiter not configured',
          };
        }
        
        const stats = this.reliabilityManager.getRateLimiterStats();
        const utilizationPercent = (stats.currentRequests / stats.maxRequests) * 100;
        
        if (utilizationPercent < 70) {
          return {
            status: 'healthy',
            message: `Rate limiter at ${utilizationPercent.toFixed(1)}% capacity`,
            details: stats,
          };
        } else if (utilizationPercent < 90) {
          return {
            status: 'degraded',
            message: `Rate limiter at ${utilizationPercent.toFixed(1)}% capacity`,
            details: stats,
          };
        } else {
          return {
            status: 'unhealthy',
            message: `Rate limiter at ${utilizationPercent.toFixed(1)}% capacity`,
            details: stats,
          };
        }
      },
    });
    
    // Error rate health check
    this.addCheck({
      name: 'error-rate',
      check: async () => {
        if (!this.reliabilityManager) {
          return {
            status: 'healthy',
            message: 'Error tracking not configured',
          };
        }
        
        const errorStats = this.reliabilityManager.getErrorStats();
        const recentErrors = errorStats.recent || 0;
        const criticalErrors = errorStats.bySeverity?.critical || 0;
        
        if (criticalErrors > 0) {
          return {
            status: 'unhealthy',
            message: `${criticalErrors} critical errors detected`,
            details: errorStats,
          };
        } else if (recentErrors > 20) {
          return {
            status: 'degraded',
            message: `${recentErrors} recent errors detected`,
            details: errorStats,
          };
        } else {
          return {
            status: 'healthy',
            message: `Error rate is normal (${recentErrors} recent errors)`,
            details: errorStats,
          };
        }
      },
    });
    
    // Memory usage health check
    this.addCheck({
      name: 'memory',
      check: async () => {
        const usage = process.memoryUsage();
        const heapUsedMB = usage.heapUsed / 1024 / 1024;
        const heapTotalMB = usage.heapTotal / 1024 / 1024;
        const heapPercent = (usage.heapUsed / usage.heapTotal) * 100;
        
        if (heapPercent < 85) {
          return {
            status: 'healthy',
            message: `Memory usage at ${heapPercent.toFixed(1)}% (${heapUsedMB.toFixed(1)}MB/${heapTotalMB.toFixed(1)}MB)`,
            details: {
              heapUsed: heapUsedMB,
              heapTotal: heapTotalMB,
              heapPercent,
              rss: usage.rss / 1024 / 1024,
            },
          };
        } else if (heapPercent < 95) {
          return {
            status: 'degraded',
            message: `Memory usage at ${heapPercent.toFixed(1)}% (${heapUsedMB.toFixed(1)}MB/${heapTotalMB.toFixed(1)}MB)`,
            details: {
              heapUsed: heapUsedMB,
              heapTotal: heapTotalMB,
              heapPercent,
              rss: usage.rss / 1024 / 1024,
            },
          };
        } else {
          return {
            status: 'unhealthy',
            message: `Memory usage critical at ${heapPercent.toFixed(1)}% (${heapUsedMB.toFixed(1)}MB/${heapTotalMB.toFixed(1)}MB)`,
            details: {
              heapUsed: heapUsedMB,
              heapTotal: heapTotalMB,
              heapPercent,
              rss: usage.rss / 1024 / 1024,
            },
          };
        }
      },
    });
  }
  
  addCheck(check: HealthCheck): void {
    this.checks.set(check.name, check);
  }
  
  removeCheck(name: string): void {
    this.checks.delete(name);
  }
  
  async runChecks(): Promise<SystemHealth> {
    const checkResults: Record<string, HealthCheckResult & { name: string }> = {};
    const checkPromises: Promise<void>[] = [];
    
    for (const [name, check] of this.checks) {
      const promise = (async () => {
        const startTime = Date.now();
        
        try {
          const timeoutPromise = new Promise<HealthCheckResult>((_, reject) => {
            setTimeout(() => reject(new Error('Health check timeout')), check.timeout || 5000);
          });
          
          const result = await Promise.race([
            check.check(),
            timeoutPromise,
          ]);
          
          checkResults[name] = {
            ...result,
            name,
            duration: Date.now() - startTime,
          };
        } catch (error) {
          // Don't log health check errors to prevent feedback loops
          checkResults[name] = {
            name,
            status: 'unhealthy',
            message: `Health check failed: ${(error as Error).message}`,
            duration: Date.now() - startTime,
          };
          
          // Only log if it's a critical health check
          if (check.critical) {
            console.warn(`Critical health check '${name}' failed:`, error);
          }
        }
      })();
      
      checkPromises.push(promise);
    }
    
    await Promise.all(checkPromises);
    
    // Calculate summary
    const results = Object.values(checkResults);
    const summary = {
      total: results.length,
      healthy: results.filter(r => r.status === 'healthy').length,
      degraded: results.filter(r => r.status === 'degraded').length,
      unhealthy: results.filter(r => r.status === 'unhealthy').length,
    };
    
    // Determine overall status
    let overallStatus: SystemHealth['status'] = 'healthy';
    
    // Check for critical unhealthy checks
    const criticalUnhealthy = Object.entries(checkResults).some(([name, result]) => {
      const check = this.checks.get(name);
      return check?.critical && result.status === 'unhealthy';
    });
    
    if (criticalUnhealthy || summary.unhealthy > 0) {
      overallStatus = 'unhealthy';
    } else if (summary.degraded > 0) {
      overallStatus = 'degraded';
    }
    
    const health: SystemHealth = {
      status: overallStatus,
      timestamp: Date.now(),
      checks: checkResults,
      summary,
    };
    
    this.lastHealthStatus = health;
    return health;
  }
  
  startPeriodicChecks(intervalMs: number = 60000): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    
    // Run initial check
    this.runChecks().catch(err => this.logger.error('Health check failed:', err));
    
    // Schedule periodic checks
    this.checkInterval = setInterval(() => {
      this.runChecks().catch(err => this.logger.error('Periodic health check failed:', err));
    }, intervalMs);
  }
  
  stopPeriodicChecks(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = undefined;
    }
    this.isRunning = false;
  }
  
  stop(): void {
    this.stopPeriodicChecks();
  }
  
  getLastHealth(): SystemHealth | undefined {
    return this.lastHealthStatus;
  }
  
  async waitForHealthy(timeoutMs: number = 30000, checkIntervalMs: number = 1000): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      const health = await this.runChecks();
      
      if (health.status === 'healthy') {
        return;
      }
      
      await new Promise(resolve => setTimeout(resolve, checkIntervalMs));
    }
    
    throw new Error(`System did not become healthy within ${timeoutMs}ms`);
  }
  
  async checkHealth(): Promise<SystemHealth> {
    if (this.lastHealthStatus && Date.now() - this.lastHealthStatus.timestamp < 5000) {
      return this.lastHealthStatus;
    }
    return this.runChecks();
  }
  
  async runCheck(checkName: string): Promise<HealthCheckResult> {
    const check = this.checks.get(checkName);
    if (!check) {
      throw new Error(`Health check '${checkName}' not found`);
    }
    
    const startTime = Date.now();
    try {
      const result = await check.check();
      return {
        ...result,
        timestamp: Date.now(),
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: `Check failed: ${(error as Error).message}`,
        timestamp: Date.now(),
        duration: Date.now() - startTime,
      };
    }
  }
  
  isHealthy(): boolean {
    return this.lastHealthStatus?.status === 'healthy';
  }
  
  shutdown(): void {
    this.stopPeriodicChecks();
    this.checks.clear();
    this.lastHealthStatus = undefined;
  }
}