// Internal imports for helper functions
import { 
  telemetryEvents, 
  telemetrySessions, 
  telemetryStats,
  telemetryErrors,
  telemetryBuffers,
  telemetryAuditLog,
} from './schema';
import type { DrizzleTelemetryConfig } from './types';
import { initializeTelemetryDB, getTelemetryDB } from './connection';

// Core schema and types exports
export { 
  telemetryEvents, 
  telemetrySessions, 
  telemetryStats,
  telemetryErrors,
  telemetryBuffers,
  telemetryAuditLog,
} from './schema';

export type { 
  TelemetryEvent,
  TelemetrySession,
  TelemetryStats,
  TelemetryError,
  TelemetryBuffer,
  TelemetryAuditLog,
  NewTelemetryEvent,
  NewTelemetrySession,
  NewTelemetryStats,
  NewTelemetryError,
  NewTelemetryBuffer,
  NewTelemetryAuditLog,
} from './schema';

// Configuration types
export type { DrizzleTelemetryConfig } from './types';

// Database connection exports
export {
  DrizzleTelemetryDB,
  getTelemetryDB,
  initializeTelemetryDB,
  closeTelemetryDB,
} from './connection';

// Operations exports
export { DrizzleTelemetryOperations } from './operations';

// Legacy compatibility
// TelemetryData is now exported from the consolidated TelemetryService
export type { TelemetryData } from '../services/telemetry';

// Phase 3: Advanced Features exports
export { DrizzleTelemetryPerformanceOptimizer } from './performance-optimizer';
// Note: Phase 3 test exports removed for consolidation

// Utility functions and constants
export const DB_VERSION = '1.0.0';
export const DEFAULT_DB_PATH = '.vibekit/telemetry.db';
export const DEFAULT_BATCH_SIZE = 50;
export const DEFAULT_FLUSH_INTERVAL = 1000;

// Configuration helpers
export function createDefaultConfig(dbPath?: string): DrizzleTelemetryConfig {
  return {
    dbPath: dbPath || DEFAULT_DB_PATH,
    enableQueryLogging: false,
    enableWAL: true,
    queryTimeoutMs: 5000,
    streamBatchSize: DEFAULT_BATCH_SIZE,
    streamFlushIntervalMs: DEFAULT_FLUSH_INTERVAL,
  };
}

// Database initialization helper
export async function initializeDatabase(config?: Partial<DrizzleTelemetryConfig>): Promise<void> {
  const fullConfig = createDefaultConfig(config?.dbPath);
  Object.assign(fullConfig, config);
  
  await initializeTelemetryDB(fullConfig);
}

// Helper to check if database exists
export function isDatabaseInitialized(dbPath: string = DEFAULT_DB_PATH): boolean {
  try {
    const fs = require('fs');
    return fs.existsSync(dbPath);
  } catch {
    return false;
  }
}

// Export health check functionality
export async function checkDatabaseHealth(dbPath: string = DEFAULT_DB_PATH): Promise<{
  exists: boolean;
  accessible: boolean;
  version: string;
  recordCount?: number;
}> {
  const exists = isDatabaseInitialized(dbPath);
  
  if (!exists) {
    return {
      exists: false,
      accessible: false,
      version: DB_VERSION,
    };
  }

  try {
    // Try to initialize the database to test accessibility
    await getTelemetryDB();
    
    return {
      exists: true,
      accessible: true,
      version: DB_VERSION,
    };
  } catch (error) {
    return {
      exists: true,
      accessible: false,
      version: DB_VERSION,
    };
  }
} 