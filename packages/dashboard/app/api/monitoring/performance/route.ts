/**
 * Performance Monitoring API Endpoint
 * 
 * Provides performance metrics and analysis data
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPerformanceDashboard } from '@/lib/performance-monitor';

export async function GET(request: NextRequest) {
  try {
    const metrics = getPerformanceDashboard();
    
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