import { TelemetryConfig } from "../types";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";
import { trace, SpanStatusCode, SpanKind } from "@opentelemetry/api";
import { TelemetryDB } from "./telemetry-db";
import { TelemetryRecord } from "../types/telemetry-storage";

export interface TelemetryData {
  sessionId?: string;
  agentType: string;
  mode: string;
  prompt: string;
  timestamp: number;
  sandboxId?: string;
  repoUrl?: string;
  streamData?: string;
  eventType: "start" | "stream" | "end" | "error";
  metadata?: Record<string, any>;
}

export class TelemetryService {
  private config: TelemetryConfig;
  private sessionId: string;
  private tracer: any;
  private sdk?: NodeSDK;
  private db?: TelemetryDB;
  private streamBuffer: Map<string, TelemetryData[]>;
  private bufferMetadata: Map<string, { createdAt: number; lastUpdated: number; flushCount: number }>;
  private flushTimer?: NodeJS.Timeout;
  private performanceMetrics: {
    totalFlushes: number;
    totalEventsWritten: number;
    averageFlushTime: number;
    lastFlushTime: number;
  };

  constructor(config: TelemetryConfig, sessionId?: string) {
    this.config = config;
    this.sessionId = sessionId || this.generateSessionId();
    this.streamBuffer = new Map();
    this.bufferMetadata = new Map();
    this.performanceMetrics = {
      totalFlushes: 0,
      totalEventsWritten: 0,
      averageFlushTime: 0,
      lastFlushTime: 0,
    };

    if (this.config.isEnabled) {
      this.initializeOpenTelemetry();
    }

    // Initialize local database if enabled
    if (this.config.localStore?.isEnabled) {
      this.db = new TelemetryDB(this.config.localStore);
      this.initializePeriodicFlush();
    }
  }

  private generateSessionId(): string {
    return `vibekit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private shouldSample(): boolean {
    if (this.config.samplingRatio === undefined) return true;
    return Math.random() < this.config.samplingRatio;
  }

  private initializeOpenTelemetry(): void {
    if (!this.config.endpoint || !this.shouldSample()) {
      return;
    }

    try {
      // Create resource with service information and custom attributes
      const resource = resourceFromAttributes({
        [ATTR_SERVICE_NAME]: this.config.serviceName || "vibekit",
        [ATTR_SERVICE_VERSION]: this.config.serviceVersion || "1.0.0",
        ...this.config.resourceAttributes,
      });

      // Create OTLP trace exporter
      const traceExporter = new OTLPTraceExporter({
        url: this.config.endpoint,
        headers: this.config.headers || {},
        timeoutMillis: this.config.timeout || 5000,
      });

      // Initialize OpenTelemetry SDK
      this.sdk = new NodeSDK({
        resource: resource,
        traceExporter: traceExporter,
        instrumentations: [], // No auto-instrumentations needed for this use case
      });

      // Start the SDK
      this.sdk.start();

      // Get tracer
      this.tracer = trace.getTracer("vibekit", "1.0.0");
    } catch (error) {
      console.warn("Failed to initialize OpenTelemetry:", error);
    }
  }

  private createSpan(
    name: string,
    agentType: string,
    mode: string,
    prompt: string,
    metadata?: Record<string, any>
  ): any {
    if (!this.tracer) return null;

    const span = this.tracer.startSpan(name, {
      kind: SpanKind.INTERNAL,
      attributes: {
        "vibekit.session_id": this.sessionId,
        "vibekit.agent_type": agentType,
        "vibekit.mode": mode,
        "vibekit.event_type": name.replace("vibekit.", ""),
        "vibekit.prompt_length": prompt?.length || 0,
        ...metadata,
      },
    });

    return span;
  }

  /**
   * Initialize periodic flush timer for stream buffers
   */
  private initializePeriodicFlush(): void {
    if (!this.config.localStore?.isEnabled) return;

    const flushInterval = this.config.localStore.streamFlushIntervalMs || 1000;
    
    this.flushTimer = setInterval(async () => {
      try {
        await this.performPeriodicFlush();
      } catch (error) {
        console.warn("Failed during periodic flush:", error);
      }
    }, flushInterval);
  }

  /**
   * Perform periodic maintenance and flush stale buffers
   */
  private async performPeriodicFlush(): Promise<void> {
    if (!this.db) return;

    const now = Date.now();
    const maxAge = (this.config.localStore?.streamFlushIntervalMs || 1000) * 2; // 2x flush interval
    const staleBufferKeys: string[] = [];

    // Find stale buffers that haven't been updated recently
    for (const [key, metadata] of this.bufferMetadata.entries()) {
      if (now - metadata.lastUpdated > maxAge) {
        staleBufferKeys.push(key);
      }
    }

    // Flush stale buffers
    for (const key of staleBufferKeys) {
      await this.flushStreamBuffer(key);
    }

    // Evict empty or very old buffer metadata to prevent memory leaks
    for (const [key, metadata] of this.bufferMetadata.entries()) {
      if (!this.streamBuffer.has(key) || now - metadata.createdAt > 300000) { // 5 minutes
        this.bufferMetadata.delete(key);
      }
    }
  }

  /**
   * Check and enforce buffer memory limits
   */
  private enforceBufferLimits(): void {
    const maxTotalBuffers = 100; // Maximum number of concurrent buffers
    const maxBufferAge = 600000; // 10 minutes maximum buffer age

    if (this.streamBuffer.size <= maxTotalBuffers) return;

    const now = Date.now();
    const buffersByAge: Array<[string, number]> = [];

    // Collect buffers with their ages
    for (const [key, metadata] of this.bufferMetadata.entries()) {
      buffersByAge.push([key, now - metadata.createdAt]);
    }

    // Sort by age (oldest first) and remove oldest buffers
    buffersByAge.sort((a, b) => b[1] - a[1]);
    
    const buffersToRemove = buffersByAge.slice(maxTotalBuffers);
    for (const [key] of buffersToRemove) {
      // Force flush before removing
      this.flushStreamBuffer(key).catch(error => {
        console.warn(`Failed to flush buffer ${key} during eviction:`, error);
      });
    }
  }

  /**
   * Get current performance metrics
   */
  public getPerformanceMetrics(): {
    totalFlushes: number;
    totalEventsWritten: number;
    averageFlushTime: number;
    lastFlushTime: number;
    activeBuffers: number;
    totalBufferedEvents: number;
  } {
    const totalBufferedEvents = Array.from(this.streamBuffer.values())
      .reduce((sum, buffer) => sum + buffer.length, 0);

    return {
      ...this.performanceMetrics,
      activeBuffers: this.streamBuffer.size,
      totalBufferedEvents,
    };
  }

  /**
   * Persist telemetry event to local database if enabled
   */
  private async persistEvent(data: TelemetryData & { streamData?: string }): Promise<boolean> {
    if (!this.db) {
      return false;
    }

    try {
      const record: Omit<TelemetryRecord, 'id'> = {
        sessionId: data.sessionId || this.sessionId,
        eventType: data.eventType,
        agentType: data.agentType,
        mode: data.mode,
        prompt: data.prompt || '',
        streamData: data.streamData,
        sandboxId: data.sandboxId,
        repoUrl: data.repoUrl,
        metadata: data.metadata,
        timestamp: data.timestamp,
      };

      await this.db.insertEvent(record);
      return true;
    } catch (error) {
      console.warn("Failed to persist telemetry event to local database:", error);
      return false;
    }
  }

  /**
   * Flush stream buffer for a specific session/agent combination
   */
  private async flushStreamBuffer(bufferKey: string): Promise<void> {
    const buffer = this.streamBuffer.get(bufferKey);
    if (!buffer || buffer.length === 0) {
      // Clean up metadata for empty buffers
      this.bufferMetadata.delete(bufferKey);
      return;
    }

    if (this.db) {
      const startTime = Date.now();
      
      try {
        const records: Array<Omit<TelemetryRecord, 'id'>> = buffer.map(data => ({
          sessionId: data.sessionId || this.sessionId,
          eventType: data.eventType,
          agentType: data.agentType,
          mode: data.mode,
          prompt: data.prompt || '',
          streamData: data.streamData,
          sandboxId: data.sandboxId,
          repoUrl: data.repoUrl,
          metadata: data.metadata,
          timestamp: data.timestamp,
        }));

        await this.db.insertBatch(records);

        // Update performance metrics
        const flushTime = Date.now() - startTime;
        this.performanceMetrics.totalFlushes++;
        this.performanceMetrics.totalEventsWritten += buffer.length;
        this.performanceMetrics.lastFlushTime = flushTime;
        
        // Update rolling average flush time
        const newAverage = (this.performanceMetrics.averageFlushTime * (this.performanceMetrics.totalFlushes - 1) + flushTime) 
                          / this.performanceMetrics.totalFlushes;
        this.performanceMetrics.averageFlushTime = Math.round(newAverage * 100) / 100; // Round to 2 decimal places

        // Update buffer metadata
        const metadata = this.bufferMetadata.get(bufferKey);
        if (metadata) {
          metadata.flushCount++;
        }

      } catch (error) {
        console.warn("Failed to flush stream buffer to local database:", error);
      }
    }

    // Clear the buffer and its metadata
    this.streamBuffer.delete(bufferKey);
    this.bufferMetadata.delete(bufferKey);
  }

  /**
   * Flush all stream buffers
   */
  private async flushAllBuffers(): Promise<void> {
    const promises = Array.from(this.streamBuffer.keys()).map(key => 
      this.flushStreamBuffer(key)
    );
    await Promise.all(promises);
  }

  // Integration test compatible overload for trackStart  
  public async trackStart(
    sessionId: string,
    agentType: string,
    mode: string,
    prompt: string,
    sandboxId?: string,
    repoUrl?: string,
    metadata?: Record<string, any>
  ): Promise<void>;
  
  // Object-based overload for trackStart
  public async trackStart(options: {
    sessionId?: string;
    agentType: string;
    mode?: string;
    prompt?: string;
    metadata?: Record<string, any>;
  }): Promise<void>;
  
  // Parameter-based overload for trackStart
  public async trackStart(
    agentType: string,
    mode: string,
    prompt: string,
    metadata?: Record<string, any>
  ): Promise<void>;
  
  // Implementation - dispatch to the appropriate overload
  public async trackStart(...args: any[]): Promise<void> {
    if (args.length === 1 && typeof args[0] === 'object') {
      // Object-based call
      const { sessionId, agentType, mode: objMode, prompt: objPrompt, metadata: objMetadata } = args[0];
      if (sessionId) this.sessionId = sessionId;
      return this._trackStartImpl(agentType, objMode || 'code', objPrompt || '', objMetadata);
    } else if (args.length >= 5) {
      // Integration test compatible: trackStart(sessionId, agentType, mode, prompt, sandboxId?, repoUrl?, metadata?)
      const [sessionId, agentType, mode, prompt, sandboxId, repoUrl, metadata] = args;
      this.sessionId = sessionId;
      const finalMetadata = {
        ...metadata,
        ...(sandboxId ? { sandboxId } : {}),
        ...(repoUrl ? { repoUrl } : {})
      };
      return this._trackStartImpl(agentType, mode, prompt, finalMetadata);
    } else {
      // Standard call: trackStart(agentType, mode, prompt, metadata?)
      const [agentType, mode, prompt, metadata] = args;
      return this._trackStartImpl(agentType, mode, prompt, metadata);
    }
  }
  
  private async _trackStartImpl(
    agentType: string,
    mode: string,
    prompt: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    const timestamp = Date.now();

    // Handle OpenTelemetry tracing
    if (this.config.isEnabled && this.tracer) {
    try {
      const span = this.createSpan(
        `vibekit.start`,
        agentType,
          mode || 'code',
          prompt || '',
        metadata
      );

      if (span) {
        // Add event to span
        span.addEvent("operation_started", {
          "vibekit.event_type": "start",
            timestamp,
        });

        // End span immediately for start events
        span.setStatus({ code: SpanStatusCode.OK });
        span.end();
      }
    } catch (error) {
      console.warn("Failed to track start event:", error);
    }
  }

    // Handle local storage persistence
    await this.persistEvent({
      sessionId: this.sessionId,
      eventType: "start",
      agentType,
      mode: mode || 'code',
      prompt: typeof prompt === 'string' ? prompt : JSON.stringify(prompt || ''),
      timestamp,
      metadata,
    });
  }

  // Integration test compatible overload for trackStream
  public async trackStream(
    sessionId: string,
    agentType: string,
    streamData: string,
    metadata?: Record<string, any>
  ): Promise<void>;
  
  // Object-based overload for trackStream
  public async trackStream(options: {
    sessionId?: string;
    agentType: string;
    mode?: string;
    prompt?: string;
    streamData: string;
    sandboxId?: string;
    repoUrl?: string;
    metadata?: Record<string, any>;
  }): Promise<void>;
  
  // Parameter-based overload for trackStream
  public async trackStream(
    agentType: string,
    mode: string,
    prompt: string,
    streamData: string,
    sandboxId?: string,
    repoUrl?: string,
    metadata?: Record<string, any>
  ): Promise<void>;
  
  // Implementation - dispatch to the appropriate overload
  public async trackStream(...args: any[]): Promise<void> {
    if (args.length === 1 && typeof args[0] === 'object') {
      // Object-based call
      const { sessionId, agentType, mode: objMode, prompt: objPrompt, streamData: objStreamData, sandboxId: objSandboxId, repoUrl: objRepoUrl, metadata: objMetadata } = args[0];
      if (sessionId) this.sessionId = sessionId;
      return this._trackStreamImpl(agentType, objMode || 'code', objPrompt || '', objStreamData, objSandboxId, objRepoUrl, objMetadata);
    } else if (args.length === 3) {
      // Integration test compatible: trackStream(sessionId, agentType, streamData)
      const [sessionId, agentType, streamData] = args;
      this.sessionId = sessionId;
      return this._trackStreamImpl(agentType, 'code', '', streamData, undefined, undefined, undefined);
    } else {
      // Standard call: trackStream(agentType, mode, prompt, streamData, sandboxId?, repoUrl?, metadata?)
      const [agentType, mode, prompt, streamData, sandboxId, repoUrl, metadata] = args;
      return this._trackStreamImpl(agentType, mode, prompt, streamData, sandboxId, repoUrl, metadata);
    }
  }
  
  private async _trackStreamImpl(
    agentType: string,
    mode: string,
    prompt: string,
    streamData: string,
    sandboxId?: string,
    repoUrl?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    const timestamp = Date.now();

    // Handle OpenTelemetry tracing
    if (this.config.isEnabled && this.tracer) {
    try {
        const span = this.createSpan(`vibekit.stream`, agentType, mode || 'code', prompt || '', {
        "vibekit.sandbox_id": sandboxId || "",
        "vibekit.repo_url": repoUrl || "",
          "vibekit.stream_data_length": streamData?.length || 0,
        ...metadata,
      });

      if (span) {
        // Add stream data as an event
        span.addEvent("stream_data", {
          "vibekit.event_type": "stream",
          "stream.data": streamData,
            timestamp,
        });

        // End span immediately for stream events
        span.setStatus({ code: SpanStatusCode.OK });
        span.end();
      }
    } catch (error) {
      console.warn("Failed to track stream event:", error);
    }
  }

    // Handle local storage persistence with buffering
    if (this.db) {
      const bufferKey = `${this.sessionId}-${agentType}`;
      const bufferLimit = this.config.localStore?.streamBatchSize || 50;
      const now = Date.now();
      
      // Initialize buffer and metadata if needed
      if (!this.streamBuffer.has(bufferKey)) {
        this.streamBuffer.set(bufferKey, []);
        this.bufferMetadata.set(bufferKey, {
          createdAt: now,
          lastUpdated: now,
          flushCount: 0,
        });
      } else {
        // Update metadata
        const metadata = this.bufferMetadata.get(bufferKey)!;
        metadata.lastUpdated = now;
      }

      const buffer = this.streamBuffer.get(bufferKey)!;
      buffer.push({
        sessionId: this.sessionId,
        eventType: "stream",
        agentType,
        mode: mode || 'code',
        prompt: typeof prompt === 'string' ? prompt : JSON.stringify(prompt || ''),
        streamData: typeof streamData === 'string' ? streamData : JSON.stringify(streamData || ''),
        sandboxId,
        repoUrl,
        timestamp,
        metadata,
      });

      // Enforce buffer limits before checking flush threshold
      this.enforceBufferLimits();

      // Flush buffer if it reaches the limit
      if (buffer.length >= bufferLimit) {
        await this.flushStreamBuffer(bufferKey);
      }
    }
  }

  // Integration test compatible overload for trackEnd
  public async trackEnd(
    sessionId: string,
    agentType: string,
    metadata?: Record<string, any>
  ): Promise<void>;
  
  // Object-based overload for trackEnd
  public async trackEnd(options: {
    sessionId?: string;
    agentType: string;
    mode?: string;
    prompt?: string;
    sandboxId?: string;
    repoUrl?: string;
    metadata?: Record<string, any>;
  }): Promise<void>;
  
  // Parameter-based overload for trackEnd
  public async trackEnd(
    agentType: string,
    mode: string,
    prompt: string,
    sandboxId?: string,
    repoUrl?: string,
    metadata?: Record<string, any>
  ): Promise<void>;
  
  // Implementation - dispatch to the appropriate overload
  public async trackEnd(...args: any[]): Promise<void> {
    if (args.length === 1 && typeof args[0] === 'object') {
      // Object-based call
      const { sessionId, agentType, mode: objMode, prompt: objPrompt, sandboxId: objSandboxId, repoUrl: objRepoUrl, metadata: objMetadata } = args[0];
      if (sessionId) this.sessionId = sessionId;
      return this._trackEndImpl(agentType, objMode || 'code', objPrompt || '', objSandboxId, objRepoUrl, objMetadata);
    } else if (args.length === 2) {
      // Integration test compatible: trackEnd(sessionId, agentType)
      const [sessionId, agentType] = args;
      this.sessionId = sessionId;
      return this._trackEndImpl(agentType, 'code', '', undefined, undefined, undefined);
    } else {
      // Standard call: trackEnd(agentType, mode, prompt, sandboxId?, repoUrl?, metadata?)
      const [agentType, mode, prompt, sandboxId, repoUrl, metadata] = args;
      return this._trackEndImpl(agentType, mode, prompt, sandboxId, repoUrl, metadata);
    }
  }
  
  private async _trackEndImpl(
    agentType: string,
    mode: string,
    prompt: string,
    sandboxId?: string,
    repoUrl?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    const timestamp = Date.now();

    // Handle OpenTelemetry tracing
    if (this.config.isEnabled && this.tracer) {
    try {
        const span = this.createSpan(`vibekit.end`, agentType, mode || 'code', prompt || '', {
        "vibekit.sandbox_id": sandboxId || "",
        "vibekit.repo_url": repoUrl || "",
        ...metadata,
      });

      if (span) {
        // Add event to span
        span.addEvent("operation_completed", {
          "vibekit.event_type": "end",
            timestamp,
        });

        // End span
        span.setStatus({ code: SpanStatusCode.OK });
        span.end();
      }
    } catch (error) {
      console.warn("Failed to track end event:", error);
    }
  }

    // Handle local storage persistence
    if (this.db) {
      // Flush any pending stream events for this session/agent
      const bufferKey = `${this.sessionId}-${agentType}`;
      await this.flushStreamBuffer(bufferKey);
    }

    // Persist the end event
    await this.persistEvent({
      sessionId: this.sessionId,
      eventType: "end",
      agentType,
      mode: mode || 'code',
      prompt: typeof prompt === 'string' ? prompt : JSON.stringify(prompt || ''),
      sandboxId,
      repoUrl,
      timestamp,
      metadata,
    });
  }

  // Object-based overload for trackError
  public async trackError(options: {
    sessionId?: string;
    agentType: string;
    mode?: string;
    prompt?: string;
    error: string;
    metadata?: Record<string, any>;
  }): Promise<void>;
  
  // Parameter-based overload for trackError  
  public async trackError(
    agentType: string,
    mode: string,
    prompt: string,
    error: string,
    metadata?: Record<string, any>
  ): Promise<void>;
  
  // Implementation - dispatch to the appropriate overload
  public async trackError(...args: any[]): Promise<void> {
    if (args.length === 1 && typeof args[0] === 'object') {
      // Object-based call
      const { sessionId, agentType, mode: objMode, prompt: objPrompt, error: objError, metadata: objMetadata } = args[0];
      if (sessionId) this.sessionId = sessionId;
      return this._trackErrorImpl(agentType, objMode || 'code', objPrompt || '', objError, objMetadata);
    } else if (args.length >= 2 && args.length <= 3) {
      // Integration test compatible: trackError(sessionId, agentType, metadata?)
      // This case doesn't actually exist in current tests, but keeping for consistency
      const [sessionId, agentType, metadata] = args;
      this.sessionId = sessionId;
      return this._trackErrorImpl(agentType, 'code', '', 'Unknown error', metadata);
    } else {
      // Standard call: trackError(agentType, mode, prompt, error, metadata?)
      const [agentType, mode, prompt, error, metadata] = args;
      return this._trackErrorImpl(agentType, mode, prompt, error, metadata);
    }
  }
  
  private async _trackErrorImpl(
    agentType: string,
    mode: string,
    prompt: string,
    error: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    const timestamp = Date.now();

    // Handle OpenTelemetry tracing
    if (this.config.isEnabled && this.tracer) {
    try {
      const span = this.createSpan(
        `vibekit.error`,
        agentType,
          mode || 'code',
          prompt || '',
        metadata
      );

      if (span) {
        // Record the error
        span.recordException(new Error(error));

        // Add error event
        span.addEvent("error_occurred", {
          "vibekit.event_type": "error",
          "error.message": error,
            timestamp,
        });

        // Set error status
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error,
        });

        span.end();
      }
    } catch (err) {
      console.warn("Failed to track error event:", err);
    }
  }

    // Handle local storage persistence
    if (this.db) {
      // Flush any pending stream events for this session/agent
      const bufferKey = `${this.sessionId}-${agentType}`;
      await this.flushStreamBuffer(bufferKey);
    }

    // Persist the error event
    await this.persistEvent({
      sessionId: this.sessionId,
      eventType: "error",
      agentType,
      mode: mode || 'code',
      prompt: typeof prompt === 'string' ? prompt : JSON.stringify(prompt || ''),
      timestamp,
      metadata: {
        ...metadata,
        "error.message": error || '',
      },
    });
  }

  /**
   * Gracefully shutdown the OpenTelemetry SDK and local database
   */
  public async shutdown(): Promise<void> {
    // Clear periodic flush timer
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }

    // Flush all pending stream buffers before shutdown
    try {
      await this.flushAllBuffers();
    } catch (error) {
      console.warn("Failed to flush stream buffers during shutdown:", error);
    }

    // Clear all buffer metadata
    this.bufferMetadata.clear();

    // Shutdown OpenTelemetry SDK
    if (this.sdk) {
      try {
        await this.sdk.shutdown();
      } catch (error) {
        console.warn("Failed to shutdown OpenTelemetry SDK:", error);
      }
    }

    // Close local database
    if (this.db) {
      try {
        await this.db.close();
      } catch (error) {
        console.warn("Failed to close local telemetry database:", error);
      }
    }
  }
}
