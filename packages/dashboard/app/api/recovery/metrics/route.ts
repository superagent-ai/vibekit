import { NextRequest, NextResponse } from 'next/server';
import { recoveryManager } from '@/lib/recovery-manager';

export async function GET(request: NextRequest) {
  try {
    // Initialize if needed
    await recoveryManager.initialize();

    const metrics = recoveryManager.getMetrics();

    return NextResponse.json({
      success: true,
      metrics
    });

  } catch (error) {
    console.error('Error getting recovery metrics:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to get recovery metrics',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}