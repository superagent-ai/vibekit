import fs from 'fs-extra';
import path from 'path';
import os from 'os';

export interface AnalyticsSession {
  sessionId: string;
  agentName: string;
  startTime: number;
  endTime: number | null;
  duration: number | null;
  status?: 'active' | 'terminated';
  executionMode?: 'sandbox' | 'local';
  inputBytes: number;
  outputBytes: number;
  commands: Array<{
    command: string;
    args: string[];
    timestamp: number;
  }>;
  exitCode: number | null;
  filesChanged: string[];
  filesCreated: string[];
  filesDeleted: string[];
  errors: string[];
  warnings: string[];
  systemInfo?: any;
}

export interface AnalyticsSummary {
  totalSessions: number;
  activeSessions: number;
  totalDuration: number;
  averageDuration: number;
  successfulSessions: number;
  successRate: number;
  totalFilesChanged: number;
  totalErrors: number;
  totalWarnings: number;
  topErrors: Array<{ error: string; count: number }>;
  agentBreakdown: Record<string, {
    sessions: number;
    duration: number;
    successfulSessions: number;
    successRate: number;
    averageDuration: number;
  }>;
}

export async function getAnalyticsData(days = 7, agentName?: string): Promise<AnalyticsSession[]> {
  const analyticsDir = path.join(os.homedir(), '.vibekit', 'analytics');
  
  if (!await fs.pathExists(analyticsDir)) {
    return [];
  }
  
  const files = await fs.readdir(analyticsDir);
  const targetFiles = agentName 
    ? files.filter(f => f.startsWith(`${agentName}-`))
    : files.filter(f => f.endsWith('.json'));
  
  // Filter by date range
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  
  const allAnalytics: AnalyticsSession[] = [];
  
  for (const file of targetFiles) {
    try {
      const filePath = path.join(analyticsDir, file);
      const content = await fs.readFile(filePath, 'utf8');
      const data = JSON.parse(content);
      
      const filteredData = data.filter((session: AnalyticsSession) => {
        const sessionDate = new Date(session.startTime);
        return sessionDate >= cutoffDate;
      });
      
      allAnalytics.push(...filteredData);
    } catch (error) {
      console.error(`Failed to read analytics file ${file}:`, error);
    }
  }
  
  return allAnalytics.sort((a, b) => b.startTime - a.startTime);
}

export function generateSummary(analytics: AnalyticsSession[]): AnalyticsSummary {
  if (analytics.length === 0) {
    return {
      totalSessions: 0,
      activeSessions: 0,
      totalDuration: 0,
      averageDuration: 0,
      successfulSessions: 0,
      successRate: 0,
      totalFilesChanged: 0,
      totalErrors: 0,
      totalWarnings: 0,
      topErrors: [],
      agentBreakdown: {}
    };
  }

  const summary = {
    totalSessions: analytics.length,
    activeSessions: analytics.filter(a => a.status === 'active').length,
    totalDuration: analytics.reduce((sum, a) => sum + (a.duration || 0), 0),
    successfulSessions: analytics.filter(a => a.exitCode === 0).length,
    totalFilesChanged: analytics.reduce((sum, a) => sum + (a.filesChanged?.length || 0), 0),
    totalErrors: analytics.reduce((sum, a) => sum + (a.errors?.length || 0), 0),
    totalWarnings: analytics.reduce((sum, a) => sum + (a.warnings?.length || 0), 0),
  };

  const averageDuration = summary.totalDuration / summary.totalSessions;
  const successRate = (summary.successfulSessions / summary.totalSessions) * 100;

  // Top errors
  const errorCounts: Record<string, number> = {};
  analytics.forEach(a => {
    a.errors?.forEach(error => {
      errorCounts[error] = (errorCounts[error] || 0) + 1;
    });
  });
  const topErrors = Object.entries(errorCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5)
    .map(([error, count]) => ({ error, count }));

  // Agent breakdown
  const agentBreakdown: Record<string, {
    sessions: number;
    duration: number;
    successfulSessions: number;
    successRate: number;
    averageDuration: number;
  }> = {};
  analytics.forEach(a => {
    if (!agentBreakdown[a.agentName]) {
      agentBreakdown[a.agentName] = {
        sessions: 0,
        duration: 0,
        successfulSessions: 0,
        successRate: 0,
        averageDuration: 0
      };
    }
    const agent = agentBreakdown[a.agentName];
    agent.sessions++;
    agent.duration += a.duration || 0;
    if (a.exitCode === 0) agent.successfulSessions++;
  });

  Object.keys(agentBreakdown).forEach(agentName => {
    const agent = agentBreakdown[agentName];
    agent.successRate = (agent.successfulSessions / agent.sessions) * 100;
    agent.averageDuration = agent.duration / agent.sessions;
  });

  return {
    ...summary,
    averageDuration,
    successRate,
    topErrors,
    agentBreakdown
  };
}

export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}