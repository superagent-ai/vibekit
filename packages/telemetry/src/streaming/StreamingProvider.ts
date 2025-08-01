import type { TelemetryEvent, StreamingConfig } from '../core/types.js';

export abstract class StreamingProvider {
  abstract readonly name: string;
  
  abstract initialize(config: StreamingConfig): Promise<void>;
  abstract stream(event: TelemetryEvent): Promise<void>;
  abstract broadcast(channel: string, data: any): Promise<void>;
  abstract subscribe(channel: string, handler: (data: any) => void): void;
  abstract unsubscribe(channel: string, handler: (data: any) => void): void;
  abstract shutdown(): Promise<void>;
}