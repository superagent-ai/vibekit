import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const currentPath = body.path || os.homedir();
    
    // Validate that the path exists
    if (!await fs.pathExists(currentPath)) {
      return NextResponse.json(
        { 
          success: false,
          data: null,
          message: 'Path does not exist' 
        },
        { status: 400 }
      );
    }
    
    // Get directory contents
    const items = await fs.readdir(currentPath, { withFileTypes: true });
    
    // Filter and map directories only
    const directories = items
      .filter(item => item.isDirectory() && !item.name.startsWith('.'))
      .map(item => ({
        name: item.name,
        path: path.join(currentPath, item.name),
        isDirectory: true
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    
    // Get parent directory (if not at root)
    const parentPath = path.dirname(currentPath);
    const isRoot = parentPath === currentPath;
    
    return NextResponse.json({
      success: true,
      data: {
        currentPath,
        parentPath: isRoot ? null : parentPath,
        directories,
        isRoot,
        separator: path.sep
      },
      message: null
    });
  } catch (error) {
    console.error('Failed to browse directories:', error);
    return NextResponse.json(
      { 
        success: false,
        data: null,
        message: 'Failed to browse directories' 
      },
      { status: 500 }
    );
  }
}