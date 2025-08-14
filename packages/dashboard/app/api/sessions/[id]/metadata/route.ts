import { NextRequest } from 'next/server';
import { SessionLogger } from '@/lib/session-logger';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params;

  try {
    const session = await SessionLogger.readSession(sessionId);
    
    return Response.json(session.metadata, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
  } catch (error: any) {
    console.error(`Failed to read session metadata for ${sessionId}:`, error);
    
    if (error.code === 'ENOENT') {
      return Response.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }
    
    return Response.json(
      { error: 'Failed to read session metadata' },
      { status: 500 }
    );
  }
}