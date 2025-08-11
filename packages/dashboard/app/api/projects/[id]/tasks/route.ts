import { NextRequest } from 'next/server';
import { getProject } from '@/lib/projects';
import { Taskmaster } from '@vibe-kit/taskmaster';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const project = await getProject(projectId);
  
  if (!project) {
    return Taskmaster.api.handleGetTasks({
      id: projectId,
      projectRoot: '',
    });
  }
  
  return Taskmaster.api.handleGetTasks({
    id: project.id,
    projectRoot: project.projectRoot,
  });
}