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
    const { taskId, numSubtasks = 5 } = body;
    
    console.log('[Task Expand] Request:', { projectId, taskId, numSubtasks });
    
    if (!taskId) {
      return NextResponse.json(
        { 
          success: false,
          message: 'Task ID is required' 
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
          message: 'Task expansion is only available for taskmaster projects' 
        },
        { status: 400 }
      );
    }
    
    console.log('[Task Expand] Project:', { 
      name: project.name, 
      projectRoot: project.projectRoot,
      taskSource: project.taskSource 
    });
    
    // Debug: Check if API keys are available
    console.log('[Task Expand] API Keys available:', {
      ANTHROPIC: !!process.env.ANTHROPIC_API_KEY,
      OPENAI: !!process.env.OPENAI_API_KEY,
      GEMINI: !!process.env.GEMINI_API_KEY,
      OPENROUTER: !!process.env.OPENROUTER_API_KEY,
    });
    
    // Try to use the existing MCP manager from the dashboard
    try {
      const manager = await getManager();
      const servers = manager.getAllServers();
      
      console.log('[Task Expand] Available MCP servers:', servers.map(s => s.name));
      
      // Find taskmaster server
      const taskmasterServer = servers.find(s => s.name === 'taskmaster');
      
      if (!taskmasterServer) {
        console.log('[Task Expand] Taskmaster server not found, falling back to CLI');
        throw new Error('Taskmaster MCP server not found');
      }
      
      console.log('[Task Expand] Found taskmaster server:', taskmasterServer);
      
      // Connect if not already connected
      if (taskmasterServer.status !== 'active') {
        console.log('[Task Expand] Connecting to taskmaster server...');
        await manager.connect(taskmasterServer.id);
      }
      
      // Get the expand_task tool
      const tools = await manager.getTools(taskmasterServer.id);
      console.log('[Task Expand] Available tools:', tools.map(t => t.name));
      
      const expandTool = tools.find(t => t.name === 'expand_task');
      
      if (!expandTool) {
        console.log('[Task Expand] expand_task tool not found');
        throw new Error('expand_task tool not found in taskmaster MCP server');
      }
      
      console.log('[Task Expand] Executing expand_task with params:', {
        id: taskId.toString(),
        num: numSubtasks,
        projectRoot: project.projectRoot
      });
      
      // Execute the expand_task tool
      const result = await manager.executeTool(taskmasterServer.id, 'expand_task', {
        id: taskId.toString(),
        num: numSubtasks,
        projectRoot: project.projectRoot,
        force: false // Append subtasks by default
      });
      
      console.log('[Task Expand] Tool execution result:', result);
      
      return NextResponse.json({
        success: true,
        message: `Successfully expanded task ${taskId} into ${numSubtasks} subtasks`,
        data: result
      });
    } catch (mcpError: any) {
      console.error('[Task Expand] MCP expansion failed:', mcpError);
      
      // Fallback to CLI command
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      
      try {
        console.log('[Task Expand] Trying CLI fallback...');
        
        // First check if task-master is installed
        try {
          await execAsync('which task-master');
        } catch {
          console.error('[Task Expand] task-master CLI not found in PATH');
          throw new Error('task-master CLI is not installed. Please install it globally with: npm install -g @vibe-kit/taskmaster');
        }
        
        // Check if tasks file exists
        const fs = await import('fs');
        const path = await import('path');
        const tasksFile = path.join(project.projectRoot, '.taskmaster', 'tasks', 'tasks.json');
        
        if (!fs.existsSync(tasksFile)) {
          console.error('[Task Expand] Tasks file not found:', tasksFile);
          throw new Error('Tasks file not found. Please ensure the project has been initialized with taskmaster and has tasks.');
        }
        
        // Read the tasks file to verify the task exists
        try {
          const tasksContent = fs.readFileSync(tasksFile, 'utf-8');
          const tasksData = JSON.parse(tasksContent);
          const taskExists = tasksData.tasks?.some((t: any) => t.id === parseInt(taskId));
          
          if (!taskExists) {
            throw new Error(`Task with ID ${taskId} not found in the project tasks.`);
          }
        } catch (err) {
          console.error('[Task Expand] Error reading tasks file:', err);
        }
        
        const command = `cd "${project.projectRoot}" && task-master expand -i ${taskId} -n ${numSubtasks}`;
        console.log('[Task Expand] Executing command:', command);
        
        const { stdout, stderr } = await execAsync(command, {
          env: {
            ...process.env,
            // Ensure all necessary API keys are available
            ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
            OPENAI_API_KEY: process.env.OPENAI_API_KEY,
            GEMINI_API_KEY: process.env.GEMINI_API_KEY,
            OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
          },
          timeout: 120000 // 120 second timeout for AI operations
        });
        
        console.log('[Task Expand] CLI stdout:', stdout);
        if (stderr) {
          console.log('[Task Expand] CLI stderr:', stderr);
        }
        
        // Check if the output indicates success
        if (stdout.includes('Successfully expanded') || stdout.includes('subtasks added')) {
          return NextResponse.json({
            success: true,
            message: `Successfully expanded task ${taskId} into ${numSubtasks} subtasks`,
            data: { output: stdout }
          });
        }
        
        // If stderr has content but includes "Generating", it might be progress output
        if (stderr && stderr.includes('Generating') && stderr.includes('subtasks')) {
          console.log('[Task Expand] Progress output detected in stderr');
          
          // Check if it ended with an error
          if (stderr.includes('Error:') || stderr.includes('Failed') || stderr.includes('error:')) {
            // Extract the actual error message after "Error:"
            const errorMatch = stderr.match(/Error:\s*(.+)/i);
            if (errorMatch) {
              throw new Error(errorMatch[1]);
            }
            throw new Error(stderr);
          }
          
          // If there's no stdout and stderr just shows "Generating", it likely failed silently
          if (!stdout || stdout.trim() === '') {
            console.error('[Task Expand] No output received after "Generating" message');
            // This often means an API key issue or network problem
            throw new Error('Task expansion started but did not complete. This usually indicates an API key issue or network problem. Please check that your ANTHROPIC_API_KEY or OPENAI_API_KEY is valid.');
          }
          
          // Otherwise treat as success
          return NextResponse.json({
            success: true,
            message: `Successfully expanded task ${taskId} into ${numSubtasks} subtasks`,
            data: { output: stdout }
          });
        }
        
        // Check for JSON parsing errors - this often means the AI returned conversational text instead of JSON
        if (stderr.includes('Failed to parse JSON') || stderr.includes('is not valid JSON')) {
          console.error('[Task Expand] JSON parsing error detected, AI likely returned conversational response');
          
          // Check if it mentions the AI trying to be conversational
          if (stderr.includes('"I\'ll') || stderr.includes('"I will') || stderr.includes('"Let me')) {
            throw new Error('The AI returned a conversational response instead of structured data. This usually means the task-master configuration needs adjustment. Try using a different AI model or updating task-master.');
          }
          
          throw new Error('Failed to generate subtasks: The AI did not return valid JSON. This can happen with certain models. Try using a different model (e.g., claude-3-sonnet or gpt-4) which are better at following structured output instructions.');
        }
        
        // Check for common error patterns
        if (stderr.includes('API key') || stderr.includes('authentication')) {
          throw new Error('Missing or invalid API key. Please ensure ANTHROPIC_API_KEY or OPENAI_API_KEY is set in your environment.');
        }
        
        if (stderr.includes('not found') || stderr.includes('does not exist')) {
          throw new Error(`Task ${taskId} not found in the taskmaster project.`);
        }
        
        if (stderr.includes('rate limit') || stderr.includes('quota')) {
          throw new Error('API rate limit exceeded. Please try again later.');
        }
        
        // Check if there's an error in stderr but task expansion partially succeeded
        if (stderr.includes('Error expanding task') && stdout.includes('Successfully')) {
          console.log('[Task Expand] Partial success detected despite error');
          return NextResponse.json({
            success: true,
            message: `Partially expanded task ${taskId} - some subtasks may have been created`,
            data: { output: stdout, warning: stderr }
          });
        }
        
        // Generic error handling
        if (stderr && !stderr.includes('warning')) {
          throw new Error(stderr);
        }
        
        throw new Error('Task expansion failed with no clear error message. Check server logs for details.');
      } catch (cliError: any) {
        console.error('[Task Expand] CLI expansion failed:', cliError);
        
        // Extract just the error message, not the full stack
        let errorMessage = cliError.message || 'Unknown error';
        
        // If it's a command execution error, try to extract the actual error
        if (errorMessage.includes('Command failed:')) {
          errorMessage = errorMessage.replace(/Command failed:.*\n/, '').trim();
        }
        
        throw new Error(errorMessage);
      }
    }
  } catch (error: any) {
    console.error('[Task Expand] Failed to expand task:', error);
    return NextResponse.json(
      { 
        success: false,
        message: error.message || 'Failed to expand task' 
      },
      { status: 500 }
    );
  }
}