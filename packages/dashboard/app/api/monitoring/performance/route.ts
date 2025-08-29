/**
 * Performance Monitoring API Endpoint
 * 
 * Provides performance metrics and analysis data using @vibe-kit/monitor
 */

import { NextRequest, NextResponse } from 'next/server';
import { getMonitorService } from '@/lib/monitor-instance';

export async function GET(request: NextRequest) {
  try {
    const monitor = await getMonitorService();
    
    const metrics = {
      performance: monitor.getPerformanceMetrics(),
      memory: monitor.getMemoryUsage(),
      storage: monitor.getStorageStats(),
      slowestEndpoints: monitor.getSlowestEndpoints(10),
      recentErrors: monitor.getRecentErrors(10),
    };
    
    return NextResponse.json({
      success: true,
      timestamp: Date.now(),
      metrics
    });
  } catch (error) {
    console.error('Error fetching performance metrics:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch performance metrics'
      },
      { status: 500 }
    );
  }
}