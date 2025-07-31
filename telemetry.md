# VibeKit Telemetry Package Extraction - Implementation Plan

## Overview

This document outlines the detailed implementation plan for extracting the telemetry system from VibeKit into a standalone package `@vibe-kit/telemetry`. The package will be designed to work with any Node.js application, not just VibeKit, while maintaining all current functionality.

## Architecture Goals

1. **Framework Agnostic**: Usable by any Node.js application
2. **Zero Breaking Changes**: VibeKit continues to work seamlessly
3. **Modular Design**: Use only what you need
4. **Extensible**: Plugin architecture for custom implementations
5. **Type Safe**: Full TypeScript support with strict typing
6. **Production Ready**: Including all reliability features

## Phase 1: Project Setup and Core Structure

### 1.1 Create Package Structure
```bash
packages/telemetry/
├── src/
│   ├── core/
│   │   ├── TelemetryService.ts      # Main service class
│   │   ├── EventEmitter.ts          # Custom event emitter
│   │   ├── types.ts                 # Core type definitions
│   │   └── constants.ts             # Constants and defaults
│   ├── events/
│   │   ├── EventTypes.ts            # Event type definitions
│   │   ├── EventProcessor.ts        # Event processing logic
│   │   ├── EventValidator.ts        # Event validation
│   │   └── EventTransformer.ts      # Event transformation
│   ├── storage/
│   │   ├── StorageProvider.ts       # Abstract storage interface
│   │   ├── providers/
│   │   │   ├── SQLiteProvider.ts    # SQLite/Drizzle implementation
│   │   │   ├── OTLPProvider.ts      # OpenTelemetry export
│   │   │   └── MemoryProvider.ts    # In-memory storage
│   │   ├── migrations/              # Database migrations
│   │   └── schema/                  # Database schemas
│   ├── streaming/
│   │   ├── StreamingProvider.ts     # Abstract streaming interface
│   │   ├── providers/
│   │   │   ├── WebSocketProvider.ts # WebSocket implementation
│   │   │   ├── SSEProvider.ts       # Server-Sent Events
│   │   │   └── GRPCProvider.ts      # gRPC streaming
│   │   ├── StreamBuffer.ts          # Buffering logic
│   │   └── StreamParser.ts          # Stream parsing
│   ├── security/
│   │   ├── SecurityProvider.ts      # Security interface
│   │   ├── PIIDetector.ts           # PII detection/sanitization
│   │   ├── DataEncryption.ts        # Encryption utilities
│   │   └── DataRetention.ts         # Retention policies
│   ├── reliability/
│   │   ├── CircuitBreaker.ts        # Circuit breaker pattern
│   │   ├── RateLimiter.ts           # Rate limiting
│   │   ├── RetryQueue.ts            # Retry mechanism
│   │   └── HealthMonitor.ts         # Health checks
│   ├── analytics/
│   │   ├── AnalyticsEngine.ts       # Analytics processing
│   │   ├── MetricsCollector.ts      # Metrics collection
│   │   ├── AnomalyDetector.ts       # Anomaly detection
│   │   └── AlertManager.ts          # Alert management
│   ├── export/
│   │   ├── ExportProvider.ts        # Export interface
│   │   ├── formats/
│   │   │   ├── JSONExporter.ts      # JSON export
│   │   │   ├── CSVExporter.ts       # CSV export
│   │   │   ├── OTLPExporter.ts      # OTLP format
│   │   │   └── ParquetExporter.ts   # Parquet format
│   │   └── ExportScheduler.ts       # Scheduled exports
│   ├── dashboard/
│   │   ├── server/
│   │   │   ├── DashboardServer.ts   # Dashboard HTTP/WS server
│   │   │   ├── APIRouter.ts         # REST API routes
│   │   │   └── WebSocketHandler.ts  # Real-time updates
│   │   ├── client/                  # React dashboard app
│   │   └── assets/                  # Pre-built dashboard
│   ├── cli/
│   │   ├── commands/
│   │   │   ├── init.ts              # Initialize telemetry
│   │   │   ├── query.ts             # Query data
│   │   │   ├── export.ts            # Export data
│   │   │   ├── dashboard.ts         # Launch dashboard
│   │   │   └── stats.ts             # View statistics
│   │   └── TelemetryCLI.ts          # CLI entry point
│   ├── plugins/
│   │   ├── PluginManager.ts         # Plugin system
│   │   ├── PluginInterface.ts       # Plugin contracts
│   │   └── hooks/                   # Plugin hooks
│   └── index.ts                     # Main entry point
├── dashboard/                       # Pre-built dashboard assets
├── migrations/                      # SQL migration files
├── package.json
├── tsconfig.json
├── README.md
└── LICENSE
```

### 1.2 Package.json Configuration
```json
{
  "name": "@vibe-kit/telemetry",
  "version": "1.0.0",
  "description": "Enterprise-grade telemetry system for agentic applications",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "bin": {
    "telemetry": "./dist/cli/TelemetryCLI.js"
  },
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    },
    "./dashboard": {
      "types": "./dist/dashboard/index.d.ts",
      "import": "./dist/dashboard/index.js",
      "require": "./dist/dashboard/index.cjs"
    },
    "./plugins/*": {
      "types": "./dist/plugins/*.d.ts",
      "import": "./dist/plugins/*.js",
      "require": "./dist/plugins/*.cjs"
    }
  },
  "scripts": {
    "build": "tsup && npm run build:dashboard",
    "build:dashboard": "cd src/dashboard/client && npm run build",
    "dev": "tsup --watch",
    "test": "vitest",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "better-sqlite3": "^9.2.2",
    "drizzle-orm": "^0.29.0",
    "@opentelemetry/api": "^1.7.0",
    "@opentelemetry/sdk-node": "^0.45.0",
    "socket.io": "^4.8.1",
    "express": "^4.18.2",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.8",
    "drizzle-kit": "^0.20.6",
    "tsup": "^8.0.1",
    "typescript": "^5.3.3",
    "vitest": "^1.0.0"
  }
}
```

## Phase 2: Core Telemetry Service Implementation

### 2.1 Core Types and Interfaces
```typescript
// src/core/types.ts
export interface TelemetryEvent {
  id?: string;
  sessionId: string;
  eventType: 'start' | 'stream' | 'end' | 'error' | 'custom';
  category: string;      // Generic category (replaces agentType)
  action: string;        // Generic action (replaces mode)
  label?: string;        // Optional label (replaces prompt)
  value?: number;        // Optional numeric value
  timestamp: number;
  duration?: number;
  metadata?: Record<string, any>;
  context?: TelemetryContext;
}

export interface TelemetryContext {
  userId?: string;
  organizationId?: string;
  environment?: string;
  version?: string;
  platform?: string;
  custom?: Record<string, any>;
}

export interface TelemetryConfig {
  // Core configuration
  serviceName: string;
  serviceVersion: string;
  environment?: string;
  
  // Storage configuration
  storage?: StorageConfig[];
  
  // Streaming configuration
  streaming?: StreamingConfig;
  
  // Security configuration
  security?: SecurityConfig;
  
  // Reliability configuration
  reliability?: ReliabilityConfig;
  
  // Analytics configuration
  analytics?: AnalyticsConfig;
  
  // Dashboard configuration
  dashboard?: DashboardConfig;
  
  // Plugin configuration
  plugins?: Plugin[];
}

export interface StorageConfig {
  type: 'sqlite' | 'otlp' | 'memory' | 'custom';
  enabled: boolean;
  options?: any;
}
```

### 2.2 Main TelemetryService Class
```typescript
// src/core/TelemetryService.ts
export class TelemetryService extends EventEmitter {
  private config: TelemetryConfig;
  private storageProviders: StorageProvider[] = [];
  private streamingProvider?: StreamingProvider;
  private securityProvider: SecurityProvider;
  private reliabilityManager: ReliabilityManager;
  private analyticsEngine?: AnalyticsEngine;
  private pluginManager: PluginManager;
  private isInitialized = false;

  constructor(config: TelemetryConfig) {
    super();
    this.config = this.validateConfig(config);
    this.pluginManager = new PluginManager(this);
    this.securityProvider = new SecurityProvider(config.security);
    this.reliabilityManager = new ReliabilityManager(config.reliability);
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // Initialize storage providers
    await this.initializeStorage();
    
    // Initialize streaming if configured
    if (this.config.streaming?.enabled) {
      await this.initializeStreaming();
    }
    
    // Initialize analytics if configured
    if (this.config.analytics?.enabled) {
      await this.initializeAnalytics();
    }
    
    // Initialize plugins
    await this.pluginManager.initialize(this.config.plugins);
    
    // Start background tasks
    this.startMaintenanceTasks();
    
    this.isInitialized = true;
    this.emit('initialized');
  }

  // Generic event tracking method
  async track(event: Partial<TelemetryEvent>): Promise<void> {
    // Validate and enrich event
    const enrichedEvent = await this.enrichEvent(event);
    
    // Apply security measures
    const sanitizedEvent = await this.securityProvider.sanitize(enrichedEvent);
    
    // Apply rate limiting
    await this.reliabilityManager.checkRateLimit(sanitizedEvent);
    
    // Process through plugins
    const processedEvent = await this.pluginManager.processEvent(sanitizedEvent);
    
    // Store event
    await this.storeEvent(processedEvent);
    
    // Stream event if configured
    if (this.streamingProvider) {
      await this.streamingProvider.stream(processedEvent);
    }
    
    // Update analytics
    if (this.analyticsEngine) {
      await this.analyticsEngine.process(processedEvent);
    }
    
    this.emit('event:tracked', processedEvent);
  }

  // Convenience methods for common event types
  async trackStart(category: string, action: string, label?: string, metadata?: any): Promise<void> {
    return this.track({
      eventType: 'start',
      category,
      action,
      label,
      metadata
    });
  }

  async trackEnd(category: string, action: string, label?: string, metadata?: any): Promise<void> {
    return this.track({
      eventType: 'end',
      category,
      action,
      label,
      metadata
    });
  }

  async trackError(category: string, action: string, error: Error | string, metadata?: any): Promise<void> {
    return this.track({
      eventType: 'error',
      category,
      action,
      label: error instanceof Error ? error.message : error,
      metadata: {
        ...metadata,
        error: error instanceof Error ? {
          message: error.message,
          stack: error.stack,
          name: error.name
        } : { message: error }
      }
    });
  }

  // Dashboard management
  async startDashboard(options?: DashboardOptions): Promise<DashboardServer> {
    if (!this.config.dashboard?.enabled) {
      throw new Error('Dashboard is not enabled in configuration');
    }
    
    const dashboardServer = new DashboardServer(this, options);
    await dashboardServer.start();
    return dashboardServer;
  }

  // Plugin management
  use(plugin: Plugin): void {
    this.pluginManager.register(plugin);
  }

  // Query methods
  async query(filter: QueryFilter): Promise<TelemetryEvent[]> {
    const results: TelemetryEvent[] = [];
    
    for (const provider of this.storageProviders) {
      if (provider.supportsQuery) {
        const providerResults = await provider.query(filter);
        results.push(...providerResults);
      }
    }
    
    return this.deduplicateEvents(results);
  }

  // Export methods
  async export(format: ExportFormat, filter?: QueryFilter): Promise<ExportResult> {
    const events = await this.query(filter || {});
    const exporter = this.getExporter(format);
    return exporter.export(events);
  }

  // Analytics methods
  async getMetrics(timeRange?: TimeRange): Promise<Metrics> {
    if (!this.analyticsEngine) {
      throw new Error('Analytics is not enabled');
    }
    return this.analyticsEngine.getMetrics(timeRange);
  }

  async getInsights(options?: InsightOptions): Promise<Insights> {
    if (!this.analyticsEngine) {
      throw new Error('Analytics is not enabled');
    }
    return this.analyticsEngine.getInsights(options);
  }

  // Lifecycle methods
  async shutdown(): Promise<void> {
    // Flush any pending events
    await this.flush();
    
    // Shutdown providers
    await Promise.all([
      ...this.storageProviders.map(p => p.shutdown()),
      this.streamingProvider?.shutdown(),
      this.analyticsEngine?.shutdown(),
      this.pluginManager.shutdown()
    ]);
    
    this.isInitialized = false;
    this.emit('shutdown');
  }
}
```

## Phase 3: Storage Implementation

### 3.1 Storage Provider Interface
```typescript
// src/storage/StorageProvider.ts
export abstract class StorageProvider {
  abstract name: string;
  abstract supportsQuery: boolean;
  abstract supportsBatch: boolean;
  
  abstract initialize(): Promise<void>;
  abstract store(event: TelemetryEvent): Promise<void>;
  abstract storeBatch(events: TelemetryEvent[]): Promise<void>;
  abstract query(filter: QueryFilter): Promise<TelemetryEvent[]>;
  abstract getStats(): Promise<StorageStats>;
  abstract shutdown(): Promise<void>;
  
  // Optional methods
  async flush(): Promise<void> {}
  async compact(): Promise<void> {}
  async clean(before: Date): Promise<number> { return 0; }
}
```

### 3.2 SQLite Provider Implementation
```typescript
// src/storage/providers/SQLiteProvider.ts
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';

export class SQLiteProvider extends StorageProvider {
  name = 'sqlite';
  supportsQuery = true;
  supportsBatch = true;
  
  private db: ReturnType<typeof drizzle>;
  private sqlite: Database.Database;
  private config: SQLiteConfig;
  private streamBuffer: Map<string, StreamBuffer>;
  
  constructor(config: SQLiteConfig) {
    super();
    this.config = config;
    this.streamBuffer = new Map();
  }
  
  async initialize(): Promise<void> {
    // Create database connection
    this.sqlite = new Database(this.config.path);
    this.db = drizzle(this.sqlite);
    
    // Run migrations
    await this.runMigrations();
    
    // Setup indexes
    await this.createIndexes();
    
    // Start buffer flush interval
    this.startBufferFlush();
  }
  
  async store(event: TelemetryEvent): Promise<void> {
    // Handle stream events with buffering
    if (event.eventType === 'stream' && this.config.streamBuffering) {
      return this.bufferStreamEvent(event);
    }
    
    // Store directly for other event types
    await this.db.insert(telemetryEvents).values(event);
  }
  
  async storeBatch(events: TelemetryEvent[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const event of events) {
        await tx.insert(telemetryEvents).values(event);
      }
    });
  }
  
  async query(filter: QueryFilter): Promise<TelemetryEvent[]> {
    let query = this.db.select().from(telemetryEvents);
    
    // Apply filters
    if (filter.sessionId) {
      query = query.where(eq(telemetryEvents.sessionId, filter.sessionId));
    }
    if (filter.category) {
      query = query.where(eq(telemetryEvents.category, filter.category));
    }
    if (filter.timeRange) {
      query = query.where(
        and(
          gte(telemetryEvents.timestamp, filter.timeRange.start),
          lte(telemetryEvents.timestamp, filter.timeRange.end)
        )
      );
    }
    
    // Apply sorting and pagination
    query = query.orderBy(desc(telemetryEvents.timestamp));
    if (filter.limit) {
      query = query.limit(filter.limit);
    }
    if (filter.offset) {
      query = query.offset(filter.offset);
    }
    
    return query;
  }
  
  private async bufferStreamEvent(event: TelemetryEvent): Promise<void> {
    const buffer = this.streamBuffer.get(event.sessionId) || {
      events: [],
      lastFlush: Date.now()
    };
    
    buffer.events.push(event);
    
    // Flush if buffer is full or time elapsed
    if (
      buffer.events.length >= this.config.streamBatchSize ||
      Date.now() - buffer.lastFlush > this.config.streamFlushInterval
    ) {
      await this.flushBuffer(event.sessionId);
    } else {
      this.streamBuffer.set(event.sessionId, buffer);
    }
  }
}
```

### 3.3 Database Schema
```typescript
// src/storage/schema/telemetry.ts
import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';

export const telemetryEvents = sqliteTable('telemetry_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: text('session_id').notNull(),
  eventType: text('event_type').notNull(),
  category: text('category').notNull(),
  action: text('action').notNull(),
  label: text('label'),
  value: real('value'),
  timestamp: integer('timestamp').notNull(),
  duration: integer('duration'),
  metadata: text('metadata'), // JSON
  context: text('context'), // JSON
  createdAt: integer('created_at').default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  sessionIdx: index('idx_session_id').on(table.sessionId),
  timestampIdx: index('idx_timestamp').on(table.timestamp),
  categoryIdx: index('idx_category').on(table.category),
  eventTypeIdx: index('idx_event_type').on(table.eventType),
}));

export const telemetrySessions = sqliteTable('telemetry_sessions', {
  id: text('id').primaryKey(),
  startTime: integer('start_time').notNull(),
  endTime: integer('end_time'),
  status: text('status').notNull(), // active, completed, error
  eventCount: integer('event_count').default(0),
  errorCount: integer('error_count').default(0),
  metadata: text('metadata'), // JSON
  createdAt: integer('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

export const telemetryStats = sqliteTable('telemetry_stats', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  period: text('period').notNull(), // hour, day, week, month
  periodStart: integer('period_start').notNull(),
  category: text('category').notNull(),
  action: text('action'),
  eventCount: integer('event_count').default(0),
  errorCount: integer('error_count').default(0),
  avgDuration: real('avg_duration'),
  metadata: text('metadata'), // JSON with additional stats
}, (table) => ({
  periodIdx: index('idx_period').on(table.period, table.periodStart),
  categoryIdx: index('idx_stats_category').on(table.category),
}));
```

## Phase 4: Streaming Implementation

### 4.1 Streaming Provider Interface
```typescript
// src/streaming/StreamingProvider.ts
export abstract class StreamingProvider {
  abstract name: string;
  
  abstract initialize(config: StreamingConfig): Promise<void>;
  abstract stream(event: TelemetryEvent): Promise<void>;
  abstract broadcast(channel: string, data: any): Promise<void>;
  abstract subscribe(channel: string, handler: (data: any) => void): void;
  abstract unsubscribe(channel: string, handler: (data: any) => void): void;
  abstract shutdown(): Promise<void>;
}
```

### 4.2 WebSocket Provider
```typescript
// src/streaming/providers/WebSocketProvider.ts
import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';

export class WebSocketProvider extends StreamingProvider {
  name = 'websocket';
  private io: SocketIOServer;
  private server: HTTPServer;
  
  async initialize(config: WebSocketConfig): Promise<void> {
    this.server = createServer();
    this.io = new SocketIOServer(this.server, {
      cors: config.cors,
      transports: ['websocket', 'polling'],
    });
    
    this.setupHandlers();
    await this.startServer(config.port);
  }
  
  async stream(event: TelemetryEvent): Promise<void> {
    // Broadcast to all connected clients
    this.io.emit('telemetry:event', event);
    
    // Broadcast to session-specific room
    this.io.to(`session:${event.sessionId}`).emit('session:event', event);
    
    // Broadcast to category-specific room
    this.io.to(`category:${event.category}`).emit('category:event', event);
  }
  
  private setupHandlers(): void {
    this.io.on('connection', (socket) => {
      // Handle subscriptions
      socket.on('subscribe:session', (sessionId: string) => {
        socket.join(`session:${sessionId}`);
      });
      
      socket.on('subscribe:category', (category: string) => {
        socket.join(`category:${category}`);
      });
      
      // Handle queries
      socket.on('query', async (filter: QueryFilter, callback) => {
        try {
          const results = await this.telemetryService.query(filter);
          callback({ success: true, data: results });
        } catch (error) {
          callback({ success: false, error: error.message });
        }
      });
    });
  }
}
```

## Phase 5: Security Implementation

### 5.1 Security Provider
```typescript
// src/security/SecurityProvider.ts
export class SecurityProvider {
  private piiDetector: PIIDetector;
  private encryptor: DataEncryptor;
  private retentionManager: RetentionManager;
  
  constructor(config: SecurityConfig) {
    this.piiDetector = new PIIDetector(config.pii);
    this.encryptor = new DataEncryptor(config.encryption);
    this.retentionManager = new RetentionManager(config.retention);
  }
  
  async sanitize(event: TelemetryEvent): Promise<TelemetryEvent> {
    // Detect and remove PII
    const sanitized = await this.piiDetector.sanitize(event);
    
    // Encrypt sensitive fields if configured
    if (this.encryptor.isEnabled()) {
      return this.encryptor.encrypt(sanitized);
    }
    
    return sanitized;
  }
}
```

### 5.2 PII Detection
```typescript
// src/security/PIIDetector.ts
export class PIIDetector {
  private patterns: Map<string, RegExp> = new Map([
    ['email', /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g],
    ['phone', /(\+\d{1,3}[- ]?)?\d{10}/g],
    ['ssn', /\b\d{3}-\d{2}-\d{4}\b/g],
    ['creditCard', /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g],
    ['apiKey', /\b[A-Za-z0-9]{32,}\b/g],
  ]);
  
  async sanitize(event: TelemetryEvent): Promise<TelemetryEvent> {
    const sanitized = { ...event };
    
    // Sanitize string fields
    if (sanitized.label) {
      sanitized.label = this.sanitizeString(sanitized.label);
    }
    
    // Sanitize metadata
    if (sanitized.metadata) {
      sanitized.metadata = this.sanitizeObject(sanitized.metadata);
    }
    
    return sanitized;
  }
  
  private sanitizeString(value: string): string {
    let sanitized = value;
    
    for (const [name, pattern] of this.patterns) {
      sanitized = sanitized.replace(pattern, `[REDACTED_${name.toUpperCase()}]`);
    }
    
    return sanitized;
  }
  
  private sanitizeObject(obj: any): any {
    if (typeof obj === 'string') {
      return this.sanitizeString(obj);
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item));
    }
    
    if (obj && typeof obj === 'object') {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = this.sanitizeObject(value);
      }
      return sanitized;
    }
    
    return obj;
  }
}
```

## Phase 6: Reliability Implementation

### 6.1 Circuit Breaker
```typescript
// src/reliability/CircuitBreaker.ts
export class CircuitBreaker {
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private failureCount = 0;
  private lastFailureTime = 0;
  private successCount = 0;
  
  constructor(
    private threshold: number = 5,
    private timeout: number = 60000,
    private halfOpenRequests: number = 3
  ) {}
  
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'half-open';
        this.successCount = 0;
      } else {
        throw new Error('Circuit breaker is open');
      }
    }
    
    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  private onSuccess(): void {
    this.failureCount = 0;
    
    if (this.state === 'half-open') {
      this.successCount++;
      if (this.successCount >= this.halfOpenRequests) {
        this.state = 'closed';
      }
    }
  }
  
  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.failureCount >= this.threshold) {
      this.state = 'open';
    }
  }
}
```

### 6.2 Rate Limiter
```typescript
// src/reliability/RateLimiter.ts
export class RateLimiter {
  private windows: Map<string, RateLimitWindow> = new Map();
  
  constructor(
    private maxRequests: number = 100,
    private windowMs: number = 60000
  ) {}
  
  async checkLimit(key: string): Promise<void> {
    const now = Date.now();
    let window = this.windows.get(key);
    
    if (!window || now - window.start > this.windowMs) {
      window = { start: now, count: 0 };
      this.windows.set(key, window);
    }
    
    if (window.count >= this.maxRequests) {
      throw new Error(`Rate limit exceeded for ${key}`);
    }
    
    window.count++;
  }
  
  reset(key: string): void {
    this.windows.delete(key);
  }
}
```

## Phase 7: Analytics Implementation

### 7.1 Analytics Engine
```typescript
// src/analytics/AnalyticsEngine.ts
export class AnalyticsEngine {
  private metricsCollector: MetricsCollector;
  private anomalyDetector: AnomalyDetector;
  private alertManager: AlertManager;
  
  constructor(config: AnalyticsConfig) {
    this.metricsCollector = new MetricsCollector(config.metrics);
    this.anomalyDetector = new AnomalyDetector(config.anomaly);
    this.alertManager = new AlertManager(config.alerts);
  }
  
  async process(event: TelemetryEvent): Promise<void> {
    // Update metrics
    await this.metricsCollector.update(event);
    
    // Check for anomalies
    const anomalies = await this.anomalyDetector.check(event);
    if (anomalies.length > 0) {
      await this.alertManager.trigger(anomalies);
    }
  }
  
  async getMetrics(timeRange?: TimeRange): Promise<Metrics> {
    return this.metricsCollector.getMetrics(timeRange);
  }
  
  async getInsights(options?: InsightOptions): Promise<Insights> {
    const metrics = await this.getMetrics(options?.timeRange);
    const anomalies = await this.anomalyDetector.getAnomalies(options?.timeRange);
    
    return {
      metrics,
      anomalies,
      trends: this.analyzeTrends(metrics),
      recommendations: this.generateRecommendations(metrics, anomalies),
    };
  }
}
```

### 7.2 Metrics Collector
```typescript
// src/analytics/MetricsCollector.ts
export class MetricsCollector {
  private counters: Map<string, number> = new Map();
  private gauges: Map<string, number> = new Map();
  private histograms: Map<string, number[]> = new Map();
  
  async update(event: TelemetryEvent): Promise<void> {
    // Update event counters
    this.incrementCounter(`events.total`);
    this.incrementCounter(`events.${event.eventType}`);
    this.incrementCounter(`events.${event.category}.${event.action}`);
    
    // Update duration histogram
    if (event.duration) {
      this.recordHistogram(`duration.${event.category}`, event.duration);
    }
    
    // Update error rate
    if (event.eventType === 'error') {
      this.incrementCounter(`errors.total`);
      this.incrementCounter(`errors.${event.category}`);
    }
  }
  
  private incrementCounter(key: string, value: number = 1): void {
    this.counters.set(key, (this.counters.get(key) || 0) + value);
  }
  
  private recordHistogram(key: string, value: number): void {
    const values = this.histograms.get(key) || [];
    values.push(value);
    this.histograms.set(key, values);
  }
}
```

## Phase 8: Dashboard Implementation

### 8.1 Dashboard Server
```typescript
// src/dashboard/server/DashboardServer.ts
import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

export class DashboardServer {
  private app: express.Application;
  private server: ReturnType<typeof createServer>;
  private io: SocketIOServer;
  
  constructor(
    private telemetryService: TelemetryService,
    private options: DashboardOptions
  ) {
    this.app = express();
    this.server = createServer(this.app);
    this.io = new SocketIOServer(this.server);
    
    this.setupRoutes();
    this.setupWebSocket();
  }
  
  async start(): Promise<void> {
    const port = this.options.port || 3000;
    
    return new Promise((resolve) => {
      this.server.listen(port, () => {
        console.log(`Dashboard running at http://localhost:${port}`);
        resolve();
      });
    });
  }
  
  private setupRoutes(): void {
    // Serve static dashboard files
    this.app.use(express.static(path.join(__dirname, '../../dashboard')));
    
    // API routes
    this.app.get('/api/events', async (req, res) => {
      const filter = this.parseQueryFilter(req.query);
      const events = await this.telemetryService.query(filter);
      res.json(events);
    });
    
    this.app.get('/api/metrics', async (req, res) => {
      const timeRange = this.parseTimeRange(req.query);
      const metrics = await this.telemetryService.getMetrics(timeRange);
      res.json(metrics);
    });
    
    this.app.get('/api/insights', async (req, res) => {
      const options = this.parseInsightOptions(req.query);
      const insights = await this.telemetryService.getInsights(options);
      res.json(insights);
    });
  }
  
  private setupWebSocket(): void {
    // Forward telemetry events to dashboard
    this.telemetryService.on('event:tracked', (event) => {
      this.io.emit('event', event);
    });
    
    // Handle client connections
    this.io.on('connection', (socket) => {
      // Send initial data
      socket.emit('connected', {
        metrics: this.telemetryService.getMetrics(),
      });
      
      // Handle subscriptions
      socket.on('subscribe', (channel: string) => {
        socket.join(channel);
      });
    });
  }
}
```

### 8.2 Dashboard React App Structure
```typescript
// src/dashboard/client/App.tsx
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Dashboard } from './pages/Dashboard';
import { Sessions } from './pages/Sessions';
import { Analytics } from './pages/Analytics';
import { Settings } from './pages/Settings';

const queryClient = new QueryClient();

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/sessions" element={<Sessions />} />
          <Route path="/sessions/:id" element={<SessionDetail />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
```

## Phase 9: Plugin System Implementation

### 9.1 Plugin Interface
```typescript
// src/plugins/PluginInterface.ts
export interface Plugin {
  name: string;
  version: string;
  
  // Lifecycle hooks
  initialize?(telemetry: TelemetryService): Promise<void>;
  shutdown?(): Promise<void>;
  
  // Event hooks
  beforeTrack?(event: TelemetryEvent): Promise<TelemetryEvent | null>;
  afterTrack?(event: TelemetryEvent): Promise<void>;
  
  // Storage hooks
  beforeStore?(event: TelemetryEvent): Promise<TelemetryEvent | null>;
  afterStore?(event: TelemetryEvent): Promise<void>;
  
  // Query hooks
  beforeQuery?(filter: QueryFilter): Promise<QueryFilter>;
  afterQuery?(results: TelemetryEvent[]): Promise<TelemetryEvent[]>;
  
  // Export hooks
  beforeExport?(events: TelemetryEvent[]): Promise<TelemetryEvent[]>;
  afterExport?(result: ExportResult): Promise<void>;
}
```

### 9.2 Plugin Manager
```typescript
// src/plugins/PluginManager.ts
export class PluginManager {
  private plugins: Plugin[] = [];
  
  constructor(private telemetryService: TelemetryService) {}
  
  async initialize(plugins?: Plugin[]): Promise<void> {
    if (plugins) {
      for (const plugin of plugins) {
        await this.register(plugin);
      }
    }
  }
  
  async register(plugin: Plugin): Promise<void> {
    if (plugin.initialize) {
      await plugin.initialize(this.telemetryService);
    }
    this.plugins.push(plugin);
  }
  
  async processEvent(event: TelemetryEvent): Promise<TelemetryEvent> {
    let processedEvent = event;
    
    for (const plugin of this.plugins) {
      if (plugin.beforeTrack) {
        const result = await plugin.beforeTrack(processedEvent);
        if (result === null) {
          throw new Error(`Plugin ${plugin.name} rejected event`);
        }
        processedEvent = result;
      }
    }
    
    return processedEvent;
  }
  
  async shutdown(): Promise<void> {
    for (const plugin of this.plugins) {
      if (plugin.shutdown) {
        await plugin.shutdown();
      }
    }
  }
}
```

## Phase 10: CLI Implementation

### 10.1 CLI Entry Point
```typescript
// src/cli/TelemetryCLI.ts
#!/usr/bin/env node
import { Command } from 'commander';
import { initCommand } from './commands/init';
import { queryCommand } from './commands/query';
import { exportCommand } from './commands/export';
import { dashboardCommand } from './commands/dashboard';
import { statsCommand } from './commands/stats';

const program = new Command();

program
  .name('telemetry')
  .description('VibeKit Telemetry CLI')
  .version('1.0.0');

program.addCommand(initCommand);
program.addCommand(queryCommand);
program.addCommand(exportCommand);
program.addCommand(dashboardCommand);
program.addCommand(statsCommand);

program.parse();
```

### 10.2 Dashboard Command
```typescript
// src/cli/commands/dashboard.ts
import { Command } from 'commander';
import { TelemetryService } from '../../core/TelemetryService';
import { DashboardServer } from '../../dashboard/server/DashboardServer';

export const dashboardCommand = new Command('dashboard')
  .description('Start the telemetry dashboard')
  .option('-p, --port <port>', 'Dashboard port', '3000')
  .option('-c, --config <path>', 'Config file path')
  .option('--no-open', 'Don\'t open browser')
  .action(async (options) => {
    // Load configuration
    const config = await loadConfig(options.config);
    
    // Initialize telemetry service
    const telemetry = new TelemetryService(config);
    await telemetry.initialize();
    
    // Start dashboard
    const dashboard = await telemetry.startDashboard({
      port: parseInt(options.port),
    });
    
    // Open browser
    if (options.open) {
      const open = await import('open');
      await open.default(`http://localhost:${options.port}`);
    }
    
    console.log(`Dashboard running at http://localhost:${options.port}`);
  });
```

## Phase 11: VibeKit Integration

### 11.1 Create Adapter for VibeKit
```typescript
// packages/vibekit/src/adapters/TelemetryAdapter.ts
import { TelemetryService } from '@vibe-kit/telemetry';

export class VibeKitTelemetryAdapter {
  private telemetry: TelemetryService;
  
  constructor(config: VibeKitTelemetryConfig) {
    this.telemetry = new TelemetryService({
      serviceName: 'vibekit',
      serviceVersion: config.serviceVersion,
      storage: [
        {
          type: 'sqlite',
          enabled: config.localStore?.isEnabled ?? true,
          options: {
            path: config.localStore?.path,
            streamBatchSize: config.localStore?.streamBatchSize,
            streamFlushIntervalMs: config.localStore?.streamFlushIntervalMs,
          }
        },
        {
          type: 'otlp',
          enabled: !!config.endpoint,
          options: {
            endpoint: config.endpoint,
            headers: config.headers,
          }
        }
      ],
      streaming: {
        enabled: true,
        type: 'websocket',
        port: 3001,
      },
      dashboard: {
        enabled: true,
      }
    });
  }
  
  async initialize(): Promise<void> {
    await this.telemetry.initialize();
  }
  
  // Adapter methods that match existing VibeKit API
  async trackStart(
    agentType: string,
    mode: string,
    prompt: string,
    metadata?: any
  ): Promise<void> {
    return this.telemetry.trackStart(agentType, mode, prompt, metadata);
  }
  
  async trackStream(
    agentType: string,
    mode: string,
    prompt: string,
    data: string,
    sandboxId?: string,
    repoUrl?: string,
    metadata?: any
  ): Promise<void> {
    return this.telemetry.track({
      eventType: 'stream',
      category: agentType,
      action: mode,
      label: prompt,
      metadata: {
        ...metadata,
        streamData: data,
        sandboxId,
        repoUrl,
      }
    });
  }
  
  async trackEnd(
    agentType: string,
    mode: string,
    prompt: string,
    sandboxId?: string,
    repoUrl?: string,
    metadata?: any
  ): Promise<void> {
    return this.telemetry.trackEnd(agentType, mode, prompt, {
      ...metadata,
      sandboxId,
      repoUrl,
    });
  }
  
  async trackError(
    agentType: string,
    mode: string,
    prompt: string,
    error: string,
    metadata?: any
  ): Promise<void> {
    return this.telemetry.trackError(agentType, mode, error, metadata);
  }
  
  // Delegate other methods
  async shutdown(): Promise<void> {
    return this.telemetry.shutdown();
  }
  
  getAnalyticsDashboard(timeWindow: string): Promise<any> {
    return this.telemetry.getInsights({ timeRange: timeWindow });
  }
  
  getTelemetryMetrics(): any {
    return this.telemetry.getMetrics();
  }
}
```

### 11.2 Update VibeKit Core
```typescript
// packages/vibekit/src/core/vibekit.ts
import { VibeKitTelemetryAdapter } from '../adapters/TelemetryAdapter';

export class VibeKit extends EventEmitter {
  private telemetryService?: VibeKitTelemetryAdapter;
  
  // ... existing code ...
  
  private async initializeAgent(): Promise<void> {
    // ... existing code ...
    
    // Initialize telemetry service if enabled
    if (this.options.telemetry?.enabled) {
      this.telemetryService = new VibeKitTelemetryAdapter({
        ...this.options.telemetry,
        serviceVersion: '1.0.0',
      });
      await this.telemetryService.initialize();
    }
    
    // ... rest of initialization ...
  }
}
```

## Phase 12: Migration and Testing

### 12.1 Migration Script
```typescript
// scripts/migrate-telemetry.ts
import { TelemetryService } from '@vibe-kit/telemetry';
import { DrizzleTelemetryDB } from '@vibe-kit/db';

async function migrateTelemetry() {
  console.log('Starting telemetry migration...');
  
  // 1. Initialize new telemetry service
  const telemetry = new TelemetryService({
    serviceName: 'vibekit',
    serviceVersion: '1.0.0',
    storage: [{
      type: 'sqlite',
      enabled: true,
      options: {
        path: '.vibekit/telemetry.db',
      }
    }]
  });
  
  await telemetry.initialize();
  
  // 2. Export existing data
  const oldDb = new DrizzleTelemetryDB({ dbPath: '.vibekit/telemetry.db' });
  const events = await oldDb.operations.queryEvents({});
  
  console.log(`Found ${events.length} events to migrate`);
  
  // 3. Transform and import events
  for (const oldEvent of events) {
    await telemetry.track({
      sessionId: oldEvent.sessionId,
      eventType: oldEvent.eventType,
      category: oldEvent.agentType, // Map old field names
      action: oldEvent.mode,
      label: oldEvent.prompt,
      timestamp: oldEvent.timestamp,
      metadata: {
        ...oldEvent.metadata,
        streamData: oldEvent.streamData,
        sandboxId: oldEvent.sandboxId,
        repoUrl: oldEvent.repoUrl,
      }
    });
  }
  
  console.log('Migration completed successfully');
}

migrateTelemetry().catch(console.error);
```

### 12.2 Test Suite Structure
```typescript
// test/telemetry.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TelemetryService } from '@vibe-kit/telemetry';

describe('TelemetryService', () => {
  let telemetry: TelemetryService;
  
  beforeEach(async () => {
    telemetry = new TelemetryService({
      serviceName: 'test',
      serviceVersion: '1.0.0',
      storage: [{
        type: 'memory',
        enabled: true,
      }]
    });
    await telemetry.initialize();
  });
  
  afterEach(async () => {
    await telemetry.shutdown();
  });
  
  describe('Event Tracking', () => {
    it('should track start events', async () => {
      await telemetry.trackStart('test-category', 'test-action', 'test-label');
      
      const events = await telemetry.query({
        category: 'test-category',
      });
      
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('start');
    });
    
    it('should sanitize PII data', async () => {
      await telemetry.track({
        eventType: 'start',
        category: 'test',
        action: 'test',
        label: 'User email is test@example.com',
      });
      
      const events = await telemetry.query({});
      expect(events[0].label).toBe('User email is [REDACTED_EMAIL]');
    });
  });
  
  describe('Plugin System', () => {
    it('should execute plugin hooks', async () => {
      let hookCalled = false;
      
      telemetry.use({
        name: 'test-plugin',
        version: '1.0.0',
        beforeTrack: async (event) => {
          hookCalled = true;
          return event;
        }
      });
      
      await telemetry.track({ eventType: 'start', category: 'test', action: 'test' });
      expect(hookCalled).toBe(true);
    });
  });
});
```

## Phase 13: Documentation

### 13.1 README.md
```markdown
# @vibe-kit/telemetry

Enterprise-grade telemetry system for agentic applications.

## Features

- 🚀 **High Performance**: Sub-millisecond event tracking with intelligent buffering
- 📊 **Real-time Analytics**: Live dashboards and metrics
- 🔌 **Extensible**: Plugin system for custom implementations
- 🔒 **Secure**: Built-in PII detection and data encryption
- 📤 **Multi-format Export**: JSON, CSV, OTLP, and more
- 🎯 **Framework Agnostic**: Works with any Node.js application

## Installation

```bash
npm install @vibe-kit/telemetry
```

## Quick Start

```typescript
import { TelemetryService } from '@vibe-kit/telemetry';

// Initialize telemetry
const telemetry = new TelemetryService({
  serviceName: 'my-app',
  serviceVersion: '1.0.0',
  storage: [{
    type: 'sqlite',
    enabled: true,
  }],
  dashboard: {
    enabled: true,
  }
});

await telemetry.initialize();

// Track events
await telemetry.track({
  eventType: 'start',
  category: 'user-action',
  action: 'button-click',
  label: 'submit-form',
});

// Start dashboard
await telemetry.startDashboard({ port: 3000 });
```

## Configuration

### Storage Providers

- **SQLite** (default): Local storage with Drizzle ORM
- **OpenTelemetry**: Export to OTLP collectors
- **Memory**: In-memory storage for testing
- **Custom**: Implement your own storage provider

### Streaming Providers

- **WebSocket**: Real-time event streaming
- **Server-Sent Events**: One-way streaming
- **gRPC**: High-performance streaming

### Security Features

- PII detection and redaction
- Data encryption at rest
- Configurable retention policies
- Audit logging

## Plugin Development

```typescript
import { Plugin } from '@vibe-kit/telemetry';

const myPlugin: Plugin = {
  name: 'my-plugin',
  version: '1.0.0',
  
  async beforeTrack(event) {
    // Modify event before tracking
    return {
      ...event,
      metadata: {
        ...event.metadata,
        customField: 'value',
      }
    };
  }
};

telemetry.use(myPlugin);
```

## CLI Usage

```bash
# Initialize telemetry
telemetry init

# Start dashboard
telemetry dashboard --port 3000

# Query events
telemetry query --category user-action --last 1h

# Export data
telemetry export --format csv --output events.csv

# View statistics
telemetry stats --real-time
```

## API Reference

See [API Documentation](./docs/api.md) for detailed API reference.

## License

MIT
```

### 13.2 Migration Guide
```markdown
# Migration Guide: VibeKit Telemetry to @vibe-kit/telemetry

## Overview

This guide helps you migrate from the integrated VibeKit telemetry to the new standalone `@vibe-kit/telemetry` package.

## Key Changes

1. **Package Structure**: Telemetry is now a separate package
2. **Event Structure**: More generic event model
3. **Configuration**: New configuration format
4. **API Changes**: Some method signatures have changed

## Migration Steps

### 1. Install the new package

```bash
npm install @vibe-kit/telemetry
```

### 2. Update imports

```typescript
// Before
import { TelemetryService } from '../services/telemetry';

// After
import { VibeKitTelemetryAdapter } from '../adapters/TelemetryAdapter';
```

### 3. Update configuration

```typescript
// Before
const telemetryConfig = {
  isEnabled: true,
  localStore: {
    isEnabled: true,
    path: '.vibekit/telemetry.db',
  },
  endpoint: 'https://otel.example.com',
};

// After
const telemetryConfig = {
  enabled: true,
  localStore: {
    isEnabled: true,
    path: '.vibekit/telemetry.db',
  },
  endpoint: 'https://otel.example.com',
};
```

### 4. Run migration script

```bash
npm run migrate:telemetry
```

This will migrate your existing telemetry data to the new format.

## Backward Compatibility

The `VibeKitTelemetryAdapter` provides full backward compatibility with the existing VibeKit API. No changes to your application code are required.

## New Features

After migration, you gain access to:

- Plugin system for extending functionality
- Multiple storage backends
- Real-time streaming options
- Enhanced security features
- Standalone CLI tools

## Support

For migration assistance, please open an issue on GitHub.
```

## Implementation Timeline

### Week 1-2: Core Implementation
- Set up package structure
- Implement core TelemetryService
- Create storage abstraction and SQLite provider
- Set up build and test infrastructure

### Week 3-4: Features Implementation
- Implement streaming providers
- Add security features (PII detection, encryption)
- Implement reliability features (circuit breaker, rate limiting)
- Create analytics engine

### Week 5-6: Dashboard and CLI
- Build dashboard server
- Create React dashboard app
- Implement CLI commands
- Add real-time features

### Week 7-8: Integration and Testing
- Create VibeKit adapter
- Update VibeKit to use new package
- Write comprehensive tests
- Performance optimization

### Week 9-10: Documentation and Release
- Write documentation
- Create examples
- Migration tooling
- Beta testing
- Production release

## Success Metrics

1. **Performance**: < 1ms overhead per event
2. **Reliability**: 99.9% uptime for critical paths
3. **Adoption**: Seamless migration for existing users
4. **Extensibility**: 5+ community plugins within 3 months
5. **Documentation**: 100% API coverage

## Risks and Mitigations

1. **Risk**: Breaking changes for VibeKit users
   - **Mitigation**: Adapter layer maintains full compatibility

2. **Risk**: Performance regression
   - **Mitigation**: Comprehensive benchmarking suite

3. **Risk**: Complex migration process
   - **Mitigation**: Automated migration tools and guides

4. **Risk**: Security vulnerabilities
   - **Mitigation**: Security audit and penetration testing

## Conclusion

This implementation plan provides a clear path to extract the telemetry system into a standalone, enterprise-grade package that can be used by any Node.js application while maintaining full compatibility with VibeKit.