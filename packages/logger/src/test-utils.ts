import { StructuredLogger } from './structured-logger';

// Use vitest's vi if available, otherwise provide mock implementation
declare const vi: any;

/**
 * Set up logging for test environment
 * Automatically suppresses logs unless VIBEKIT_TEST_LOGS is set
 */
export const setupTestLogging = () => {
  // The logger already handles test environment suppression automatically
  // This function exists for explicit test setup if needed
  if (process.env.NODE_ENV === 'test' && !process.env.VIBEKIT_TEST_LOGS) {
    // Logs are already suppressed by the logger implementation
    return;
  }
};

/**
 * Force enable logging in tests
 */
export const enableTestLogging = () => {
  process.env.VIBEKIT_TEST_LOGS = 'true';
};

/**
 * Disable logging in tests (default behavior)
 */
export const disableTestLogging = () => {
  delete process.env.VIBEKIT_TEST_LOGS;
};

/**
 * Create a mock logger for testing
 * Useful for verifying logging calls without actual output
 */
export const createMockLogger = () => {
  const logs: any[] = [];
  
  return {
    debug: vi.fn((msg: string, ctx?: any) => logs.push({ level: 'DEBUG', message: msg, context: ctx })),
    info: vi.fn((msg: string, ctx?: any) => logs.push({ level: 'INFO', message: msg, context: ctx })),
    warn: vi.fn((msg: string, err?: any, ctx?: any) => logs.push({ level: 'WARN', message: msg, error: err, context: ctx })),
    error: vi.fn((msg: string, err?: any, ctx?: any) => logs.push({ level: 'ERROR', message: msg, error: err, context: ctx })),
    timer: vi.fn(() => ({
      stop: vi.fn(() => 100),
      stopWithError: vi.fn(() => 100),
      stopWithWarning: vi.fn(() => 100)
    })),
    withContext: vi.fn(() => createMockLogger()),
    getLogs: () => logs,
    clearLogs: () => logs.length = 0
  };
};