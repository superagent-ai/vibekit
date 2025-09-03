import { NextRequest } from 'next/server';
import { SessionLogger } from '@/lib/session-logger';
import path from 'path';
import os from 'os';
import chokidar, { FSWatcher } from 'chokidar';
import { promises as fs } from 'fs';
import { shutdownCoordinator } from '@/lib/shutdown-coordinator';
import { healthCheck } from '@/lib/health-check';

// Optimized intervals for production
const KEEP_ALIVE_INTERVAL = 30000; // 30 seconds
const LOG_POLL_INTERVAL = 250; // Reduced from 100ms to 250ms
const CONNECTION_TIMEOUT = 5 * 60 * 1000; // 5 minutes
const MAX_CONCURRENT_CONNECTIONS = 100; // Connection limit

// Global connection tracking with atomic operations
const activeConnections = new Map<string, number>(); // sessionId -> count
let totalConnections = 0;
const connectionMutex = new Map<string, Promise<void>>(); // sessionId -> operation promise

// Connection state tracking
enum ConnectionState {
  CONNECTING = 'connecting',
  CONNECTED = 'connected', 
  CLOSING = 'closing',
  CLOSED = 'closed'
}

interface ConnectionInfo {
  id: string;
  sessionId: string;
  state: ConnectionState;
  createdAt: number;
  lastActivity: number;
}

// Active connection instances
const connectionInstances = new Map<string, ConnectionInfo>(); // connectionId -> ConnectionInfo

/**
 * Atomic connection operations to prevent race conditions
 */
async function withConnectionLock<T>(sessionId: string, operation: () => Promise<T>): Promise<T> {
  // Wait for any existing operation on this session
  const existingOperation = connectionMutex.get(sessionId);
  if (existingOperation) {
    await existingOperation;
  }
  
  // Create a new operation
  let resolve: () => void;
  const operationPromise = new Promise<void>((res) => { resolve = res; });
  connectionMutex.set(sessionId, operationPromise);
  
  try {
    const result = await operation();
    return result;
  } finally {
    resolve!();
    // Clean up if this was the last operation
    if (connectionMutex.get(sessionId) === operationPromise) {
      connectionMutex.delete(sessionId);
    }
  }
}

/**
 * Safely increment connection count
 */
async function incrementConnection(sessionId: string, connectionId: string): Promise<void> {
  return withConnectionLock(sessionId, async () => {
    // Check limits before incrementing
    if (totalConnections >= MAX_CONCURRENT_CONNECTIONS) {
      throw new Error('Connection limit exceeded');
    }
    
    totalConnections++;
    const sessionConnections = activeConnections.get(sessionId) || 0;
    activeConnections.set(sessionId, sessionConnections + 1);
    
    // Track connection instance
    connectionInstances.set(connectionId, {
      id: connectionId,
      sessionId,
      state: ConnectionState.CONNECTING,
      createdAt: Date.now(),
      lastActivity: Date.now()
    });
    
    console.log(`[SSE] Connection ${connectionId} registered for session ${sessionId}. Total: ${totalConnections}, Session: ${sessionConnections + 1}`);
  });
}

/**
 * Safely decrement connection count with cleanup verification
 */
async function decrementConnection(connectionId: string): Promise<void> {
  const connectionInfo = connectionInstances.get(connectionId);
  if (!connectionInfo) {
    console.warn(`[SSE] Attempted to decrement unknown connection: ${connectionId}`);
    return;
  }
  
  const sessionId = connectionInfo.sessionId;
  
  return withConnectionLock(sessionId, async () => {
    // Update connection state
    connectionInfo.state = ConnectionState.CLOSING;
    
    // Decrement counts
    totalConnections = Math.max(0, totalConnections - 1);
    const sessionConnections = activeConnections.get(sessionId) || 1;
    
    if (sessionConnections <= 1) {
      activeConnections.delete(sessionId);
    } else {
      activeConnections.set(sessionId, sessionConnections - 1);
    }
    
    // Remove connection instance
    connectionInstances.delete(connectionId);
    
    console.log(`[SSE] Connection ${connectionId} cleaned up for session ${sessionId}. Remaining: ${totalConnections}`);
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params;
  const encoder = new TextEncoder();
  let keepAliveTimer: NodeJS.Timeout | null = null;
  let watcher: FSWatcher | null = null;
  let pollTimer: NodeJS.Timeout | null = null;
  let fileExistsInterval: NodeJS.Timeout | null = null;
  let lastLine = 0;
  let connectionId = `${sessionId}-${Date.now()}`;
  
  // Track connection using atomic operations
  try {
    await incrementConnection(sessionId, connectionId);
    // Track in shutdown coordinator for draining
    shutdownCoordinator.trackStream(connectionId);
    // Update health metrics
    healthCheck.updateConnectionMetrics(totalConnections, connectionInstances.size, 0);
  } catch (error) {
    return new Response('Connection limit exceeded', { status: 503 });
  }
  
  // Cleanup tracking to prevent multiple cleanup calls
  let cleanupCompleted = false;
  const cleanup = async (reason = 'unknown') => {
    if (cleanupCompleted) {
      return;
    }
    cleanupCompleted = true;
    
    console.log(`[SSE] Starting cleanup for connection ${connectionId} (reason: ${reason})`);
    
    // Update connection state
    const connectionInfo = connectionInstances.get(connectionId);
    if (connectionInfo) {
      connectionInfo.state = ConnectionState.CLOSING;
    }
    
    // Clean up timers first to prevent new operations
    if (keepAliveTimer) {
      clearInterval(keepAliveTimer);
      keepAliveTimer = null;
    }
    
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    
    if (fileExistsInterval) {
      clearInterval(fileExistsInterval);
      fileExistsInterval = null;
    }
    
    // Clean up file watcher
    if (watcher) {
      try {
        await watcher.close();
        watcher = null;
      } catch (error) {
        console.error(`[SSE] Error closing file watcher:`, error);
      }
    }
    
    // Clean up connection tracking - this must succeed to prevent memory leaks
    try {
      await decrementConnection(connectionId);
      // Untrack in shutdown coordinator
      shutdownCoordinator.untrackStream(connectionId);
      // Update health metrics
      healthCheck.updateConnectionMetrics(totalConnections, connectionInstances.size, 0);
    } catch (error) {
      console.error(`[SSE] Critical error in connection cleanup:`, error);
      // Force cleanup even if atomic operation fails
      const sessionConnections = activeConnections.get(sessionId) || 1;
      totalConnections = Math.max(0, totalConnections - 1);
      if (sessionConnections <= 1) {
        activeConnections.delete(sessionId);
      } else {
        activeConnections.set(sessionId, sessionConnections - 1);
      }
      connectionInstances.delete(connectionId);
      shutdownCoordinator.untrackStream(connectionId);
    }
    
    console.log(`[SSE] Cleanup completed for connection ${connectionId}`);
  };
  
  // Shutdown handlers need to be defined outside for cleanup access
  let handleShutdown: (() => void) | null = null;
  let handleStreamClose: ((streamId: string) => void) | null = null;
  
  const stream = new ReadableStream({
    async start(controller) {
      // Send initial connection message
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'connected', sessionId })}\n\n`));
      
      // Load initial session data
      try {
        const session = await SessionLogger.readSession(sessionId);
        
        // Send initial metadata
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: 'metadata',
          metadata: session.metadata
        })}\n\n`));
        
        // Send all existing logs
        if (session.logs.length > 0) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'logs',
            logs: session.logs
          })}\n\n`));
        }
        
        lastLine = session.logs.length;
      } catch (error: any) {
        // Session might not exist yet (could be ENOENT for file system errors or "Session not found" for our custom error)
        if (error.code !== 'ENOENT' && !error.message?.includes('not found')) {
          console.error('[SSE] Failed to load initial session:', error);
        } else {
          console.log(`[SSE] Session ${sessionId} not found yet, will wait for it to be created`);
        }
      }
      
      // Set up shutdown listener for graceful draining
      handleShutdown = () => {
        console.log(`[SSE] Received shutdown signal, draining connection ${connectionId}`);
        try {
          // Send shutdown notification to client
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
            type: 'shutdown', 
            message: 'Server is shutting down gracefully',
            reconnectDelay: 5000 
          })}\n\n`));
          
          // Schedule cleanup after giving client time to process
          setTimeout(() => {
            cleanup('shutdown').catch(err => 
              console.error(`[SSE] Error during shutdown cleanup:`, err)
            );
            try {
              controller.close();
            } catch {
              // Controller might already be closed
            }
          }, 1000);
        } catch (error) {
          console.error(`[SSE] Error sending shutdown notification:`, error);
          cleanup('shutdown-error');
        }
      };
      
      // Listen for stream-specific close event
      handleStreamClose = (streamId: string) => {
        if (streamId === connectionId && handleShutdown) {
          handleShutdown();
        }
      };
      
      shutdownCoordinator.on('drain-streams', handleShutdown);
      shutdownCoordinator.on('close-stream', handleStreamClose);
      
      // Send keep-alive messages to prevent timeout
      keepAliveTimer = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`:keepalive\n\n`));
        } catch (error) {
          // Connection closed, clean up
          if (keepAliveTimer) {
            clearInterval(keepAliveTimer);
            keepAliveTimer = null;
          }
        }
      }, KEEP_ALIVE_INTERVAL);
      
      // Set up file watcher for daily log files
      const sessionsRoot = path.join(os.homedir(), '.vibekit', 'sessions');
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const dailyLogFile = path.join(sessionsRoot, `${today}.jsonl`);
      
      // Function to check for new logs
      const checkForNewLogs = async (source = 'unknown') => {
        try {
          const result = await SessionLogger.tailSession(sessionId, lastLine);
          
          if (result.logs.length > 0) {
            console.log(`[SSE] Found ${result.logs.length} new logs for session ${sessionId} (source: ${source})`);
            console.log(`[SSE] Log types:`, result.logs.map(log => `${log.type}: ${log.data.substring(0, 50)}`));
            
            // Send new logs
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              type: 'logs',
              logs: result.logs,
              incremental: true
            })}\n\n`));
            
            lastLine = result.nextLine;
            
            // Check if session ended
            const endLog = result.logs.find(log => log.type === 'end');
            if (endLog) {
              console.log(`[SSE] Session ${sessionId} ended`);
              
              // Send updated metadata
              try {
                const session = await SessionLogger.readSession(sessionId);
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                  type: 'metadata',
                  metadata: session.metadata
                })}\n\n`));
                
                // Send completion event
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                  type: 'completed',
                  exitCode: session.metadata.exitCode
                })}\n\n`));
              } catch (error) {
                console.error('Failed to read final metadata:', error);
              }
              
              // Stop watching and polling since session is complete
              if (watcher) {
                watcher.close();
                watcher = null;
              }
              if (pollTimer) {
                clearInterval(pollTimer);
                pollTimer = null;
              }
            }
          }
        } catch (error) {
          console.error('Failed to tail session:', error);
        }
      };
      
      // Watch for changes to the log file
      try {
        // Initial check for logs
        await checkForNewLogs('initial');
        
        // Set up chokidar file watcher for daily log file
        watcher = chokidar.watch(dailyLogFile, {
          persistent: true,
          usePolling: true,    // Force polling for maximum reliability
          interval: 50,        // Poll every 50ms for faster updates
          binaryInterval: 50,  // Check binary files every 50ms
          awaitWriteFinish: {  // Wait for write operations to finish
            stabilityThreshold: 25,  // Wait 25ms for file to be stable
            pollInterval: 5          // Check every 5ms during write
          },
          ignoreInitial: true  // Don't trigger on initial scan
        });
        
        // Handle daily log file changes
        watcher.on('change', async (filePath: string) => {
          const filename = filePath.split('/').pop();
          console.log(`[SSE] File change detected: ${filename} for session ${sessionId}`);
          if (filename?.endsWith('.jsonl')) {
            await checkForNewLogs('chokidar');
          }
        });
        
        // Handle watcher errors
        watcher.on('error', (error: unknown) => {
          console.error('Chokidar watcher error:', error);
        });
        
        // Add hybrid polling as fallback - this ensures we never miss updates
        pollTimer = setInterval(async () => {
          await checkForNewLogs('polling');
        }, LOG_POLL_INTERVAL);
        
        console.log(`[SSE] Set up chokidar watcher and polling for session ${sessionId}`);
        
        // Mark connection as connected
        const connectionInfo = connectionInstances.get(connectionId);
        if (connectionInfo) {
          connectionInfo.state = ConnectionState.CONNECTED;
          connectionInfo.lastActivity = Date.now();
        }
      } catch (error: any) {
        // File might not exist yet - poll for it
        if (error.code === 'ENOENT') {
          console.log(`[SSE] Daily log file doesn't exist yet for session ${sessionId}, polling for creation...`);
          
          // Poll every 100ms until file exists
          fileExistsInterval = setInterval(async () => {
            try {
              await fs.access(dailyLogFile);
              if (fileExistsInterval) clearInterval(fileExistsInterval);
              fileExistsInterval = null;
              
              console.log(`[SSE] Daily log file created for session ${sessionId}, setting up watcher`);
              
              // File exists now, set up chokidar watcher
              await checkForNewLogs('file-created');
              
              watcher = chokidar.watch(dailyLogFile, {
                persistent: true,
                usePolling: true,
                interval: 50,
                binaryInterval: 50,
                awaitWriteFinish: {
                  stabilityThreshold: 25,
                  pollInterval: 5
                },
                ignoreInitial: true
              });
              
              watcher.on('change', async (filePath: string) => {
                const filename = filePath.split('/').pop();
                if (filename?.endsWith('.jsonl')) {
                  await checkForNewLogs('chokidar-delayed');
                }
              });
              
              // Also start hybrid polling
              pollTimer = setInterval(async () => {
                await checkForNewLogs('polling-delayed');
              }, LOG_POLL_INTERVAL);
              
            } catch {
              // Still doesn't exist, keep polling
            }
          }, 100);
        } else {
          console.error('Failed to set up file watcher:', error);
        }
      }
    },
    
    cancel() {
      // Remove shutdown listeners
      if (handleShutdown) {
        shutdownCoordinator.removeListener('drain-streams', handleShutdown);
      }
      if (handleStreamClose) {
        shutdownCoordinator.removeListener('close-stream', handleStreamClose);
      }
      
      // Use our comprehensive cleanup function
      cleanup('stream_cancel').catch(error => {
        console.error(`[SSE] Error during stream cleanup:`, error);
      });
    }
  });
  
  // Set connection timeout
  const timeoutId = setTimeout(() => {
    console.log(`[SSE] Connection timeout for session ${sessionId}`);
    cleanup('timeout').catch(error => {
      console.error(`[SSE] Error during timeout cleanup:`, error);
    });
    try {
      stream.cancel();
    } catch {
      // Stream might already be closed
    }
  }, CONNECTION_TIMEOUT);
  
  // Clear timeout when connection ends
  request.signal.addEventListener('abort', () => {
    clearTimeout(timeoutId);
    cleanup('abort').catch(error => {
      console.error(`[SSE] Error during abort cleanup:`, error);
    });
  });
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable Nginx buffering
    },
  });
}