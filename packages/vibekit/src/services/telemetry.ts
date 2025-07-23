import { TelemetryConfig } from "../types";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";
import { trace, SpanStatusCode, SpanKind } from "@opentelemetry/api";

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
  
  // Drizzle-related properties (added incrementally)
  private dbOps?: any; // Will be DrizzleTelemetryOperations when available
  private dataIntegrity?: any;
  private analytics?: any;
  private exportService?: any;

  constructor(config: TelemetryConfig, sessionId?: string) {
    this.config = config;
    this.sessionId = sessionId || this.generateSessionId();

    if (this.config.isEnabled) {
      this.initializeOpenTelemetry();
    }

    // Initialize local storage if configured (non-blocking)
    if (this.config.localStore?.isEnabled) {
      this.initializeDrizzleDB().catch(error => {
        console.warn('Local telemetry storage initialization failed, continuing with OpenTelemetry only:', error.message);
      });
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
        "vibekit.prompt_length": prompt.length,
        ...metadata,
      },
    });

    return span;
  }

  public async trackStart(
    agentType: string,
    mode: string,
    prompt: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    if (!this.config.isEnabled || !this.tracer) {
      return;
    }

    try {
      // Phase 3: Create session record if Drizzle is available
      if (this.dbOps) {
        await this.createSessionRecord(agentType, mode, prompt, metadata);
      }

      // Original OpenTelemetry tracking (preserved)
      const span = this.createSpan(
        `vibekit.start`,
        agentType,
        mode,
        prompt,
        metadata
      );

      if (span) {
        // Add event to span
        span.addEvent("operation_started", {
          "vibekit.event_type": "start",
          timestamp: Date.now(),
        });

        // End span immediately for start events
        span.setStatus({ code: SpanStatusCode.OK });
        span.end();
      }

      // Phase 3: Persist event to database if available
      if (this.dbOps) {
        await this.persistEvent({
          sessionId: this.sessionId,
          agentType,
          mode,
          prompt,
          timestamp: Date.now(),
          eventType: "start",
          metadata,
        });
      }
    } catch (error) {
      console.warn("Failed to track start event:", error);
    }
  }

  public async trackStream(
    agentType: string,
    mode: string,
    prompt: string,
    streamData: string,
    sandboxId?: string,
    repoUrl?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    if (!this.config.isEnabled || !this.tracer) {
      return;
    }

    try {
      // Original OpenTelemetry tracking (preserved)
      const span = this.createSpan(`vibekit.stream`, agentType, mode, prompt, {
        "vibekit.sandbox_id": sandboxId || "",
        "vibekit.repo_url": repoUrl || "",
        "vibekit.stream_data_length": streamData.length,
        ...metadata,
      });

      if (span) {
        // Add stream data as an event
        span.addEvent("stream_data", {
          "vibekit.event_type": "stream",
          "stream.data": streamData,
          timestamp: Date.now(),
        });

        // End span immediately for stream events
        span.setStatus({ code: SpanStatusCode.OK });
        span.end();
      }

      // Phase 3: Persist stream event to database if available
      if (this.dbOps) {
        await this.persistEvent({
          sessionId: this.sessionId,
          agentType,
          mode,
          prompt,
          timestamp: Date.now(),
          eventType: "stream",
          sandboxId,
          repoUrl,
          streamData,
          metadata,
        });
      }
    } catch (error) {
      console.warn("Failed to track stream event:", error);
    }
  }

  public async trackEnd(
    agentType: string,
    mode: string,
    prompt: string,
    sandboxId?: string,
    repoUrl?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    if (!this.config.isEnabled || !this.tracer) {
      return;
    }

    try {
      // Original OpenTelemetry tracking (preserved)
      const span = this.createSpan(`vibekit.end`, agentType, mode, prompt, {
        "vibekit.sandbox_id": sandboxId || "",
        "vibekit.repo_url": repoUrl || "",
        ...metadata,
      });

      if (span) {
        // Add event to span
        span.addEvent("operation_completed", {
          "vibekit.event_type": "end",
          timestamp: Date.now(),
        });

        // End span
        span.setStatus({ code: SpanStatusCode.OK });
        span.end();
      }

      // Phase 3: Persist end event and update session
      if (this.dbOps) {
        await this.persistEvent({
          sessionId: this.sessionId,
          agentType,
          mode,
          prompt,
          timestamp: Date.now(),
          eventType: "end",
          sandboxId,
          repoUrl,
          metadata,
        });

        // Update session status to completed
        await this.updateSessionRecord(this.sessionId, {
          status: 'completed',
          endTime: Date.now(),
        });
      }
    } catch (error) {
      console.warn("Failed to track end event:", error);
    }
  }

  public async trackError(
    agentType: string,
    mode: string,
    prompt: string,
    error: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    if (!this.config.isEnabled || !this.tracer) {
      return;
    }

    try {
      // Original OpenTelemetry tracking (preserved)
      const span = this.createSpan(
        `vibekit.error`,
        agentType,
        mode,
        prompt,
        metadata
      );

      if (span) {
        // Record the error
        span.recordException(new Error(error));

        // Add error event
        span.addEvent("error_occurred", {
          "vibekit.event_type": "error",
          "error.message": error,
          timestamp: Date.now(),
        });

        // Set error status
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error,
        });

        span.end();
      }

      // Phase 3: Persist error event and update session
      if (this.dbOps) {
        await this.persistEvent({
          sessionId: this.sessionId,
          agentType,
          mode,
          prompt,
          timestamp: Date.now(),
          eventType: "error",
          metadata: {
            ...metadata,
            error,
          },
        });

        // Update session status to error
        await this.updateSessionRecord(this.sessionId, {
          status: 'error',
          endTime: Date.now(),
        });
      }
    } catch (err) {
      console.warn("Failed to track error event:", err);
    }
  }

  /**
   * Initialize Drizzle database for local storage (Phase 2: Actual initialization)
   */
  private async initializeDrizzleDB(): Promise<void> {
    console.log('🔍 Initializing Drizzle telemetry database...');
    
    try {
      // Try to dynamically import Drizzle components
      const { DrizzleTelemetryOperations } = await import('../db/operations');
      const { initializeTelemetryDB } = await import('../db/connection');
      
      console.log('✅ Drizzle telemetry components loaded');
      
      // Phase 2: Actually initialize the database
      const drizzleConfig = {
        path: this.config.localStore?.path || '.vibekit/telemetry.db',
        streamBatchSize: this.config.localStore?.streamBatchSize || 50,
        streamFlushIntervalMs: this.config.localStore?.streamFlushIntervalMs || 1000,
        enableWAL: true,
        enableForeignKeys: true,
        performanceMode: true,
      };

      console.log('🗄️  Initializing database:', drizzleConfig.path);
      await initializeTelemetryDB(drizzleConfig);
      
      this.dbOps = new DrizzleTelemetryOperations(drizzleConfig);
      await this.dbOps.initialize();
      
      console.log('✅ Drizzle telemetry database initialized successfully');
      console.log('📊 Local storage and analytics now available');
      
    } catch (error: any) {
      console.warn('⚠️  Drizzle telemetry initialization failed:', error.message);
      console.log('📡 Continuing with OpenTelemetry-only mode');
      // Don't throw - graceful degradation
    }
  }

  /**
   * Create session record in database (Phase 3)
   */
  private async createSessionRecord(
    agentType: string,
    mode: string,
    prompt: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    if (!this.dbOps) return;

    try {
      await this.dbOps.createSession({
        id: this.sessionId,
        agentType,
        mode,
        prompt: prompt.substring(0, 1000), // Limit prompt length
        startTime: Date.now(),
        status: 'active',
        eventCount: 0,
        streamEventCount: 0,
        errorCount: 0,
        sandboxId: metadata?.sandboxId || null,
        repoUrl: metadata?.repoUrl || null,
        metadata: metadata ? JSON.stringify(metadata) : null,
        endTime: null,
        duration: null,
      });
    } catch (error: any) {
      // Session creation failed, but continue with OpenTelemetry
      console.debug('Session record creation failed:', error.message);
    }
  }

  /**
   * Persist event to database (Phase 3)
   */
  private async persistEvent(data: TelemetryData): Promise<void> {
    if (!this.dbOps) return;

    try {
      await this.dbOps.insertEvent({
        sessionId: data.sessionId || this.sessionId,
        agentType: data.agentType,
        mode: data.mode,
        prompt: data.prompt.substring(0, 1000),
        timestamp: data.timestamp,
        eventType: data.eventType,
        sandboxId: data.sandboxId || null,
        repoUrl: data.repoUrl || null,
        streamData: data.streamData || null,
        metadata: data.metadata ? JSON.stringify(data.metadata) : null,
      });
    } catch (error: any) {
      console.debug('Event persistence failed:', error.message);
    }
  }

  /**
   * Update session record in database (Phase 3)
   */
  private async updateSessionRecord(sessionId: string, updates: Record<string, any>): Promise<void> {
    if (!this.dbOps) return;

    try {
      await this.dbOps.updateSession(sessionId, updates);
    } catch (error: any) {
      console.debug('Session update failed:', error.message);
    }
  }

  /**
   * Initialize the telemetry service (compatibility method)
   */
  public async initialize(): Promise<void> {
    // OpenTelemetry is already initialized in constructor if enabled
    // This method exists for compatibility with the consolidated interface
    
    // Wait a moment for async Drizzle initialization if it was started
    if (this.config.localStore?.isEnabled) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  /**
   * Get analytics dashboard data (Phase 2: Use Drizzle when available)
   */
  public async getAnalyticsDashboard(timeWindow: 'hour' | 'day' | 'week' = 'day'): Promise<any> {
    // Phase 2: Check if Drizzle is available and use it
    if (this.dbOps) {
      try {
        console.log('📊 Generating analytics dashboard from local database...');
        
        // Try to get basic analytics from Drizzle
        const sessionSummaries = await this.dbOps.getSessionSummaries?.({ limit: 10 });
        const totalSessions = sessionSummaries?.length || 0;
        
        return {
          timeWindow,
          totalSessions,
          totalEvents: 0, // Will be implemented in Phase 3
          avgResponseTime: 0, // Will be implemented in Phase 3  
          errorRate: 0, // Will be implemented in Phase 3
          topAgents: [], // Will be implemented in Phase 3
          recentSessions: sessionSummaries || [],
          message: 'Basic analytics from local database (Phase 2)',
          source: 'drizzle'
        };
        
      } catch (error: any) {
        console.warn('Failed to get analytics from local database:', error.message);
        // Fall through to OpenTelemetry-only response
      }
    }
    
    // Fallback: OpenTelemetry-only mode
    console.warn('Analytics dashboard not available with OpenTelemetry-only mode. Enable local storage for analytics.');
    return {
      timeWindow,
      totalSessions: 0,
      totalEvents: 0,
      avgResponseTime: 0,
      errorRate: 0,
      topAgents: [],
      recentSessions: [],
      message: 'Analytics requires local storage with Drizzle integration',
      source: 'opentelemetry-only'
    };
  }

  /**
   * Gracefully shutdown the OpenTelemetry SDK
   */
  public async shutdown(): Promise<void> {
    if (this.sdk) {
      try {
        await this.sdk.shutdown();
      } catch (error) {
        console.warn("Failed to shutdown OpenTelemetry SDK:", error);
      }
    }
  }
}
