import { NextRequest, NextResponse } from 'next/server';
import { getProject } from '@/lib/projects';
import * as fs from 'fs/promises';
import * as path from 'path';

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
    
    // Construct the path to the tasks.json file
    const tasksFilePath = path.join(project.projectRoot, '.taskmaster', 'tasks', 'tasks.json');
    
    try {
      // Check if file exists
      await fs.access(tasksFilePath);
      
      // Read and parse the tasks file
      const fileContent = await fs.readFile(tasksFilePath, 'utf-8');
      const tasksData = JSON.parse(fileContent);
      
      // Return the full tasks data structure with all tags
      return NextResponse.json({
        success: true,
        data: tasksData,
      });
    } catch (fileError) {
      // File doesn't exist or can't be read
      console.error('Error reading tasks file:', fileError);
      return NextResponse.json({
        success: false,
        error: `No tasks file found at ${tasksFilePath}. Make sure Taskmaster is initialized for this project.`,
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