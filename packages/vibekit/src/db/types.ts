import { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import {
  telemetryEvents,
  telemetrySessions,
  telemetryBuffers,
  telemetryStats,
  telemetryErrors,
  eventTypes,
  sessionStatuses,
  bufferStatuses,
} from './schema';

// Inferred types from schema
export type TelemetryEvent = InferSelectModel<typeof telemetryEvents>;
export type NewTelemetryEvent = InferInsertModel<typeof telemetryEvents>;

export type TelemetrySession = InferSelectModel<typeof telemetrySessions>;
export type NewTelemetrySession = InferInsertModel<typeof telemetrySessions>;

export type TelemetryBuffer = InferSelectModel<typeof telemetryBuffers>;
export type NewTelemetryBuffer = InferInsertModel<typeof telemetryBuffers>;

export type TelemetryStatsRecord = InferSelectModel<typeof telemetryStats>;
export type NewTelemetryStatsRecord = InferInsertModel<typeof telemetryStats>;

export type TelemetryError = InferSelectModel<typeof telemetryErrors>;
export type NewTelemetryError = InferInsertModel<typeof telemetryErrors>;

// Enum types
export type EventType = typeof eventTypes[number];
export type SessionStatus = typeof sessionStatuses[number];
export type BufferStatus = typeof bufferStatuses[number];
export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

// Utility types for event payloads
export interface StreamEventData {
  chunk: string;
  chunkIndex: number;
  totalChunks?: number;
  deltaTime?: number;
}

export interface StartEventData {
  initialPrompt: string;
  agentConfig?: Record<string, any>;
  sandboxConfig?: Record<string, any>;
}

export interface EndEventData {
  finalOutput?: string;
  totalTokens?: number;
  duration: number;
  exitCode?: number;
}

export interface ErrorEventData {
  errorType: string;
  errorMessage: string;
  errorStack?: string;
  context?: Record<string, any>;
  recoverable?: boolean;
}

// Session with relations
export interface SessionWithEvents extends TelemetrySession {
  events: TelemetryEvent[];
  buffers: TelemetryBuffer[];
  errors: TelemetryError[];
}

// Event with session
export interface EventWithSession extends TelemetryEvent {
  session: TelemetrySession;
}

// Query filter types
export interface TelemetryQueryFilter {
  // Time filters
  from?: number;
  to?: number;
  
  // Entity filters
  sessionId?: string;
  eventType?: EventType;
  agentType?: string;
  mode?: string;
  sandboxId?: string;
  
  // Pagination
  limit?: number;
  offset?: number;
  
  // Sorting
  orderBy?: 'timestamp_asc' | 'timestamp_desc' | 'created_at_asc' | 'created_at_desc';
}

export interface SessionQueryFilter {
  // Time filters
  from?: number;
  to?: number;
  
  // Status filters
  status?: SessionStatus | SessionStatus[];
  agentType?: string;
  mode?: string;
  sandboxId?: string;
  
  // Duration filters
  minDuration?: number;
  maxDuration?: number;
  
  // Event count filters
  minEventCount?: number;
  maxEventCount?: number;
  
  // Pagination
  limit?: number;
  offset?: number;
  
  // Sorting
  orderBy?: 'start_time_asc' | 'start_time_desc' | 'duration_asc' | 'duration_desc';
  
  // Relations
  includeEvents?: boolean;
  includeBuffers?: boolean;
  includeErrors?: boolean;
}

export interface BufferQueryFilter {
  sessionId?: string;
  status?: BufferStatus | BufferStatus[];
  from?: number;
  to?: number;
  limit?: number;
  offset?: number;
}

export interface ErrorQueryFilter {
  sessionId?: string;
  eventId?: number;
  errorType?: string;
  severity?: ErrorSeverity | ErrorSeverity[];
  resolved?: boolean;
  from?: number;
  to?: number;
  limit?: number;
  offset?: number;
}

// Statistics types
export interface AgentBreakdown {
  [agentType: string]: number;
}

export interface ModeBreakdown {
  [mode: string]: number;
}

export interface EventBreakdown {
  start: number;
  stream: number;
  end: number;
  error: number;
}

export interface TelemetryStatsSummary {
  totalEvents: number;
  totalSessions: number;
  eventBreakdown: EventBreakdown;
  agentBreakdown: AgentBreakdown;
  modeBreakdown: ModeBreakdown;
  dateRange: {
    earliest: number;
    latest: number;
  };
  avgSessionDuration: number;
  dbSizeBytes: number;
}

// Batch operation types
export interface BatchInsertResult {
  eventsInserted: number;
  sessionsUpserted: number;
  buffersProcessed: number;
  errorsLogged: number;
  processingTime: number;
}

export interface StreamBufferData {
  events: Omit<NewTelemetryEvent, 'id' | 'createdAt'>[];
  sessionId: string;
  maxSize: number;
}

// Configuration types
export interface DrizzleTelemetryConfig {
  /**
   * Database file path
   */
  dbPath?: string;
  
  /**
   * Auto-delete records older than N days
   */
  pruneDays?: number;
  
  /**
   * Maximum buffer size for stream events
   */
  streamBatchSize?: number;
  
  /**
   * Buffer flush interval in milliseconds
   */
  streamFlushIntervalMs?: number;
  
  /**
   * Maximum database file size in MB
   */
  maxSizeMB?: number;
  
  /**
   * Enable WAL mode for better concurrency
   */
  enableWAL?: boolean;
  
  /**
   * Enable foreign key constraints
   */
  enableForeignKeys?: boolean;
  
  /**
   * Connection pool size
   */
  poolSize?: number;
  
  /**
   * Query timeout in milliseconds
   */
  queryTimeoutMs?: number;
  
  /**
   * Enable query logging for debugging
   */
  enableQueryLogging?: boolean;
  
  /**
   * Enable performance metrics collection
   */
  enableMetrics?: boolean;
}

// Migration types
export interface MigrationResult {
  success: boolean;
  version: string;
  migrationsRun: string[];
  errors: string[];
  duration: number;
}

// Performance monitoring types
export interface QueryMetrics {
  queryType: string;
  query: string;
  duration: number;
  timestamp: number;
  resultCount?: number;
  error?: string;
}

export interface DatabaseMetrics {
  totalQueries: number;
  avgQueryTime: number;
  slowQueries: QueryMetrics[];
  errorCount: number;
  connectionCount: number;
  dbSizeBytes: number;
  lastUpdated: number;
}

// Error types
export class DrizzleTelemetryError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'DrizzleTelemetryError';
  }
}

export class DrizzleTelemetryConnectionError extends DrizzleTelemetryError {
  constructor(message: string, cause?: Error) {
    super(message, cause);
    this.name = 'DrizzleTelemetryConnectionError';
  }
}

export class DrizzleTelemetryQueryError extends DrizzleTelemetryError {
  constructor(message: string, cause?: Error) {
    super(message, cause);
    this.name = 'DrizzleTelemetryQueryError';
  }
}

export class DrizzleTelemetryMigrationError extends DrizzleTelemetryError {
  constructor(message: string, cause?: Error) {
    super(message, cause);
    this.name = 'DrizzleTelemetryMigrationError';
  }
} 