// Streaming utilities for AI chat

export function createChatStream(stream: ReadableStream) {
  return stream.pipeThrough(new TextDecoderStream());
}

export function parseStreamChunk(chunk: string) {
  try {
    const lines = chunk.split('\n').filter(Boolean);
    const events = [];
    
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') {
          events.push({ type: 'done' });
        } else {
          try {
            const parsed = JSON.parse(data);
            events.push(parsed);
          } catch {
            // Invalid JSON, skip
          }
        }
      }
    }
    
    return events;
  } catch {
    return [];
  }
}

export class StreamProcessor {
  private buffer = '';
  
  process(chunk: string) {
    this.buffer += chunk;
    const events = [];
    
    // Process complete lines
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || ''; // Keep incomplete line in buffer
    
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim();
        if (data) {
          events.push(data);
        }
      }
    }
    
    return events;
  }
  
  flush() {
    const remaining = this.buffer;
    this.buffer = '';
    return remaining ? [remaining] : [];
  }
}