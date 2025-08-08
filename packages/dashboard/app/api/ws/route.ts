import { NextRequest } from 'next/server';
import chokidar from 'chokidar';
import path from 'path';
import os from 'os';

const VIBEKIT_DIR = path.join(os.homedir(), '.vibekit');
const PROJECTS_FILE = path.join(VIBEKIT_DIR, 'projects.json');
const CURRENT_PROJECT_FILE = path.join(VIBEKIT_DIR, 'current-project.json');

// Keep-alive interval to prevent connection timeout
const KEEP_ALIVE_INTERVAL = 30000; // 30 seconds
const MAX_RETRY_ATTEMPTS = 3;

export async function GET(request: NextRequest) {
  // Return Server-Sent Events instead of WebSocket for simpler Next.js integration
  const encoder = new TextEncoder();
  let keepAliveTimer: NodeJS.Timeout | null = null;
  let watcher: any = null;
  
  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection message
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'connected' })}\n\n`));
      
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
      
      // Set up file watcher with production-ready configuration
      watcher = chokidar.watch([PROJECTS_FILE, CURRENT_PROJECT_FILE], {
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: {
          stabilityThreshold: 100,
          pollInterval: 100
        },
        // Production optimizations
        ignorePermissionErrors: true,
        depth: 0,
        atomic: true // Handle atomic writes
      });
      
      // Handle file changes
      const handleChange = (filePath: string) => {
        const fileName = path.basename(filePath);
        const eventType = fileName === 'projects.json' ? 'projects-updated' : 'current-project-updated';
        
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
            type: eventType,
            timestamp: new Date().toISOString()
          })}\n\n`));
        } catch (error) {
          // Stream might be closed
          console.error('Error sending update:', error);
          // Clean up if stream is closed
          if (watcher) {
            watcher.close();
            watcher = null;
          }
        }
      };
      
      watcher.on('change', handleChange);
      watcher.on('add', handleChange);
      watcher.on('unlink', (filePath: string) => {
        const fileName = path.basename(filePath);
        const eventType = fileName === 'current-project.json' ? 'current-project-cleared' : 'projects-cleared';
        
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
            type: eventType,
            timestamp: new Date().toISOString()
          })}\n\n`));
        } catch (error) {
          console.error('Error sending update:', error);
        }
      });
      
      // Handle watcher errors gracefully
      watcher.on('error', (error: Error) => {
        console.error('File watcher error:', error);
        // Send error event to client
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
            type: 'error',
            message: 'File watching error occurred',
            timestamp: new Date().toISOString()
          })}\n\n`));
        } catch (e) {
          // Stream might be closed
        }
      });
      
      // Clean up on close
      request.signal.addEventListener('abort', () => {
        if (keepAliveTimer) {
          clearInterval(keepAliveTimer);
          keepAliveTimer = null;
        }
        if (watcher) {
          watcher.close();
          watcher = null;
        }
        controller.close();
      });
    },
    cancel() {
      // Clean up when stream is cancelled
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
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable Nginx buffering
    },
  });
}