import { NextRequest } from 'next/server';
import { SessionLogger } from '@/lib/session-logger';
import path from 'path';
import os from 'os';
import { watch } from 'fs';
import { promises as fs } from 'fs';

// Keep-alive interval to prevent connection timeout
const KEEP_ALIVE_INTERVAL = 30000; // 30 seconds

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params;
  const encoder = new TextEncoder();
  let keepAliveTimer: NodeJS.Timeout | null = null;
  let watcher: any = null;
  let lastLine = 0;
  
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
        // Session might not exist yet
        if (error.code !== 'ENOENT') {
          console.error('Failed to load initial session:', error);
        }
      }
      
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
      
      // Set up file watcher for the session log file
      const sessionsRoot = path.join(os.homedir(), '.vibekit', 'sessions');
      const sessionDir = path.join(sessionsRoot, sessionId);
      const logFile = path.join(sessionDir, 'execution.log');
      const metadataFile = path.join(sessionDir, 'metadata.json');
      
      // Function to check for new logs
      const checkForNewLogs = async () => {
        try {
          const result = await SessionLogger.tailSession(sessionId, lastLine);
          
          if (result.logs.length > 0) {
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
              
              // Stop watching since session is complete
              if (watcher) {
                watcher.close();
                watcher = null;
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
        await checkForNewLogs();
        
        // Set up file watcher
        watcher = watch(logFile, async (eventType) => {
          if (eventType === 'change') {
            await checkForNewLogs();
          }
        });
        
        // Also watch metadata file for status updates
        const metadataWatcher = watch(metadataFile, async (eventType) => {
          if (eventType === 'change') {
            try {
              const content = await fs.readFile(metadataFile, 'utf8');
              const metadata = JSON.parse(content);
              
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'metadata',
                metadata
              })}\n\n`));
            } catch (error) {
              console.error('Failed to read metadata update:', error);
            }
          }
        });
        
        // Handle watcher errors
        watcher.on('error', (error: Error) => {
          console.error('Log file watcher error:', error);
        });
        
        metadataWatcher.on('error', (error: Error) => {
          console.error('Metadata watcher error:', error);
        });
      } catch (error: any) {
        // File might not exist yet - poll for it
        if (error.code === 'ENOENT') {
          // Poll every 500ms until file exists
          const pollInterval = setInterval(async () => {
            try {
              await fs.access(logFile);
              clearInterval(pollInterval);
              
              // File exists now, set up watcher
              await checkForNewLogs();
              
              watcher = watch(logFile, async (eventType) => {
                if (eventType === 'change') {
                  await checkForNewLogs();
                }
              });
            } catch {
              // Still doesn't exist, keep polling
            }
          }, 500);
          
          // Clean up interval on close
          request.signal.addEventListener('abort', () => {
            clearInterval(pollInterval);
          });
        } else {
          console.error('Failed to set up file watcher:', error);
        }
      }
    },
    
    cancel() {
      // Clean up resources
      if (keepAliveTimer) {
        clearInterval(keepAliveTimer);
        keepAliveTimer = null;
      }
      
      if (watcher) {
        watcher.close();
        watcher = null;
      }
    }
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