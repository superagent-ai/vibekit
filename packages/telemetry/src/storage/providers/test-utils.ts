import { initializeTelemetryDB } from '@vibe-kit/db';
import Database from 'better-sqlite3';

/**
 * Create the telemetry tables directly for testing
 * This bypasses the migration system and creates tables immediately
 */
export async function createTelemetryTablesForTesting(dbPath: string): Promise<void> {
  const db = new Database(dbPath);
  
  // Create all tables using the migration SQL
  db.exec(`
    CREATE TABLE IF NOT EXISTS telemetry_sessions (
      id text PRIMARY KEY NOT NULL,
      agent_type text NOT NULL,
      mode text NOT NULL,
      status text DEFAULT 'active' NOT NULL,
      start_time real NOT NULL,
      end_time real,
      duration real,
      event_count integer DEFAULT 0 NOT NULL,
      stream_event_count integer DEFAULT 0 NOT NULL,
      error_count integer DEFAULT 0 NOT NULL,
      sandbox_id text,
      repo_url text,
      metadata text,
      created_at real DEFAULT (unixepoch() * 1000) NOT NULL,
      updated_at real DEFAULT (unixepoch() * 1000) NOT NULL,
      version integer DEFAULT 1 NOT NULL,
      schema_version text DEFAULT '1.0.0' NOT NULL
    );

    CREATE TABLE IF NOT EXISTS telemetry_events (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      session_id text NOT NULL,
      event_type text NOT NULL,
      agent_type text NOT NULL,
      mode text NOT NULL,
      prompt text NOT NULL,
      stream_data text,
      sandbox_id text,
      repo_url text,
      metadata text,
      timestamp real NOT NULL,
      created_at real DEFAULT (unixepoch() * 1000) NOT NULL,
      version integer DEFAULT 1 NOT NULL,
      schema_version text DEFAULT '1.0.0' NOT NULL
    );

    CREATE TABLE IF NOT EXISTS telemetry_buffers (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      session_id text NOT NULL,
      status text DEFAULT 'pending' NOT NULL,
      event_count integer DEFAULT 0 NOT NULL,
      buffer_data text NOT NULL,
      max_size integer DEFAULT 50 NOT NULL,
      created_at real DEFAULT (unixepoch() * 1000) NOT NULL,
      last_updated real DEFAULT (unixepoch() * 1000) NOT NULL,
      flushed_at real,
      flush_attempts integer DEFAULT 0 NOT NULL,
      version integer DEFAULT 1 NOT NULL,
      schema_version text DEFAULT '1.0.0' NOT NULL
    );

    CREATE TABLE IF NOT EXISTS telemetry_errors (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      session_id text,
      event_id integer,
      error_type text NOT NULL,
      error_message text NOT NULL,
      error_stack text,
      context text,
      severity text DEFAULT 'error' NOT NULL,
      resolved integer DEFAULT 0 NOT NULL,
      metadata text,
      timestamp real NOT NULL,
      created_at real DEFAULT (unixepoch() * 1000) NOT NULL,
      resolved_at real,
      resolved_by text,
      version integer DEFAULT 1 NOT NULL,
      schema_version text DEFAULT '1.0.0' NOT NULL
    );

    CREATE TABLE IF NOT EXISTS telemetry_stats (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      stat_type text NOT NULL,
      stat_key text NOT NULL,
      total_events integer DEFAULT 0 NOT NULL,
      start_events integer DEFAULT 0 NOT NULL,
      stream_events integer DEFAULT 0 NOT NULL,
      end_events integer DEFAULT 0 NOT NULL,
      error_events integer DEFAULT 0 NOT NULL,
      unique_sessions integer DEFAULT 0 NOT NULL,
      agent_breakdown text,
      mode_breakdown text,
      avg_session_duration real,
      min_timestamp real,
      max_timestamp real,
      computed_at real DEFAULT (unixepoch() * 1000) NOT NULL,
      updated_at real DEFAULT (unixepoch() * 1000) NOT NULL,
      version integer DEFAULT 1 NOT NULL,
      schema_version text DEFAULT '1.0.0' NOT NULL
    );
    
    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_events_timestamp ON telemetry_events (timestamp);
    CREATE INDEX IF NOT EXISTS idx_events_session ON telemetry_events (session_id);
    CREATE INDEX IF NOT EXISTS idx_events_type ON telemetry_events (event_type);
    CREATE INDEX IF NOT EXISTS idx_events_agent ON telemetry_events (agent_type);
    CREATE INDEX IF NOT EXISTS idx_events_compound ON telemetry_events (session_id, event_type, timestamp);
    
    CREATE INDEX IF NOT EXISTS idx_sessions_status ON telemetry_sessions (status);
    CREATE INDEX IF NOT EXISTS idx_sessions_agent ON telemetry_sessions (agent_type);
    CREATE INDEX IF NOT EXISTS idx_sessions_start_time ON telemetry_sessions (start_time);
    CREATE INDEX IF NOT EXISTS idx_sessions_sandbox ON telemetry_sessions (sandbox_id);
    
    CREATE INDEX IF NOT EXISTS idx_buffers_session ON telemetry_buffers (session_id);
    CREATE INDEX IF NOT EXISTS idx_buffers_status ON telemetry_buffers (status);
    CREATE INDEX IF NOT EXISTS idx_buffers_created ON telemetry_buffers (created_at);
    
    CREATE INDEX IF NOT EXISTS idx_errors_session ON telemetry_errors (session_id);
    CREATE INDEX IF NOT EXISTS idx_errors_type ON telemetry_errors (error_type);
    CREATE INDEX IF NOT EXISTS idx_errors_severity ON telemetry_errors (severity);
    CREATE INDEX IF NOT EXISTS idx_errors_timestamp ON telemetry_errors (timestamp);
    CREATE INDEX IF NOT EXISTS idx_errors_resolved ON telemetry_errors (resolved);
    
    CREATE UNIQUE INDEX IF NOT EXISTS idx_stats_type_key ON telemetry_stats (stat_type, stat_key);
    CREATE INDEX IF NOT EXISTS idx_stats_type ON telemetry_stats (stat_type);
    CREATE INDEX IF NOT EXISTS idx_stats_computed ON telemetry_stats (computed_at);
  `);
  
  db.close();
}