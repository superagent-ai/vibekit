import { NextRequest } from 'next/server';
import { SessionLogger } from '@/lib/session-logger';
import path from 'path';
import os from 'os';
import chokidar, { FSWatcher } from 'chokidar';
import { promises as fs } from 'fs';

// Keep-alive interval to prevent connection timeout
const KEEP_ALIVE_INTERVAL = 30000; // 30 seconds
// Polling interval for hybrid approach
const LOG_POLL_INTERVAL = 100; // 100ms for faster real-time updates

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params;
  const encoder = new TextEncoder();
  let keepAliveTimer: NodeJS.Timeout | null = null;
  let watcher: FSWatcher | null = null;
  let pollTimer: NodeJS.Timeout | null = null;
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
        
        // Set up chokidar file watcher with optimized real-time settings
        watcher = chokidar.watch([logFile, metadataFile], {
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
        
        // Handle log file changes
        watcher.on('change', async (filePath: string) => {
          const filename = filePath.split('/').pop();
          console.log(`[SSE] File change detected: ${filename} for session ${sessionId}`);
          if (filename === 'execution.log') {
            await checkForNewLogs('chokidar');
          } else if (filename === 'metadata.json') {
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
        watcher.on('error', (error: unknown) => {
          console.error('Chokidar watcher error:', error);
        });
        
        // Add hybrid polling as fallback - this ensures we never miss updates
        pollTimer = setInterval(async () => {
          await checkForNewLogs('polling');
        }, LOG_POLL_INTERVAL);
        
        console.log(`[SSE] Set up chokidar watcher and polling for session ${sessionId}`);
      } catch (error: any) {
        // File might not exist yet - poll for it
        if (error.code === 'ENOENT') {
          console.log(`[SSE] Log file doesn't exist yet for session ${sessionId}, polling for creation...`);
          
          // Poll every 100ms until file exists
          const fileExistsInterval = setInterval(async () => {
            try {
              await fs.access(logFile);
              clearInterval(fileExistsInterval);
              
              console.log(`[SSE] Log file created for session ${sessionId}, setting up watcher`);
              
              // File exists now, set up chokidar watcher
              await checkForNewLogs('file-created');
              
              watcher = chokidar.watch([logFile, metadataFile], {
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
                if (filename === 'execution.log') {
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
          
          // Clean up interval on close
          request.signal.addEventListener('abort', () => {
            clearInterval(fileExistsInterval);
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
      
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      
      console.log(`[SSE] Cleaned up resources for session ${sessionId}`);
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