import { NextRequest, NextResponse } from 'next/server';
import { getProject } from '@/lib/projects';
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
  return Taskmaster.api.handleUpdateTask(
    {
      id: project.id,
      projectRoot: project.projectRoot,
    },
    body
  );
}