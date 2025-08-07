import { NextRequest, NextResponse } from 'next/server';
import { getAllProjects, createProject } from '@/lib/projects';
import { validateProjectInput, sanitizeProjectData } from '@/lib/validation';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

const PROJECTS_FILE = path.join(os.homedir(), '.vibekit', 'projects.json');

export async function GET() {
  try {
    const projects = await getAllProjects();
    
    // Get file modification time for change detection
    let lastModified = null;
    try {
      const stats = await fs.stat(PROJECTS_FILE);
      lastModified = stats.mtime.toISOString();
    } catch (error) {
      // File doesn't exist yet, that's ok
    }
    
    return NextResponse.json({
      success: true,
      data: projects,
      lastModified,
      message: null
    });
  } catch (error) {
    console.error('Failed to fetch projects:', error);
    return NextResponse.json(
      { 
        success: false,
        data: null,
        lastModified: null,
        message: 'Failed to fetch projects' 
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate input
    const validation = validateProjectInput(body);
    if (!validation.isValid) {
      return NextResponse.json(
        { 
          success: false,
          data: null,
          message: 'Validation failed',
          errors: validation.errors
        },
        { status: 400 }
      );
    }
    
    // Sanitize input data
    const sanitizedData = sanitizeProjectData(body);
    
    const project = await createProject(sanitizedData);
    
    return NextResponse.json({
      success: true,
      data: project,
      message: 'Project created successfully'
    });
  } catch (error) {
    console.error('Failed to create project:', error);
    return NextResponse.json(
      { 
        success: false,
        data: null,
        message: 'Failed to create project' 
      },
      { status: 500 }
    );
  }
}