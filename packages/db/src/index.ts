/**
 * @vibe-kit/db - Standalone database package for VibeKit telemetry
 * 
 * This package provides a complete database layer using Drizzle ORM with SQLite
 * for storing and managing VibeKit telemetry data.
 */

// Import types for internal use
import type { DrizzleTelemetryConfig } from './types';

// Core database management
export {
  DrizzleTelemetryDB,
  getTelemetryDB,
  initializeTelemetryDB,
  closeTelemetryDB,
} from './connection';

// Database operations
export { DrizzleTelemetryOperations } from './operations';

// Schema definitions and tables
export {
  // Table definitions
  telemetryEvents,
  telemetrySessions,
  telemetryBuffers,
  telemetryStats,
  telemetryErrors,
  telemetryAuditLog,
  telemetryValidationRules,
  telemetrySchemaVersions,
  
  // Relations
  telemetrySessionsRelations,
  telemetryEventsRelations,
  telemetryBuffersRelations,
  telemetryErrorsRelations,
  
  // Enums
  eventTypes,
  sessionStatuses,
  bufferStatuses,
  auditOperations,
  severityLevels,
} from './schema';

// Type definitions
export type {
  // Core types
  TelemetryEvent,
  NewTelemetryEvent,
  TelemetrySession,
  NewTelemetrySession,
  TelemetryBuffer,
  NewTelemetryBuffer,
  TelemetryStatsRecord,
  NewTelemetryStatsRecord,
  TelemetryError,
  NewTelemetryError,
  
  // Enum types
  EventType,
  SessionStatus,
  BufferStatus,
  ErrorSeverity,
  
  // Event payload types
  StreamEventData,
  StartEventData,
  EndEventData,
  ErrorEventData,
  
  // Relation types
  SessionWithEvents,
  EventWithSession,
  
  // Query filter types
  TelemetryQueryFilter,
  SessionQueryFilter,
  BufferQueryFilter,
  ErrorQueryFilter,
  
  // Statistics types
  AgentBreakdown,
  ModeBreakdown,
  EventBreakdown,
  TelemetryStatsSummary,
  
  // Operation result types
  BatchInsertResult,
  StreamBufferData,
  
  // Configuration types
  DrizzleTelemetryConfig,
  
  // Migration types
  MigrationResult,
  
  // Performance monitoring types
  QueryMetrics,
  DatabaseMetrics,
} from './types';

// Error classes
export {
  DrizzleTelemetryError,
  DrizzleTelemetryConnectionError,
  DrizzleTelemetryQueryError,
  DrizzleTelemetryMigrationError,
} from './types';

// Default configuration
export const DEFAULT_DB_CONFIG: DrizzleTelemetryConfig = {
  dbPath: '.vibekit/telemetry.db',
  pruneDays: 30,
  streamBatchSize: 50,
  streamFlushIntervalMs: 1000,
  maxSizeMB: 100,
  enableWAL: true,
  enableForeignKeys: true,
  poolSize: 5,
  queryTimeoutMs: 30000,
  enableQueryLogging: false,
  enableMetrics: true,
};

// Version information
export const DB_VERSION = '1.0.0';
export const SCHEMA_VERSION = '1.0.0'; 