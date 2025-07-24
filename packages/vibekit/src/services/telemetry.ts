import { TelemetryConfig } from "../types";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";
import { trace, SpanStatusCode, SpanKind } from "@opentelemetry/api";
import { EventEmitter } from "events";
import { resolve } from "path";
import { drizzle } from "drizzle-orm/better-sqlite3";
import BetterSQLite3 from "better-sqlite3";


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

// Add security and data protection utilities
interface PIIDetectionConfig {
  enableEmailDetection: boolean;
  enablePhoneDetection: boolean;
  enableSSNDetection: boolean;
  enableCreditCardDetection: boolean;
  enableApiKeyDetection: boolean;
  customPatterns: { name: string; regex: RegExp; replacement: string }[];
}

interface DataRetentionConfig {
  maxAgeDays: number;
  maxSizeMB: number;
  compressionEnabled: boolean;
  archivalPath?: string;
}

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastCheck: number;
  checks: {
    database: { status: string; latency?: number; error?: string; activeConnections?: number };
    opentelemetry: { status: string; latency?: number; error?: string };
    rateLimiter: { status: string; activeConnections: number };
    circuitBreaker: { status: string; isOpen: boolean; failureCount: number };
    retryQueue: { status: string; queueSize: number };
  };
}

interface TelemetryMetrics {
  events: {
    total: number;
    start: number;
    stream: number;
    end: number;
    error: number;
  };
  performance: {
    avgLatency: number;
    p95Latency: number;
    throughput: number; // events per second
  };
  errors: {
    total: number;
    circuitBreakerTrips: number;
    rateLimitHits: number;
    retryQueueOverflows: number;
  };
  health: {
    uptime: number;
    lastHealthCheck: number;
  };
}

enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  CRITICAL = 4,
}

class Logger {
  private logLevel: LogLevel;
  private serviceName: string;

  constructor(serviceName: string, logLevel: LogLevel = LogLevel.INFO) {
    this.serviceName = serviceName;
    this.logLevel = logLevel;
  }

  private formatMessage(level: string, message: string, metadata?: Record<string, any>): string {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      service: this.serviceName,
      message,
      ...metadata,
    };
    return JSON.stringify(logEntry);
  }

  debug(message: string, metadata?: Record<string, any>): void {
    if (this.logLevel <= LogLevel.DEBUG) {
      console.debug(this.formatMessage('DEBUG', message, metadata));
    }
  }

  info(message: string, metadata?: Record<string, any>): void {
    if (this.logLevel <= LogLevel.INFO) {
      console.info(this.formatMessage('INFO', message, metadata));
    }
  }

  warn(message: string, metadata?: Record<string, any>): void {
    if (this.logLevel <= LogLevel.WARN) {
      console.warn(this.formatMessage('WARN', message, metadata));
    }
  }

  error(message: string, metadata?: Record<string, any>): void {
    if (this.logLevel <= LogLevel.ERROR) {
      console.error(this.formatMessage('ERROR', message, metadata));
    }
  }

  critical(message: string, metadata?: Record<string, any>): void {
    if (this.logLevel <= LogLevel.CRITICAL) {
      console.error(this.formatMessage('CRITICAL', message, metadata));
    }
  }
}

export class TelemetryService extends EventEmitter {
  private config: TelemetryConfig;
  private sessionId: string;
  private tracer: any;
  private sdk?: NodeSDK;
  
  // Drizzle-related properties (added incrementally)
  private dbOps?: any; // Will be DrizzleTelemetryOperations when available
  private dataIntegrity?: any;
  private analytics?: any;
  private exportService?: any;

  // Security and reliability properties
  private piiConfig: PIIDetectionConfig;
  private retentionConfig: DataRetentionConfig;
  private rateLimiter: Map<string, { count: number; lastReset: number }>;
  private circuitBreaker: { isOpen: boolean; failureCount: number; lastFailureTime: number };
  private retryQueue: Array<{ operation: () => Promise<void>; attempts: number; lastAttempt: number }>;

  // Monitoring and observability properties
  private logger: Logger;
  private healthStatus: HealthStatus;
  private metrics: TelemetryMetrics;
  private alertingEnabled: boolean;

  constructor(config: TelemetryConfig, sessionId?: string) {
    super(); // Call EventEmitter constructor
    this.config = config;
    this.sessionId = sessionId || this.generateSessionId();

    // Initialize monitoring and observability
    this.logger = new Logger(config.serviceName || 'vibekit-telemetry', LogLevel.INFO);
    this.alertingEnabled = config.resourceAttributes?.['telemetry.alerting'] === 'true' || false;
    
    this.healthStatus = {
      status: 'healthy',
      lastCheck: Date.now(),
      checks: {
        database: { status: 'unknown', activeConnections: 0 },
        opentelemetry: { status: 'unknown' },
        rateLimiter: { status: 'healthy', activeConnections: 0 },
        circuitBreaker: { status: 'healthy', isOpen: false, failureCount: 0 },
        retryQueue: { status: 'healthy', queueSize: 0 },
      },
    };

    this.metrics = {
      events: { total: 0, start: 0, stream: 0, end: 0, error: 0 },
      performance: { avgLatency: 0, p95Latency: 0, throughput: 0 },
      errors: { total: 0, circuitBreakerTrips: 0, rateLimitHits: 0, retryQueueOverflows: 0 },
      health: { uptime: Date.now(), lastHealthCheck: Date.now() },
    };

    // Initialize security configurations
    this.piiConfig = {
      enableEmailDetection: true,
      enablePhoneDetection: true,
      enableSSNDetection: true,
      enableCreditCardDetection: true,
      enableApiKeyDetection: true,
      customPatterns: [
        { name: 'API_KEY', regex: /\b[A-Za-z0-9]{32,}\b/g, replacement: '[API_KEY_REDACTED]' },
        { name: 'JWT_TOKEN', regex: /eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/g, replacement: '[JWT_REDACTED]' },
      ]
    };

    this.retentionConfig = {
      maxAgeDays: config.localStore?.pruneDays || 30,
      maxSizeMB: config.localStore?.maxSizeMB || 100,
      compressionEnabled: true,
    };

    this.rateLimiter = new Map();
    this.circuitBreaker = { isOpen: false, failureCount: 0, lastFailureTime: 0 };
    this.retryQueue = [];

    this.logger.info('TelemetryService initialized', {
      sessionId: this.sessionId,
      isEnabled: this.config.isEnabled,
      localStoreEnabled: this.config.localStore?.isEnabled,
    });

    if (this.config.isEnabled) {
      this.initializeOpenTelemetry();
    }

    // Initialize local storage if configured (non-blocking)
    if (this.config.localStore?.isEnabled) {
      this.initializeDrizzleDB().catch(error => {
        this.logger.warn('Local telemetry storage initialization failed', { error: error.message });
      });
    }

    // Start background maintenance tasks
    this.startMaintenanceTasks();

    // Temporary: Add event listeners for testing real-time events
    this.on('new:start', (data) => console.log('🟢 Event emitted: new:start', { sessionId: data.sessionId, agentType: data.agentType }));
    this.on('new:stream', (data) => console.log('🔵 Event emitted: new:stream', { sessionId: data.sessionId, streamLength: data.streamData?.length }));
    this.on('new:end', (data) => console.log('🔴 Event emitted: new:end', { sessionId: data.sessionId, agentType: data.agentType }));
    this.on('new:error', (data) => console.log('⚠️ Event emitted: new:error', { sessionId: data.sessionId, error: data.error }));
    this.on('update:metrics', (metrics) => console.log('📊 Event emitted: update:metrics', { totalEvents: metrics.events.total }));
    this.on('update:health', (health) => console.log('💚 Event emitted: update:health', { status: health.status }));
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
    if (!this.config.isEnabled) {
      return;
    }

    // Apply rate limiting
    const rateLimitKey = `${agentType}:${this.sessionId}`;
    if (!this.checkRateLimit(rateLimitKey)) {
      console.warn('Rate limit exceeded for trackStart');
      return;
    }

    // Sanitize sensitive data
    const sanitizedPrompt = this.sanitizeData(prompt);
    const sanitizedMetadata = metadata ? this.sanitizeMetadata(metadata) : undefined;

    const trackingOperation = async () => {
      // Use sessionId from metadata if provided, otherwise use instance sessionId
      const sessionId = metadata?.sessionId || this.sessionId;

      // Phase 3: Create session record if Drizzle is available
      if (this.dbOps) {
        await this.createSessionRecord(agentType, mode, sanitizedPrompt, sanitizedMetadata, sessionId);
      }

      // Original OpenTelemetry tracking (preserved) with circuit breaker - only if tracer available
      if (this.tracer) {
        await this.executeWithCircuitBreaker(async () => {
          const span = this.createSpan(
            `vibekit.start`,
            agentType,
            mode,
            sanitizedPrompt,
            sanitizedMetadata
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
        });
      }

      // Phase 3: Persist event to database if available
      if (this.dbOps) {
        await this.persistEvent({
          sessionId: sessionId,
          agentType,
          mode,
          prompt: sanitizedPrompt,
          timestamp: Date.now(),
          eventType: "start",
          metadata: sanitizedMetadata,
        });
      }

      // Emit real-time event for WebSocket broadcasting
      this.emit('new:start', { 
        sessionId: sessionId, 
        agentType, 
        mode, 
        prompt: sanitizedPrompt, 
        metadata: sanitizedMetadata, 
        timestamp: Date.now() 
      });
    };

    const startTime = Date.now();
    try {
      await trackingOperation();
      // Update metrics on success
      const latency = Date.now() - startTime;
      this.updateEventMetrics("start", latency);
      this.logger.debug('Start event tracked successfully', {
        agentType,
        sessionId: this.sessionId,
        latency,
      });
    } catch (error) {
      this.logger.error("Failed to track start event", { error, agentType, sessionId: this.sessionId });
      this.metrics.errors.total++;
      // Queue for retry
      this.queueForRetry(trackingOperation);
      // Check for alerts
      this.checkAndTriggerAlerts();
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
    if (!this.config.isEnabled) {
      return;
    }

    // Apply rate limiting (more permissive for stream events)
    const rateLimitKey = `stream:${agentType}:${this.sessionId}`;
    if (!this.checkRateLimit(rateLimitKey, 500)) { // Higher limit for stream events
      console.warn('Rate limit exceeded for trackStream');
      return;
    }

    // Sanitize sensitive data
    const sanitizedPrompt = this.sanitizeData(prompt);
    const sanitizedStreamData = this.sanitizeData(streamData);
    const sanitizedMetadata = metadata ? this.sanitizeMetadata(metadata) : undefined;
    const sanitizedSandboxId = sandboxId ? this.sanitizeData(sandboxId) : undefined;
    const sanitizedRepoUrl = repoUrl ? this.sanitizeData(repoUrl) : undefined;

    const trackingOperation = async () => {
      // Use sessionId from metadata if provided, otherwise use instance sessionId
      const sessionId = metadata?.sessionId || this.sessionId;

      // Original OpenTelemetry tracking (preserved) with circuit breaker - only if tracer available
      if (this.tracer) {
        await this.executeWithCircuitBreaker(async () => {
          const span = this.createSpan(`vibekit.stream`, agentType, mode, sanitizedPrompt, {
            "vibekit.sandbox_id": sanitizedSandboxId || "",
            "vibekit.repo_url": sanitizedRepoUrl || "",
            "vibekit.stream_data_length": sanitizedStreamData.length,
            ...sanitizedMetadata,
          });

          if (span) {
            // Add stream data as an event
            span.addEvent("stream_data", {
              "vibekit.event_type": "stream",
              "stream.data": sanitizedStreamData,
              timestamp: Date.now(),
            });

            // End span immediately for stream events
            span.setStatus({ code: SpanStatusCode.OK });
            span.end();
          }
        });
      }

      // Phase 3: Persist stream event to database if available
      if (this.dbOps) {
        await this.persistEvent({
          sessionId: sessionId,
          agentType,
          mode,
          prompt: sanitizedPrompt,
          timestamp: Date.now(),
          eventType: "stream",
          sandboxId: sanitizedSandboxId,
          repoUrl: sanitizedRepoUrl,
          streamData: sanitizedStreamData,
          metadata: sanitizedMetadata,
        });
      }

      // Emit real-time event for WebSocket broadcasting
      this.emit('new:stream', { 
        sessionId: sessionId, 
        agentType, 
        mode, 
        prompt: sanitizedPrompt, 
        streamData: sanitizedStreamData,
        sandboxId: sanitizedSandboxId,
        repoUrl: sanitizedRepoUrl,
        metadata: sanitizedMetadata, 
        timestamp: Date.now() 
      });
    };

    try {
      await trackingOperation();
    } catch (error) {
      console.warn("Failed to track stream event:", error);
      // Queue for retry with lower priority (streams are less critical)
      if (Math.random() < 0.1) { // Only retry 10% of failed stream events
        this.queueForRetry(trackingOperation);
      }
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
    if (!this.config.isEnabled) {
      return;
    }

    // Apply rate limiting
    const rateLimitKey = `${agentType}:${this.sessionId}`;
    if (!this.checkRateLimit(rateLimitKey)) {
      console.warn('Rate limit exceeded for trackEnd');
      return;
    }

    // Sanitize sensitive data
    const sanitizedPrompt = this.sanitizeData(prompt);
    const sanitizedMetadata = metadata ? this.sanitizeMetadata(metadata) : undefined;
    const sanitizedSandboxId = sandboxId ? this.sanitizeData(sandboxId) : undefined;
    const sanitizedRepoUrl = repoUrl ? this.sanitizeData(repoUrl) : undefined;

    const trackingOperation = async () => {
      // Use sessionId from metadata if provided, otherwise use instance sessionId
      const sessionId = metadata?.sessionId || this.sessionId;

      // Original OpenTelemetry tracking (preserved) with circuit breaker - only if tracer available
      if (this.tracer) {
        await this.executeWithCircuitBreaker(async () => {
          const span = this.createSpan(`vibekit.end`, agentType, mode, sanitizedPrompt, {
            "vibekit.sandbox_id": sanitizedSandboxId || "",
            "vibekit.repo_url": sanitizedRepoUrl || "",
            ...sanitizedMetadata,
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
        });
      }

      // Phase 3: Persist end event and update session
      if (this.dbOps) {
        await this.persistEvent({
          sessionId: sessionId,
          agentType,
          mode,
          prompt: sanitizedPrompt,
          timestamp: Date.now(),
          eventType: "end",
          sandboxId: sanitizedSandboxId,
          repoUrl: sanitizedRepoUrl,
          metadata: sanitizedMetadata,
        });

        // Update session status to completed
        await this.updateSessionRecord(sessionId, {
          status: 'completed',
          endTime: Date.now(),
        });
      }

      // Emit real-time event for WebSocket broadcasting
      this.emit('new:end', { 
        sessionId: sessionId, 
        agentType, 
        mode, 
        prompt: sanitizedPrompt, 
        sandboxId: sanitizedSandboxId,
        repoUrl: sanitizedRepoUrl,
        metadata: sanitizedMetadata, 
        timestamp: Date.now() 
      });
    };

    try {
      await trackingOperation();
    } catch (error) {
      console.warn("Failed to track end event:", error);
      // End events are critical - always retry
      this.queueForRetry(trackingOperation);
    }
  }

  public async trackError(
    agentType: string,
    mode: string,
    prompt: string,
    error: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    if (!this.config.isEnabled) {
      return;
    }

    // Skip rate limiting for error events - errors are always important
    
    // Sanitize sensitive data
    const sanitizedPrompt = this.sanitizeData(prompt);
    const sanitizedError = this.sanitizeData(error);
    const sanitizedMetadata = metadata ? this.sanitizeMetadata(metadata) : undefined;

    const trackingOperation = async () => {
      // Use sessionId from metadata if provided, otherwise use instance sessionId
      const sessionId = metadata?.sessionId || this.sessionId;

      // Original OpenTelemetry tracking (preserved) with circuit breaker - only if tracer available
      if (this.tracer) {
        await this.executeWithCircuitBreaker(async () => {
          const span = this.createSpan(
            `vibekit.error`,
            agentType,
            mode,
            sanitizedPrompt,
            sanitizedMetadata
          );

          if (span) {
            // Record the error
            span.recordException(new Error(sanitizedError));

            // Add error event
            span.addEvent("error_occurred", {
              "vibekit.event_type": "error",
              "error.message": sanitizedError,
              timestamp: Date.now(),
            });

            // Set error status
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: sanitizedError,
            });

            span.end();
          }
        });
      }

      // Phase 3: Persist error event and update session
      if (this.dbOps) {
        await this.persistEvent({
          sessionId: sessionId,
          agentType,
          mode,
          prompt: sanitizedPrompt,
          timestamp: Date.now(),
          eventType: "error",
          metadata: {
            ...sanitizedMetadata,
            error: sanitizedError,
          },
        });

        // Update session status to error
        await this.updateSessionRecord(sessionId, {
          status: 'error',
          endTime: Date.now(),
        });
      }

      // Emit real-time event for WebSocket broadcasting
      this.emit('new:error', { 
        sessionId: sessionId, 
        agentType, 
        mode, 
        prompt: sanitizedPrompt, 
        error: sanitizedError,
        metadata: {
          ...sanitizedMetadata,
          error: sanitizedError,
        }, 
        timestamp: Date.now() 
      });
    };

    try {
      await trackingOperation();
    } catch (err) {
      console.warn("Failed to track error event:", err);
      // Error events are critical - always retry
      this.queueForRetry(trackingOperation);
    }
  }

  /**
   * Initialize Drizzle database for local storage (Phase 2: Actual initialization)
   */
  private async initializeDrizzleDB(): Promise<void> {
    console.log('🔍 Initializing Drizzle telemetry database...');
    
    try {
      // Try to dynamically import Drizzle components
      const { DrizzleTelemetryOperations } = await import('@vibe-kit/db');
      
      console.log('✅ Drizzle telemetry components loaded');
      
      // Phase 2: Actually initialize the database
      const dbPath = resolve(this.config.localStore?.path || '.vibekit/telemetry.db');
      
      // Initialize database with Drizzle
      const database = new BetterSQLite3(dbPath);
      const db = drizzle(database);
      
      // Initialize DrizzleTelemetryOperations - using type assertion to bypass TypeScript errors
      const dbOps = new DrizzleTelemetryOperations(db as any);
      await dbOps.initialize();
      
      // Only set this.dbOps if everything succeeded
      this.dbOps = dbOps;
      
      // Load historical metrics from database
      await this.loadHistoricalMetrics();
      
      console.log('✅ Drizzle telemetry database initialized successfully');
      console.log('📊 Local storage and analytics now available');
      
    } catch (error: any) {
      console.warn('⚠️  Drizzle telemetry initialization failed:', error.message);
      console.log('📡 Continuing with OpenTelemetry-only mode');
    }
  }

  /**
   * Load historical metrics from database
   */
  private async loadHistoricalMetrics(): Promise<void> {
    if (!this.dbOps) {
      console.log('⚠️ dbOps not available, skipping historical metrics loading');
      return;
    }

    try {
      console.log('📊 Loading historical metrics from database...');
      
      // Check what methods are available on dbOps
      console.log('🔍 dbOps available methods:', Object.keys(this.dbOps));
      
      // Try to get events directly
      let allEvents = null;
      let sessions = null;
      
      try {
        console.log('🔍 Attempting to query events...');
        allEvents = await this.dbOps.queryEvents?.({});
        console.log(`📈 Found ${allEvents?.length || 0} events via queryEvents`);
      } catch (e) {
        console.log('❌ Error querying events:', e);
      }
      
      try {
        console.log('🔍 Attempting to query sessions...');
        sessions = await this.dbOps.querySessions?.({});
        console.log(`📊 Found ${sessions?.length || 0} sessions via querySessions`);
      } catch (e) {
        console.log('❌ Error querying sessions:', e);
      }
      
      // Try direct database query as fallback
      try {
        console.log('🔍 Attempting direct database access...');
        if (this.dbOps.db) {
          console.log('✅ Database connection available');
          
          // Try to get events using raw SQL
          try {
            const events = await this.dbOps.db.select().from('telemetry_events').all();
            console.log(`📈 Found ${events?.length || 0} events via direct query`);
            
            if (events && events.length > 0) {
              // Calculate metrics from direct query
              let startEvents = 0;
              let streamEvents = 0;
              let endEvents = 0;
              let errorEvents = 0;
              
              for (const event of events) {
                const eventType = event.event_type || event.eventType;
                switch (eventType) {
                  case 'start':
                    startEvents++;
                    break;
                  case 'stream':
                    streamEvents++;
                    break;
                  case 'end':
                    endEvents++;
                    break;
                  case 'error':
                    errorEvents++;
                    break;
                }
              }
              
              const totalEvents = events.length;
              
              // Update in-memory metrics
              this.metrics.events.total = totalEvents;
              this.metrics.events.start = startEvents;
              this.metrics.events.stream = streamEvents;
              this.metrics.events.end = endEvents;
              this.metrics.events.error = errorEvents;
              
              console.log('✅ Historical metrics loaded via direct database query');
              console.log(`📊 Total events: ${totalEvents}, Start: ${startEvents}, Stream: ${streamEvents}, End: ${endEvents}, Error: ${errorEvents}`);
              
              // Emit update event
              this.emit('update:metrics', this.metrics);
              return;
            }
          } catch (e) {
            console.log('❌ Error with direct database query:', e);
          }
        }
      } catch (e) {
        console.log('❌ Error with direct database access:', e);
      }
      
      // If we have events from query methods, use them
      if (allEvents && allEvents.length > 0) {
        console.log(`📈 Processing ${allEvents.length} events from queryEvents`);
        
        // Calculate metrics from events
        let startEvents = 0;
        let streamEvents = 0;
        let endEvents = 0;
        let errorEvents = 0;
        
        for (const event of allEvents) {
          const eventType = event.event_type || event.eventType;
          switch (eventType) {
            case 'start':
              startEvents++;
              break;
            case 'stream':
              streamEvents++;
              break;
            case 'end':
              endEvents++;
              break;
            case 'error':
              errorEvents++;
              break;
          }
        }
        
        const totalEvents = allEvents.length;
        
        // Update in-memory metrics
        this.metrics.events.total = totalEvents;
        this.metrics.events.start = startEvents;
        this.metrics.events.stream = streamEvents;
        this.metrics.events.end = endEvents;
        this.metrics.events.error = errorEvents;
        
        console.log('✅ Historical metrics loaded successfully');
        console.log(`📊 Total events: ${totalEvents}, Start: ${startEvents}, Stream: ${streamEvents}, End: ${endEvents}, Error: ${errorEvents}`);
        
        // Emit update event
        this.emit('update:metrics', this.metrics);
      } else if (sessions && sessions.length > 0) {
        console.log(`📊 Processing ${sessions.length} sessions for event counting`);
        
        // Fallback to session-based counting
        let totalEvents = 0;
        let startEvents = 0;
        let streamEvents = 0;
        let endEvents = 0;
        let errorEvents = 0;
        
        for (const session of sessions) {
          try {
            const sessionEvents = await this.dbOps.queryEvents?.({ sessionId: session.id });
            if (sessionEvents) {
              totalEvents += sessionEvents.length;
              
              for (const event of sessionEvents) {
                const eventType = event.event_type || event.eventType;
                switch (eventType) {
                  case 'start':
                    startEvents++;
                    break;
                  case 'stream':
                    streamEvents++;
                    break;
                  case 'end':
                    endEvents++;
                    break;
                  case 'error':
                    errorEvents++;
                    break;
                }
              }
            }
          } catch (e) {
            console.log(`❌ Error processing session ${session.id}:`, e);
          }
        }
        
        // Update in-memory metrics
        this.metrics.events.total = totalEvents;
        this.metrics.events.start = startEvents;
        this.metrics.events.stream = streamEvents;
        this.metrics.events.end = endEvents;
        this.metrics.events.error = errorEvents;
        
        console.log('✅ Historical metrics loaded via session-based counting');
        console.log(`📊 Total events: ${totalEvents}, Start: ${startEvents}, Stream: ${streamEvents}, End: ${endEvents}, Error: ${errorEvents}`);
        
        // Emit update event
        this.emit('update:metrics', this.metrics);
      } else {
        console.log('ℹ️ No historical data found in database');
      }
    } catch (error) {
      console.warn('❌ Failed to load historical metrics:', error);
    }
  }

  /**
   * Create session record in database (Phase 3)
   */
  private async createSessionRecord(
    agentType: string,
    mode: string,
    prompt: string,
    metadata?: Record<string, any>,
    sessionId?: string
  ): Promise<void> {
    if (!this.dbOps) return;

    try {
      const effectiveSessionId = sessionId || this.sessionId;
      await this.dbOps.createSession({
        id: effectiveSessionId,
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

  // ========================================
  // PRODUCTION READINESS: HEALTH CHECKS & MONITORING
  // ========================================

  /**
   * Perform comprehensive health check
   */
  public async getHealthStatus(): Promise<HealthStatus> {
    const startTime = Date.now();

    // Update health check timestamp
    this.healthStatus.lastCheck = startTime;
    this.metrics.health.lastHealthCheck = startTime;

    // Check database health
    await this.checkDatabaseHealth();

    // Check OpenTelemetry health
    await this.checkOpenTelemetryHealth();

    // Check rate limiter health
    this.checkRateLimiterHealth();

    // Check circuit breaker health
    this.checkCircuitBreakerHealth();

    // Check retry queue health
    this.checkRetryQueueHealth();

    // Determine overall health status
    this.updateOverallHealthStatus();

    const duration = Date.now() - startTime;
    this.logger.debug('Health check completed', { duration, status: this.healthStatus.status });

    // Emit real-time health update for WebSocket broadcasting
    this.emit('update:health', this.healthStatus);

    return { ...this.healthStatus };
  }

  /**
   * Get current telemetry metrics
   */
  public getTelemetryMetrics(): TelemetryMetrics {
    // Calculate throughput (events per second over last minute)
    const uptime = Date.now() - this.metrics.health.uptime;
    const uptimeSeconds = uptime / 1000;
    this.metrics.performance.throughput = uptimeSeconds > 0 ? this.metrics.events.total / uptimeSeconds : 0;

    return { ...this.metrics };
  }

  /**
   * Reset telemetry metrics
   */
  public resetMetrics(): void {
    this.metrics = {
      events: { total: 0, start: 0, stream: 0, end: 0, error: 0 },
      performance: { avgLatency: 0, p95Latency: 0, throughput: 0 },
      errors: { total: 0, circuitBreakerTrips: 0, rateLimitHits: 0, retryQueueOverflows: 0 },
      health: { uptime: Date.now(), lastHealthCheck: Date.now() },
    };
    this.logger.info('Telemetry metrics reset');
  }

  /**
   * Update event metrics
   */
  private updateEventMetrics(eventType: "start" | "stream" | "end" | "error", latency?: number): void {
    this.metrics.events.total++;
    this.metrics.events[eventType]++;

    if (latency !== undefined) {
      // Simple moving average for latency
      this.metrics.performance.avgLatency = 
        (this.metrics.performance.avgLatency * (this.metrics.events.total - 1) + latency) / this.metrics.events.total;
    }

    // Emit real-time metrics update for WebSocket broadcasting
    this.emit('update:metrics', this.metrics);
  }

  /**
   * Check database health
   */
  private async checkDatabaseHealth(): Promise<void> {
    if (!this.dbOps) {
      this.healthStatus.checks.database = { status: 'disabled' };
      return;
    }

    const startTime = Date.now();
    try {
      // Simple health check query
      await this.dbOps.getDatabaseStats?.();
      const latency = Date.now() - startTime;
      
      this.healthStatus.checks.database = {
        status: latency < 100 ? 'healthy' : 'degraded',
        latency,
        activeConnections: 1, // SQLite is single connection
      };
    } catch (error: any) {
      this.healthStatus.checks.database = {
        status: 'unhealthy',
        error: error.message,
        latency: Date.now() - startTime,
      };
    }
  }

  /**
   * Check OpenTelemetry health
   */
  private async checkOpenTelemetryHealth(): Promise<void> {
    if (!this.tracer || !this.config.endpoint) {
      this.healthStatus.checks.opentelemetry = { status: 'disabled' };
      return;
    }

    const startTime = Date.now();
    try {
      // Create a test span to verify OpenTelemetry is working
      const testSpan = this.tracer.startSpan('health_check');
      testSpan.setStatus({ code: SpanStatusCode.OK });
      testSpan.end();

      const latency = Date.now() - startTime;
      this.healthStatus.checks.opentelemetry = {
        status: latency < 50 ? 'healthy' : 'degraded',
        latency,
      };
    } catch (error: any) {
      this.healthStatus.checks.opentelemetry = {
        status: 'unhealthy',
        error: error.message,
        latency: Date.now() - startTime,
      };
    }
  }

  /**
   * Check rate limiter health
   */
  private checkRateLimiterHealth(): void {
    const activeConnections = this.rateLimiter.size;
    
    this.healthStatus.checks.rateLimiter = {
      status: activeConnections < 1000 ? 'healthy' : 'degraded',
      activeConnections,
    };
  }

  /**
   * Check circuit breaker health
   */
  private checkCircuitBreakerHealth(): void {
    this.healthStatus.checks.circuitBreaker = {
      status: this.circuitBreaker.isOpen ? 'degraded' : 'healthy',
      isOpen: this.circuitBreaker.isOpen,
      failureCount: this.circuitBreaker.failureCount,
    };
  }

  /**
   * Check retry queue health
   */
  private checkRetryQueueHealth(): void {
    const queueSize = this.retryQueue.length;
    
    this.healthStatus.checks.retryQueue = {
      status: queueSize < 100 ? 'healthy' : queueSize < 500 ? 'degraded' : 'unhealthy',
      queueSize,
    };
  }

  /**
   * Update overall health status based on individual checks
   */
  private updateOverallHealthStatus(): void {
    const checks = Object.values(this.healthStatus.checks);
    const unhealthyCount = checks.filter(check => check.status === 'unhealthy').length;
    const degradedCount = checks.filter(check => check.status === 'degraded').length;

    if (unhealthyCount > 0) {
      this.healthStatus.status = 'unhealthy';
    } else if (degradedCount > 1) {
      this.healthStatus.status = 'degraded';
    } else {
      this.healthStatus.status = 'healthy';
    }
  }

  /**
   * Check if alerting should be triggered
   */
  private checkAndTriggerAlerts(): void {
    if (!this.alertingEnabled) return;

    // Circuit breaker alert
    if (this.circuitBreaker.isOpen) {
      this.logger.critical('Circuit breaker is open', {
        failureCount: this.circuitBreaker.failureCount,
        lastFailureTime: this.circuitBreaker.lastFailureTime,
      });
    }

    // Retry queue overflow alert
    if (this.retryQueue.length > 500) {
      this.logger.critical('Retry queue is overflowing', {
        queueSize: this.retryQueue.length,
      });
      this.metrics.errors.retryQueueOverflows++;
    }

    // High error rate alert
    const errorRate = this.metrics.events.total > 0 ? this.metrics.events.error / this.metrics.events.total : 0;
    if (errorRate > 0.1) { // 10% error rate
      this.logger.critical('High error rate detected', {
        errorRate: `${(errorRate * 100).toFixed(2)}%`,
        totalEvents: this.metrics.events.total,
        errorEvents: this.metrics.events.error,
      });
    }
  }

  /**
   * Enhanced getAnalyticsDashboard with production metrics
   */
  public async getAnalyticsDashboard(timeWindow: 'hour' | 'day' | 'week' = 'day'): Promise<any> {
    // Get health status
    const health = await this.getHealthStatus();
    const metrics = this.getTelemetryMetrics();

    // Get real-time metrics in the format expected by CLI
    const realTimeMetrics = await this.getRealTimeMetrics();

    // Phase 2: Check if Drizzle is available and use it
    if (this.dbOps) {
      try {
        this.logger.info('Generating analytics dashboard from local database');
        
        // Try to get basic analytics from Drizzle
        const sessionSummaries = await this.dbOps.querySessions?.({ limit: 10 });
        const totalSessions = sessionSummaries?.length || 0;
        
        return {
          timeWindow,
          overview: {
            totalSessions,
            totalEvents: metrics.events.total,
            avgResponseTime: metrics.performance.avgLatency,
            errorRate: metrics.events.total > 0 ? (metrics.events.error / metrics.events.total) * 100 : 0,
            throughput: metrics.performance.throughput,
          },
          health: {
            status: health.status,
            checks: health.checks,
          },
          realTime: realTimeMetrics,
          performance: [], // Empty array for now
          sessionSummaries: sessionSummaries || [],
          anomalies: [], // Empty array for now
          topAgents: [], // Will be implemented in Phase 3
          message: 'Production analytics dashboard with health monitoring',
          source: 'drizzle',
          lastUpdated: Date.now(),
        };
        
      } catch (error: any) {
        this.logger.warn('Failed to get analytics from local database', { error: error.message });
        // Fall through to OpenTelemetry-only response
      }
    }
    
    // Fallback: OpenTelemetry-only mode with basic metrics
    this.logger.warn('Analytics dashboard in OpenTelemetry-only mode');
    return {
      timeWindow,
      overview: {
        totalSessions: 0,
        totalEvents: metrics.events.total,
        avgResponseTime: metrics.performance.avgLatency,
        errorRate: metrics.events.total > 0 ? (metrics.events.error / metrics.events.total) * 100 : 0,
        throughput: metrics.performance.throughput,
      },
      health: {
        status: health.status,
        checks: health.checks,
      },
      realTime: realTimeMetrics,
      performance: [], // Empty array for now
      sessionSummaries: [],
      anomalies: [], // Empty array for now
      topAgents: [],
      message: 'Limited analytics - local storage required for full features',
      source: 'opentelemetry-only',
      lastUpdated: Date.now(),
    };
  }

     /**
    * Sanitize sensitive data from telemetry data
    */
   private sanitizeData(data: string): string {
     let sanitized = data;

     if (this.piiConfig.enableEmailDetection) {
       sanitized = sanitized.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL_REDACTED]');
     }

     if (this.piiConfig.enablePhoneDetection) {
       sanitized = sanitized.replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[PHONE_REDACTED]');
     }

     if (this.piiConfig.enableSSNDetection) {
       sanitized = sanitized.replace(/\b\d{3}-?\d{2}-?\d{4}\b/g, '[SSN_REDACTED]');
     }

     if (this.piiConfig.enableCreditCardDetection) {
       sanitized = sanitized.replace(/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, '[CARD_REDACTED]');
     }

     // Apply custom patterns
     for (const pattern of this.piiConfig.customPatterns) {
       sanitized = sanitized.replace(pattern.regex, pattern.replacement);
     }

     return sanitized;
   }

   /**
    * Sanitize metadata object recursively
    */
   private sanitizeMetadata(metadata: Record<string, any>): Record<string, any> {
     const sanitized: Record<string, any> = {};

     for (const [key, value] of Object.entries(metadata)) {
       if (typeof value === 'string') {
         sanitized[key] = this.sanitizeData(value);
       } else if (typeof value === 'object' && value !== null) {
         if (Array.isArray(value)) {
           sanitized[key] = value.map(item => 
             typeof item === 'string' ? this.sanitizeData(item) : 
             typeof item === 'object' && item !== null ? this.sanitizeMetadata(item) : item
           );
         } else {
           sanitized[key] = this.sanitizeMetadata(value);
         }
       } else {
         sanitized[key] = value;
       }
     }

     return sanitized;
   }

  /**
   * Check rate limiting for a given identifier
   */
  private checkRateLimit(identifier: string, maxRequestsPerMinute: number = 100): boolean {
    const now = Date.now();
    const windowMs = 60 * 1000; // 1 minute

    const current = this.rateLimiter.get(identifier) || { count: 0, lastReset: now };

    // Reset if window has passed
    if (now - current.lastReset > windowMs) {
      current.count = 0;
      current.lastReset = now;
    }

    if (current.count >= maxRequestsPerMinute) {
      return false; // Rate limited
    }

    current.count++;
    this.rateLimiter.set(identifier, current);
    return true;
  }

  /**
   * Circuit breaker pattern for external service calls
   */
  private async executeWithCircuitBreaker<T>(operation: () => Promise<T>): Promise<T | null> {
    const circuitBreakerThreshold = 5;
    const circuitBreakerTimeoutMs = 30000; // 30 seconds

    // Check if circuit breaker is open
    if (this.circuitBreaker.isOpen) {
      const timeSinceLastFailure = Date.now() - this.circuitBreaker.lastFailureTime;
      if (timeSinceLastFailure < circuitBreakerTimeoutMs) {
        console.warn('Circuit breaker is open, skipping operation');
        return null;
      } else {
        // Reset circuit breaker
        this.circuitBreaker.isOpen = false;
        this.circuitBreaker.failureCount = 0;
      }
    }

    try {
      const result = await operation();
      // Reset failure count on success
      this.circuitBreaker.failureCount = 0;
      return result;
    } catch (error) {
      this.circuitBreaker.failureCount++;
      this.circuitBreaker.lastFailureTime = Date.now();

      if (this.circuitBreaker.failureCount >= circuitBreakerThreshold) {
        this.circuitBreaker.isOpen = true;
        console.error('Circuit breaker opened due to repeated failures');
      }

      throw error;
    }
  }

  /**
   * Add operation to retry queue
   */
  private queueForRetry(operation: () => Promise<void>, maxRetries: number = 3): void {
    if (this.retryQueue.length > 1000) {
      console.warn('Retry queue is full, dropping oldest operations');
      this.retryQueue.shift();
    }

    this.retryQueue.push({
      operation,
      attempts: 0,
      lastAttempt: Date.now(),
    });
  }

  /**
   * Process retry queue
   */
  private async processRetryQueue(): Promise<void> {
    const maxRetries = 3;
    const retryDelayMs = 5000; // 5 seconds
    const now = Date.now();

    for (let i = this.retryQueue.length - 1; i >= 0; i--) {
      const item = this.retryQueue[i];

      // Skip if not enough time has passed since last attempt
      if (now - item.lastAttempt < retryDelayMs) {
        continue;
      }

      try {
        await item.operation();
        // Success - remove from queue
        this.retryQueue.splice(i, 1);
      } catch (error) {
        item.attempts++;
        item.lastAttempt = now;

        if (item.attempts >= maxRetries) {
          console.error('Operation failed after maximum retries:', error);
          this.retryQueue.splice(i, 1);
        }
      }
    }
  }

  /**
   * Start background maintenance tasks
   */
  private startMaintenanceTasks(): void {
    // Process retry queue every 10 seconds
    setInterval(() => {
      this.processRetryQueue().catch(error => {
        console.warn('Error processing retry queue:', error);
      });
    }, 10000);

    // Clean up rate limiter every 5 minutes
    setInterval(() => {
      const now = Date.now();
      const windowMs = 60 * 1000;

      for (const [key, value] of this.rateLimiter.entries()) {
        if (now - value.lastReset > windowMs * 5) {
          this.rateLimiter.delete(key);
        }
      }
    }, 5 * 60 * 1000);

    // Data retention cleanup every hour
    setInterval(() => {
      this.performDataMaintenance().catch(error => {
        this.logger.warn('Error during data maintenance', { error: error.message });
      });
    }, 60 * 60 * 1000);

    // Health checks every 5 minutes
    setInterval(() => {
      this.getHealthStatus().catch(error => {
        this.logger.warn('Error during health check', { error: error.message });
      });
    }, 5 * 60 * 1000);

    // Alerting checks every minute
    setInterval(() => {
      this.checkAndTriggerAlerts();
    }, 60 * 1000);
  }

  /**
   * Perform data maintenance tasks
   */
  private async performDataMaintenance(): Promise<void> {
    if (!this.dbOps) return;

    try {
      // Clean up old records
      const cutoffTime = Date.now() - (this.retentionConfig.maxAgeDays * 24 * 60 * 60 * 1000);
      await this.dbOps.deleteOldRecords?.(cutoffTime);

      // Check database size and compress if needed
      const dbStats = await this.dbOps.getDatabaseStats?.();
      if (dbStats?.sizeMB > this.retentionConfig.maxSizeMB) {
        console.log('Database size exceeded limit, performing compression');
        await this.dbOps.compressDatabase?.();
      }
    } catch (error) {
      console.warn('Data maintenance failed:', error);
    }
  }

  /**
   * Get real-time metrics for CLI stats command
   */
  public async getRealTimeMetrics(): Promise<any[]> {
    const metrics = this.getTelemetryMetrics();
    
    return [
      {
        metric: 'Total Events',
        value: metrics.events.total,
        type: 'counter'
      },
      {
        metric: 'Start Events',
        value: metrics.events.start,
        type: 'counter'
      },
      {
        metric: 'Stream Events', 
        value: metrics.events.stream,
        type: 'counter'
      },
      {
        metric: 'End Events',
        value: metrics.events.end,
        type: 'counter'
      },
      {
        metric: 'Error Events',
        value: metrics.events.error,
        type: 'counter'
      },
      {
        metric: 'Average Latency (ms)',
        value: Math.round(metrics.performance.avgLatency),
        type: 'gauge'
      },
      {
        metric: 'Throughput (events/sec)',
        value: parseFloat(metrics.performance.throughput.toFixed(2)),
        type: 'gauge'
      },
      {
        metric: 'Error Rate (%)',
        value: metrics.events.total > 0 ? 
          parseFloat(((metrics.events.error / metrics.events.total) * 100).toFixed(2)) : 0,
        type: 'gauge'
      }
    ];
  }

  /**
   * Get analytics service information
   */
  public getAnalyticsInfo(): { status: string; enabled: boolean; source: string } {
    return {
      status: this.dbOps ? 'enabled' : 'disabled',
      enabled: this.dbOps !== undefined,
      source: this.dbOps ? 'local-database' : 'opentelemetry-only'
    };
  }

  /**
   * Get export service information
   */
  public getExportInfo(): { status: string; enabled: boolean; formats: string[] } {
    return {
      status: this.dbOps ? 'enabled' : 'disabled', 
      enabled: this.dbOps !== undefined,
      formats: this.dbOps ? ['json', 'csv', 'otlp'] : []
    };
  }

  /**
   * Get export service instance (for CLI export command)
   */
  public getExportService(): any {
    return this.dbOps ? this : null;
  }

  /**
   * Export data method (placeholder implementation)
   */
  public async exportData(filter: any, config: any): Promise<any> {
    if (!this.dbOps) {
      throw new Error('Export service not available - local store must be enabled');
    }

    // Basic implementation - could be enhanced with actual export logic
    const stats = {
      totalRecords: 0,
      size: 0
    };

    return {
      config,
      stats,
      success: true
    };
  }

  /**
   * Get session summaries (for CLI query command)
   */
  public async getSessionSummaries(filterOptions: any): Promise<any[]> {
    if (!this.dbOps) {
      return [];
    }

    try {
      // Try to get sessions from database if available
      const sessions = await this.dbOps.querySessions?.(filterOptions);
      return sessions || [];
    } catch (error) {
      console.warn('Failed to get session summaries:', error);
      return [];
    }
  }

  /**
   * Get database operations instance (for advanced operations like refreshAllSessionStats)
   */
  public getDBOperations(): any {
    return this.dbOps;
  }
}
