import { NextRequest, NextResponse } from 'next/server';
import { SessionManager } from '@/lib/session-manager';
import { SessionRecovery } from '@/lib/session-recovery';
import { executionHistoryManager } from '@/lib/execution-history-manager';
import { getFileWatcherPool } from '@/lib/file-watcher-pool';
import { SafeFileWriter } from '@/lib/safe-file-writer';
import { AgentAnalytics } from '@/lib/agent-analytics';
import { healthCheck } from '@/lib/health-check';
import { memoryMonitor } from '@/lib/memory-monitor';
import { shutdownCoordinator } from '@/lib/shutdown-coordinator';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

interface ComponentHealth {
  name: string;
  status: 'healthy' | 'warning' | 'error';
  message: string;
  details?: Record<string, any>;
  lastCheck?: number;
  errors?: string[];
}

interface SystemHealth {
  overall: 'healthy' | 'warning' | 'error';
  timestamp: number;
  uptime: number;
  components: ComponentHealth[];
  metrics: {
    totalSessions: number;
    activeSessions: number;
    totalExecutions: number;
    activeExecutions: number;
    fileWatchers: number;
    activeLocks: number;
    diskUsage: {
      sessions: string;
      executions: string;
      analytics: string;
    };
    memory: {
      heapUsed: string;
      heapTotal: string;
      external: string;
    };
  };
  version: string;
  environment: string;
}

export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams } = request.nextUrl;
  const endpoint = searchParams.get('check') || 'health';
  
  // Use new comprehensive health check for specific endpoints
  if (endpoint === 'ready' || endpoint === 'live') {
    try {
      const result = await healthCheck.handleHealthRequest(endpoint as 'ready' | 'live');
      return NextResponse.json(result.body, { 
        status: result.status,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'X-Health-Check': endpoint
        }
      });
    } catch (error) {
      console.error('Health check error:', error);
      return NextResponse.json(
        { 
          status: 'error', 
          message: 'Health check failed',
          timestamp: Date.now()
        },
        { status: 500 }
      );
    }
  }
  
  // For full health check, combine both legacy and new systems
  const startTime = Date.now();
  const components: ComponentHealth[] = [];
  const timeout = 10000; // 10 second timeout
  
  try {
    // Get comprehensive health report
    const comprehensiveReport = await healthCheck.check();
    
    // Add memory monitor status
    const memoryStatus = memoryMonitor.getStatus();
    components.push({
      name: 'Memory Monitor',
      status: memoryStatus.stats?.pressureLevel === 'critical' ? 'error' :
              memoryStatus.stats?.pressureLevel === 'high' ? 'warning' : 'healthy',
      message: `Memory at ${(memoryStatus.stats?.usagePercent || 0) * 100}%`,
      details: {
        running: memoryStatus.running,
        pressureLevel: memoryStatus.stats?.pressureLevel,
        heapUsed: memoryStatus.stats?.heapUsed,
        cleanupHistory: memoryStatus.cleanupHistory
      },
      lastCheck: Date.now()
    });
    
    // Add shutdown coordinator status
    const shutdownStatus = shutdownCoordinator.getStatus();
    components.push({
      name: 'Shutdown Coordinator',
      status: shutdownStatus.isShuttingDown ? 'warning' : 'healthy',
      message: shutdownStatus.isShuttingDown ? 'System shutting down' : 'Ready',
      details: shutdownStatus,
      lastCheck: Date.now()
    });
    // Check Session Manager
    try {
      const sessionCheck = Promise.race([
        (async () => {
          await SessionManager.initialize();
          return await SessionManager.getStats();
        })(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
      ]);
      
      const sessionStats = await sessionCheck;
      
      components.push({
        name: 'Session Manager',
        status: 'healthy',
        message: `Managing ${(sessionStats as any).totalSessions || 0} sessions`,
        details: sessionStats as Record<string, any>,
        lastCheck: Date.now()
      });
    } catch (error) {
      console.warn('Session Manager check failed:', error);
      components.push({
        name: 'Session Manager',
        status: 'warning',
        message: 'Service not available',
        errors: [error instanceof Error ? error.message : String(error)],
        lastCheck: Date.now()
      });
    }
    
    // Check Session Recovery
    try {
      const recoveryStats = SessionRecovery.getStats();
      const activeRecoveries = recoveryStats.activeRecoveries || 0;
      const status = activeRecoveries > 10 ? 'warning' : 'healthy';
      
      components.push({
        name: 'Session Recovery',
        status,
        message: `${activeRecoveries} active recoveries`,
        details: recoveryStats,
        lastCheck: Date.now()
      });
    } catch (error) {
      console.warn('Session Recovery check failed:', error);
      components.push({
        name: 'Session Recovery',
        status: 'warning',
        message: 'Service not available',
        errors: [error instanceof Error ? error.message : String(error)],
        lastCheck: Date.now()
      });
    }
    
    // Check Execution History Manager
    try {
      const historyCheck = Promise.race([
        (async () => {
          await executionHistoryManager.initialize();
          return await executionHistoryManager.getStatistics();
        })(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
      ]);
      
      const historyStats = await historyCheck;
      
      components.push({
        name: 'Execution History',
        status: 'healthy',
        message: `${(historyStats as any).total} total executions, ${(historyStats as any).activeExecutions || 0} active`,
        details: {
          totalExecutions: (historyStats as any).total,
          activeExecutions: (historyStats as any).activeExecutions || 0,
          successRate: (historyStats as any).successRate,
          averageDuration: (historyStats as any).averageDuration
        },
        lastCheck: Date.now()
      });
    } catch (error) {
      console.warn('Execution History check failed:', error);
      components.push({
        name: 'Execution History',
        status: 'warning',
        message: 'Service not available',
        errors: [error instanceof Error ? error.message : String(error)],
        lastCheck: Date.now()
      });
    }
    
    // Check File Watcher Pool
    try {
      const fileWatcherPool = getFileWatcherPool();
      const watcherStats = fileWatcherPool.getStats();
      const totalWatchers = watcherStats.totalWatchers || 0;
      const totalSessions = watcherStats.totalSessions || 0;
      const status = totalWatchers > 50 ? 'warning' : 'healthy';
      
      components.push({
        name: 'File Watcher Pool',
        status,
        message: `${totalWatchers} watchers, ${totalSessions} sessions`,
        details: watcherStats,
        lastCheck: Date.now()
      });
    } catch (error) {
      console.warn('File Watcher Pool check failed:', error);
      components.push({
        name: 'File Watcher Pool',
        status: 'warning',
        message: 'Service not available',
        errors: [error instanceof Error ? error.message : String(error)],
        lastCheck: Date.now()
      });
    }
    
    // Check Safe File Writer
    try {
      const writerStats = SafeFileWriter.getStats();
      const activeLocks = writerStats.activeLocks || 0;
      const status = activeLocks > 10 ? 'warning' : 'healthy';
      
      components.push({
        name: 'Safe File Writer',
        status,
        message: `${activeLocks} active locks`,
        details: writerStats,
        lastCheck: Date.now()
      });
    } catch (error) {
      console.warn('Safe File Writer check failed:', error);
      components.push({
        name: 'Safe File Writer',
        status: 'warning',
        message: 'Service not available',
        errors: [error instanceof Error ? error.message : String(error)],
        lastCheck: Date.now()
      });
    }
    
    // Check Analytics
    try {
      const analyticsEnabled = await AgentAnalytics.isEnabled();
      
      components.push({
        name: 'Analytics',
        status: analyticsEnabled ? 'healthy' : 'warning',
        message: analyticsEnabled ? 'Analytics enabled' : 'Analytics disabled',
        details: { enabled: analyticsEnabled },
        lastCheck: Date.now()
      });
    } catch (error) {
      console.warn('Analytics check failed:', error);
      components.push({
        name: 'Analytics',
        status: 'warning',
        message: 'Service not available',
        errors: [error instanceof Error ? error.message : String(error)],
        lastCheck: Date.now()
      });
    }
    
    // Add our core monitoring components
    components.push({
      name: 'Monitoring System',
      status: 'healthy',
      message: 'Core monitoring services operational',
      details: { 
        executionHistory: 'available',
        configuration: 'available',
        recovery: 'available'
      },
      lastCheck: Date.now()
    });
    
    // Calculate disk usage
    let diskUsage = { sessions: '0 MB', executions: '0 MB', analytics: '0 MB' };
    try {
      diskUsage = await calculateDiskUsage();
    } catch (error) {
      console.warn('Disk usage calculation failed:', error);
    }
    
    // Get memory usage
    const memoryUsage = process.memoryUsage();
    
    // Extract metrics from components
    const sessionComponent = components.find(c => c.name === 'Session Manager');
    const historyComponent = components.find(c => c.name === 'Execution History');
    const watcherComponent = components.find(c => c.name === 'File Watcher Pool');
    const writerComponent = components.find(c => c.name === 'Safe File Writer');
    
    // Determine overall health
    const errorCount = components.filter(c => c.status === 'error').length;
    const warningCount = components.filter(c => c.status === 'warning').length;
    
    let overallStatus: 'healthy' | 'warning' | 'error' = 'healthy';
    if (errorCount > 2) { // More tolerant - only error if multiple critical failures
      overallStatus = 'error';
    } else if (errorCount > 0 || warningCount > 2) {
      overallStatus = 'warning';
    }
    
    const health: SystemHealth = {
      overall: overallStatus,
      timestamp: Date.now(),
      uptime: process.uptime() * 1000, // Convert to milliseconds
      components,
      metrics: {
        totalSessions: sessionComponent?.details?.totalSessions || 0,
        activeSessions: sessionComponent?.details?.activeSessions || 0,
        totalExecutions: historyComponent?.details?.totalExecutions || 0,
        activeExecutions: historyComponent?.details?.activeExecutions || 0,
        fileWatchers: watcherComponent?.details?.totalWatchers || 0,
        activeLocks: writerComponent?.details?.activeLocks || 0,
        diskUsage,
        memory: {
          heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB`,
          heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB`,
          external: `${Math.round(memoryUsage.external / 1024 / 1024)} MB`
        }
      },
      version: process.env.npm_package_version || '0.0.0',
      environment: process.env.NODE_ENV || 'development'
    };
    
    const responseTime = Date.now() - startTime;
    
    return NextResponse.json(health, {
      status: overallStatus === 'error' ? 503 : 200,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Response-Time': `${responseTime}ms`
      }
    });
    
  } catch (error) {
    console.error('Health check failed:', error);
    
    const errorHealth: SystemHealth = {
      overall: 'error',
      timestamp: Date.now(),
      uptime: process.uptime() * 1000,
      components: [{
        name: 'Health Check',
        status: 'error',
        message: 'Health check system failed',
        errors: [error instanceof Error ? error.message : String(error)],
        lastCheck: Date.now()
      }],
      metrics: {
        totalSessions: 0,
        activeSessions: 0,
        totalExecutions: 0,
        activeExecutions: 0,
        fileWatchers: 0,
        activeLocks: 0,
        diskUsage: { sessions: '0 MB', executions: '0 MB', analytics: '0 MB' },
        memory: { heapUsed: '0 MB', heapTotal: '0 MB', external: '0 MB' }
      },
      version: '0.0.0',
      environment: 'unknown'
    };
    
    return NextResponse.json(errorHealth, { status: 500 });
  }
}

/**
 * Calculate disk usage for different data directories
 */
async function calculateDiskUsage(): Promise<{ sessions: string; executions: string; analytics: string }> {
  const vibekitDir = path.join(os.homedir(), '.vibekit');
  
  const directories = {
    sessions: path.join(vibekitDir, 'sessions'),
    executions: path.join(vibekitDir, 'execution-history'),
    analytics: path.join(vibekitDir, 'analytics')
  };
  
  const usage = { sessions: '0 MB', executions: '0 MB', analytics: '0 MB' };
  
  for (const [key, dir] of Object.entries(directories)) {
    try {
      const size = await getDirectorySize(dir);
      usage[key as keyof typeof usage] = `${(size / 1024 / 1024).toFixed(2)} MB`;
    } catch (error) {
      // Directory might not exist, keep 0 MB
    }
  }
  
  return usage;
}

/**
 * Recursively calculate directory size
 */
async function getDirectorySize(dirPath: string): Promise<number> {
  let totalSize = 0;
  
  try {
    const items = await fs.readdir(dirPath);
    
    for (const item of items) {
      const itemPath = path.join(dirPath, item);
      const stats = await fs.stat(itemPath);
      
      if (stats.isDirectory()) {
        totalSize += await getDirectorySize(itemPath);
      } else {
        totalSize += stats.size;
      }
    }
  } catch (error) {
    // Handle permission errors or missing directories
    return 0;
  }
  
  return totalSize;
}