import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

interface ExecutionRecord {
  projectId: string;
  taskId?: number;
  subtaskId: number;
  sessionId: string;
  timestamp: string;
  agent: string;
  sandbox: string;
  branch: string;
  status?: 'running' | 'completed' | 'failed';
  duration?: number;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const searchParams = request.nextUrl.searchParams;
  const subtaskId = searchParams.get('subtaskId');
  
  try {
    const historyDir = path.join(os.homedir(), '.vibekit', 'execution-history');
    
    // Check if history directory exists
    try {
      await fs.access(historyDir);
    } catch {
      return NextResponse.json({ 
        success: true, 
        executions: [] 
      });
    }
    
    // Read all daily history files
    const files = await fs.readdir(historyDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));
    
    let allExecutions: ExecutionRecord[] = [];
    
    for (const file of jsonFiles) {
      try {
        const filePath = path.join(historyDir, file);
        const data = await fs.readFile(filePath, 'utf-8');
        const dailyHistory: ExecutionRecord[] = JSON.parse(data);
        
        // Filter by projectId
        const projectExecutions = dailyHistory.filter(exec => exec.projectId === projectId);
        allExecutions.push(...projectExecutions);
      } catch (error) {
        console.error(`Failed to read history file ${file}:`, error);
        // Continue with other files
      }
    }
    
    // Filter by subtaskId if provided
    let executions = allExecutions;
    if (subtaskId) {
      executions = allExecutions.filter(exec => exec.subtaskId === parseInt(subtaskId, 10));
    }
    
    // Sort by timestamp descending (most recent first)
    executions.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    
    return NextResponse.json({
      success: true,
      executions
    });
  } catch (error: any) {
    console.error('Failed to read execution history:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message 
      },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  
  try {
    const body: ExecutionRecord = await request.json();
    
    // Ensure directory exists
    const historyDir = path.join(os.homedir(), '.vibekit', 'execution-history');
    await fs.mkdir(historyDir, { recursive: true });
    
    // Get today's date for filename
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const historyPath = path.join(historyDir, `${today}.json`);
    
    // Read existing history for today or create new
    let history: ExecutionRecord[] = [];
    try {
      const data = await fs.readFile(historyPath, 'utf-8');
      history = JSON.parse(data);
    } catch {
      // File doesn't exist yet
    }
    
    // Add new execution record with projectId
    const newRecord: ExecutionRecord = {
      ...body,
      projectId,
      timestamp: body.timestamp || new Date().toISOString()
    };
    
    history.push(newRecord);
    
    // Write updated history
    await fs.writeFile(historyPath, JSON.stringify(history, null, 2));
    
    return NextResponse.json({
      success: true,
      execution: newRecord
    });
  } catch (error: any) {
    console.error('Failed to save execution history:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message 
      },
      { status: 500 }
    );
  }
}

// Update execution status
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  
  try {
    const { sessionId, status, duration } = await request.json();
    
    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: 'sessionId is required' },
        { status: 400 }
      );
    }
    
    const historyDir = path.join(os.homedir(), '.vibekit', 'execution-history');
    
    // Read all daily history files to find the record
    const files = await fs.readdir(historyDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));
    
    let foundRecord = false;
    let updatedRecord: ExecutionRecord | null = null;
    
    for (const file of jsonFiles) {
      try {
        const filePath = path.join(historyDir, file);
        const data = await fs.readFile(filePath, 'utf-8');
        let history: ExecutionRecord[] = JSON.parse(data);
        
        // Find the record by sessionId and projectId
        const recordIndex = history.findIndex(exec => 
          exec.sessionId === sessionId && exec.projectId === projectId
        );
        
        if (recordIndex !== -1) {
          // Update the record
          history[recordIndex] = {
            ...history[recordIndex],
            status,
            duration
          };
          
          // Write updated history back to file
          await fs.writeFile(filePath, JSON.stringify(history, null, 2));
          
          updatedRecord = history[recordIndex];
          foundRecord = true;
          break;
        }
      } catch (error) {
        console.error(`Failed to process history file ${file}:`, error);
        // Continue with other files
      }
    }
    
    if (!foundRecord) {
      return NextResponse.json(
        { success: false, error: 'Execution record not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      success: true,
      execution: updatedRecord
    });
  } catch (error: any) {
    console.error('Failed to update execution history:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message 
      },
      { status: 500 }
    );
  }
}