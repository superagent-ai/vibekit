import { NextRequest, NextResponse } from 'next/server';
import { getProject } from '@/lib/projects';
import * as fs from 'fs/promises';
import * as path from 'path';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const { taskId, status, tag } = await request.json();
    
    if (!taskId || !status) {
      return NextResponse.json(
        { success: false, error: 'Task ID and status are required' },
        { status: 400 }
      );
    }
    
    // Validate status
    if (!['pending', 'done', 'in-progress', 'review', 'deferred', 'cancelled'].includes(status)) {
      return NextResponse.json(
        { success: false, error: 'Invalid status value' },
        { status: 400 }
      );
    }
    
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
      // Read the current tasks file
      const fileContent = await fs.readFile(tasksFilePath, 'utf-8');
      const tasksData = JSON.parse(fileContent);
      
      // Find and update the task
      let taskFound = false;
      const targetTag = tag || 'master'; // Default to 'master' if no tag specified
      
      if (tasksData[targetTag] && tasksData[targetTag].tasks) {
        for (const task of tasksData[targetTag].tasks) {
          if (task.id === taskId) {
            task.status = status;
            taskFound = true;
            break;
          }
        }
      }
      
      if (!taskFound) {
        // Try to find in all tags if not found in specified tag
        for (const tagKey in tasksData) {
          if (tasksData[tagKey] && tasksData[tagKey].tasks) {
            for (const task of tasksData[tagKey].tasks) {
              if (task.id === taskId) {
                task.status = status;
                taskFound = true;
                break;
              }
            }
            if (taskFound) break;
          }
        }
      }
      
      if (!taskFound) {
        return NextResponse.json(
          { success: false, error: 'Task not found' },
          { status: 404 }
        );
      }
      
      // Update the metadata for the relevant tag
      if (tasksData[targetTag] && tasksData[targetTag].metadata) {
        tasksData[targetTag].metadata.updated = new Date().toISOString();
      }
      
      // Write the updated data back to the file
      await fs.writeFile(
        tasksFilePath,
        JSON.stringify(tasksData, null, 2),
        'utf-8'
      );
      
      return NextResponse.json({
        success: true,
        data: {
          taskId,
          status,
          message: 'Task status updated successfully',
        },
      });
    } catch (fileError) {
      console.error('Error updating tasks file:', fileError);
      return NextResponse.json(
        { success: false, error: 'Failed to update task status' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error updating task:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update task' },
      { status: 500 }
    );
  }
}