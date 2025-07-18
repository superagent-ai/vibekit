export interface LocalStoreConfig {
  /**
   * Whether local telemetry storage is enabled
   * @default false
   */
  isEnabled: boolean;

  /**
   * File path for the SQLite database
   * @default ".vibekit/telemetry.db"
   */
  path?: string;

  /**
   * Auto-delete records older than N days
   * @default undefined (no pruning)
   */
  pruneDays?: number;

  /**
   * Maximum number of stream events to buffer before writing to DB
   * @default 50
   */
  streamBatchSize?: number;

  /**
   * Interval in milliseconds to flush stream buffers
   * @default 1000
   */
  streamFlushIntervalMs?: number;

  /**
   * Maximum size of the database file in MB
   * @default undefined (no limit)
   */
  maxSizeMB?: number;
}

export interface TelemetryRecord {
  /**
   * Auto-generated primary key
   */
  id?: number;

  /**
   * Session identifier
   */
  sessionId: string;

  /**
   * Type of telemetry event
   */
  eventType: "start" | "stream" | "end" | "error";

  /**
   * Agent type (e.g., "claude", "codex", etc.)
   */
  agentType: string;

  /**
   * Mode of operation
   */
  mode: string;

  /**
   * User prompt or input
   */
  prompt: string;

  /**
   * Stream data (only for stream events)
   */
  streamData?: string;

  /**
   * Sandbox identifier
   */
  sandboxId?: string;

  /**
   * Repository URL
   */
  repoUrl?: string;

  /**
   * Additional metadata as JSON
   */
  metadata?: Record<string, any>;

  /**
   * Event timestamp (Unix milliseconds)
   */
  timestamp: number;
}

export interface TelemetryQueryFilter {
  /**
   * Start timestamp (Unix milliseconds)
   */
  from?: number;

  /**
   * End timestamp (Unix milliseconds)
   */
  to?: number;

  /**
   * Filter by session ID
   */
  sessionId?: string;

  /**
   * Filter by event type
   */
  eventType?: "start" | "stream" | "end" | "error";

  /**
   * Filter by agent type
   */
  agentType?: string;

  /**
   * Filter by mode
   */
  mode?: string;

  /**
   * Limit number of results
   */
  limit?: number;

  /**
   * Offset for pagination
   */
  offset?: number;

  /**
   * Sort order (default: timestamp DESC)
   */
  orderBy?: "timestamp_asc" | "timestamp_desc";
}

export interface BatchBuffer {
  /**
   * Buffered telemetry records
   */
  records: TelemetryRecord[];

  /**
   * Timestamp when buffer was created
   */
  createdAt: number;

  /**
   * Last time buffer was updated
   */
  lastUpdated: number;
}

export interface TelemetryStats {
  /**
   * Total number of events
   */
  totalEvents: number;

  /**
   * Events by type
   */
  eventCounts: Record<string, number>;

  /**
   * Events by agent type
   */
  agentBreakdown: Record<string, number>;

  /**
   * Date range of stored events
   */
  dateRange: {
    earliest: number;
    latest: number;
  };

  /**
   * Database file size in bytes
   */
  dbSizeBytes: number;

  /**
   * Number of unique sessions
   */
  uniqueSessions: number;
}

/**
 * Custom error types for telemetry database operations
 */
export class TelemetryDBError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = "TelemetryDBError";
  }
}

export class TelemetryDBInitError extends TelemetryDBError {
  constructor(message: string, cause?: Error) {
    super(message, cause);
    this.name = "TelemetryDBInitError";
  }
}

export class TelemetryDBQueryError extends TelemetryDBError {
  constructor(message: string, cause?: Error) {
    super(message, cause);
    this.name = "TelemetryDBQueryError";
  }
} 