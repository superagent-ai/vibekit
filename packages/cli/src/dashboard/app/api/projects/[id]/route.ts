import { NextRequest, NextResponse } from 'next/server';
import { getProject, updateProject, deleteProject } from '@/lib/projects';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const project = await getProject(params.id);
    
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
    
    return NextResponse.json({
      success: true,
      data: project,
      message: null
    });
  } catch (error) {
    console.error('Failed to fetch project:', error);
    return NextResponse.json(
      { 
        success: false,
        data: null,
        message: 'Failed to fetch project' 
      },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    
    const project = await updateProject(params.id, {
      name: body.name,
      gitRepoPath: body.gitRepoPath,
      setupScript: body.setupScript,
      devScript: body.devScript,
      cleanupScript: body.cleanupScript,
      tags: body.tags,
      description: body.description,
      status: body.status
    });
    
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
    
    return NextResponse.json({
      success: true,
      data: project,
      message: 'Project updated successfully'
    });
  } catch (error) {
    console.error('Failed to update project:', error);
    return NextResponse.json(
      { 
        success: false,
        data: null,
        message: 'Failed to update project' 
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const success = await deleteProject(params.id);
    
    if (!success) {
      return NextResponse.json(
        { 
          success: false,
          data: null,
          message: 'Project not found' 
        },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      success: true,
      data: null,
      message: 'Project deleted successfully'
    });
  } catch (error) {
    console.error('Failed to delete project:', error);
    return NextResponse.json(
      { 
        success: false,
        data: null,
        message: 'Failed to delete project' 
      },
      { status: 500 }
    );
  }
}