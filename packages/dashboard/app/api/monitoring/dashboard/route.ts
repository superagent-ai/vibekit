import { NextRequest, NextResponse } from 'next/server';
import { ExecutionHistoryManager } from '@/lib/execution-history-manager';
import { SessionManager } from '@/lib/session-manager';
import { SessionRecovery } from '@/lib/session-recovery';

interface DashboardData {
  overview: {
    totalExecutions: number;
    activeExecutions: number;
    successRate: number;
    avgDuration: number;
    pullRequestsCreated: number;
    activeSessions: number;
    recoveredSessions: number;
  };
  recentExecutions: any[];
  statistics: {
    byAgent: Record<string, number>;
    bySandbox: Record<string, number>;
    byStatus: Record<string, number>;
    hourlyVolume: Array<{ hour: string; count: number; success: number; failed: number }>;
    dailyTrends: Array<{ date: string; executions: number; successRate: number; avgDuration: number }>;
  };
  alerts: Array<{
    type: 'warning' | 'error' | 'info';
    message: string;
    timestamp: number;
    component?: string;
  }>;
  timestamp: number;
}

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const { searchParams } = request.nextUrl;
    const projectId = searchParams.get('projectId') || undefined;
    const timeRange = searchParams.get('timeRange') || '24h'; // 1h, 24h, 7d, 30d
    
    // Initialize managers
    await ExecutionHistoryManager.initialize();
    await SessionManager.initialize();
    
    // Calculate date range
    const now = new Date();
    const ranges = {
      '1h': 1 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000
    };
    
    const dateFrom = new Date(now.getTime() - (ranges[timeRange as keyof typeof ranges] || ranges['24h']));
    
    // Get execution statistics
    const stats = await ExecutionHistoryManager.getStatistics(projectId);
    
    // Get recent executions
    const recentExecutions = await ExecutionHistoryManager.queryExecutions({
      projectId,
      dateFrom,
      limit: 50
    });
    
    // Get session statistics
    const sessionStats = await SessionManager.getStats();
    const recoveryStats = SessionRecovery.getStats();
    
    // Calculate hourly volume for charts
    const hourlyVolume = await calculateHourlyVolume(dateFrom, now, projectId);
    
    // Calculate daily trends
    const dailyTrends = await calculateDailyTrends(dateFrom, now, projectId);
    
    // Generate alerts
    const alerts = await generateAlerts(stats, sessionStats, recoveryStats);
    
    const dashboardData: DashboardData = {
      overview: {
        totalExecutions: stats.total,
        activeExecutions: recentExecutions.filter(e => e.status === 'running' || e.status === 'started').length,
        successRate: stats.successRate,
        avgDuration: Math.round(stats.averageDuration / 1000), // Convert to seconds
        pullRequestsCreated: stats.pullRequestsCreated,
        activeSessions: sessionStats.activeSessions,
        recoveredSessions: recoveryStats.activeRecoveries
      },
      recentExecutions: recentExecutions.map(execution => ({
        ...execution,
        duration: execution.duration ? Math.round(execution.duration / 1000) : undefined // Convert to seconds
      })),
      statistics: {
        byAgent: stats.byAgent,
        bySandbox: stats.bySandbox,
        byStatus: stats.byStatus,
        hourlyVolume,
        dailyTrends
      },
      alerts,
      timestamp: Date.now()
    };
    
    return NextResponse.json(dashboardData, {
      headers: {
        'Cache-Control': 'no-cache, max-age=30' // Cache for 30 seconds
      }
    });
    
  } catch (error) {
    console.error('Failed to get dashboard data:', error);
    return NextResponse.json(
      {
        error: 'Failed to get dashboard data',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

/**
 * Calculate hourly execution volume for charts
 */
async function calculateHourlyVolume(
  dateFrom: Date, 
  dateTo: Date, 
  projectId?: string
): Promise<Array<{ hour: string; count: number; success: number; failed: number }>> {
  try {
    const executions = await ExecutionHistoryManager.queryExecutions({
      projectId,
      dateFrom,
      dateTo,
      limit: 10000
    });
    
    const hourlyData = new Map<string, { count: number; success: number; failed: number }>();
    
    // Initialize all hours in range
    const current = new Date(dateFrom);
    while (current <= dateTo) {
      const hourKey = current.toISOString().slice(0, 13) + ':00:00.000Z';
      hourlyData.set(hourKey, { count: 0, success: 0, failed: 0 });
      current.setHours(current.getHours() + 1);
    }
    
    // Count executions by hour
    for (const execution of executions) {
      const executionDate = new Date(execution.timestamp);
      const hourKey = executionDate.toISOString().slice(0, 13) + ':00:00.000Z';
      
      const data = hourlyData.get(hourKey);
      if (data) {
        data.count++;
        if (execution.success === true) {
          data.success++;
        } else if (execution.success === false) {
          data.failed++;
        }
      }
    }
    
    return Array.from(hourlyData.entries()).map(([hour, data]) => ({
      hour: new Date(hour).toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false 
      }),
      ...data
    }));
    
  } catch (error) {
    console.error('Failed to calculate hourly volume:', error);
    return [];
  }
}

/**
 * Calculate daily trends for charts
 */
async function calculateDailyTrends(
  dateFrom: Date, 
  dateTo: Date, 
  projectId?: string
): Promise<Array<{ date: string; executions: number; successRate: number; avgDuration: number }>> {
  try {
    const executions = await ExecutionHistoryManager.queryExecutions({
      projectId,
      dateFrom,
      dateTo,
      limit: 10000
    });
    
    const dailyData = new Map<string, { 
      executions: number; 
      successes: number; 
      totalDuration: number; 
      durationCount: number; 
    }>();
    
    // Initialize all days in range
    const current = new Date(dateFrom);
    while (current <= dateTo) {
      const dayKey = current.toISOString().split('T')[0];
      dailyData.set(dayKey, { executions: 0, successes: 0, totalDuration: 0, durationCount: 0 });
      current.setDate(current.getDate() + 1);
    }
    
    // Aggregate by day
    for (const execution of executions) {
      const executionDate = new Date(execution.timestamp);
      const dayKey = executionDate.toISOString().split('T')[0];
      
      const data = dailyData.get(dayKey);
      if (data) {
        data.executions++;
        if (execution.success === true) {
          data.successes++;
        }
        if (execution.duration) {
          data.totalDuration += execution.duration;
          data.durationCount++;
        }
      }
    }
    
    return Array.from(dailyData.entries()).map(([date, data]) => ({
      date,
      executions: data.executions,
      successRate: data.executions > 0 ? (data.successes / data.executions) * 100 : 0,
      avgDuration: data.durationCount > 0 ? Math.round(data.totalDuration / data.durationCount / 1000) : 0
    }));
    
  } catch (error) {
    console.error('Failed to calculate daily trends:', error);
    return [];
  }
}

/**
 * Generate system alerts based on current state
 */
async function generateAlerts(
  executionStats: any,
  sessionStats: any,
  recoveryStats: any
): Promise<Array<{ type: 'warning' | 'error' | 'info'; message: string; timestamp: number; component?: string }>> {
  const alerts: Array<{ type: 'warning' | 'error' | 'info'; message: string; timestamp: number; component?: string }> = [];
  const now = Date.now();
  
  // Check success rate
  if (executionStats.successRate < 50) {
    alerts.push({
      type: 'error',
      message: `Low success rate: ${executionStats.successRate.toFixed(1)}%`,
      timestamp: now,
      component: 'Execution History'
    });
  } else if (executionStats.successRate < 80) {
    alerts.push({
      type: 'warning',
      message: `Success rate below 80%: ${executionStats.successRate.toFixed(1)}%`,
      timestamp: now,
      component: 'Execution History'
    });
  }
  
  // Check for high number of failed executions
  const failedCount = executionStats.byStatus?.failed || 0;
  if (failedCount > 10) {
    alerts.push({
      type: 'warning',
      message: `${failedCount} failed executions detected`,
      timestamp: now,
      component: 'Execution History'
    });
  }
  
  // Check for high number of active sessions
  if (sessionStats.activeSessions > 20) {
    alerts.push({
      type: 'warning',
      message: `High number of active sessions: ${sessionStats.activeSessions}`,
      timestamp: now,
      component: 'Session Manager'
    });
  }
  
  // Check for recovery issues
  if (recoveryStats.activeRecoveries > 5) {
    alerts.push({
      type: 'warning',
      message: `${recoveryStats.activeRecoveries} sessions requiring recovery`,
      timestamp: now,
      component: 'Session Recovery'
    });
  }
  
  // Check average execution time
  if (executionStats.averageDuration > 300000) { // 5 minutes
    alerts.push({
      type: 'info',
      message: `Average execution time is high: ${Math.round(executionStats.averageDuration / 1000)}s`,
      timestamp: now,
      component: 'Performance'
    });
  }
  
  return alerts;
}