import { NextRequest, NextResponse } from 'next/server';
import { getProject, updateProject, deleteProject } from '@/lib/projects';
import { promises as fs } from 'fs';
import path from 'path';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const project = await getProject(id);
    
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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    
    // Prepare update data - only include defined fields
    const updateData: any = {};
    
    // Only add fields that are actually present in the request body
    if (body.name !== undefined) updateData.name = body.name;
    if (body.projectRoot !== undefined) updateData.projectRoot = body.projectRoot;
    if (body.setupScript !== undefined) updateData.setupScript = body.setupScript;
    if (body.devScript !== undefined) updateData.devScript = body.devScript;
    if (body.cleanupScript !== undefined) updateData.cleanupScript = body.cleanupScript;
    if (body.tags !== undefined) updateData.tags = body.tags;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.priority !== undefined) updateData.priority = body.priority;
    if (body.taskSource !== undefined) updateData.taskSource = body.taskSource;
    if (body.manualTasks !== undefined) updateData.manualTasks = body.manualTasks;
    if (body.mcpServers !== undefined) updateData.mcpServers = body.mcpServers;
    
    // If projectRoot is being updated and taskSource is not explicitly set,
    // auto-detect based on .taskmaster folder
    if (body.projectRoot && !body.taskSource) {
      const taskmasterPath = path.join(body.projectRoot, '.taskmaster');
      try {
        const stats = await fs.stat(taskmasterPath);
        updateData.taskSource = stats.isDirectory() ? 'taskmaster' : 'manual';
      } catch {
        // .taskmaster folder doesn't exist, use manual mode
        updateData.taskSource = 'manual';
      }
    }
    
    const project = await updateProject(id, updateData);
    
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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const success = await deleteProject(id);
    
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