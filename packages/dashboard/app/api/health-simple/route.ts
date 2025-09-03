import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest): Promise<Response> {
  const startTime = Date.now();
  
  try {
    const health = {
      overall: 'healthy',
      timestamp: Date.now(),
      uptime: process.uptime() * 1000,
      components: [
        {
          name: 'Dashboard API',
          status: 'healthy',
          message: 'API responding normally',
          lastCheck: Date.now()
        }
      ],
      metrics: {
        totalSessions: 0,
        activeSessions: 0,
        totalExecutions: 0,
        activeExecutions: 0,
        fileWatchers: 0,
        activeLocks: 0,
        diskUsage: { sessions: '0 MB', executions: '0 MB', analytics: '0 MB' },
        memory: {
          heapUsed: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`,
          heapTotal: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)} MB`,
          external: `${Math.round(process.memoryUsage().external / 1024 / 1024)} MB`
        }
      },
      version: process.env.npm_package_version || '0.0.0',
      environment: process.env.NODE_ENV || 'development'
    };
    
    const responseTime = Date.now() - startTime;
    
    return NextResponse.json(health, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Response-Time': `${responseTime}ms`
      }
    });
    
  } catch (error) {
    console.error('Simple health check failed:', error);
    
    return NextResponse.json(
      {
        overall: 'error',
        timestamp: Date.now(),
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}