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
  
  return Taskmaster.api.handleWatchTasks({
    id: project.id,
    projectRoot: project.projectRoot,
  });
}