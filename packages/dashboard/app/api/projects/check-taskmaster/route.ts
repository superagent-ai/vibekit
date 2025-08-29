import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export async function POST(request: NextRequest) {
  try {
    const { projectRoot } = await request.json();
    
    if (!projectRoot) {
      return NextResponse.json(
        { success: false, error: 'Project root is required' },
        { status: 400 }
      );
    }
    
    // Check if .taskmaster folder exists
    const taskmasterPath = path.join(projectRoot, '.taskmaster');
    
    try {
      const stats = await fs.stat(taskmasterPath);
      const hasTaskmaster = stats.isDirectory();
      
      return NextResponse.json({
        success: true,
        hasTaskmaster,
        taskSource: hasTaskmaster ? 'taskmaster' : 'manual'
      });
    } catch (error) {
      // .taskmaster folder doesn't exist
      return NextResponse.json({
        success: true,
        hasTaskmaster: false,
        taskSource: 'manual'
      });
    }
  } catch (error) {
    console.error('Error checking taskmaster folder:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to check taskmaster folder' },
      { status: 500 }
    );
  }
}