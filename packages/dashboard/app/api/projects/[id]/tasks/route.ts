import { NextRequest, NextResponse } from 'next/server';
import { getProject } from '@/lib/projects';
import { Taskmaster } from '@vibe-kit/taskmaster';

export async function GET(
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
  
  // Check if project uses manual tasks
  if (project.taskSource === 'manual') {
    // Return manual tasks in the same format as taskmaster
    const manualTasks = project.manualTasks || [];
    return NextResponse.json({
      success: true,
      data: {
        tasks: manualTasks,
        metadata: {
          created: project.createdAt,
          updated: project.updatedAt,
          description: `Manual tasks for ${project.name}`,
          source: 'manual'
        }
      }
    });
  }
  
  // Default to taskmaster
  return Taskmaster.api.handleGetTasks({
    id: project.id,
    projectRoot: project.projectRoot,
  });
}