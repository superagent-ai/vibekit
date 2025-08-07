import { NextRequest, NextResponse } from 'next/server';
import { ChatClient } from '@vibe-kit/ai-chat';

const chatClient = new ChatClient();

interface RouteParams {
  params: Promise<{ id: string }> | { id: string };
}

async function resolveParams(params: Promise<{ id: string }> | { id: string }) {
  return params instanceof Promise ? await params : params;
}

// GET /api/chat/sessions/[id] - Get specific session
export async function GET(req: NextRequest, context: RouteParams) {
  try {
    const { id } = await resolveParams(context.params);
    
    await chatClient.initialize();
    const session = await chatClient.loadSession(id);
    
    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json(session);
  } catch (error) {
    console.error('Failed to load session:', error);
    return NextResponse.json(
      { error: 'Failed to load session' },
      { status: 500 }
    );
  }
}

// PATCH /api/chat/sessions/[id] - Update session (rename)
export async function PATCH(req: NextRequest, context: RouteParams) {
  try {
    const { id } = await resolveParams(context.params);
    const { title } = await req.json();
    
    if (!title) {
      return NextResponse.json(
        { error: 'Title is required' },
        { status: 400 }
      );
    }
    
    await chatClient.initialize();
    await chatClient.renameSession(id, title);
    
    const session = await chatClient.loadSession(id);
    return NextResponse.json(session);
  } catch (error) {
    console.error('Failed to update session:', error);
    return NextResponse.json(
      { error: 'Failed to update session' },
      { status: 500 }
    );
  }
}

// DELETE /api/chat/sessions/[id] - Delete session
export async function DELETE(req: NextRequest, context: RouteParams) {
  try {
    const { id } = await resolveParams(context.params);
    
    await chatClient.initialize();
    await chatClient.deleteSession(id);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete session:', error);
    return NextResponse.json(
      { error: 'Failed to delete session' },
      { status: 500 }
    );
  }
}