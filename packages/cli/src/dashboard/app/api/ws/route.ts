import { NextRequest } from 'next/server';
import chokidar from 'chokidar';
import path from 'path';
import os from 'os';

const VIBEKIT_DIR = path.join(os.homedir(), '.vibekit');
const PROJECTS_FILE = path.join(VIBEKIT_DIR, 'projects.json');
const CURRENT_PROJECT_FILE = path.join(VIBEKIT_DIR, 'current-project.json');

export async function GET(request: NextRequest) {
  // Return Server-Sent Events instead of WebSocket for simpler Next.js integration
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection message
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'connected' })}\n\n`));
      
      // Set up file watcher
      const watcher = chokidar.watch([PROJECTS_FILE, CURRENT_PROJECT_FILE], {
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: {
          stabilityThreshold: 100,
          pollInterval: 100
        }
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
        }
      };
      
      watcher.on('change', handleChange);
      watcher.on('add', handleChange);
      watcher.on('unlink', (filePath) => {
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
      
      // Clean up on close
      request.signal.addEventListener('abort', () => {
        watcher.close();
        controller.close();
      });
    }
  });
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}