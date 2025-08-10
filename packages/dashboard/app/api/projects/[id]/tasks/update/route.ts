import { NextRequest, NextResponse } from 'next/server';
import { getProject } from '@/lib/projects';
import { createTaskmasterProvider } from '@vibe-kit/taskmaster';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const { taskId, status, tag } = await request.json();
    
    if (!taskId || !status) {
      return NextResponse.json(
        { success: false, error: 'Task ID and status are required' },
        { status: 400 }
      );
    }
    
    // Validate status
    if (!['pending', 'done', 'in-progress', 'review', 'deferred', 'cancelled'].includes(status)) {
      return NextResponse.json(
        { success: false, error: 'Invalid status value' },
        { status: 400 }
      );
    }
    
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
    
    try {
      // Update task using the provider
      await provider.updateTask({
        taskId,
        status,
        tag: tag || 'master',
      });
      
      return NextResponse.json({
        success: true,
        data: {
          taskId,
          status,
          message: 'Task status updated successfully',
        },
      });
    } catch (fileError) {
      console.error('Error updating tasks file:', fileError);
      return NextResponse.json(
        { success: false, error: 'Failed to update task status' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error updating task:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update task' },
      { status: 500 }
    );
  }
}