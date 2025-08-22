import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createLogger, LogLevel } from '../src';
import { setupTestLogging } from '../src/test-utils';

describe('StructuredLogger', () => {
  let originalNodeEnv: string | undefined;
  let originalTestLogs: string | undefined;

  beforeEach(() => {
    originalNodeEnv = process.env.NODE_ENV;
    originalTestLogs = process.env.VIBEKIT_TEST_LOGS;
    setupTestLogging();
  });

  afterEach(() => {
    if (originalNodeEnv !== undefined) {
      process.env.NODE_ENV = originalNodeEnv;
    } else {
      delete process.env.NODE_ENV;
    }
    
    if (originalTestLogs !== undefined) {
      process.env.VIBEKIT_TEST_LOGS = originalTestLogs;
    } else {
      delete process.env.VIBEKIT_TEST_LOGS;
    }
  });

  it('should create component logger', () => {
    const logger = createLogger('test-component');
    expect(logger).toBeDefined();
  });

  it('should log with context in development mode', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    process.env.NODE_ENV = 'development';
    process.env.VIBEKIT_TEST_LOGS = 'true';
    
    const logger = createLogger('test');
    logger.info('Test message', { key: 'value' });
    
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('should respect log levels', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    process.env.LOG_LEVEL = 'INFO';
    process.env.NODE_ENV = 'development';
    process.env.VIBEKIT_TEST_LOGS = 'true';
    
    const logger = createLogger('test');
    logger.debug('Debug message'); // Should not log (DEBUG > INFO)
    logger.info('Info message'); // Should log (INFO == INFO)
    
    // Only info should be logged, debug should be filtered out
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    consoleSpy.mockRestore();
  });

  it('should suppress logs in test environment by default', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    process.env.NODE_ENV = 'test';
    delete process.env.VIBEKIT_TEST_LOGS;
    
    const logger = createLogger('test');
    logger.info('Test message');
    logger.error('Error message');
    
    // Should not log anything in test mode
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('should allow logging in test environment when enabled', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    process.env.NODE_ENV = 'test';
    process.env.VIBEKIT_TEST_LOGS = 'true';
    
    const logger = createLogger('test');
    logger.info('Test message');
    
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('should create timers', () => {
    const logger = createLogger('test');
    const timer = logger.timer('test-operation');
    
    expect(timer).toBeDefined();
    expect(typeof timer.stop).toBe('function');
  });
});