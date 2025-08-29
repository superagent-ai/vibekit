import { NextRequest, NextResponse } from 'next/server';
import { SessionLogger } from '@/lib/session-logger';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const projectId = searchParams.get('projectId') || undefined;
    
    const sessions = await SessionLogger.listSessions(limit, projectId);
    
    return NextResponse.json({
      success: true,
      sessions,
      count: sessions.length
    });
  } catch (error: any) {
    console.error('Failed to list sessions:', error);
    
    return NextResponse.json(
      { 
        success: false,
        error: error.message || 'Failed to list sessions'
      },
      { status: 500 }
    );
  }
}