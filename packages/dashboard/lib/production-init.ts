/**
 * Production System Initialization
 * 
 * Central initialization point for all production monitoring and safety systems.
 * This module starts and coordinates all production hardening components.
 */

import { memoryMonitor } from './memory-monitor';
import { diskMonitor } from './disk-monitor';
import { healthCheck, HealthStatus } from './health-check';
import { shutdownCoordinator } from './shutdown-coordinator';
import { SessionManager } from './session-manager';
import { createLogger } from './structured-logger';
import { performanceMonitor } from './performance-monitor';

const logger = createLogger('ProductionInit');

/**
 * Production configuration
 */
export interface ProductionConfig {
  enableMemoryMonitor?: boolean;
  enableDiskMonitor?: boolean;
  enableHealthCheck?: boolean;
  enableShutdownCoordinator?: boolean;
  enablePerformanceMonitor?: boolean;
  environment?: 'development' | 'production' | 'staging';
  memoryCheckInterval?: number;
  diskCheckInterval?: number;
  healthCheckInterval?: number;
  performanceCheckInterval?: number;
}

/**
 * Default production configuration
 */
const DEFAULT_CONFIG: ProductionConfig = {
  enableMemoryMonitor: true,
  enableDiskMonitor: true,
  enableHealthCheck: true,
  enableShutdownCoordinator: true,
  enablePerformanceMonitor: process.env.NODE_ENV === 'production',
  environment: process.env.NODE_ENV as any || 'development',
  memoryCheckInterval: process.env.NODE_ENV === 'production' ? 30000 : 60000, // 30s prod, 60s dev
  diskCheckInterval: process.env.NODE_ENV === 'production' ? 60000 : 300000,   // 1m prod, 5m dev
  healthCheckInterval: process.env.NODE_ENV === 'production' ? 30000 : 120000,  // 30s prod, 2m dev
  performanceCheckInterval: process.env.NODE_ENV === 'production' ? 30000 : 60000  // 30s prod, 60s dev
};

/**
 * Production system state
 */
let isInitialized = false;
let activeConfig: ProductionConfig = DEFAULT_CONFIG;

/**
 * Initialize all production systems
 */
export async function initializeProduction(config: ProductionConfig = {}): Promise<void> {
  if (isInitialized) {
    logger.warn('Production systems already initialized');
    return;
  }

  activeConfig = { ...DEFAULT_CONFIG, ...config };
  
  logger.info('Initializing production systems', {
    environment: activeConfig.environment,
    config: activeConfig
  });

  try {
    // 1. Initialize Session Manager first (needed by other components)
    logger.info('Initializing Session Manager');
    await SessionManager.initialize();

    // 2. Register shutdown handlers
    if (activeConfig.enableShutdownCoordinator) {
      logger.info('Registering shutdown handlers');
      
      // Register memory monitor cleanup
      shutdownCoordinator.registerHandler({
        name: 'stop-memory-monitor',
        phase: 'closing_services' as any,
        priority: 10,
        timeout: 2000,
        execute: async () => {
          logger.info('Stopping memory monitor');
          memoryMonitor.stop();
        }
      });

      // Register disk monitor cleanup
      shutdownCoordinator.registerHandler({
        name: 'stop-disk-monitor',
        phase: 'closing_services' as any,
        priority: 20,
        timeout: 2000,
        execute: async () => {
          logger.info('Stopping disk monitor');
          diskMonitor.stop();
        }
      });

      // Register health check cleanup
      shutdownCoordinator.registerHandler({
        name: 'stop-health-check',
        phase: 'closing_services' as any,
        priority: 30,
        timeout: 2000,
        execute: async () => {
          logger.info('Stopping health check');
          healthCheck.stop();
        }
      });

      // Register performance monitor cleanup
      shutdownCoordinator.registerHandler({
        name: 'stop-performance-monitor',
        phase: 'closing_services' as any,
        priority: 40,
        timeout: 2000,
        execute: async () => {
          logger.info('Stopping performance monitor');
          await performanceMonitor.stop();
        }
      });

      // Register signal handlers
      shutdownCoordinator.registerSignalHandlers();
      logger.info('Shutdown coordinator initialized');
    }

    // 3. Start Memory Monitor
    if (activeConfig.enableMemoryMonitor) {
      logger.info('Starting memory monitor', {
        checkInterval: activeConfig.memoryCheckInterval
      });
      
      // Register cleanup actions with memory monitor
      memoryMonitor.registerCleanupAction({
        name: 'clear-session-buffers',
        priority: 5,
        execute: async () => {
          // Trigger session buffer cleanup
          const SessionLogger = require('./session-logger').SessionLogger;
          // This would be handled by event listeners in actual sessions
          logger.info('Clearing session buffers');
          return Promise.resolve();
        },
        canExecute: () => true,
        minInterval: 60000 // 1 minute
      });

      memoryMonitor.start();
      
      // Listen for memory pressure events
      memoryMonitor.on('pressure-change', (level, stats) => {
        logger.warn('Memory pressure changed', {
          level,
          usagePercent: stats.usagePercent,
          heapUsed: stats.heapUsed
        });
      });
      
      logger.info('Memory monitor started');
    }

    // 4. Start Disk Monitor
    if (activeConfig.enableDiskMonitor) {
      logger.info('Starting disk monitor', {
        checkInterval: activeConfig.diskCheckInterval
      });
      
      diskMonitor.start();
      
      // Listen for disk alerts
      diskMonitor.on('alert', (level, stats) => {
        logger.warn('Disk space alert', {
          level,
          usagePercent: stats.usagePercent,
          available: stats.available
        });
      });
      
      logger.info('Disk monitor started');
    }

    // 5. Start Health Check
    if (activeConfig.enableHealthCheck) {
      logger.info('Starting health check', {
        checkInterval: activeConfig.healthCheckInterval
      });
      
      // Register custom health checkers
      healthCheck.registerChecker('production-init', async () => {
        return {
          name: 'production-init',
          status: HealthStatus.HEALTHY,
          message: 'Production systems initialized',
          metrics: {
            memoryMonitor: activeConfig.enableMemoryMonitor,
            diskMonitor: activeConfig.enableDiskMonitor,
            healthCheck: activeConfig.enableHealthCheck,
            shutdownCoordinator: activeConfig.enableShutdownCoordinator,
            performanceMonitor: activeConfig.enablePerformanceMonitor
          },
          lastCheck: Date.now()
        };
      });
      
      healthCheck.start();
      logger.info('Health check started');
    }

    // 6. Start Performance Monitor
    if (activeConfig.enablePerformanceMonitor) {
      logger.info('Starting performance monitor', {
        checkInterval: activeConfig.performanceCheckInterval
      });
      
      await performanceMonitor.start();
      
      // Listen for performance events
      performanceMonitor.on('slowRequest', (metrics) => {
        logger.warn('Slow request detected', {
          path: metrics.path,
          method: metrics.method,
          duration: metrics.duration
        });
      });
      
      performanceMonitor.on('bottlenecks', (bottlenecks) => {
        logger.warn('Performance bottlenecks detected', { bottlenecks });
      });
      
      logger.info('Performance monitor started');
    }

    isInitialized = true;
    logger.info('Production systems initialization complete', {
      memoryMonitor: activeConfig.enableMemoryMonitor,
      diskMonitor: activeConfig.enableDiskMonitor,
      healthCheck: activeConfig.enableHealthCheck,
      shutdownCoordinator: activeConfig.enableShutdownCoordinator,
      performanceMonitor: activeConfig.enablePerformanceMonitor
    });

  } catch (error) {
    logger.error('Failed to initialize production systems', error);
    throw error;
  }
}

/**
 * Shutdown all production systems
 */
export async function shutdownProduction(options?: {
  gracePeriod?: number;
  forceTimeout?: number;
}): Promise<void> {
  if (!isInitialized) {
    logger.warn('Production systems not initialized');
    return;
  }

  logger.info('Shutting down production systems');

  try {
    // Use shutdown coordinator if enabled
    if (activeConfig.enableShutdownCoordinator) {
      await shutdownCoordinator.shutdown({
        ...options,
        exitOnComplete: false
      });
    } else {
      // Manual shutdown
      if (activeConfig.enableMemoryMonitor) {
        memoryMonitor.stop();
      }
      if (activeConfig.enableDiskMonitor) {
        diskMonitor.stop();
      }
      if (activeConfig.enableHealthCheck) {
        healthCheck.stop();
      }
      if (activeConfig.enablePerformanceMonitor) {
        await performanceMonitor.stop();
      }
    }

    isInitialized = false;
    logger.info('Production systems shutdown complete');
  } catch (error) {
    logger.error('Error during production shutdown', error);
    throw error;
  }
}

/**
 * Get production system status
 */
export function getProductionStatus(): {
  initialized: boolean;
  config: ProductionConfig;
  systems: {
    memoryMonitor: any;
    diskMonitor: any;
    healthCheck: any;
    shutdownCoordinator: any;
    performanceMonitor: any;
  };
} {
  return {
    initialized: isInitialized,
    config: activeConfig,
    systems: {
      memoryMonitor: activeConfig.enableMemoryMonitor ? memoryMonitor.getStatus() : null,
      diskMonitor: activeConfig.enableDiskMonitor ? diskMonitor.getStatus() : null,
      healthCheck: activeConfig.enableHealthCheck ? healthCheck.getLastReport() : null,
      shutdownCoordinator: activeConfig.enableShutdownCoordinator ? shutdownCoordinator.getStatus() : null,
      performanceMonitor: activeConfig.enablePerformanceMonitor ? performanceMonitor.getSnapshot() : null
    }
  };
}

/**
 * Handle process-level errors
 */
export function setupErrorHandlers(): void {
  process.on('uncaughtException', (error: Error) => {
    logger.error('Uncaught exception', error);
    
    // Attempt graceful shutdown
    shutdownProduction({
      gracePeriod: 5000,
      forceTimeout: 10000
    }).finally(() => {
      process.exit(1);
    });
  });

  process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    logger.error('Unhandled promise rejection', {
      reason: String(reason),
      promise: String(promise)
    });
  });
}

// Export for convenience
export {
  memoryMonitor,
  diskMonitor,
  healthCheck,
  shutdownCoordinator,
  performanceMonitor
};