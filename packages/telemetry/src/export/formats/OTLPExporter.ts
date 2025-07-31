import type { TelemetryEvent, ExportResult } from '../../core/types.js';

interface OTLPResource {
  attributes: Array<{
    key: string;
    value: {
      stringValue?: string;
      intValue?: number;
      doubleValue?: number;
      boolValue?: boolean;
    };
  }>;
}

interface OTLPSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: number;
  startTimeUnixNano: string;
  endTimeUnixNano?: string;
  attributes: Array<{
    key: string;
    value: {
      stringValue?: string;
      intValue?: number;
      doubleValue?: number;
      boolValue?: boolean;
    };
  }>;
  status: {
    code: number;
    message?: string;
  };
  events: Array<{
    timeUnixNano: string;
    name: string;
    attributes: Array<{
      key: string;
      value: {
        stringValue?: string;
        intValue?: number;
        doubleValue?: number;
        boolValue?: boolean;
      };
    }>;
  }>;
}

interface OTLPTrace {
  resource: OTLPResource;
  scopeSpans: Array<{
    scope: {
      name: string;
      version: string;
    };
    spans: OTLPSpan[];
  }>;
}

interface OTLPExportData {
  resourceSpans: OTLPTrace[];
}

export class OTLPExporter {
  private serviceName: string;
  private serviceVersion: string;
  
  constructor(options: { serviceName?: string; serviceVersion?: string } = {}) {
    this.serviceName = options.serviceName || 'vibekit-telemetry';
    this.serviceVersion = options.serviceVersion || '1.0.0';
  }
  
  async export(events: TelemetryEvent[]): Promise<ExportResult> {
    const otlpData = this.convertToOTLP(events);
    const jsonString = JSON.stringify(otlpData, null, 2);
    
    return {
      format: 'otlp',
      data: jsonString,
      size: Buffer.byteLength(jsonString, 'utf8'),
      exportedAt: Date.now(),
    };
  }
  
  async exportBinary(events: TelemetryEvent[]): Promise<Buffer> {
    // For a full implementation, this would use protobuf encoding
    // For now, we'll return JSON as bytes
    const result = await this.export(events);
    return Buffer.from(result.data, 'utf-8');
  }
  
  private convertToOTLP(events: TelemetryEvent[]): OTLPExportData {
    // Group events by session to create traces
    const sessionGroups = new Map<string, TelemetryEvent[]>();
    
    for (const event of events) {
      if (!sessionGroups.has(event.sessionId)) {
        sessionGroups.set(event.sessionId, []);
      }
      sessionGroups.get(event.sessionId)!.push(event);
    }
    
    const resourceSpans: OTLPTrace[] = [];
    
    for (const [sessionId, sessionEvents] of sessionGroups.entries()) {
      // Sort events by timestamp
      sessionEvents.sort((a, b) => a.timestamp - b.timestamp);
      
      const spans = this.convertEventsToSpans(sessionEvents);
      
      resourceSpans.push({
        resource: this.createResource(),
        scopeSpans: [{
          scope: {
            name: this.serviceName,
            version: this.serviceVersion,
          },
          spans,
        }],
      });
    }
    
    return { resourceSpans };
  }
  
  private createResource(): OTLPResource {
    return {
      attributes: [
        {
          key: 'service.name',
          value: { stringValue: this.serviceName },
        },
        {
          key: 'service.version',
          value: { stringValue: this.serviceVersion },
        },
        {
          key: 'telemetry.sdk.name',
          value: { stringValue: 'vibekit-telemetry' },
        },
        {
          key: 'telemetry.sdk.version',
          value: { stringValue: '1.0.0' },
        },
      ],
    };
  }
  
  private convertEventsToSpans(events: TelemetryEvent[]): OTLPSpan[] {
    const spans: OTLPSpan[] = [];
    const traceId = this.generateTraceId();
    
    // Find session start and end events
    const startEvent = events.find(e => e.eventType === 'start');
    const endEvent = events.find(e => e.eventType === 'end');
    
    if (startEvent) {
      // Create main session span
      const mainSpan = this.createSessionSpan(
        startEvent,
        endEvent,
        traceId,
        events
      );
      spans.push(mainSpan);
      
      // Create child spans for other events
      const otherEvents = events.filter(e => 
        e.eventType !== 'start' && e.eventType !== 'end'
      );
      
      for (const event of otherEvents) {
        const childSpan = this.createEventSpan(event, traceId, mainSpan.spanId);
        spans.push(childSpan);
      }
    } else {
      // No session structure, create individual spans
      for (const event of events) {
        const span = this.createEventSpan(event, traceId);
        spans.push(span);
      }
    }
    
    return spans;
  }
  
  private createSessionSpan(
    startEvent: TelemetryEvent,
    endEvent: TelemetryEvent | undefined,
    traceId: string,
    allEvents: TelemetryEvent[]
  ): OTLPSpan {
    const spanId = this.generateSpanId();
    const startTimeNano = this.timestampToNano(startEvent.timestamp);
    const endTimeNano = endEvent 
      ? this.timestampToNano(endEvent.timestamp)
      : this.timestampToNano(Date.now());
    
    // Determine status based on events
    const hasErrors = allEvents.some(e => e.eventType === 'error');
    const status = hasErrors 
      ? { code: 2, message: 'Session completed with errors' } // ERROR
      : { code: 1 }; // OK
    
    return {
      traceId,
      spanId,
      name: `${startEvent.category}.${startEvent.action}`,
      kind: 1, // SPAN_KIND_SERVER
      startTimeUnixNano: startTimeNano,
      endTimeUnixNano: endTimeNano,
      attributes: this.convertEventAttributes(startEvent),
      status,
      events: this.convertEventToSpanEvents(allEvents.filter(e => 
        e.eventType !== 'start' && e.eventType !== 'end'
      )),
    };
  }
  
  private createEventSpan(
    event: TelemetryEvent,
    traceId: string,
    parentSpanId?: string
  ): OTLPSpan {
    const spanId = this.generateSpanId();
    const startTimeNano = this.timestampToNano(event.timestamp);
    const endTimeNano = event.duration 
      ? this.timestampToNano(event.timestamp + event.duration)
      : startTimeNano;
    
    const status = event.eventType === 'error'
      ? { code: 2, message: event.label || 'Error occurred' }
      : { code: 1 };
    
    return {
      traceId,
      spanId,
      parentSpanId,
      name: `${event.category}.${event.action}`,
      kind: this.getSpanKind(event.eventType),
      startTimeUnixNano: startTimeNano,
      endTimeUnixNano: endTimeNano,
      attributes: this.convertEventAttributes(event),
      status,
      events: [],
    };
  }
  
  private convertEventAttributes(event: TelemetryEvent) {
    const attributes = [
      {
        key: 'event.type',
        value: { stringValue: event.eventType },
      },
      {
        key: 'event.category',
        value: { stringValue: event.category },
      },
      {
        key: 'event.action',
        value: { stringValue: event.action },
      },
    ];
    
    if (event.label) {
      attributes.push({
        key: 'event.label',
        value: { stringValue: event.label },
      });
    }
    
    if (event.value !== undefined) {
      attributes.push({
        key: 'event.value',
        value: { stringValue: String(event.value) },
      });
    }
    
    // Add metadata as attributes
    if (event.metadata) {
      for (const [key, value] of Object.entries(event.metadata)) {
        attributes.push({
          key: `metadata.${key}`,
          value: this.convertValueToOTLPValue(value),
        });
      }
    }
    
    // Add context as attributes
    if (event.context) {
      for (const [key, value] of Object.entries(event.context)) {
        attributes.push({
          key: `context.${key}`,
          value: this.convertValueToOTLPValue(value),
        });
      }
    }
    
    return attributes;
  }
  
  private convertEventToSpanEvents(events: TelemetryEvent[]) {
    return events.map(event => ({
      timeUnixNano: this.timestampToNano(event.timestamp),
      name: `${event.eventType}.${event.action}`,
      attributes: this.convertEventAttributes(event),
    }));
  }
  
  private convertValueToOTLPValue(value: any) {
    // For now, convert all values to strings for compatibility
    if (typeof value === 'string') {
      return { stringValue: value };
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      return { stringValue: String(value) };
    } else {
      return { stringValue: JSON.stringify(value) };
    }
  }
  
  private getSpanKind(eventType: string): number {
    switch (eventType) {
      case 'start':
      case 'end':
        return 1; // SPAN_KIND_SERVER
      case 'stream':
        return 3; // SPAN_KIND_CLIENT
      case 'error':
        return 4; // SPAN_KIND_PRODUCER
      default:
        return 0; // SPAN_KIND_UNSPECIFIED
    }
  }
  
  private generateTraceId(): string {
    // Generate 16-byte (128-bit) trace ID as hex string
    const bytes = new Uint8Array(16);
    for (let i = 0; i < 16; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  }
  
  private generateSpanId(): string {
    // Generate 8-byte (64-bit) span ID as hex string
    const bytes = new Uint8Array(8);
    for (let i = 0; i < 8; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  }
  
  private timestampToNano(timestamp: number): string {
    // Convert milliseconds to nanoseconds
    return (timestamp * 1_000_000).toString();
  }
  
  // HTTP export method for sending to OTLP collectors
  async exportToCollector(
    events: TelemetryEvent[],
    endpoint: string,
    headers: Record<string, string> = {}
  ): Promise<ExportResult> {
    try {
      const otlpData = this.convertToOTLP(events);
      
      const response = await fetch(`${endpoint}/v1/traces`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'vibekit-telemetry/1.0.0',
          ...headers,
        },
        body: JSON.stringify(otlpData),
      });
      
      if (!response.ok) {
        throw new Error(`OTLP export failed: ${response.status} ${response.statusText}`);
      }
      
      return {
        format: 'otlp',
        data: `Exported ${events.length} events to OTLP collector`,
        size: events.length,
        exportedAt: Date.now(),
      };
    } catch (error) {
      throw error;
    }
  }
  
  // gRPC export method (stub for full implementation)
  async exportToCollectorGRPC(
    events: TelemetryEvent[],
    endpoint: string,
    options: any = {}
  ): Promise<ExportResult> {
    // This would require implementing gRPC client for OTLP
    // For now, fallback to HTTP
    return this.exportToCollector(events, endpoint);
  }
}