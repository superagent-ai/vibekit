import { NextRequest, NextResponse } from 'next/server';
import { getProject } from '@/lib/projects';
import { createTaskmasterProvider } from '@vibe-kit/taskmaster';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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
    
    try {
      // Get tasks using the provider
      const tasksData = await provider.getTasks();
      
      // Return the full tasks data structure with all tags
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
          projectId,
          projectName: project.name,
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