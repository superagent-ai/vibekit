import { NextRequest, NextResponse } from 'next/server';
import { getAllProjects } from '@/lib/projects';
import * as fs from 'fs/promises';
import * as path from 'path';

export async function GET(request: NextRequest) {
  try {
    // Get all projects
    const projects = await getAllProjects();
    
    // Check each project for taskmaster file
    const statusMap: Record<string, boolean> = {};
    
    for (const project of projects) {
      const tasksFilePath = path.join(project.projectRoot, '.taskmaster', 'tasks', 'tasks.json');
      
      try {
        await fs.access(tasksFilePath);
        statusMap[project.id] = true;
      } catch {
        statusMap[project.id] = false;
      }
    }
    
    return NextResponse.json({
      success: true,
      data: statusMap,
    });
  } catch (error) {
    console.error('Error checking taskmaster status:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to check taskmaster status' },
      { status: 500 }
    );
  }
}