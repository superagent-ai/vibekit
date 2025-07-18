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

// Phase 3: Advanced Features exports
export { DrizzleTelemetryPerformanceOptimizer } from './performance-optimizer';
export { runPhase3Tests, Phase3TestSuite } from './test-phase3';

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

// Phase 3: Convenience functions for common operations
export async function initializeOptimizedTelemetrySystem(config?: Partial<import('./types').DrizzleTelemetryConfig>) {
  const { DrizzleTelemetryOperations } = await import('./operations');
  const { DrizzleTelemetryPerformanceOptimizer } = await import('./performance-optimizer');
  const { initializeTelemetryDB } = await import('./connection');
  
  const fullConfig = createDrizzleConfig(config);
  
  // Initialize database
  await initializeTelemetryDB(fullConfig);
  
  // Create operations instance
  const operations = new DrizzleTelemetryOperations(fullConfig);
  await operations.initialize();
  
  // Create performance optimizer
  const optimizer = new DrizzleTelemetryPerformanceOptimizer(operations, fullConfig);
  
  return {
    operations,
    optimizer,
    config: fullConfig,
  };
} 