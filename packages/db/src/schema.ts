import { sqliteTable, text, integer, real, index, uniqueIndex, foreignKey } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

// Enums for better type safety
export const eventTypes = ['start', 'stream', 'end', 'error'] as const;
export const sessionStatuses = ['active', 'completed', 'failed', 'timeout'] as const;
export const bufferStatuses = ['pending', 'flushed', 'failed'] as const;
export const auditOperations = ['INSERT', 'UPDATE', 'DELETE'] as const;
export const severityLevels = ['low', 'medium', 'high', 'critical'] as const;

// Main telemetry events table with foreign key constraints
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
  // Data versioning fields
  version: integer('version').notNull().default(1),
  schemaVersion: text('schema_version').notNull().default('1.0.0'),
}, (table) => ({
  // Indexes for common query patterns
  timestampIdx: index('idx_events_timestamp').on(table.timestamp),
  sessionIdx: index('idx_events_session').on(table.sessionId),
  eventTypeIdx: index('idx_events_type').on(table.eventType),
  agentTypeIdx: index('idx_events_agent').on(table.agentType),
  compoundIdx: index('idx_events_compound').on(table.sessionId, table.eventType, table.timestamp),
  versionIdx: index('idx_events_version').on(table.version),
  
  // Performance optimization indexes
  modeIdx: index('idx_events_mode').on(table.mode), // Critical for action queries
  timestampDescIdx: index('idx_events_timestamp_desc').on(table.timestamp), // For ORDER BY timestamp DESC
  sessionTimeDescIdx: index('idx_events_session_time_desc').on(table.sessionId, table.timestamp), // Common compound query
  
  // Foreign key constraint
  sessionFk: foreignKey({
    columns: [table.sessionId],
    foreignColumns: [telemetrySessions.id],
    name: 'fk_events_session'
  }).onDelete('cascade').onUpdate('cascade'),
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
  // Data versioning fields
  version: integer('version').notNull().default(1),
  schemaVersion: text('schema_version').notNull().default('1.0.0'),
}, (table) => ({
  statusIdx: index('idx_sessions_status').on(table.status),
  agentTypeIdx: index('idx_sessions_agent').on(table.agentType),
  startTimeIdx: index('idx_sessions_start_time').on(table.startTime),
  sandboxIdx: index('idx_sessions_sandbox').on(table.sandboxId),
  versionIdx: index('idx_sessions_version').on(table.version),
  
  // Performance optimization indexes
  endTimeIdx: index('idx_sessions_end_time').on(table.endTime), // For completed session queries
  statusStartTimeIdx: index('idx_sessions_status_start_time').on(table.status, table.startTime), // For active session queries
}));

// Stream event buffers for batching with foreign key constraints
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
  // Data versioning fields
  version: integer('version').notNull().default(1),
  schemaVersion: text('schema_version').notNull().default('1.0.0'),
}, (table) => ({
  sessionIdx: index('idx_buffers_session').on(table.sessionId),
  statusIdx: index('idx_buffers_status').on(table.status),
  createdAtIdx: index('idx_buffers_created').on(table.createdAt),
  versionIdx: index('idx_buffers_version').on(table.version),
  // Foreign key constraint
  sessionFk: foreignKey({
    columns: [table.sessionId],
    foreignColumns: [telemetrySessions.id],
    name: 'fk_buffers_session'
  }).onDelete('cascade').onUpdate('cascade'),
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
  // Data versioning fields
  version: integer('version').notNull().default(1),
  schemaVersion: text('schema_version').notNull().default('1.0.0'),
}, (table) => ({
  statTypeKeyIdx: uniqueIndex('idx_stats_type_key').on(table.statType, table.statKey),
  statTypeIdx: index('idx_stats_type').on(table.statType),
  computedAtIdx: index('idx_stats_computed').on(table.computedAt),
  versionIdx: index('idx_stats_version').on(table.version),
}));

// Error tracking table with foreign key constraints
export const telemetryErrors = sqliteTable('telemetry_errors', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: text('session_id'),
  eventId: integer('event_id'),
  errorType: text('error_type').notNull(), // e.g., 'db_error', 'buffer_overflow', 'serialize_error'
  errorMessage: text('error_message').notNull(),
  errorStack: text('error_stack'),
  context: text('context'), // JSON object with additional context
  severity: text('severity', { enum: severityLevels }).notNull().default('medium'),
  resolved: integer('resolved', { mode: 'boolean' }).notNull().default(false),
  metadata: text('metadata'), // JSON string
  timestamp: real('timestamp').notNull(),
  createdAt: real('created_at').notNull().default(Date.now()),
  resolvedAt: real('resolved_at'),
  resolvedBy: text('resolved_by'),
  // Data versioning fields
  version: integer('version').notNull().default(1),
  schemaVersion: text('schema_version').notNull().default('1.0.0'),
}, (table) => ({
  sessionIdx: index('idx_errors_session').on(table.sessionId),
  errorTypeIdx: index('idx_errors_type').on(table.errorType),
  severityIdx: index('idx_errors_severity').on(table.severity),
  timestampIdx: index('idx_errors_timestamp').on(table.timestamp),
  resolvedIdx: index('idx_errors_resolved').on(table.resolved),
  versionIdx: index('idx_errors_version').on(table.version),
  // Foreign key constraints
  sessionFk: foreignKey({
    columns: [table.sessionId],
    foreignColumns: [telemetrySessions.id],
    name: 'fk_errors_session'
  }).onDelete('set null').onUpdate('cascade'),
  eventFk: foreignKey({
    columns: [table.eventId],
    foreignColumns: [telemetryEvents.id],
    name: 'fk_errors_event'
  }).onDelete('set null').onUpdate('cascade'),
}));

// NEW: Audit trail table for tracking all data modifications
export const telemetryAuditLog = sqliteTable('telemetry_audit_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tableName: text('table_name').notNull(), // Which table was modified
  recordId: text('record_id').notNull(), // ID of the modified record
  operation: text('operation', { enum: auditOperations }).notNull(),
  oldValues: text('old_values'), // JSON string of previous values
  newValues: text('new_values'), // JSON string of new values
  changedFields: text('changed_fields'), // JSON array of field names that changed
  userId: text('user_id'), // Who made the change (if applicable)
  sessionId: text('session_id'), // Related session (if applicable)
  reason: text('reason'), // Optional reason for the change
  metadata: text('metadata'), // Additional context as JSON
  timestamp: real('timestamp').notNull(),
  createdAt: real('created_at').notNull().default(Date.now()),
}, (table) => ({
  tableNameIdx: index('idx_audit_table').on(table.tableName),
  recordIdIdx: index('idx_audit_record').on(table.recordId),
  operationIdx: index('idx_audit_operation').on(table.operation),
  timestampIdx: index('idx_audit_timestamp').on(table.timestamp),
  sessionIdx: index('idx_audit_session').on(table.sessionId),
  compoundIdx: index('idx_audit_compound').on(table.tableName, table.recordId, table.timestamp),
}));

// NEW: Data validation rules table
export const telemetryValidationRules = sqliteTable('telemetry_validation_rules', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tableName: text('table_name').notNull(),
  fieldName: text('field_name').notNull(),
  ruleType: text('rule_type').notNull(), // 'required', 'pattern', 'range', 'enum', 'json_schema'
  ruleConfig: text('rule_config').notNull(), // JSON configuration for the rule
  errorMessage: text('error_message').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  priority: integer('priority').notNull().default(100), // Lower numbers = higher priority
  createdAt: real('created_at').notNull().default(Date.now()),
  updatedAt: real('updated_at').notNull().default(Date.now()),
}, (table) => ({
  tableFieldIdx: index('idx_validation_table_field').on(table.tableName, table.fieldName),
  activeIdx: index('idx_validation_active').on(table.isActive),
  priorityIdx: index('idx_validation_priority').on(table.priority),
}));

// NEW: Schema version tracking table
export const telemetrySchemaVersions = sqliteTable('telemetry_schema_versions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  version: text('version').notNull().unique(), // e.g., '1.0.0', '1.1.0'
  description: text('description').notNull(),
  migrationScript: text('migration_script'), // SQL commands to apply this version
  rollbackScript: text('rollback_script'), // SQL commands to rollback this version
  appliedAt: real('applied_at').notNull().default(Date.now()),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  metadata: text('metadata'), // Additional version metadata as JSON
}, (table) => ({
  versionIdx: uniqueIndex('idx_schema_version').on(table.version),
  appliedAtIdx: index('idx_schema_applied').on(table.appliedAt),
  activeIdx: index('idx_schema_active').on(table.isActive),
}));

// Define relations between tables
export const telemetrySessionsRelations = relations(telemetrySessions, ({ many }) => ({
  events: many(telemetryEvents),
  buffers: many(telemetryBuffers),
  errors: many(telemetryErrors),
}));

export const telemetryEventsRelations = relations(telemetryEvents, ({ one, many }) => ({
  session: one(telemetrySessions, {
    fields: [telemetryEvents.sessionId],
    references: [telemetrySessions.id],
  }),
  errors: many(telemetryErrors),
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

// Export types for type safety
export type TelemetryEvent = typeof telemetryEvents.$inferSelect;
export type NewTelemetryEvent = typeof telemetryEvents.$inferInsert;
export type TelemetrySession = typeof telemetrySessions.$inferSelect;
export type NewTelemetrySession = typeof telemetrySessions.$inferInsert;
export type TelemetryBuffer = typeof telemetryBuffers.$inferSelect;
export type NewTelemetryBuffer = typeof telemetryBuffers.$inferInsert;
export type TelemetryStats = typeof telemetryStats.$inferSelect;
export type NewTelemetryStats = typeof telemetryStats.$inferInsert;
export type TelemetryError = typeof telemetryErrors.$inferSelect;
export type NewTelemetryError = typeof telemetryErrors.$inferInsert;
export type TelemetryAuditLog = typeof telemetryAuditLog.$inferSelect;
export type NewTelemetryAuditLog = typeof telemetryAuditLog.$inferInsert;
export type TelemetryValidationRule = typeof telemetryValidationRules.$inferSelect;
export type NewTelemetryValidationRule = typeof telemetryValidationRules.$inferInsert;
export type TelemetrySchemaVersion = typeof telemetrySchemaVersions.$inferSelect;
export type NewTelemetrySchemaVersion = typeof telemetrySchemaVersions.$inferInsert; 