import { NextRequest, NextResponse } from 'next/server';
import { getProject } from '@/lib/projects';
import { getManager } from '@/app/api/mcp/utils';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const body = await request.json();
    const { taskId, all = false, tag = 'master' } = body;
    
    console.log('[Clear Subtasks] Request:', { projectId, taskId, all, tag });
    
    if (!taskId && !all) {
      return NextResponse.json(
        { 
          success: false,
          message: 'Task ID is required when not clearing all tasks' 
        },
        { status: 400 }
      );
    }
    
    // Get the project to verify it exists and has taskmaster
    const project = await getProject(projectId);
    
    if (!project) {
      return NextResponse.json(
        { 
          success: false,
          message: 'Project not found' 
        },
        { status: 404 }
      );
    }
    
    if (project.taskSource !== 'taskmaster') {
      return NextResponse.json(
        { 
          success: false,
          message: 'Clear subtasks is only available for taskmaster projects' 
        },
        { status: 400 }
      );
    }
    
    console.log('[Clear Subtasks] Project:', { 
      name: project.name, 
      projectRoot: project.projectRoot,
      taskSource: project.taskSource 
    });
    
    // Try to use the existing MCP manager from the dashboard
    try {
      const manager = await getManager();
      const servers = manager.getAllServers();
      
      console.log('[Clear Subtasks] Available MCP servers:', servers.map(s => s.name));
      
      // Find task-master-ai server
      const taskmasterServer = servers.find(s => s.name === 'task-master-ai');
      
      if (!taskmasterServer) {
        console.log('[Clear Subtasks] Taskmaster server not found');
        throw new Error('Taskmaster MCP server not found');
      }
      
      console.log('[Clear Subtasks] Found taskmaster server:', taskmasterServer.name, 'with status:', taskmasterServer.status);
      
      // Always try to connect to ensure server is active
      try {
        console.log('[Clear Subtasks] Ensuring taskmaster server is connected...');
        await manager.connect(taskmasterServer.id);
        console.log('[Clear Subtasks] Successfully connected to taskmaster server');
      } catch (connectError: any) {
        console.error('[Clear Subtasks] Failed to connect to taskmaster server:', connectError);
        // Try to continue anyway in case it's already connected
      }
      
      // Get the clear_subtasks tool
      const tools = await manager.getTools(taskmasterServer.id);
      console.log('[Clear Subtasks] Available tools:', tools.map(t => t.name));
      
      const clearTool = tools.find(t => t.name === 'clear_subtasks');
      
      if (!clearTool) {
        console.log('[Clear Subtasks] clear_subtasks tool not found');
        throw new Error('clear_subtasks tool not found in taskmaster MCP server');
      }
      
      console.log('[Clear Subtasks] Executing clear_subtasks with params:', {
        id: taskId ? taskId.toString() : '',
        all,
        projectRoot: project.projectRoot,
        tag
      });
      
      // Execute the clear_subtasks tool
      const result = await manager.executeTool(taskmasterServer.id, 'clear_subtasks', {
        id: taskId ? taskId.toString() : '',
        all,
        projectRoot: project.projectRoot,
        tag
      });
      
      console.log('[Clear Subtasks] Tool execution result:', result);
      
      return NextResponse.json({
        success: true,
        message: all ? 'Successfully cleared subtasks from all tasks' : `Successfully cleared subtasks from task ${taskId}`,
        data: result
      });
    } catch (mcpError: any) {
      console.error('[Clear Subtasks] MCP operation failed:', mcpError);
      
      return NextResponse.json(
        { 
          success: false,
          message: mcpError.message || 'Failed to clear subtasks',
          error: mcpError.toString()
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('[Clear Subtasks] Error:', error);
    return NextResponse.json(
      { 
        success: false,
        message: error.message || 'Failed to clear subtasks',
        error: error.toString()
      },
      { status: 500 }
    );
  }
}