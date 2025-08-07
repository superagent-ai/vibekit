import { NextRequest, NextResponse } from 'next/server';
import { getAllProjects, createProject } from '@/lib/projects';

export async function GET() {
  try {
    const projects = await getAllProjects();
    return NextResponse.json({
      success: true,
      data: projects,
      message: null
    });
  } catch (error) {
    console.error('Failed to fetch projects:', error);
    return NextResponse.json(
      { 
        success: false,
        data: null,
        message: 'Failed to fetch projects' 
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate required fields
    if (!body.name || !body.projectRoot) {
      return NextResponse.json(
        { 
          success: false,
          data: null,
          message: 'Name and projectRoot are required' 
        },
        { status: 400 }
      );
    }
    
    const project = await createProject({
      name: body.name,
      projectRoot: body.projectRoot,
      setupScript: body.setupScript || '',
      devScript: body.devScript || '',
      cleanupScript: body.cleanupScript || '',
      tags: body.tags || [],
      description: body.description || '',
      status: body.status || 'active'
    });
    
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