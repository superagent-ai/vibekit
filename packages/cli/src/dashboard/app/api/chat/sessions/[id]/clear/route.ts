import { NextRequest, NextResponse } from 'next/server';
import { ChatClient } from '@vibe-kit/ai-chat';

const chatClient = new ChatClient();

interface RouteParams {
  params: Promise<{ id: string }> | { id: string };
}

async function resolveParams(params: Promise<{ id: string }> | { id: string }) {
  return params instanceof Promise ? await params : params;
}

// POST /api/chat/sessions/[id]/clear - Clear session messages
export async function POST(req: NextRequest, context: RouteParams) {
  try {
    const { id } = await resolveParams(context.params);
    
    await chatClient.initialize();
    await chatClient.clearSession(id);
    
    const session = await chatClient.loadSession(id);
    return NextResponse.json(session);
  } catch (error) {
    console.error('Failed to clear session:', error);
    return NextResponse.json(
      { error: 'Failed to clear session' },
      { status: 500 }
    );
  }
}