import { StorageProvider } from '../StorageProvider.js';
import type { TelemetryEvent, QueryFilter, StorageStats } from '../../core/types.js';
import { createLogger } from '../../utils/logger.js';

export interface OTLPConfig {
  endpoint: string;
  headers?: Record<string, string>;
  batchSize?: number;
  timeout?: number;
}

export class OTLPProvider extends StorageProvider {
  readonly name = 'otlp';
  readonly supportsQuery = false;
  readonly supportsBatch = true;
  
  private config: OTLPConfig;
  private batch: TelemetryEvent[] = [];
  private flushTimeout?: NodeJS.Timeout;
  private logger = createLogger('OTLPProvider');
  
  constructor(config: OTLPConfig) {
    super();
    this.config = {
      batchSize: 100,
      timeout: 5000,
      ...config,
    };
    
    if (!this.config.endpoint) {
      throw new Error('OTLP endpoint is required');
    }
  }
  
  async initialize(): Promise<void> {
    // Test connection to OTLP endpoint
    try {
      const response = await fetch(this.config.endpoint, {
        method: 'HEAD',
        headers: this.config.headers,
      });
      
      if (!response.ok && response.status !== 405) {
        throw new Error(`OTLP endpoint not reachable: ${response.status}`);
      }
    } catch (error) {
      this.logger.warn('OTLP endpoint test failed:', error);
      // Don't fail initialization, just warn
    }
  }
  
  async store(event: TelemetryEvent): Promise<void> {
    this.batch.push(event);
    
    if (this.batch.length >= this.config.batchSize!) {
      await this.flush();
    } else {
      this.scheduleFlush();
    }
  }
  
  async storeBatch(events: TelemetryEvent[]): Promise<void> {
    this.batch.push(...events);
    
    while (this.batch.length >= this.config.batchSize!) {
      const batchToSend = this.batch.splice(0, this.config.batchSize!);
      await this.sendBatch(batchToSend);
    }
    
    if (this.batch.length > 0) {
      this.scheduleFlush();
    }
  }
  
  private scheduleFlush(): void {
    if (this.flushTimeout) return;
    
    this.flushTimeout = setTimeout(() => {
      this.flush().catch(error => this.logger.error('Failed to flush OTLP batch:', error));
    }, this.config.timeout!);
  }
  
  async flush(): Promise<void> {
    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
      this.flushTimeout = undefined;
    }
    
    if (this.batch.length === 0) return;
    
    const batchToSend = this.batch.splice(0);
    await this.sendBatch(batchToSend);
  }
  
  private async sendBatch(events: TelemetryEvent[]): Promise<void> {
    if (events.length === 0) return;
    
    const otlpData = this.convertToOTLP(events);
    
    try {
      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.config.headers,
        },
        body: JSON.stringify(otlpData),
      });
      
      if (!response.ok) {
        throw new Error(`OTLP export failed: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      // Re-add events to batch for retry
      this.batch.unshift(...events);
      throw error;
    }
  }
  
  private convertToOTLP(events: TelemetryEvent[]): any {
    // Convert telemetry events to OTLP format
    // This is a simplified conversion - in practice you'd want more sophisticated mapping
    
    const resourceSpans = events.map(event => ({
      resource: {
        attributes: [
          {
            key: 'service.name',
            value: { stringValue: event.context?.version || 'vibekit-telemetry' }
          },
          {
            key: 'service.version',
            value: { stringValue: event.context?.version || '1.0.0' }
          }
        ]
      },
      scopeSpans: [{
        scope: {
          name: 'vibekit-telemetry',
          version: '1.0.0'
        },
        spans: [{
          traceId: Buffer.from(event.sessionId.replace(/-/g, ''), 'hex').toString('base64'),
          spanId: Buffer.from(event.id!.replace(/-/g, '').substring(0, 16), 'hex').toString('base64'),
          name: `${event.category}.${event.action}`,
          kind: 1, // SPAN_KIND_INTERNAL
          startTimeUnixNano: event.timestamp * 1000000,
          endTimeUnixNano: event.duration 
            ? (event.timestamp + event.duration) * 1000000
            : event.timestamp * 1000000,
          attributes: [
            {
              key: 'event.type',
              value: { stringValue: event.eventType }
            },
            {
              key: 'event.category',
              value: { stringValue: event.category }
            },
            {
              key: 'event.action',
              value: { stringValue: event.action }
            },
            ...(event.label ? [{
              key: 'event.label',
              value: { stringValue: event.label }
            }] : []),
            ...(event.value !== undefined ? [{
              key: 'event.value',
              value: { doubleValue: event.value }
            }] : []),
            ...(event.metadata ? Object.entries(event.metadata).map(([key, value]) => ({
              key: `metadata.${key}`,
              value: { stringValue: String(value) }
            })) : [])
          ],
          status: {
            code: event.eventType === 'error' ? 2 : 1 // ERROR or OK
          }
        }]
      }]
    }));
    
    return {
      resourceSpans
    };
  }
  
  async getStats(): Promise<StorageStats> {
    return {
      totalEvents: 0, // We don't track this for OTLP
      diskUsage: 0,
      lastEvent: 0,
    };
  }
  
  async shutdown(): Promise<void> {
    await this.flush();
  }
}