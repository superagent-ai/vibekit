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
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 10000, // Higher default for export
    };

    const format = (searchParams.get('format') || 'json') as 'json' | 'csv' | 'jsonl';

    // Validate format
    if (!['json', 'csv', 'jsonl'].includes(format)) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Invalid format. Must be json, csv, or jsonl' 
        },
        { status: 400 }
      );
    }

    const exportData = await executionHistoryManager.exportExecutions(query, format);

    // Set appropriate headers for download
    const headers = new Headers();
    const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const filename = `execution-history-${timestamp}.${format}`;

    switch (format) {
      case 'json':
        headers.set('Content-Type', 'application/json');
        break;
      case 'csv':
        headers.set('Content-Type', 'text/csv');
        break;
      case 'jsonl':
        headers.set('Content-Type', 'application/x-jsonlines');
        break;
    }

    headers.set('Content-Disposition', `attachment; filename="${filename}"`);
    headers.set('Cache-Control', 'no-cache');

    return new NextResponse(exportData, { headers });

  } catch (error) {
    console.error('Error exporting execution history:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to export execution history',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}