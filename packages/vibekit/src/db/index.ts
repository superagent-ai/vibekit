/**
 * Database Module Exports
 * 
 * Core telemetry database functionality using Drizzle ORM
 * Advanced features have been archived and are available in db/archived/
 */

// Core database operations (actively used)
export { DrizzleTelemetryOperations } from './operations';
export { 
  initializeTelemetryDB, 
  getTelemetryDB, 
  closeTelemetryDB,
  type DrizzleTelemetryDB
} from './connection';

// Schema exports
export { 
  telemetryEvents, 
  telemetrySessions, 
  telemetryStats,
  telemetryErrors,
  telemetryBuffers,
  telemetryAuditLog,
  eventTypes,
  sessionStatuses,
  bufferStatuses,
  auditOperations,
  severityLevels
} from './schema';

// Type exports
export type { 
  TelemetryEvent,
  TelemetrySession,
  TelemetryBuffer,
  TelemetryStatsRecord,
  TelemetryError,
  NewTelemetryEvent,
  NewTelemetrySession,
  NewTelemetryBuffer,
  NewTelemetryStatsRecord,
  NewTelemetryError,
  EventType,
  SessionStatus,
  BufferStatus,
  ErrorSeverity,
  StreamEventData,
  StartEventData,
  EndEventData,
  DrizzleTelemetryConfig
} from './types';

// TelemetryData type is now exported from the consolidated TelemetryService
export type { TelemetryData } from '../services/telemetry';

// Note: Advanced features like analytics, export, performance monitoring,
// and data integrity have been moved to db/archived/ since they're not
// currently being used in the consolidated telemetry service 