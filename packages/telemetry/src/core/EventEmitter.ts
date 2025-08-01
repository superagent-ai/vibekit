import { EventEmitter as NodeEventEmitter } from 'events';

export interface TelemetryEventMap {
  'initialized': () => void;
  'event:tracked': (event: any) => void;
  'event:error': (error: Error | any) => void;
  'storage:error': (error: Error) => void;
  'storage:critical': (data: any) => void;
  'storage:degraded': (data: any) => void;
  'streaming:error': (data: any) => void;
  'analytics:error': (data: any) => void;
  'analytics:anomaly': (anomaly: any) => void;
  'analytics:alert': (alert: any) => void;
  'analytics:realtime': (metrics: any) => void;
  'metrics:snapshot': (snapshot: any) => void;
  'security:warning': (data: any) => void;
  'plugin:warning': (data: any) => void;
  'shutdown': () => void;
}

export class TelemetryEventEmitter {
  private emitter = new NodeEventEmitter();

  on<K extends keyof TelemetryEventMap>(event: K, listener: TelemetryEventMap[K]): this {
    this.emitter.on(event, listener);
    return this;
  }

  once<K extends keyof TelemetryEventMap>(event: K, listener: TelemetryEventMap[K]): this {
    this.emitter.once(event, listener);
    return this;
  }

  off<K extends keyof TelemetryEventMap>(event: K, listener: TelemetryEventMap[K]): this {
    this.emitter.off(event, listener);
    return this;
  }

  emit<K extends keyof TelemetryEventMap>(event: K, ...args: Parameters<TelemetryEventMap[K]>): boolean {
    return this.emitter.emit(event, ...args);
  }

  removeAllListeners(event?: keyof TelemetryEventMap): this {
    this.emitter.removeAllListeners(event);
    return this;
  }

  listenerCount(event: keyof TelemetryEventMap): number {
    return this.emitter.listenerCount(event);
  }
}