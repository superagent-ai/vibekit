CREATE TABLE `telemetry_audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`table_name` text NOT NULL,
	`record_id` text NOT NULL,
	`operation` text NOT NULL,
	`old_values` text,
	`new_values` text,
	`changed_fields` text,
	`user_id` text,
	`session_id` text,
	`reason` text,
	`metadata` text,
	`timestamp` real NOT NULL,
	`created_at` real DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_audit_table` ON `telemetry_audit_log` (`table_name`);--> statement-breakpoint
CREATE INDEX `idx_audit_record` ON `telemetry_audit_log` (`record_id`);--> statement-breakpoint
CREATE INDEX `idx_audit_operation` ON `telemetry_audit_log` (`operation`);--> statement-breakpoint
CREATE INDEX `idx_audit_timestamp` ON `telemetry_audit_log` (`timestamp`);--> statement-breakpoint
CREATE INDEX `idx_audit_session` ON `telemetry_audit_log` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_audit_compound` ON `telemetry_audit_log` (`table_name`,`record_id`,`timestamp`);--> statement-breakpoint
CREATE TABLE `telemetry_schema_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`version` text NOT NULL,
	`description` text NOT NULL,
	`migration_script` text,
	`rollback_script` text,
	`applied_at` real DEFAULT (unixepoch()) NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`metadata` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `telemetry_schema_versions_version_unique` ON `telemetry_schema_versions` (`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_schema_version` ON `telemetry_schema_versions` (`version`);--> statement-breakpoint
CREATE INDEX `idx_schema_applied` ON `telemetry_schema_versions` (`applied_at`);--> statement-breakpoint
CREATE INDEX `idx_schema_active` ON `telemetry_schema_versions` (`is_active`);--> statement-breakpoint
CREATE TABLE `telemetry_validation_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`table_name` text NOT NULL,
	`field_name` text NOT NULL,
	`rule_type` text NOT NULL,
	`rule_config` text NOT NULL,
	`error_message` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`priority` integer DEFAULT 100 NOT NULL,
	`created_at` real DEFAULT (unixepoch()) NOT NULL,
	`updated_at` real DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_validation_table_field` ON `telemetry_validation_rules` (`table_name`,`field_name`);--> statement-breakpoint
CREATE INDEX `idx_validation_active` ON `telemetry_validation_rules` (`is_active`);--> statement-breakpoint
CREATE INDEX `idx_validation_priority` ON `telemetry_validation_rules` (`priority`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_telemetry_buffers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`event_count` integer DEFAULT 0 NOT NULL,
	`buffer_data` text NOT NULL,
	`max_size` integer DEFAULT 50 NOT NULL,
	`created_at` real DEFAULT (unixepoch()) NOT NULL,
	`last_updated` real DEFAULT (unixepoch()) NOT NULL,
	`flushed_at` real,
	`flush_attempts` integer DEFAULT 0 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`schema_version` text DEFAULT '1.0.0' NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `telemetry_sessions`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_telemetry_buffers`("id", "session_id", "status", "event_count", "buffer_data", "max_size", "created_at", "last_updated", "flushed_at", "flush_attempts", "version", "schema_version") 
SELECT "id", "session_id", "status", "event_count", "buffer_data", "max_size", "created_at", "last_updated", "flushed_at", "flush_attempts", 1, '1.0.0' FROM `telemetry_buffers`;--> statement-breakpoint
DROP TABLE `telemetry_buffers`;--> statement-breakpoint
ALTER TABLE `__new_telemetry_buffers` RENAME TO `telemetry_buffers`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_buffers_session` ON `telemetry_buffers` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_buffers_status` ON `telemetry_buffers` (`status`);--> statement-breakpoint
CREATE INDEX `idx_buffers_created` ON `telemetry_buffers` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_buffers_version` ON `telemetry_buffers` (`version`);--> statement-breakpoint
CREATE TABLE `__new_telemetry_errors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text,
	`event_id` integer,
	`error_type` text NOT NULL,
	`error_message` text NOT NULL,
	`error_stack` text,
	`context` text,
	`severity` text DEFAULT 'medium' NOT NULL,
	`resolved` integer DEFAULT false NOT NULL,
	`metadata` text,
	`timestamp` real NOT NULL,
	`created_at` real DEFAULT (unixepoch()) NOT NULL,
	`resolved_at` real,
	`resolved_by` text,
	`version` integer DEFAULT 1 NOT NULL,
	`schema_version` text DEFAULT '1.0.0' NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `telemetry_sessions`(`id`) ON UPDATE cascade ON DELETE set null,
	FOREIGN KEY (`event_id`) REFERENCES `telemetry_events`(`id`) ON UPDATE cascade ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_telemetry_errors`("id", "session_id", "event_id", "error_type", "error_message", "error_stack", "context", "severity", "resolved", "metadata", "timestamp", "created_at", "resolved_at", "resolved_by", "version", "schema_version") 
SELECT "id", "session_id", "event_id", "error_type", "error_message", "error_stack", "context", "severity", "resolved", "metadata", "timestamp", "created_at", NULL, NULL, 1, '1.0.0' FROM `telemetry_errors`;--> statement-breakpoint
DROP TABLE `telemetry_errors`;--> statement-breakpoint
ALTER TABLE `__new_telemetry_errors` RENAME TO `telemetry_errors`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_errors_session` ON `telemetry_errors` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_errors_type` ON `telemetry_errors` (`error_type`);--> statement-breakpoint
CREATE INDEX `idx_errors_severity` ON `telemetry_errors` (`severity`);--> statement-breakpoint
CREATE INDEX `idx_errors_timestamp` ON `telemetry_errors` (`timestamp`);--> statement-breakpoint
CREATE INDEX `idx_errors_resolved` ON `telemetry_errors` (`resolved`);--> statement-breakpoint
CREATE INDEX `idx_errors_version` ON `telemetry_errors` (`version`);--> statement-breakpoint
CREATE TABLE `__new_telemetry_events` (
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
	`created_at` real DEFAULT (unixepoch()) NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`schema_version` text DEFAULT '1.0.0' NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `telemetry_sessions`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_telemetry_events`("id", "session_id", "event_type", "agent_type", "mode", "prompt", "stream_data", "sandbox_id", "repo_url", "metadata", "timestamp", "created_at", "version", "schema_version") 
SELECT "id", "session_id", "event_type", "agent_type", "mode", "prompt", "stream_data", "sandbox_id", "repo_url", "metadata", "timestamp", "created_at", 1, '1.0.0' FROM `telemetry_events`;--> statement-breakpoint
DROP TABLE `telemetry_events`;--> statement-breakpoint
ALTER TABLE `__new_telemetry_events` RENAME TO `telemetry_events`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_events_timestamp` ON `telemetry_events` (`timestamp`);--> statement-breakpoint
CREATE INDEX `idx_events_session` ON `telemetry_events` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_events_type` ON `telemetry_events` (`event_type`);--> statement-breakpoint
CREATE INDEX `idx_events_agent` ON `telemetry_events` (`agent_type`);--> statement-breakpoint
CREATE INDEX `idx_events_compound` ON `telemetry_events` (`session_id`,`event_type`,`timestamp`);--> statement-breakpoint
CREATE INDEX `idx_events_version` ON `telemetry_events` (`version`);--> statement-breakpoint
CREATE TABLE `__new_telemetry_sessions` (
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
	`created_at` real DEFAULT (unixepoch()) NOT NULL,
	`updated_at` real DEFAULT (unixepoch()) NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`schema_version` text DEFAULT '1.0.0' NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_telemetry_sessions`("id", "agent_type", "mode", "status", "start_time", "end_time", "duration", "event_count", "stream_event_count", "error_count", "sandbox_id", "repo_url", "metadata", "created_at", "updated_at", "version", "schema_version") 
SELECT "id", "agent_type", "mode", "status", "start_time", "end_time", "duration", "event_count", "stream_event_count", "error_count", "sandbox_id", "repo_url", "metadata", "created_at", "updated_at", 1, '1.0.0' FROM `telemetry_sessions`;--> statement-breakpoint
DROP TABLE `telemetry_sessions`;--> statement-breakpoint
ALTER TABLE `__new_telemetry_sessions` RENAME TO `telemetry_sessions`;--> statement-breakpoint
CREATE INDEX `idx_sessions_status` ON `telemetry_sessions` (`status`);--> statement-breakpoint
CREATE INDEX `idx_sessions_agent` ON `telemetry_sessions` (`agent_type`);--> statement-breakpoint
CREATE INDEX `idx_sessions_start_time` ON `telemetry_sessions` (`start_time`);--> statement-breakpoint
CREATE INDEX `idx_sessions_sandbox` ON `telemetry_sessions` (`sandbox_id`);--> statement-breakpoint
CREATE INDEX `idx_sessions_version` ON `telemetry_sessions` (`version`);--> statement-breakpoint
CREATE TABLE `__new_telemetry_stats` (
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
	`computed_at` real DEFAULT (unixepoch()) NOT NULL,
	`updated_at` real DEFAULT (unixepoch()) NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`schema_version` text DEFAULT '1.0.0' NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_telemetry_stats`("id", "stat_type", "stat_key", "total_events", "start_events", "stream_events", "end_events", "error_events", "unique_sessions", "agent_breakdown", "mode_breakdown", "avg_session_duration", "min_timestamp", "max_timestamp", "computed_at", "updated_at", "version", "schema_version") 
SELECT "id", "stat_type", "stat_key", "total_events", "start_events", "stream_events", "end_events", "error_events", "unique_sessions", "agent_breakdown", "mode_breakdown", "avg_session_duration", "min_timestamp", "max_timestamp", "computed_at", "updated_at", 1, '1.0.0' FROM `telemetry_stats`;--> statement-breakpoint
DROP TABLE `telemetry_stats`;--> statement-breakpoint
ALTER TABLE `__new_telemetry_stats` RENAME TO `telemetry_stats`;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_stats_type_key` ON `telemetry_stats` (`stat_type`,`stat_key`);--> statement-breakpoint
CREATE INDEX `idx_stats_type` ON `telemetry_stats` (`stat_type`);--> statement-breakpoint
CREATE INDEX `idx_stats_computed` ON `telemetry_stats` (`computed_at`);--> statement-breakpoint
CREATE INDEX `idx_stats_version` ON `telemetry_stats` (`version`);