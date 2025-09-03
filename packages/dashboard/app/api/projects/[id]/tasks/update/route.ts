import { NextRequest, NextResponse } from 'next/server';
import { getProject, updateProject } from '@/lib/projects';
import { Taskmaster } from '@vibe-kit/taskmaster';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const project = await getProject(projectId);
  
  if (!project) {
    return NextResponse.json(
      { success: false, error: 'Project not found' },
      { status: 404 }
    );
  }
  
  const body = await request.json();
  
  // Check if project uses manual tasks
  if (project.taskSource === 'manual') {
    try {
      const { taskId, status } = body;
      
      if (!project.manualTasks) {
        return NextResponse.json(
          { success: false, error: 'No manual tasks found' },
          { status: 404 }
        );
      }
      
      const taskIndex = project.manualTasks.findIndex(t => t.id === taskId);
      
      if (taskIndex === -1) {
        return NextResponse.json(
          { success: false, error: 'Task not found' },
          { status: 404 }
        );
      }
      
      // Update the task status
      project.manualTasks[taskIndex].status = status;
      project.manualTasks[taskIndex].updatedAt = new Date().toISOString();
      
      // Save the updated project
      await updateProject(projectId, { manualTasks: project.manualTasks });
      
      return NextResponse.json({
        success: true,
        data: project.manualTasks[taskIndex]
      });
    } catch (error) {
      console.error('Failed to update manual task:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to update manual task' },
        { status: 500 }
      );
    }
  }
  
  // Default to taskmaster
  return Taskmaster.api.handleUpdateTask(
    {
      id: project.id,
      projectRoot: project.projectRoot,
    },
    body
  );
}