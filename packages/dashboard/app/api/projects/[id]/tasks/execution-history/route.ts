import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

interface ExecutionRecord {
  taskId?: number;
  taskTitle?: string;
  subtaskId: number;
  subtaskTitle?: string;
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
    // Path to execution history file
    const historyPath = path.join(
      os.homedir(),
      '.vibekit',
      'execution-history',
      `${projectId}.json`
    );
    
    // Check if history file exists
    try {
      await fs.access(historyPath);
    } catch {
      return NextResponse.json({ 
        success: true, 
        executions: [] 
      });
    }
    
    // Read history file
    const data = await fs.readFile(historyPath, 'utf-8');
    const history: ExecutionRecord[] = JSON.parse(data);
    
    // Filter by subtaskId if provided
    let executions = history;
    if (subtaskId) {
      executions = history.filter(exec => exec.subtaskId === parseInt(subtaskId, 10));
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
    
    // Path to execution history file
    const historyPath = path.join(historyDir, `${projectId}.json`);
    
    // Read existing history or create new
    let history: ExecutionRecord[] = [];
    try {
      const data = await fs.readFile(historyPath, 'utf-8');
      history = JSON.parse(data);
    } catch {
      // File doesn't exist yet
    }
    
    // Add new execution record
    history.push({
      ...body,
      timestamp: body.timestamp || new Date().toISOString()
    });
    
    // Keep only last 100 executions per project
    if (history.length > 100) {
      history = history.slice(-100);
    }
    
    // Write updated history
    await fs.writeFile(historyPath, JSON.stringify(history, null, 2));
    
    return NextResponse.json({
      success: true,
      execution: body
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
    
    // Path to execution history file
    const historyPath = path.join(
      os.homedir(),
      '.vibekit',
      'execution-history',
      `${projectId}.json`
    );
    
    // Read existing history
    let history: ExecutionRecord[] = [];
    try {
      const data = await fs.readFile(historyPath, 'utf-8');
      history = JSON.parse(data);
    } catch {
      return NextResponse.json(
        { success: false, error: 'No execution history found' },
        { status: 404 }
      );
    }
    
    // Find and update the execution record
    const recordIndex = history.findIndex(exec => exec.sessionId === sessionId);
    if (recordIndex === -1) {
      return NextResponse.json(
        { success: false, error: 'Execution record not found' },
        { status: 404 }
      );
    }
    
    // Update the record
    history[recordIndex] = {
      ...history[recordIndex],
      status,
      duration
    };
    
    // Write updated history
    await fs.writeFile(historyPath, JSON.stringify(history, null, 2));
    
    return NextResponse.json({
      success: true,
      execution: history[recordIndex]
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