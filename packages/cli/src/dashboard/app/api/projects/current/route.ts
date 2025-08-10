import { NextRequest, NextResponse } from 'next/server';
import { getCurrentProject, setCurrentProject, getProject } from '@/lib/projects';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

const CURRENT_PROJECT_FILE = path.join(os.homedir(), '.vibekit', 'current-project.json');

export async function GET() {
  try {
    const currentProject = await getCurrentProject();
    
    // Get file modification time for change detection
    let lastModified = null;
    try {
      const stats = await fs.stat(CURRENT_PROJECT_FILE);
      lastModified = stats.mtime.toISOString();
    } catch (error) {
      // File doesn't exist yet, that's ok
    }
    
    return NextResponse.json({
      success: true,
      data: currentProject,
      lastModified,
      message: null
    });
  } catch (error) {
    console.error('Failed to fetch current project:', error);
    return NextResponse.json(
      { 
        success: false,
        data: null,
        lastModified: null,
        message: 'Failed to fetch current project' 
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId } = body;
    
    if (!projectId) {
      return NextResponse.json(
        { 
          success: false,
          data: null,
          message: 'Project ID is required' 
        },
        { status: 400 }
      );
    }
    
    const project = await getProject(projectId);
    if (!project) {
      return NextResponse.json(
        { 
          success: false,
          data: null,
          message: 'Project not found' 
        },
        { status: 404 }
      );
    }
    
    await setCurrentProject(project);
    
    return NextResponse.json({
      success: true,
      data: project,
      message: 'Current project updated successfully'
    });
  } catch (error) {
    console.error('Failed to set current project:', error);
    return NextResponse.json(
      { 
        success: false,
        data: null,
        message: 'Failed to set current project' 
      },
      { status: 500 }
    );
  }
}