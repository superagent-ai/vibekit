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
export function isDrizzleTelemetryError(error: unknown): error is import('./types').DrizzleTelemetryError {
  return error instanceof Error && error.name.startsWith('DrizzleTelemetry');
}

export function isDrizzleTelemetryConnectionError(error: unknown): error is import('./types').DrizzleTelemetryConnectionError {
  return error instanceof Error && error.name === 'DrizzleTelemetryConnectionError';
}

export function isDrizzleTelemetryQueryError(error: unknown): error is import('./types').DrizzleTelemetryQueryError {
  return error instanceof Error && error.name === 'DrizzleTelemetryQueryError';
}

export function isDrizzleTelemetryMigrationError(error: unknown): error is import('./types').DrizzleTelemetryMigrationError {
  return error instanceof Error && error.name === 'DrizzleTelemetryMigrationError';
} 