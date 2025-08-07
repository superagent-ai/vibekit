import { NextRequest, NextResponse } from 'next/server';
import { getProject } from '@/lib/projects';
import * as chokidar from 'chokidar';
import * as path from 'path';

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
  
  // Construct the path to the tasks.json file
  const tasksFilePath = path.join(project.projectRoot, '.taskmaster', 'tasks', 'tasks.json');
  
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
      
      // Set up file watcher
      const watcher = chokidar.watch(tasksFilePath, {
        persistent: true,
        ignoreInitial: true,
      });
      
      watcher.on('change', () => {
        try {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'tasks-updated', projectId })}\n\n`
            )
          );
        } catch (error) {
          console.error('Error sending update:', error);
        }
      });
      
      watcher.on('error', (error) => {
        console.error('Watcher error:', error);
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`
          )
        );
      });
      
      // Clean up on connection close
      request.signal.addEventListener('abort', () => {
        watcher.close();
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