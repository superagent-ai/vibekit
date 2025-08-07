import { NextRequest, NextResponse } from 'next/server';
import { getProject } from '@/lib/projects';
import { createTaskmasterProvider, SSEManager } from '@vibe-kit/taskmaster';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  
  // Get project details
  const project = await getProject(projectId);
  
  if (!project) {
    return NextResponse.json(
      { success: false, error: 'Project not found' },
      { status: 404 }
    );
  }
  
  // Create taskmaster provider
  const provider = createTaskmasterProvider({
    projectRoot: project.projectRoot,
  });
  
  // Create a readable stream for SSE
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      
      // Send initial connection message
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ type: 'connected', projectId })}\n\n`
        )
      );
      
      // Set up file watcher using the provider
      const unsubscribe = provider.watchTasks((event) => {
        try {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ ...event, projectId })}\n\n`
            )
          );
        } catch (error) {
          console.error('Error sending update:', error);
        }
      });
      
      // Clean up on connection close
      request.signal.addEventListener('abort', () => {
        unsubscribe();
        controller.close();
      });
      
      // Keep connection alive with periodic pings
      const pingInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': ping\n\n'));
        } catch (error) {
          clearInterval(pingInterval);
        }
      }, 30000);
      
      request.signal.addEventListener('abort', () => {
        clearInterval(pingInterval);
      });
    },
  });
  
  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}