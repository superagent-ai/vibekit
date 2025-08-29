import { NextRequest, NextResponse } from 'next/server';
import { executionHistoryManager } from '@/lib/execution-history-manager';

export async function GET(request: NextRequest) {
  try {
    // Initialize if needed
    await executionHistoryManager.initialize();

    // Parse query parameters
    const { searchParams } = request.nextUrl;
    const projectId = searchParams.get('projectId') || undefined;

    const statistics = await executionHistoryManager.getStatistics(projectId);

    return NextResponse.json({
      success: true,
      statistics
    });

  } catch (error) {
    console.error('Error getting execution statistics:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to get execution statistics',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}