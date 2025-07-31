import type { TelemetryEvent } from '../core/types.js';

export type EventTransformer = (event: TelemetryEvent) => TelemetryEvent | null | Promise<TelemetryEvent | null>;
export type EventEnricher = (event: TelemetryEvent) => void | Promise<void>;

export interface ProcessorOptions {
  parallel?: boolean;
  continueOnError?: boolean;
  timeout?: number;
}

export class EventProcessor {
  private transformers: Array<{
    name: string;
    transformer: EventTransformer;
    priority: number;
  }> = [];
  
  private enrichers: Array<{
    name: string;
    enricher: EventEnricher;
    priority: number;
  }> = [];
  
  private options: ProcessorOptions;
  
  constructor(options: ProcessorOptions = {}) {
    this.options = {
      parallel: false,
      continueOnError: true,
      timeout: 5000,
      ...options,
    };
  }
  
  /**
   * Add a transformer that can modify or filter events
   */
  addTransformer(name: string, transformer: EventTransformer, priority = 0): void {
    this.transformers.push({ name, transformer, priority });
    this.transformers.sort((a, b) => b.priority - a.priority);
  }
  
  /**
   * Add an enricher that adds data to events
   */
  addEnricher(name: string, enricher: EventEnricher, priority = 0): void {
    this.enrichers.push({ name, enricher, priority });
    this.enrichers.sort((a, b) => b.priority - a.priority);
  }
  
  /**
   * Remove a transformer by name
   */
  removeTransformer(name: string): void {
    this.transformers = this.transformers.filter(t => t.name !== name);
  }
  
  /**
   * Remove an enricher by name
   */
  removeEnricher(name: string): void {
    this.enrichers = this.enrichers.filter(e => e.name !== name);
  }
  
  /**
   * Process a single event
   */
  async process(event: TelemetryEvent): Promise<TelemetryEvent | null> {
    let processedEvent: TelemetryEvent | null = { ...event };
    
    // Apply transformers
    if (this.options.parallel) {
      // Note: Parallel processing doesn't guarantee order
      const results = await Promise.all(
        this.transformers.map(({ transformer }) => 
          this.executeWithTimeout(transformer, processedEvent!)
        )
      );
      
      // Use the first non-null result
      processedEvent = results.find(r => r !== null) || null;
    } else {
      // Sequential processing
      for (const { name, transformer } of this.transformers) {
        if (!processedEvent) break;
        
        try {
          processedEvent = await this.executeWithTimeout(transformer, processedEvent);
        } catch (error) {
          if (!this.options.continueOnError) {
            throw new Error(`Transformer ${name} failed: ${(error as Error).message}`);
          }
          console.error(`Transformer ${name} failed:`, error);
        }
      }
    }
    
    if (!processedEvent) {
      return null; // Event was filtered out
    }
    
    // Apply enrichers
    if (this.options.parallel) {
      await Promise.all(
        this.enrichers.map(({ name, enricher }) => 
          this.executeEnricherWithTimeout(name, enricher, processedEvent!)
        )
      );
    } else {
      for (const { name, enricher } of this.enrichers) {
        try {
          await this.executeWithTimeout(enricher, processedEvent);
        } catch (error) {
          if (!this.options.continueOnError) {
            throw new Error(`Enricher ${name} failed: ${(error as Error).message}`);
          }
          console.error(`Enricher ${name} failed:`, error);
        }
      }
    }
    
    return processedEvent;
  }
  
  /**
   * Process a batch of events
   */
  async processBatch(events: TelemetryEvent[]): Promise<TelemetryEvent[]> {
    if (this.options.parallel) {
      const results = await Promise.all(
        events.map(event => this.process(event))
      );
      return results.filter((event): event is TelemetryEvent => event !== null);
    } else {
      const processed: TelemetryEvent[] = [];
      for (const event of events) {
        const result = await this.process(event);
        if (result) {
          processed.push(result);
        }
      }
      return processed;
    }
  }
  
  /**
   * Create a pipeline of processors
   */
  static pipeline(...processors: EventProcessor[]): EventProcessor {
    const pipelineProcessor = new EventProcessor();
    
    pipelineProcessor.addTransformer('pipeline', async (event) => {
      let current: TelemetryEvent | null = event;
      
      for (const processor of processors) {
        if (!current) break;
        current = await processor.process(current);
      }
      
      return current;
    });
    
    return pipelineProcessor;
  }
  
  private async executeWithTimeout<T>(
    fn: (event: TelemetryEvent) => T | Promise<T>,
    event: TelemetryEvent
  ): Promise<T> {
    if (!this.options.timeout) {
      return fn(event);
    }
    
    return Promise.race([
      Promise.resolve(fn(event)),
      new Promise<T>((_, reject) => 
        setTimeout(() => reject(new Error('Operation timed out')), this.options.timeout)
      ),
    ]);
  }
  
  private async executeEnricherWithTimeout(
    name: string,
    enricher: EventEnricher,
    event: TelemetryEvent
  ): Promise<void> {
    try {
      await this.executeWithTimeout(enricher, event);
    } catch (error) {
      if (!this.options.continueOnError) {
        throw new Error(`Enricher ${name} failed: ${(error as Error).message}`);
      }
      console.error(`Enricher ${name} failed:`, error);
    }
  }
}

// Common transformers and enrichers
export const CommonProcessors = {
  /**
   * Add timestamp if missing
   */
  timestampEnricher: (): EventEnricher => {
    return (event) => {
      if (!event.timestamp) {
        event.timestamp = Date.now();
      }
    };
  },
  
  /**
   * Add unique ID if missing
   */
  idEnricher: (): EventEnricher => {
    return (event) => {
      if (!event.id) {
        event.id = `${event.sessionId}_${event.timestamp}_${Math.random().toString(36).substr(2, 9)}`;
      }
    };
  },
  
  /**
   * Filter events by category
   */
  categoryFilter: (allowedCategories: string[]): EventTransformer => {
    const allowed = new Set(allowedCategories);
    return (event) => {
      return allowed.has(event.category) ? event : null;
    };
  },
  
  /**
   * Filter events by type
   */
  typeFilter: (allowedTypes: TelemetryEvent['eventType'][]): EventTransformer => {
    const allowed = new Set(allowedTypes);
    return (event) => {
      return allowed.has(event.eventType) ? event : null;
    };
  },
  
  /**
   * Sample events (only keep a percentage)
   */
  sampler: (sampleRate: number): EventTransformer => {
    if (sampleRate < 0 || sampleRate > 1) {
      throw new Error('Sample rate must be between 0 and 1');
    }
    
    return (event) => {
      return Math.random() < sampleRate ? event : null;
    };
  },
  
  /**
   * Redact sensitive fields
   */
  redactor: (fieldsToRedact: string[]): EventTransformer => {
    return (event) => {
      const redacted = { ...event };
      
      // Redact from metadata
      if (redacted.metadata) {
        redacted.metadata = { ...redacted.metadata };
        fieldsToRedact.forEach(field => {
          if (field in redacted.metadata!) {
            redacted.metadata![field] = '[REDACTED]';
          }
        });
      }
      
      // Redact from context.custom
      if (redacted.context?.custom) {
        redacted.context = {
          ...redacted.context,
          custom: { ...redacted.context.custom },
        };
        fieldsToRedact.forEach(field => {
          if (field in redacted.context!.custom!) {
            redacted.context!.custom![field] = '[REDACTED]';
          }
        });
      }
      
      return redacted;
    };
  },
  
  /**
   * Add environment context
   */
  environmentEnricher: (environment: string): EventEnricher => {
    return (event) => {
      if (!event.context) {
        event.context = {};
      }
      event.context.environment = environment;
    };
  },
  
  /**
   * Add version context
   */
  versionEnricher: (version: string): EventEnricher => {
    return (event) => {
      if (!event.context) {
        event.context = {};
      }
      event.context.version = version;
    };
  },
  
  /**
   * Add platform context
   */
  platformEnricher: (): EventEnricher => {
    return (event) => {
      if (!event.context) {
        event.context = {};
      }
      
      if (typeof process !== 'undefined') {
        event.context.platform = `node/${process.version}`;
      } else if (typeof window !== 'undefined') {
        event.context.platform = 'browser';
      }
    };
  },
  
  /**
   * Deduplicate events based on a key
   */
  deduplicator: (
    keyGenerator: (event: TelemetryEvent) => string,
    windowMs = 1000
  ): EventTransformer => {
    const seen = new Map<string, number>();
    
    // Clean old entries periodically
    setInterval(() => {
      const cutoff = Date.now() - windowMs;
      for (const [key, timestamp] of seen.entries()) {
        if (timestamp < cutoff) {
          seen.delete(key);
        }
      }
    }, windowMs);
    
    return (event) => {
      const key = keyGenerator(event);
      const lastSeen = seen.get(key);
      
      if (lastSeen && Date.now() - lastSeen < windowMs) {
        return null; // Duplicate
      }
      
      seen.set(key, Date.now());
      return event;
    };
  },
};