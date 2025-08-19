import { NextRequest, NextResponse } from 'next/server';
import { executionHistoryManager } from '@/lib/execution-history-manager';

export async function GET(request: NextRequest) {
  try {
    // Initialize if needed
    await executionHistoryManager.initialize();

    // Parse query parameters
    const { searchParams } = request.nextUrl;
    
    const query = {
      projectId: searchParams.get('projectId') || undefined,
      agent: searchParams.get('agent') || undefined,
      sandbox: searchParams.get('sandbox') || undefined,
      status: searchParams.get('status') as any || undefined,
      success: searchParams.get('success') ? searchParams.get('success') === 'true' : undefined,
      dateFrom: searchParams.get('dateFrom') ? parseInt(searchParams.get('dateFrom')!) : undefined,
      dateTo: searchParams.get('dateTo') ? parseInt(searchParams.get('dateTo')!) : undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 100,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : 0,
    };

    const result = await executionHistoryManager.queryExecutions(query);

    return NextResponse.json({
      success: true,
      executions: result.executions,
      count: result.count,
      query: result.query
    });

  } catch (error) {
    console.error('Error querying execution history:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to query execution history',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}