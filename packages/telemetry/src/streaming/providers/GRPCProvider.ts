import { StreamingProvider } from '../StreamingProvider.js';
import type { TelemetryEvent, StreamingConfig } from '../../core/types.js';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { EventEmitter } from 'events';

interface GRPCConfig extends StreamingConfig {
  host?: string;
  port?: number;
  credentials?: grpc.ServerCredentials;
  maxConcurrentStreams?: number;
  keepaliveTime?: number;
  keepaliveTimeout?: number;
}

interface StreamSession {
  id: string;
  call: grpc.ServerDuplexStream<any, any>;
  subscriptions: Set<string>;
  lastActivity: number;
}

export class GRPCProvider extends StreamingProvider {
  readonly name = 'grpc';
  
  private server?: grpc.Server;
  private sessions = new Map<string, StreamSession>();
  private handlers = new Map<string, Set<(data: any) => void>>();
  private eventEmitter = new EventEmitter();
  private sessionCleanupInterval?: NodeJS.Timeout;
  
  async initialize(config: GRPCConfig): Promise<void> {
    const protoPath = this.createProtoDefinition();
    const packageDefinition = protoLoader.loadSync(protoPath, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });
    
    const telemetryProto = grpc.loadPackageDefinition(packageDefinition) as any;
    
    this.server = new grpc.Server({
      'grpc.keepalive_time_ms': config.keepaliveTime || 30000,
      'grpc.keepalive_timeout_ms': config.keepaliveTimeout || 5000,
      'grpc.max_concurrent_streams': config.maxConcurrentStreams || 100,
    });
    
    // Add streaming service
    this.server.addService(telemetryProto.TelemetryService.service, {
      StreamEvents: this.handleStreamEvents.bind(this),
      Subscribe: this.handleSubscribe.bind(this),
      Unsubscribe: this.handleUnsubscribe.bind(this),
      Query: this.handleQuery.bind(this),
    });
    
    const host = config.host || '0.0.0.0';
    const port = config.port || 50051;
    const credentials = config.credentials || grpc.ServerCredentials.createInsecure();
    
    await new Promise<void>((resolve, reject) => {
      this.server!.bindAsync(`${host}:${port}`, credentials, (error, port) => {
        if (error) {
          reject(error);
        } else {
          this.server!.start();
          console.log(`gRPC streaming server listening on ${host}:${port}`);
          resolve();
        }
      });
    });
    
    // Start session cleanup
    this.startSessionCleanup();
  }
  
  private createProtoDefinition(): string {
    // Create a temporary proto file definition
    const protoContent = `
syntax = "proto3";

package telemetry;

service TelemetryService {
  rpc StreamEvents(stream EventRequest) returns (stream EventResponse);
  rpc Subscribe(SubscribeRequest) returns (SubscribeResponse);
  rpc Unsubscribe(UnsubscribeRequest) returns (UnsubscribeResponse);
  rpc Query(QueryRequest) returns (QueryResponse);
}

message TelemetryEvent {
  string id = 1;
  string sessionId = 2;
  string eventType = 3;
  string category = 4;
  string action = 5;
  string label = 6;
  double value = 7;
  int64 timestamp = 8;
  int64 duration = 9;
  string metadata = 10; // JSON string
  string context = 11;  // JSON string
}

message EventRequest {
  oneof request_type {
    TelemetryEvent event = 1;
    string ping = 2;
  }
}

message EventResponse {
  oneof response_type {
    TelemetryEvent event = 1;
    string pong = 2;
    string error = 3;
  }
}

message SubscribeRequest {
  string sessionId = 1;
  string channel = 2;
  repeated string filters = 3;
}

message SubscribeResponse {
  bool success = 1;
  string message = 2;
}

message UnsubscribeRequest {
  string sessionId = 1;
  string channel = 2;
}

message UnsubscribeResponse {
  bool success = 1;
  string message = 2;
}

message QueryRequest {
  string sessionId = 1;
  string category = 2;
  string action = 3;
  string eventType = 4;
  int64 startTime = 5;
  int64 endTime = 6;
  int32 limit = 7;
  int32 offset = 8;
}

message QueryResponse {
  repeated TelemetryEvent events = 1;
  int32 total = 2;
  bool hasMore = 3;
}
    `;
    
    // In a real implementation, you'd write this to a temporary file
    // For now, we'll use a mock path - this would need proper file handling
    return '/tmp/telemetry.proto';
  }
  
  private handleStreamEvents(call: grpc.ServerDuplexStream<any, any>): void {
    const sessionId = `grpc-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    
    const session: StreamSession = {
      id: sessionId,
      call,
      subscriptions: new Set(),
      lastActivity: Date.now(),
    };
    
    this.sessions.set(sessionId, session);
    console.log(`gRPC client ${sessionId} connected for streaming`);
    
    call.on('data', (request: any) => {
      session.lastActivity = Date.now();
      
      if (request.event) {
        // Client sent an event
        this.handleClientEvent(request.event, session);
      } else if (request.ping) {
        // Handle ping for keepalive
        call.write({ pong: 'pong' });
      }
    });
    
    call.on('end', () => {
      this.sessions.delete(sessionId);
      console.log(`gRPC client ${sessionId} disconnected from streaming`);
    });
    
    call.on('error', (error) => {
      console.error(`gRPC streaming error for ${sessionId}:`, error);
      this.sessions.delete(sessionId);
    });
  }
  
  private handleSubscribe(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>): void {
    const request = call.request;
    const sessionId = request.sessionId;
    const channel = request.channel;
    
    const session = this.sessions.get(sessionId);
    if (!session) {
      callback(null, { success: false, message: 'Session not found' });
      return;
    }
    
    session.subscriptions.add(channel);
    callback(null, { success: true, message: `Subscribed to ${channel}` });
  }
  
  private handleUnsubscribe(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>): void {
    const request = call.request;
    const sessionId = request.sessionId;
    const channel = request.channel;
    
    const session = this.sessions.get(sessionId);
    if (!session) {
      callback(null, { success: false, message: 'Session not found' });
      return;
    }
    
    session.subscriptions.delete(channel);
    callback(null, { success: true, message: `Unsubscribed from ${channel}` });
  }
  
  private handleQuery(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>): void {
    // This would integrate with the telemetry service to perform queries
    // For now, return empty results
    callback(null, {
      events: [],
      total: 0,
      hasMore: false,
    });
  }
  
  private handleClientEvent(eventData: any, session: StreamSession): void {
    // Process event from client (if needed)
    console.log(`Received event from gRPC client ${session.id}:`, eventData);
  }
  
  private startSessionCleanup(): void {
    this.sessionCleanupInterval = setInterval(() => {
      const now = Date.now();
      const timeout = 5 * 60 * 1000; // 5 minutes
      
      for (const [sessionId, session] of this.sessions.entries()) {
        if (now - session.lastActivity > timeout) {
          try {
            session.call.end();
          } catch (error) {
            console.warn(`Error ending gRPC session ${sessionId}:`, error);
          }
          this.sessions.delete(sessionId);
          console.log(`Cleaned up inactive gRPC session ${sessionId}`);
        }
      }
    }, 60000); // Check every minute
  }
  
  async stream(event: TelemetryEvent): Promise<void> {
    const grpcEvent = this.convertToGRPCEvent(event);
    
    // Broadcast to all active sessions
    for (const session of this.sessions.values()) {
      try {
        // Check if session is subscribed to relevant channels
        const shouldSend = session.subscriptions.size === 0 || // No specific subscriptions = receive all
          session.subscriptions.has('all') ||
          session.subscriptions.has(`session:${event.sessionId}`) ||
          session.subscriptions.has(`category:${event.category}`) ||
          session.subscriptions.has(`type:${event.eventType}`);
        
        if (shouldSend) {
          session.call.write({ event: grpcEvent });
          session.lastActivity = Date.now();
        }
      } catch (error) {
        console.warn(`Failed to stream to gRPC session ${session.id}:`, error);
        // Remove failed session
        this.sessions.delete(session.id);
      }
    }
  }
  
  async broadcast(channel: string, data: any): Promise<void> {
    for (const session of this.sessions.values()) {
      try {
        if (session.subscriptions.has(channel) || session.subscriptions.size === 0) {
          session.call.write({ event: data });
          session.lastActivity = Date.now();
        }
      } catch (error) {
        console.warn(`Failed to broadcast to gRPC session ${session.id}:`, error);
        this.sessions.delete(session.id);
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
  
  private convertToGRPCEvent(event: TelemetryEvent): any {
    return {
      id: event.id,
      sessionId: event.sessionId,
      eventType: event.eventType,
      category: event.category,
      action: event.action,
      label: event.label || '',
      value: event.value || 0,
      timestamp: event.timestamp,
      duration: event.duration || 0,
      metadata: event.metadata ? JSON.stringify(event.metadata) : '{}',
      context: event.context ? JSON.stringify(event.context) : '{}',
    };
  }
  
  getActiveSessionsCount(): number {
    return this.sessions.size;
  }
  
  getSessionInfo(): Array<{ id: string; subscriptions: string[]; lastActivity: number }> {
    return Array.from(this.sessions.values()).map(session => ({
      id: session.id,
      subscriptions: Array.from(session.subscriptions),
      lastActivity: session.lastActivity,
    }));
  }
  
  async shutdown(): Promise<void> {
    if (this.sessionCleanupInterval) {
      clearInterval(this.sessionCleanupInterval);
    }
    
    // Close all active sessions
    for (const session of this.sessions.values()) {
      try {
        session.call.end();
      } catch (error) {
        console.warn(`Error closing gRPC session ${session.id}:`, error);
      }
    }
    this.sessions.clear();
    
    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server!.tryShutdown(() => {
          console.log('gRPC streaming server shut down');
          resolve();
        });
      });
    }
  }
}