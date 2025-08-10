import { NextRequest, NextResponse } from 'next/server';
import { getProject } from '@/lib/projects';
import { getAnalyticsData } from '@/lib/analytics';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const days = parseInt(searchParams.get('days') || '7');
    
    // Get the project
    const { id } = await params;
    const project = await getProject(id);
    if (!project) {
      return NextResponse.json(
        { 
          success: false,
          data: null,
          message: 'Project not found' 
        },
        { status: 404 }
      );
    }
    
    // Get all analytics data
    const allAnalytics = await getAnalyticsData(days);
    
    // Filter analytics for this project's root path
    const projectPath = project.projectRoot;
    const projectAnalytics = allAnalytics.filter(session => {
      // Try to match the project path with the session's system info or commands
      if (session.systemInfo?.gitBranch && session.systemInfo?.projectName) {
        // If we have git branch info, try to match against the project's path
        return session.systemInfo.projectName === project.name ||
               session.filesChanged?.some(file => file.startsWith(projectPath)) ||
               session.filesCreated?.some(file => file.startsWith(projectPath)) ||
               session.filesDeleted?.some(file => file.startsWith(projectPath));
      }
      
      // Fallback: check if any file operations match the project's path
      return session.filesChanged?.some(file => file.startsWith(projectPath)) ||
             session.filesCreated?.some(file => file.startsWith(projectPath)) ||
             session.filesDeleted?.some(file => file.startsWith(projectPath));
    });
    
    // Calculate project-specific metrics
    const metrics = {
      totalSessions: projectAnalytics.length,
      activeSessions: projectAnalytics.filter(a => a.status === 'active').length,
      totalDuration: projectAnalytics.reduce((sum, a) => sum + (a.duration || 0), 0),
      averageDuration: projectAnalytics.length > 0 
        ? projectAnalytics.reduce((sum, a) => sum + (a.duration || 0), 0) / projectAnalytics.length
        : 0,
      successfulSessions: projectAnalytics.filter(a => a.exitCode === 0).length,
      successRate: projectAnalytics.length > 0 
        ? (projectAnalytics.filter(a => a.exitCode === 0).length / projectAnalytics.length) * 100
        : 0,
      totalFilesChanged: projectAnalytics.reduce((sum, a) => sum + (a.filesChanged?.length || 0), 0),
      totalFilesCreated: projectAnalytics.reduce((sum, a) => sum + (a.filesCreated?.length || 0), 0),
      totalFilesDeleted: projectAnalytics.reduce((sum, a) => sum + (a.filesDeleted?.length || 0), 0),
      totalErrors: projectAnalytics.reduce((sum, a) => sum + (a.errors?.length || 0), 0),
      totalWarnings: projectAnalytics.reduce((sum, a) => sum + (a.warnings?.length || 0), 0),
      
      // Recent activity
      recentSessions: projectAnalytics
        .sort((a, b) => b.startTime - a.startTime)
        .slice(0, 10),
      
      // Daily activity breakdown
      dailyActivity: getDailyActivity(projectAnalytics, days),
      
      // Most changed files
      mostChangedFiles: getMostChangedFiles(projectAnalytics),
      
      // Common commands
      commonCommands: getCommonCommands(projectAnalytics)
    };
    
    return NextResponse.json({
      success: true,
      data: {
        project,
        analytics: metrics
      },
      message: null
    });
  } catch (error) {
    console.error('Failed to fetch project analytics:', error);
    return NextResponse.json(
      { 
        success: false,
        data: null,
        message: 'Failed to fetch project analytics' 
      },
      { status: 500 }
    );
  }
}

function getDailyActivity(analytics: any[], days: number) {
  const dailyData: Record<string, number> = {};
  
  for (let i = 0; i < days; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateKey = date.toISOString().split('T')[0];
    dailyData[dateKey] = 0;
  }
  
  analytics.forEach(session => {
    const sessionDate = new Date(session.startTime).toISOString().split('T')[0];
    if (dailyData.hasOwnProperty(sessionDate)) {
      dailyData[sessionDate]++;
    }
  });
  
  return Object.entries(dailyData)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, sessions: count }));
}

function getMostChangedFiles(analytics: any[]) {
  const fileChanges: Record<string, number> = {};
  
  analytics.forEach(session => {
    [...(session.filesChanged || []), ...(session.filesCreated || [])].forEach(file => {
      fileChanges[file] = (fileChanges[file] || 0) + 1;
    });
  });
  
  return Object.entries(fileChanges)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 10)
    .map(([file, changes]) => ({ file, changes }));
}

function getCommonCommands(analytics: any[]) {
  const commandCounts: Record<string, number> = {};
  
  analytics.forEach(session => {
    session.commands?.forEach((cmd: any) => {
      const commandName = cmd.command;
      commandCounts[commandName] = (commandCounts[commandName] || 0) + 1;
    });
  });
  
  return Object.entries(commandCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 10)
    .map(([command, count]) => ({ command, count }));
}