import type { TelemetryEvent, TelemetryContext } from '../core/types.js';
import { v4 as uuidv4 } from 'uuid';

export interface EventBuilderOptions {
  sessionId: string;
  context?: TelemetryContext;
  defaultCategory?: string;
  timestampProvider?: () => number;
}

export class EventBuilder {
  private options: Required<EventBuilderOptions>;
  
  constructor(options: EventBuilderOptions) {
    this.options = {
      sessionId: options.sessionId,
      context: options.context || {},
      defaultCategory: options.defaultCategory || 'general',
      timestampProvider: options.timestampProvider || (() => Date.now()),
    };
  }
  
  /**
   * Create a start event
   */
  start(category: string, action: string, metadata?: Record<string, any>): TelemetryEvent {
    return this.createEvent('start', category, action, metadata);
  }
  
  /**
   * Create a stream event
   */
  stream(category: string, action: string, metadata?: Record<string, any>): TelemetryEvent {
    return this.createEvent('stream', category, action, metadata);
  }
  
  /**
   * Create an end event
   */
  end(category: string, action: string, metadata?: Record<string, any>): TelemetryEvent {
    return this.createEvent('end', category, action, metadata);
  }
  
  /**
   * Create an error event
   */
  error(category: string, action: string, error: Error | string, metadata?: Record<string, any>): TelemetryEvent {
    const errorData = error instanceof Error ? {
      message: error.message,
      stack: error.stack,
      name: error.name,
    } : { message: error };
    
    return this.createEvent('error', category, action, {
      ...metadata,
      error: errorData,
    });
  }
  
  /**
   * Create a custom event
   */
  custom(category: string, action: string, metadata?: Record<string, any>): TelemetryEvent {
    return this.createEvent('custom', category, action, metadata);
  }
  
  /**
   * Create a metric event
   */
  metric(category: string, action: string, value: number, metadata?: Record<string, any>): TelemetryEvent {
    const event = this.createEvent('custom', category, action, metadata);
    event.value = value;
    return event;
  }
  
  /**
   * Create a timed event (measures duration)
   */
  timed<T>(
    category: string,
    action: string,
    operation: () => T | Promise<T>,
    metadata?: Record<string, any>
  ): Promise<{ result: T; event: TelemetryEvent }> {
    const startTime = this.options.timestampProvider();
    const startEvent = this.start(category, action, metadata);
    
    return Promise.resolve(operation())
      .then(result => {
        const endTime = this.options.timestampProvider();
        const endEvent = this.end(category, action, {
          ...metadata,
          startEventId: startEvent.id,
          duration: endTime - startTime,
        });
        endEvent.duration = endTime - startTime;
        
        return { result, event: endEvent };
      })
      .catch(error => {
        const endTime = this.options.timestampProvider();
        const errorEvent = this.error(category, action, error, {
          ...metadata,
          startEventId: startEvent.id,
          duration: endTime - startTime,
        });
        errorEvent.duration = endTime - startTime;
        
        throw error;
      });
  }
  
  /**
   * Create a batch of events
   */
  batch(events: Array<{
    type: TelemetryEvent['eventType'];
    category: string;
    action: string;
    metadata?: Record<string, any>;
  }>): TelemetryEvent[] {
    return events.map(({ type, category, action, metadata }) => 
      this.createEvent(type, category, action, metadata)
    );
  }
  
  /**
   * Update context for future events
   */
  updateContext(context: Partial<TelemetryContext>): void {
    this.options.context = {
      ...this.options.context,
      ...context,
    };
  }
  
  /**
   * Clone builder with new options
   */
  clone(options: Partial<EventBuilderOptions>): EventBuilder {
    return new EventBuilder({
      ...this.options,
      ...options,
      context: {
        ...this.options.context,
        ...options.context,
      },
    });
  }
  
  private createEvent(
    eventType: TelemetryEvent['eventType'],
    category: string,
    action: string,
    metadata?: Record<string, any>
  ): TelemetryEvent {
    return {
      id: uuidv4(),
      sessionId: this.options.sessionId,
      eventType,
      category: category || this.options.defaultCategory,
      action,
      timestamp: this.options.timestampProvider(),
      metadata,
      context: { ...this.options.context },
    };
  }
}

/**
 * Factory for creating event builders with common configurations
 */
export class EventBuilderFactory {
  private defaultOptions: Partial<EventBuilderOptions>;
  
  constructor(defaultOptions: Partial<EventBuilderOptions> = {}) {
    this.defaultOptions = defaultOptions;
  }
  
  /**
   * Create a new event builder for a session
   */
  createBuilder(sessionId: string, options?: Partial<EventBuilderOptions>): EventBuilder {
    return new EventBuilder({
      ...this.defaultOptions,
      ...options,
      sessionId,
    });
  }
  
  /**
   * Create a builder for a specific category
   */
  createCategoryBuilder(
    sessionId: string,
    category: string,
    options?: Partial<EventBuilderOptions>
  ): EventBuilder {
    return new EventBuilder({
      ...this.defaultOptions,
      ...options,
      sessionId,
      defaultCategory: category,
    });
  }
  
  /**
   * Create a builder with user context
   */
  createUserBuilder(
    sessionId: string,
    userId: string,
    options?: Partial<EventBuilderOptions>
  ): EventBuilder {
    return new EventBuilder({
      ...this.defaultOptions,
      ...options,
      sessionId,
      context: {
        ...this.defaultOptions.context,
        ...options?.context,
        userId,
      },
    });
  }
}