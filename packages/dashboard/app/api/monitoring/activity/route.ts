import { NextRequest } from 'next/server';
import { ExecutionHistoryManager } from '@/lib/execution-history-manager';
import { SessionManager } from '@/lib/session-manager';
import { createLogger, logUtils } from '@/lib/structured-logger';

interface ActivityEvent {
  id: string;
  type: 'execution_started' | 'execution_completed' | 'execution_failed' | 'session_created' | 'session_ended' | 'system_alert';
  timestamp: number;
  data: Record<string, any>;
  severity?: 'info' | 'warning' | 'error';
}

// Global activity tracking with resource limits
const activityBuffer: ActivityEvent[] = [];
const MAX_BUFFER_SIZE = 100;
const MAX_CONCURRENT_CONNECTIONS = 50; // Prevent connection exhaustion
const CONNECTION_TIMEOUT = 10 * 60 * 1000; // 10 minutes
const activeConnections = new Map<ReadableStreamDefaultController, number>(); // controller -> creation time

// Create logger for this API
const logger = createLogger('ActivityAPI');

/**
 * Clean up stale connections that have exceeded the timeout
 */
function cleanupStaleConnections() {
  const now = Date.now();
  const staleControllers: ReadableStreamDefaultController[] = [];
  
  for (const [controller, timestamp] of activeConnections) {
    if (now - timestamp > CONNECTION_TIMEOUT) {
      staleControllers.push(controller);
    }
  }
  
  for (const controller of staleControllers) {
    try {
      controller.close();
    } catch (error) {
      // Connection might already be closed
    }
    activeConnections.delete(controller);
  }
  
  if (staleControllers.length > 0) {
    logger.info('Cleaned up stale connections', { 
      staleConnections: staleControllers.length,
      remainingConnections: activeConnections.size
    });
  }
}

/**
 * Add activity event to buffer and broadcast to all connected clients
 */
export function broadcastActivity(event: ActivityEvent) {
  // Add to buffer
  activityBuffer.unshift(event);
  
  // Limit buffer size
  if (activityBuffer.length > MAX_BUFFER_SIZE) {
    activityBuffer.splice(MAX_BUFFER_SIZE);
  }
  
  // Broadcast to all active connections
  const encoder = new TextEncoder();
  const data = `data: ${JSON.stringify(event)}\n\n`;
  
  for (const [controller, timestamp] of activeConnections) {
    try {
      controller.enqueue(encoder.encode(data));
    } catch (error) {
      // Connection is closed, remove immediately
      activeConnections.delete(controller);
    }
  }
}

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const timer = logUtils.requestStart('GET', '/api/monitoring/activity', requestId);
  
  const encoder = new TextEncoder();
  let currentController: ReadableStreamDefaultController;
  
  // Check connection limits
  if (activeConnections.size >= MAX_CONCURRENT_CONNECTIONS) {
    // Clean up stale connections first
    cleanupStaleConnections();
    
    if (activeConnections.size >= MAX_CONCURRENT_CONNECTIONS) {
      logger.warn('Connection limit exceeded', {
        requestId,
        currentConnections: activeConnections.size,
        maxConnections: MAX_CONCURRENT_CONNECTIONS
      });
      logUtils.requestComplete(timer, 503, requestId);
      return new Response('Connection limit exceeded', { status: 503 });
    }
  }
  
  const stream = new ReadableStream({
    start(controller: ReadableStreamDefaultController) {
      currentController = controller;
      
      // Add to active connections with timestamp
      activeConnections.set(controller, Date.now());
      
      // Send initial connection event
      const connectionEvent: ActivityEvent = {
        id: `conn_${Date.now()}`,
        type: 'system_alert',
        timestamp: Date.now(),
        data: { message: 'Connected to activity stream' },
        severity: 'info'
      };
      
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(connectionEvent)}\n\n`));
      
      // Send recent activity from buffer
      for (const event of activityBuffer.slice(0, 10)) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }
      
      logger.info('New activity stream connection', { 
        requestId,
        totalConnections: activeConnections.size,
        maxConnections: MAX_CONCURRENT_CONNECTIONS
      });
    },
    
    cancel() {
      // Remove from active connections
      activeConnections.delete(currentController);
      logger.info('Activity stream connection closed', { 
        requestId,
        remainingConnections: activeConnections.size
      });
      logUtils.requestComplete(timer, 200, requestId);
    }
  });
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
    },
  });
}

// Export utility functions for other parts of the system to use
export const ActivityStream = {
  /**
   * Log execution started
   */
  executionStarted: (executionData: {
    executionId: string;
    sessionId: string;
    projectId: string;
    agent: string;
    sandbox: string;
    taskTitle: string;
    subtaskTitle: string;
  }) => {
    broadcastActivity({
      id: `exec_start_${executionData.executionId}`,
      type: 'execution_started',
      timestamp: Date.now(),
      data: executionData,
      severity: 'info'
    });
  },
  
  /**
   * Log execution completed
   */
  executionCompleted: (executionData: {
    executionId: string;
    success: boolean;
    duration: number;
    exitCode: number;
    pullRequestCreated?: boolean;
  }) => {
    broadcastActivity({
      id: `exec_complete_${executionData.executionId}`,
      type: 'execution_completed',
      timestamp: Date.now(),
      data: executionData,
      severity: executionData.success ? 'info' : 'warning'
    });
  },
  
  /**
   * Log execution failed
   */
  executionFailed: (executionData: {
    executionId: string;
    error: string;
    duration?: number;
  }) => {
    broadcastActivity({
      id: `exec_failed_${executionData.executionId}`,
      type: 'execution_failed',
      timestamp: Date.now(),
      data: executionData,
      severity: 'error'
    });
  },
  
  /**
   * Log session created
   */
  sessionCreated: (sessionData: {
    sessionId: string;
    agent: string;
    projectId: string;
  }) => {
    broadcastActivity({
      id: `session_create_${sessionData.sessionId}`,
      type: 'session_created',
      timestamp: Date.now(),
      data: sessionData,
      severity: 'info'
    });
  },
  
  /**
   * Log session ended
   */
  sessionEnded: (sessionData: {
    sessionId: string;
    duration: number;
    status: string;
  }) => {
    broadcastActivity({
      id: `session_end_${sessionData.sessionId}`,
      type: 'session_ended',
      timestamp: Date.now(),
      data: sessionData,
      severity: 'info'
    });
  },
  
  /**
   * Log system alert
   */
  systemAlert: (alertData: {
    message: string;
    component?: string;
    details?: any;
    severity?: 'info' | 'warning' | 'error';
  }) => {
    broadcastActivity({
      id: `alert_${Date.now()}`,
      type: 'system_alert',
      timestamp: Date.now(),
      data: alertData,
      severity: alertData.severity || 'info'
    });
  },
  
  /**
   * Get current activity buffer
   */
  getRecentActivity: (limit: number = 50) => {
    return activityBuffer.slice(0, limit);
  },
  
  /**
   * Get connection count
   */
  getConnectionCount: () => {
    return activeConnections.size;
  }
};