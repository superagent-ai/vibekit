// Load environment variables from root .env file
import '@/load-env';

import { NextRequest } from 'next/server';
import { SessionLogger } from '@/lib/session-logger';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params;

  console.log(`[Metadata API] Attempting to read session: ${sessionId}`);
  console.log(`[Metadata API] Current working directory: ${process.cwd()}`);

  try {
    const session = await SessionLogger.readSession(sessionId);
    console.log(`[Metadata API] Successfully read session: ${sessionId}`);
    
    return Response.json(session.metadata, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
  } catch (error: any) {
    console.error(`[Metadata API] Failed to read session metadata for ${sessionId}:`, error);
    console.error(`[Metadata API] Error type:`, typeof error);
    console.error(`[Metadata API] Error code:`, error.code);
    console.error(`[Metadata API] Error message:`, error.message);
    console.error(`[Metadata API] Error stack:`, error.stack);
    
    if (error.code === 'ENOENT' || error.message?.includes('not found')) {
      console.log(`[Metadata API] Returning 404 for session ${sessionId}`);
      return Response.json(
        { error: 'Session not found', sessionId },
        { status: 404 }
      );
    }
    
    console.log(`[Metadata API] Returning 500 for session ${sessionId}`);
    return Response.json(
      { 
        error: 'Failed to read session metadata', 
        sessionId,
        details: error.message || 'Unknown error'
      },
      { status: 500 }
    );
  }
}