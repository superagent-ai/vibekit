// Schema exports
export * from './schema';

// Type exports
export * from './types';

// Database connection exports
export {
  DrizzleTelemetryDB,
  getTelemetryDB,
  initializeTelemetryDB,
  closeTelemetryDB,
} from './connection';

// Operations exports
export { DrizzleTelemetryOperations } from './operations';

// Service exports
export { DrizzleTelemetryService } from './drizzle-telemetry-service';
export type { TelemetryData } from './drizzle-telemetry-service';

// Utility functions and constants
export const DB_VERSION = '1.0.0';
export const DEFAULT_DB_PATH = '.vibekit/telemetry.db';
export const DEFAULT_BATCH_SIZE = 50;
export const DEFAULT_FLUSH_INTERVAL = 1000;

// Migration helpers
export const MIGRATION_PATHS = {
  development: '.vibekit/telemetry-dev.db',
  production: '.vibekit/telemetry.db',
  test: '.vibekit/telemetry-test.db',
} as const;

// Error helpers
export function isDrizzleTelemetryError(error: unknown): error is import('./types').DrizzleTelemetryConnectionError | import('./types').DrizzleTelemetryMigrationError {
  return error instanceof Error && (error.name === 'DrizzleTelemetryConnectionError' || error.name === 'DrizzleTelemetryMigrationError');
}

// Configuration helpers
export function createDrizzleConfig(overrides?: Partial<import('./types').DrizzleTelemetryConfig>): Required<import('./types').DrizzleTelemetryConfig> {
  return {
    dbPath: DEFAULT_DB_PATH,
    pruneDays: 30,
    streamBatchSize: DEFAULT_BATCH_SIZE,
    streamFlushIntervalMs: DEFAULT_FLUSH_INTERVAL,
    maxSizeMB: 100,
    enableWAL: true,
    enableForeignKeys: true,
    poolSize: 1,
    queryTimeoutMs: 5000,
    enableQueryLogging: false,
    enableMetrics: true,
    ...overrides,
  };
} 