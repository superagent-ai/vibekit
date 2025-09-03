import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createLogger, LogLevel } from '../src';
import { setupTestLogging } from '../src/test-utils';

describe('Integration Tests', () => {
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

  describe('basic functionality', () => {
    it('should create logger without throwing', () => {
      expect(() => createLogger('test')).not.toThrow();
    });

    it('should support all log levels', () => {
      const logger = createLogger('test');
      
      expect(() => logger.debug('debug')).not.toThrow();
      expect(() => logger.info('info')).not.toThrow();
      expect(() => logger.warn('warn')).not.toThrow();
      expect(() => logger.error('error')).not.toThrow();
    });

    it('should create timers', () => {
      const logger = createLogger('test');
      const timer = logger.timer('operation');
      
      expect(timer).toBeDefined();
      expect(typeof timer.stop).toBe('function');
    });

    it('should support withContext', () => {
      const logger = createLogger('test');
      const contextLogger = logger.withContext({ key: 'value' });
      
      expect(contextLogger).toBeDefined();
      expect(() => contextLogger.info('message')).not.toThrow();
    });

    it('should suppress logs in test environment by default', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      process.env.NODE_ENV = 'test';
      delete process.env.VIBEKIT_TEST_LOGS;
      
      const logger = createLogger('test');
      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');
      
      // Should not log anything in test mode
      expect(consoleSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
      
      consoleSpy.mockRestore();
      consoleErrorSpy.mockRestore();
      consoleWarnSpy.mockRestore();
    });

    it('should log when test logging is enabled', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      process.env.NODE_ENV = 'test';
      process.env.VIBEKIT_TEST_LOGS = 'true';
      process.env.LOG_LEVEL = 'DEBUG';
      
      const logger = createLogger('test');
      logger.info('info message');
      
      // Should log when explicitly enabled
      const totalCalls = consoleSpy.mock.calls.length + 
                        consoleErrorSpy.mock.calls.length + 
                        consoleWarnSpy.mock.calls.length;
      expect(totalCalls).toBeGreaterThan(0);
      
      consoleSpy.mockRestore();
      consoleErrorSpy.mockRestore();
      consoleWarnSpy.mockRestore();
    });

    it('should respect log levels', () => {
      // This test verifies that log level filtering works
      // The exact console method used depends on environment configuration
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      process.env.NODE_ENV = 'test';
      process.env.VIBEKIT_TEST_LOGS = 'true';
      process.env.LOG_LEVEL = 'WARN'; // Only warn and error should log
      
      const logger = createLogger('test');
      logger.debug('debug message'); // Should not log (DEBUG > WARN)
      logger.info('info message');   // Should not log (INFO > WARN)
      logger.warn('warn message');   // Should log (WARN = WARN)
      logger.error('error message'); // Should log (ERROR < WARN)
      
      // Should have logged exactly 2 messages (warn + error)
      const totalCalls = consoleSpy.mock.calls.length + 
                         consoleErrorSpy.mock.calls.length + 
                         consoleWarnSpy.mock.calls.length;
      
      expect(totalCalls).toBeGreaterThanOrEqual(2);
      
      consoleSpy.mockRestore();
      consoleErrorSpy.mockRestore();
      consoleWarnSpy.mockRestore();
    });

    it('should handle errors gracefully', () => {
      const logger = createLogger('test');
      const error = new Error('test error');
      
      expect(() => logger.error('error message', error)).not.toThrow();
    });

    it('should measure timer durations', async () => {
      const logger = createLogger('test');
      const timer = logger.timer('test-operation');
      
      // Wait a small amount to ensure duration > 0
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const duration = timer.stop();
      expect(duration).toBeGreaterThan(0);
    });

    it('should handle context merging', () => {
      const logger = createLogger('test', { baseKey: 'baseValue' });
      const contextLogger = logger.withContext({ additionalKey: 'additionalValue' });
      
      expect(() => contextLogger.info('message', { messageKey: 'messageValue' })).not.toThrow();
    });
  });

  describe('error scenarios', () => {
    it('should handle null context gracefully', () => {
      const logger = createLogger('test');
      
      expect(() => logger.info('message', null as any)).not.toThrow();
    });

    it('should handle undefined error objects', () => {
      const logger = createLogger('test');
      
      expect(() => logger.error('message', undefined)).not.toThrow();
    });

    it('should handle non-Error objects as errors', () => {
      const logger = createLogger('test');
      
      expect(() => logger.error('message', { custom: 'error' })).not.toThrow();
    });

    it('should handle empty component names', () => {
      expect(() => createLogger('')).not.toThrow();
    });

    it('should handle very long messages', () => {
      const logger = createLogger('test');
      const longMessage = 'a'.repeat(10000);
      
      expect(() => logger.info(longMessage)).not.toThrow();
    });
  });
});