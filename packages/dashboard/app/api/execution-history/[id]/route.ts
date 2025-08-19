import { NextRequest, NextResponse } from 'next/server';
import { executionHistoryManager } from '@/lib/execution-history-manager';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Initialize if needed
    await executionHistoryManager.initialize();

    const { id } = params;
    
    if (!id) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Execution ID is required' 
        },
        { status: 400 }
      );
    }

    const execution = await executionHistoryManager.getExecution(id);

    if (!execution) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Execution not found' 
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      execution
    });

  } catch (error) {
    console.error('Error getting execution:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to get execution',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}