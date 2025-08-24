import { createLogger } from '@vibe-kit/logger';
import { TaskChangeEvent } from '../types';

// Create logger for this module
const log = createLogger('taskmaster-sse');

export class SSEManager {
  private clients: Set<WritableStreamDefaultWriter> = new Set();

  addClient(writer: WritableStreamDefaultWriter): void {
    this.clients.add(writer);
  }

  removeClient(writer: WritableStreamDefaultWriter): void {
    this.clients.delete(writer);
  }

  broadcast(event: TaskChangeEvent): void {
    const data = `data: ${JSON.stringify(event)}\n\n`;
    const encoder = new TextEncoder();
    const encoded = encoder.encode(data);
    
    for (const client of this.clients) {
      try {
        client.write(encoded);
      } catch (error) {
        log.error('Failed to send SSE event', error);
        this.removeClient(client);
      }
    }
  }

  getClientCount(): number {
    return this.clients.size;
  }
}