import { NextRequest, NextResponse } from 'next/server';
import { ChatClient } from '@vibe-kit/ai-chat';

const chatClient = new ChatClient();

// GET /api/chat/sessions - List all sessions
export async function GET() {
  try {
    await chatClient.initialize();
    const sessions = await chatClient.listSessions();
    return NextResponse.json(sessions);
  } catch (error) {
    console.error('Failed to list sessions:', error);
    return NextResponse.json(
      { error: 'Failed to list sessions' },
      { status: 500 }
    );
  }
}

// POST /api/chat/sessions - Create new session
export async function POST(req: NextRequest) {
  try {
    const { title } = await req.json();
    
    await chatClient.initialize();
    const session = await chatClient.createSession(title);
    
    return NextResponse.json(session);
  } catch (error) {
    console.error('Failed to create session:', error);
    return NextResponse.json(
      { error: 'Failed to create session' },
      { status: 500 }
    );
  }
}