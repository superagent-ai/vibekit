import { StreamingProvider } from '../StreamingProvider.js';
import type { TelemetryEvent, StreamingConfig } from '../../core/types.js';
import { createServer, IncomingMessage, ServerResponse } from 'http';

interface SSEClient {
  id: string;
  response: ServerResponse;
  subscriptions: Set<string>;
}

export class SSEProvider extends StreamingProvider {
  readonly name = 'sse';
  
  private server?: any;
  private clients = new Map<string, SSEClient>();
  private handlers = new Map<string, Set<(data: any) => void>>();
  
  async initialize(config: StreamingConfig): Promise<void> {
    this.server = createServer((req: IncomingMessage, res: ServerResponse) => {
      this.handleRequest(req, res);
    });
    
    const port = config.port || 3002;
    await new Promise<void>((resolve) => {
      this.server.listen(port, () => {
        console.log(`SSE streaming server listening on port ${port}`);
        resolve();
      });
    });
  }
  
  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    
    if (url.pathname === '/events') {
      this.handleSSEConnection(req, res);
    } else if (url.pathname === '/subscribe') {
      this.handleSubscription(req, res, url);
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  }
  
  private handleSSEConnection(req: IncomingMessage, res: ServerResponse): void {
    const clientId = `client-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    
    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });
    
    // Send initial connection event
    this.sendSSE(res, 'connected', { clientId });
    
    // Store client
    const client: SSEClient = {
      id: clientId,
      response: res,
      subscriptions: new Set()
    };
    this.clients.set(clientId, client);
    
    // Handle client disconnect
    req.on('close', () => {
      this.clients.delete(clientId);
      console.log(`SSE client ${clientId} disconnected`);
    });
    
    console.log(`SSE client ${clientId} connected`);
  }
  
  private handleSubscription(req: IncomingMessage, res: ServerResponse, url: URL): void {
    const clientId = url.searchParams.get('clientId');
    const channel = url.searchParams.get('channel');
    const action = url.searchParams.get('action'); // 'subscribe' or 'unsubscribe'
    
    if (!clientId || !channel || !action) {
      res.writeHead(400);
      res.end('Missing parameters');
      return;
    }
    
    const client = this.clients.get(clientId);
    if (!client) {
      res.writeHead(404);
      res.end('Client not found');
      return;
    }
    
    if (action === 'subscribe') {
      client.subscriptions.add(channel);
    } else if (action === 'unsubscribe') {
      client.subscriptions.delete(channel);
    }
    
    res.writeHead(200);
    res.end('OK');
  }
  
  private sendSSE(res: ServerResponse, event: string, data: any): void {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }
  
  async stream(event: TelemetryEvent): Promise<void> {
    // Broadcast to all clients
    for (const client of this.clients.values()) {
      this.sendSSE(client.response, 'telemetry:event', event);
      
      // Send to session-specific subscribers
      if (client.subscriptions.has(`session:${event.sessionId}`)) {
        this.sendSSE(client.response, 'session:event', event);
      }
      
      // Send to category-specific subscribers
      if (client.subscriptions.has(`category:${event.category}`)) {
        this.sendSSE(client.response, 'category:event', event);
      }
    }
  }
  
  async broadcast(channel: string, data: any): Promise<void> {
    for (const client of this.clients.values()) {
      if (client.subscriptions.has(channel) || client.subscriptions.size === 0) {
        this.sendSSE(client.response, channel, data);
      }
    }
  }
  
  subscribe(channel: string, handler: (data: any) => void): void {
    if (!this.handlers.has(channel)) {
      this.handlers.set(channel, new Set());
    }
    this.handlers.get(channel)!.add(handler);
  }
  
  unsubscribe(channel: string, handler: (data: any) => void): void {
    const channelHandlers = this.handlers.get(channel);
    if (channelHandlers) {
      channelHandlers.delete(handler);
      if (channelHandlers.size === 0) {
        this.handlers.delete(channel);
      }
    }
  }
  
  async shutdown(): Promise<void> {
    // Close all client connections
    for (const client of this.clients.values()) {
      try {
        client.response.end();
      } catch (error) {
        console.warn(`Error closing SSE client ${client.id}:`, error);
      }
    }
    this.clients.clear();
    
    if (this.server) {
      this.server.close();
    }
  }
}