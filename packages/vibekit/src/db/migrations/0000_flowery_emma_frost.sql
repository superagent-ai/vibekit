CREATE TABLE `telemetry_buffers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`event_count` integer DEFAULT 0 NOT NULL,
	`buffer_data` text NOT NULL,
	`max_size` integer DEFAULT 50 NOT NULL,
	`created_at` real DEFAULT 1752850264865 NOT NULL,
	`last_updated` real DEFAULT 1752850264865 NOT NULL,
	`flushed_at` real,
	`flush_attempts` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_buffers_session` ON `telemetry_buffers` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_buffers_status` ON `telemetry_buffers` (`status`);--> statement-breakpoint
CREATE INDEX `idx_buffers_created` ON `telemetry_buffers` (`created_at`);--> statement-breakpoint
CREATE TABLE `telemetry_errors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text,
	`event_id` integer,
	`error_type` text NOT NULL,
	`error_message` text NOT NULL,
	`error_stack` text,
	`context` text,
	`severity` text DEFAULT 'error' NOT NULL,
	`resolved` integer DEFAULT false NOT NULL,
	`metadata` text,
	`timestamp` real NOT NULL,
	`created_at` real DEFAULT 1752850264865 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_errors_session` ON `telemetry_errors` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_errors_type` ON `telemetry_errors` (`error_type`);--> statement-breakpoint
CREATE INDEX `idx_errors_severity` ON `telemetry_errors` (`severity`);--> statement-breakpoint
CREATE INDEX `idx_errors_timestamp` ON `telemetry_errors` (`timestamp`);--> statement-breakpoint
CREATE INDEX `idx_errors_resolved` ON `telemetry_errors` (`resolved`);--> statement-breakpoint
CREATE TABLE `telemetry_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`event_type` text NOT NULL,
	`agent_type` text NOT NULL,
	`mode` text NOT NULL,
	`prompt` text NOT NULL,
	`stream_data` text,
	`sandbox_id` text,
	`repo_url` text,
	`metadata` text,
	`timestamp` real NOT NULL,
	`created_at` real DEFAULT 1752850264865 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_events_timestamp` ON `telemetry_events` (`timestamp`);--> statement-breakpoint
CREATE INDEX `idx_events_session` ON `telemetry_events` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_events_type` ON `telemetry_events` (`event_type`);--> statement-breakpoint
CREATE INDEX `idx_events_agent` ON `telemetry_events` (`agent_type`);--> statement-breakpoint
CREATE INDEX `idx_events_compound` ON `telemetry_events` (`session_id`,`event_type`,`timestamp`);--> statement-breakpoint
CREATE TABLE `telemetry_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_type` text NOT NULL,
	`mode` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`start_time` real NOT NULL,
	`end_time` real,
	`duration` real,
	`event_count` integer DEFAULT 0 NOT NULL,
	`stream_event_count` integer DEFAULT 0 NOT NULL,
	`error_count` integer DEFAULT 0 NOT NULL,
	`sandbox_id` text,
	`repo_url` text,
	`metadata` text,
	`created_at` real DEFAULT 1752850264865 NOT NULL,
	`updated_at` real DEFAULT 1752850264865 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_sessions_status` ON `telemetry_sessions` (`status`);--> statement-breakpoint
CREATE INDEX `idx_sessions_agent` ON `telemetry_sessions` (`agent_type`);--> statement-breakpoint
CREATE INDEX `idx_sessions_start_time` ON `telemetry_sessions` (`start_time`);--> statement-breakpoint
CREATE INDEX `idx_sessions_sandbox` ON `telemetry_sessions` (`sandbox_id`);--> statement-breakpoint
CREATE TABLE `telemetry_stats` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`stat_type` text NOT NULL,
	`stat_key` text NOT NULL,
	`total_events` integer DEFAULT 0 NOT NULL,
	`start_events` integer DEFAULT 0 NOT NULL,
	`stream_events` integer DEFAULT 0 NOT NULL,
	`end_events` integer DEFAULT 0 NOT NULL,
	`error_events` integer DEFAULT 0 NOT NULL,
	`unique_sessions` integer DEFAULT 0 NOT NULL,
	`agent_breakdown` text,
	`mode_breakdown` text,
	`avg_session_duration` real,
	`min_timestamp` real,
	`max_timestamp` real,
	`computed_at` real DEFAULT 1752850264865 NOT NULL,
	`updated_at` real DEFAULT 1752850264865 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_stats_type_key` ON `telemetry_stats` (`stat_type`,`stat_key`);--> statement-breakpoint
CREATE INDEX `idx_stats_type` ON `telemetry_stats` (`stat_type`);--> statement-breakpoint
CREATE INDEX `idx_stats_computed` ON `telemetry_stats` (`computed_at`);