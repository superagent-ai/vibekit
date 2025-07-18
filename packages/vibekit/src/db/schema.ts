import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

// Enums for better type safety
export const eventTypes = ['start', 'stream', 'end', 'error'] as const;
export const sessionStatuses = ['active', 'completed', 'failed', 'timeout'] as const;
export const bufferStatuses = ['pending', 'flushed', 'failed'] as const;

// Main telemetry events table
export const telemetryEvents = sqliteTable('telemetry_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: text('session_id').notNull(),
  eventType: text('event_type', { enum: eventTypes }).notNull(),
  agentType: text('agent_type').notNull(),
  mode: text('mode').notNull(),
  prompt: text('prompt').notNull(),
  streamData: text('stream_data'),
  sandboxId: text('sandbox_id'),
  repoUrl: text('repo_url'),
  metadata: text('metadata'), // JSON string
  timestamp: real('timestamp').notNull(), // Unix timestamp in milliseconds
  createdAt: real('created_at').notNull().default(Date.now()),
}, (table) => ({
  // Indexes for common query patterns
  timestampIdx: index('idx_events_timestamp').on(table.timestamp),
  sessionIdx: index('idx_events_session').on(table.sessionId),
  eventTypeIdx: index('idx_events_type').on(table.eventType),
  agentTypeIdx: index('idx_events_agent').on(table.agentType),
  compoundIdx: index('idx_events_compound').on(table.sessionId, table.eventType, table.timestamp),
}));

// Session metadata table
export const telemetrySessions = sqliteTable('telemetry_sessions', {
  id: text('id').primaryKey(), // Session UUID
  agentType: text('agent_type').notNull(),
  mode: text('mode').notNull(),
  status: text('status', { enum: sessionStatuses }).notNull().default('active'),
  startTime: real('start_time').notNull(),
  endTime: real('end_time'),
  duration: real('duration'), // Calculated duration in milliseconds
  eventCount: integer('event_count').notNull().default(0),
  streamEventCount: integer('stream_event_count').notNull().default(0),
  errorCount: integer('error_count').notNull().default(0),
  sandboxId: text('sandbox_id'),
  repoUrl: text('repo_url'),
  metadata: text('metadata'), // JSON string
  createdAt: real('created_at').notNull().default(Date.now()),
  updatedAt: real('updated_at').notNull().default(Date.now()),
}, (table) => ({
  statusIdx: index('idx_sessions_status').on(table.status),
  agentTypeIdx: index('idx_sessions_agent').on(table.agentType),
  startTimeIdx: index('idx_sessions_start_time').on(table.startTime),
  sandboxIdx: index('idx_sessions_sandbox').on(table.sandboxId),
}));

// Stream event buffers for batching
export const telemetryBuffers = sqliteTable('telemetry_buffers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: text('session_id').notNull(),
  status: text('status', { enum: bufferStatuses }).notNull().default('pending'),
  eventCount: integer('event_count').notNull().default(0),
  bufferData: text('buffer_data').notNull(), // JSON array of events
  maxSize: integer('max_size').notNull().default(50),
  createdAt: real('created_at').notNull().default(Date.now()),
  lastUpdated: real('last_updated').notNull().default(Date.now()),
  flushedAt: real('flushed_at'),
  flushAttempts: integer('flush_attempts').notNull().default(0),
}, (table) => ({
  sessionIdx: index('idx_buffers_session').on(table.sessionId),
  statusIdx: index('idx_buffers_status').on(table.status),
  createdAtIdx: index('idx_buffers_created').on(table.createdAt),
}));

// Pre-computed statistics table
export const telemetryStats = sqliteTable('telemetry_stats', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  statType: text('stat_type').notNull(), // e.g., 'daily', 'weekly', 'session'
  statKey: text('stat_key').notNull(), // e.g., '2024-07-18', 'session-123'
  totalEvents: integer('total_events').notNull().default(0),
  startEvents: integer('start_events').notNull().default(0),
  streamEvents: integer('stream_events').notNull().default(0),
  endEvents: integer('end_events').notNull().default(0),
  errorEvents: integer('error_events').notNull().default(0),
  uniqueSessions: integer('unique_sessions').notNull().default(0),
  agentBreakdown: text('agent_breakdown'), // JSON object
  modeBreakdown: text('mode_breakdown'), // JSON object
  avgSessionDuration: real('avg_session_duration'),
  minTimestamp: real('min_timestamp'),
  maxTimestamp: real('max_timestamp'),
  computedAt: real('computed_at').notNull().default(Date.now()),
  updatedAt: real('updated_at').notNull().default(Date.now()),
}, (table) => ({
  statTypeKeyIdx: uniqueIndex('idx_stats_type_key').on(table.statType, table.statKey),
  statTypeIdx: index('idx_stats_type').on(table.statType),
  computedAtIdx: index('idx_stats_computed').on(table.computedAt),
}));

// Error tracking table
export const telemetryErrors = sqliteTable('telemetry_errors', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: text('session_id'),
  eventId: integer('event_id'),
  errorType: text('error_type').notNull(), // e.g., 'db_error', 'buffer_overflow', 'serialize_error'
  errorMessage: text('error_message').notNull(),
  errorStack: text('error_stack'),
  context: text('context'), // JSON object with additional context
  severity: text('severity').notNull().default('error'), // 'low', 'medium', 'high', 'critical'
  resolved: integer('resolved', { mode: 'boolean' }).notNull().default(false),
  metadata: text('metadata'), // JSON string
  timestamp: real('timestamp').notNull(),
  createdAt: real('created_at').notNull().default(Date.now()),
}, (table) => ({
  sessionIdx: index('idx_errors_session').on(table.sessionId),
  errorTypeIdx: index('idx_errors_type').on(table.errorType),
  severityIdx: index('idx_errors_severity').on(table.severity),
  timestampIdx: index('idx_errors_timestamp').on(table.timestamp),
  resolvedIdx: index('idx_errors_resolved').on(table.resolved),
}));

// Define relations between tables
export const telemetrySessionsRelations = relations(telemetrySessions, ({ many }) => ({
  events: many(telemetryEvents),
  buffers: many(telemetryBuffers),
  errors: many(telemetryErrors),
}));

export const telemetryEventsRelations = relations(telemetryEvents, ({ one }) => ({
  session: one(telemetrySessions, {
    fields: [telemetryEvents.sessionId],
    references: [telemetrySessions.id],
  }),
}));

export const telemetryBuffersRelations = relations(telemetryBuffers, ({ one }) => ({
  session: one(telemetrySessions, {
    fields: [telemetryBuffers.sessionId],
    references: [telemetrySessions.id],
  }),
}));

export const telemetryErrorsRelations = relations(telemetryErrors, ({ one }) => ({
  session: one(telemetrySessions, {
    fields: [telemetryErrors.sessionId],
    references: [telemetrySessions.id],
  }),
  event: one(telemetryEvents, {
    fields: [telemetryErrors.eventId],
    references: [telemetryEvents.id],
  }),
})); 