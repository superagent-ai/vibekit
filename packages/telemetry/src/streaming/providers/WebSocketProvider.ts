import { Server as SocketIOServer } from 'socket.io';
import { createServer, Server as HTTPServer } from 'http';
import { StreamingProvider } from '../StreamingProvider.js';
import type { TelemetryEvent, StreamingConfig } from '../../core/types.js';

export class WebSocketProvider extends StreamingProvider {
  readonly name = 'websocket';
  
  private io?: SocketIOServer;
  private server?: HTTPServer;
  
  async initialize(config: StreamingConfig): Promise<void> {
    this.server = createServer();
    
    // Parse allowed origins from environment or config
    const allowedOrigins = process.env.TELEMETRY_ALLOWED_ORIGINS?.split(',') || 
                          config.cors?.origin || 
                          false; // Disable CORS by default
    
    this.io = new SocketIOServer(this.server, {
      cors: {
        origin: allowedOrigins,
        methods: ["GET", "POST"],
        credentials: true,
      },
      transports: ['websocket', 'polling'],
    });
    
    this.setupHandlers();
    
    const port = config.port || 3001;
    await new Promise<void>((resolve) => {
      this.server!.listen(port, () => {
        console.log(`WebSocket streaming server listening on port ${port}`);
        resolve();
      });
    });
  }
  
  private setupHandlers(): void {
    if (!this.io) return;
    
    this.io.on('connection', (socket) => {
      console.log('Client connected to telemetry stream');
      
      // Handle subscriptions
      socket.on('subscribe:session', (sessionId: string) => {
        socket.join(`session:${sessionId}`);
      });
      
      socket.on('subscribe:category', (category: string) => {
        socket.join(`category:${category}`);
      });
      
      socket.on('unsubscribe:session', (sessionId: string) => {
        socket.leave(`session:${sessionId}`);
      });
      
      socket.on('unsubscribe:category', (category: string) => {
        socket.leave(`category:${category}`);
      });
      
      socket.on('disconnect', () => {
        console.log('Client disconnected from telemetry stream');
      });
    });
  }
  
  async stream(event: TelemetryEvent): Promise<void> {
    if (!this.io) return;
    
    // Broadcast to all connected clients
    this.io.emit('telemetry:event', event);
    
    // Broadcast to session-specific room
    this.io.to(`session:${event.sessionId}`).emit('session:event', event);
    
    // Broadcast to category-specific room
    this.io.to(`category:${event.category}`).emit('category:event', event);
  }
  
  async broadcast(channel: string, data: any): Promise<void> {
    if (!this.io) return;
    this.io.emit(channel, data);
  }
  
  subscribe(channel: string, handler: (data: any) => void): void {
    // This would be implemented for server-side subscriptions
    // For WebSocket, subscriptions are handled by clients
  }
  
  unsubscribe(channel: string, handler: (data: any) => void): void {
    // This would be implemented for server-side subscriptions
    // For WebSocket, subscriptions are handled by clients
  }
  
  async shutdown(): Promise<void> {
    if (this.io) {
      this.io.close();
    }
    if (this.server) {
      this.server.close();
    }
  }
}