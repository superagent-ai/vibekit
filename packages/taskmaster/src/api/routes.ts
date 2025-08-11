import { NextRequest, NextResponse } from 'next/server';
import { TaskmasterProvider } from '../providers/taskmaster';
import { SSEManager } from '../utils/sse';
import type { TaskUpdate } from '../types';

/**
 * Self-contained API route handlers for taskmaster
 * These can be used directly in Next.js API routes or any other framework
 */

export interface TaskmasterProject {
  id: string;
  projectRoot: string;
}

/**
 * Handler for GET /tasks - Retrieve all tasks for a project
 */
export async function handleGetTasks(project: TaskmasterProject): Promise<NextResponse> {
  try {
    const provider = new TaskmasterProvider({
      projectRoot: project.projectRoot,
    });
    
    try {
      const tasksData = await provider.getTasks();
      
      return NextResponse.json({
        success: true,
        data: tasksData,
      });
    } catch (error) {
      // File doesn't exist or can't be read
      console.error('Error reading tasks file:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to read tasks file';
      return NextResponse.json({
        success: false,
        error: errorMessage,
        data: {
          tasks: [],
          metadata: {},
          projectId: project.id,
        },
      });
    }
  } catch (error) {
    console.error('Error fetching tasks:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch tasks' },
      { status: 500 }
    );
  }
}

/**
 * Handler for POST /tasks/update - Update a task
 */
export async function handleUpdateTask(
  project: TaskmasterProject,
  body: TaskUpdate
): Promise<NextResponse> {
  try {
    const provider = new TaskmasterProvider({
      projectRoot: project.projectRoot,
    });
    
    await provider.updateTask(body);
    
    return NextResponse.json({
      success: true,
      message: 'Task updated successfully',
    });
  } catch (error) {
    console.error('Error updating task:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to update task' 
      },
      { status: 500 }
    );
  }
}

/**
 * Handler for GET /tasks/watch - SSE endpoint for watching task changes
 */
export function handleWatchTasks(project: TaskmasterProject): Response {
  const provider = new TaskmasterProvider({
    projectRoot: project.projectRoot,
  });
  
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      
      // Send initial connection message
      controller.enqueue(encoder.encode('data: {"type":"connected"}\n\n'));
      
      // Set up file watcher
      const cleanup = provider.watchTasks((event) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch (error) {
          console.error('Error sending SSE event:', error);
        }
      });
      
      // Handle client disconnect
      const checkClosed = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(':heartbeat\n\n'));
        } catch {
          cleanup();
          clearInterval(checkClosed);
        }
      }, 30000);
      
      // Cleanup on close
      return () => {
        cleanup();
        clearInterval(checkClosed);
      };
    },
  });
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

/**
 * Create Next.js API route handlers for taskmaster
 * This returns an object with route handlers that can be exported from Next.js route files
 */
export function createTaskmasterAPIRoutes(
  getProject: (id: string) => Promise<TaskmasterProject | null>
) {
  return {
    // GET /api/projects/[id]/tasks
    async getTasks(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
      const { id } = await params;
      const project = await getProject(id);
      
      if (!project) {
        return NextResponse.json(
          { success: false, error: 'Project not found' },
          { status: 404 }
        );
      }
      
      return handleGetTasks(project);
    },
    
    // POST /api/projects/[id]/tasks/update
    async updateTask(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
      const { id } = await params;
      const project = await getProject(id);
      
      if (!project) {
        return NextResponse.json(
          { success: false, error: 'Project not found' },
          { status: 404 }
        );
      }
      
      const body = await request.json() as TaskUpdate;
      return handleUpdateTask(project, body);
    },
    
    // GET /api/projects/[id]/tasks/watch
    async watchTasks(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
      const { id } = await params;
      const project = await getProject(id);
      
      if (!project) {
        return NextResponse.json(
          { success: false, error: 'Project not found' },
          { status: 404 }
        );
      }
      
      return handleWatchTasks(project);
    },
  };
}