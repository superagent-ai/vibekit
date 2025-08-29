import { NextRequest, NextResponse } from 'next/server';
import { getProject, updateProject } from '@/lib/projects';
import type { ManualTask } from '@/lib/projects';

// GET - Get manual tasks for a project
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  
  try {
    const project = await getProject(id);
    
    if (!project) {
      return NextResponse.json(
        { success: false, error: 'Project not found' },
        { status: 404 }
      );
    }
    
    // Return manual tasks or empty array
    const tasks = project.manualTasks || [];
    
    return NextResponse.json({
      success: true,
      data: tasks,
      taskSource: project.taskSource || 'taskmaster'
    });
  } catch (error) {
    console.error('Failed to fetch manual tasks:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch manual tasks' },
      { status: 500 }
    );
  }
}

// POST - Create a new manual task
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  
  try {
    const project = await getProject(id);
    
    if (!project) {
      return NextResponse.json(
        { success: false, error: 'Project not found' },
        { status: 404 }
      );
    }
    
    const taskData = await request.json();
    
    // Initialize manual tasks if not present
    if (!project.manualTasks) {
      project.manualTasks = [];
    }
    
    // Create new task with auto-incrementing ID
    const newTask: ManualTask = {
      id: project.manualTasks.length > 0 
        ? Math.max(...project.manualTasks.map(t => t.id)) + 1 
        : 1,
      title: taskData.title,
      description: taskData.description || '',
      details: taskData.details || '',
      testStrategy: taskData.testStrategy || '',
      priority: taskData.priority || 'medium',
      dependencies: taskData.dependencies || [],
      status: taskData.status || 'pending',
      subtasks: taskData.subtasks || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    project.manualTasks.push(newTask);
    
    // Update the project (ensure taskSource is set to manual)
    await updateProject(id, { 
      manualTasks: project.manualTasks,
      taskSource: 'manual'
    });
    
    return NextResponse.json({
      success: true,
      data: newTask
    });
  } catch (error) {
    console.error('Failed to create manual task:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create manual task' },
      { status: 500 }
    );
  }
}

// PUT - Update a manual task
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  
  try {
    const project = await getProject(id);
    
    if (!project) {
      return NextResponse.json(
        { success: false, error: 'Project not found' },
        { status: 404 }
      );
    }
    
    const { taskId, ...updates } = await request.json();
    
    if (!project.manualTasks) {
      return NextResponse.json(
        { success: false, error: 'No manual tasks found' },
        { status: 404 }
      );
    }
    
    const taskIndex = project.manualTasks.findIndex(t => t.id === taskId);
    
    if (taskIndex === -1) {
      return NextResponse.json(
        { success: false, error: 'Task not found' },
        { status: 404 }
      );
    }
    
    // Update the task
    project.manualTasks[taskIndex] = {
      ...project.manualTasks[taskIndex],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    
    // Save the updated project
    await updateProject(id, { manualTasks: project.manualTasks });
    
    return NextResponse.json({
      success: true,
      data: project.manualTasks[taskIndex]
    });
  } catch (error) {
    console.error('Failed to update manual task:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update manual task' },
      { status: 500 }
    );
  }
}

// DELETE - Delete a manual task
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  
  try {
    const project = await getProject(id);
    
    if (!project) {
      return NextResponse.json(
        { success: false, error: 'Project not found' },
        { status: 404 }
      );
    }
    
    const { taskId } = await request.json();
    
    if (!project.manualTasks) {
      return NextResponse.json(
        { success: false, error: 'No manual tasks found' },
        { status: 404 }
      );
    }
    
    const taskIndex = project.manualTasks.findIndex(t => t.id === taskId);
    
    if (taskIndex === -1) {
      return NextResponse.json(
        { success: false, error: 'Task not found' },
        { status: 404 }
      );
    }
    
    // Remove the task
    project.manualTasks.splice(taskIndex, 1);
    
    // Save the updated project
    await updateProject(id, { manualTasks: project.manualTasks });
    
    return NextResponse.json({
      success: true,
      message: 'Task deleted successfully'
    });
  } catch (error) {
    console.error('Failed to delete manual task:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete manual task' },
      { status: 500 }
    );
  }
}