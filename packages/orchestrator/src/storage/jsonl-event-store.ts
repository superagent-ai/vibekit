import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as readline from 'readline';
import * as path from 'path';
import { OrchestrationEvent, ReadOptions } from '../types';

export class JSONLEventStore {
  private streams: Map<string, fsSync.WriteStream> = new Map();
  private basePath = '.vibekit/orchestrator/events';

  private getStreamPath(streamName: string): string {
    return path.join(this.basePath, `${streamName}.jsonl`);
  }

  async appendEvent(streamName: string, event: OrchestrationEvent): Promise<void> {
    const filePath = this.getStreamPath(streamName);
    
    // Ensure directory exists
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    
    // Get or create write stream
    if (!this.streams.has(streamName)) {
      this.streams.set(streamName, fsSync.createWriteStream(filePath, { flags: 'a' }));
    }
    
    const stream = this.streams.get(streamName)!;
    const eventLine = JSON.stringify({
      ...event,
      timestamp: event.timestamp || new Date().toISOString(),
      sequence: await this.getNextSequence(streamName)
    }) + '\n';
    
    // Append to JSONL file
    await new Promise<void>((resolve, reject) => {
      stream.write(eventLine, (err) => err ? reject(err) : resolve());
    });
  }

  async readEvents(streamName: string, options?: ReadOptions): Promise<OrchestrationEvent[]> {
    const filePath = this.getStreamPath(streamName);
    
    try {
      await fs.access(filePath);
    } catch {
      return []; // File doesn't exist
    }
    
    const events: OrchestrationEvent[] = [];
    const stream = fsSync.createReadStream(filePath, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: stream });
    
    for await (const line of rl) {
      if (line.trim()) {
        try {
          const event = JSON.parse(line) as OrchestrationEvent;
          
          // Apply filters if provided
          if (options?.filter && !options.filter(event)) continue;
          if (options?.since && new Date(event.timestamp) < options.since) continue;
          if (options?.until && new Date(event.timestamp) > options.until) continue;
          
          events.push(event);
          
          if (options?.limit && events.length >= options.limit) break;
        } catch (error) {
          console.warn('Failed to parse event line:', line, error);
        }
      }
    }
    
    return events;
  }

  // Efficient tail reading for real-time monitoring
  async tail(streamName: string, callback: (event: OrchestrationEvent) => void): Promise<() => void> {
    const filePath = this.getStreamPath(streamName);
    
    // Ensure file exists
    try {
      await fs.access(filePath);
    } catch {
      await fs.writeFile(filePath, '');
    }
    
    const watcher = fsSync.watch(filePath);
    let position = (await fs.stat(filePath)).size;
    
    watcher.on('change', async () => {
      try {
        const currentSize = (await fs.stat(filePath)).size;
        if (currentSize <= position) {
          // File was truncated or no new content
          return;
        }

        const stream = fsSync.createReadStream(filePath, { 
          start: position,
          encoding: 'utf8' 
        });
        
        const rl = readline.createInterface({ input: stream });
        
        for await (const line of rl) {
          if (line.trim()) {
            try {
              const event = JSON.parse(line) as OrchestrationEvent;
              callback(event);
            } catch (error) {
              console.warn('Failed to parse event line:', line, error);
            }
          }
        }
        
        position = currentSize;
      } catch (error) {
        console.error('Error in file watcher:', error);
      }
    });
    
    return () => watcher.close();
  }

  private async getNextSequence(streamName: string): Promise<number> {
    // Simple sequence counter - could be enhanced with actual counting
    return Date.now();
  }

  async close(): Promise<void> {
    for (const [name, stream] of this.streams) {
      await new Promise<void>((resolve) => {
        stream.end(() => resolve());
      });
    }
    this.streams.clear();
  }

  // Utility methods for file management
  async rotateLogFile(streamName: string, maxSizeBytes: number = 100 * 1024 * 1024): Promise<void> {
    const filePath = this.getStreamPath(streamName);
    
    try {
      const stats = await fs.stat(filePath);
      
      if (stats.size > maxSizeBytes) {
        // Close existing stream
        const existingStream = this.streams.get(streamName);
        if (existingStream) {
          await new Promise<void>((resolve) => {
            existingStream.end(() => resolve());
          });
          this.streams.delete(streamName);
        }
        
        // Rotate file
        const timestamp = new Date().toISOString().replace(/:/g, '-');
        const rotatedPath = `${filePath}.${timestamp}`;
        await fs.rename(filePath, rotatedPath);
        
        console.log(`Rotated log file ${streamName} to ${rotatedPath}`);
      }
    } catch (error) {
      if ((error as any).code !== 'ENOENT') {
        console.error('Error rotating log file:', error);
      }
    }
  }

  async getStreamStats(streamName: string): Promise<{ size: number; eventCount: number; lastModified: Date }> {
    const filePath = this.getStreamPath(streamName);
    
    try {
      const stats = await fs.stat(filePath);
      
      // Count lines (approximate event count)
      const content = await fs.readFile(filePath, 'utf8');
      const eventCount = content.split('\n').filter(line => line.trim()).length;
      
      return {
        size: stats.size,
        eventCount,
        lastModified: stats.mtime
      };
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        return { size: 0, eventCount: 0, lastModified: new Date(0) };
      }
      throw error;
    }
  }
}