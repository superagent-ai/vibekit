import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const telemetryEvents = sqliteTable('telemetry_events', {
  id: text('id').primaryKey(),
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
  createdAt: integer('created_at').default(sql`(strftime('%s', 'now'))`),
}, (table) => ({
  sessionIdx: index('idx_session_id').on(table.sessionId),
  timestampIdx: index('idx_timestamp').on(table.timestamp),
  categoryIdx: index('idx_category').on(table.category),
  eventTypeIdx: index('idx_event_type').on(table.eventType),
  categoryActionIdx: index('idx_category_action').on(table.category, table.action),
}));

export const telemetrySessions = sqliteTable('telemetry_sessions', {
  id: text('id').primaryKey(),
  startTime: integer('start_time').notNull(),
  endTime: integer('end_time'),
  status: text('status').notNull(), // active, completed, error
  eventCount: integer('event_count').default(0),
  errorCount: integer('error_count').default(0),
  metadata: text('metadata'), // JSON
  createdAt: integer('created_at').default(sql`(strftime('%s', 'now'))`),
  updatedAt: integer('updated_at').default(sql`(strftime('%s', 'now'))`),
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