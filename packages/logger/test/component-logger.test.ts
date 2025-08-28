import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createLogger, ComponentLogger, LogLevel } from '../src';
import { setupTestLogging } from '../src/test-utils';

describe('ComponentLogger', () => {
  let originalNodeEnv: string | undefined;
  let originalTestLogs: string | undefined;

  beforeEach(() => {
    originalNodeEnv = process.env.NODE_ENV;
    originalTestLogs = process.env.VIBEKIT_TEST_LOGS;
    
    // Set common environment variables before setup
    process.env.NODE_ENV = 'development';
    process.env.VIBEKIT_TEST_LOGS = 'true';
    process.env.LOG_MAX_SIZE = '5000'; // Increase size limit for tests
    
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

  describe('component context', () => {
    it('should include component name in context', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      const logger = createLogger('test-component');
      logger.info('test message');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[test-component]')
      );
      
      consoleSpy.mockRestore();
    });

    it('should merge additional context', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      const logger = createLogger('test-component');
      logger.info('test message', { requestId: '123', userId: 'user456' });
      
      // Should include both component context and additional context
      const logCall = consoleSpy.mock.calls[0][0];
      expect(logCall).toContain('[test-component]');
      expect(logCall).toContain('requestId');
      expect(logCall).toContain('userId');
      
      consoleSpy.mockRestore();
    });

    it('should create logger with base context', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      const logger = createLogger('test-component', { sessionId: 'session123' });
      logger.info('test message');
      
      const logCall = consoleSpy.mock.calls[0][0];
      expect(logCall).toContain('sessionId');
      
      consoleSpy.mockRestore();
    });
  });

  describe('log level methods', () => {
    it('should support debug logging', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      process.env.LOG_LEVEL = 'DEBUG';
      
      const logger = createLogger('test');
      logger.debug('debug message', { data: 'test' });
      
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      expect(consoleSpy.mock.calls[0][0]).toContain('debug message');
      
      consoleSpy.mockRestore();
    });

    it('should support info logging', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      process.env.LOG_LEVEL = 'INFO';
      
      const logger = createLogger('test');
      logger.info('info message', { data: 'test' });
      
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      expect(consoleSpy.mock.calls[0][0]).toContain('info message');
      
      consoleSpy.mockRestore();
    });

    it('should support warn logging', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      process.env.LOG_LEVEL = 'WARN';
      
      const logger = createLogger('test');
      logger.warn('warn message', undefined, { data: 'test' });
      
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      expect(consoleSpy.mock.calls[0][0]).toContain('warn message');
      
      consoleSpy.mockRestore();
    });

    it('should support warn logging with error', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      process.env.LOG_LEVEL = 'WARN';
      
      const logger = createLogger('test');
      const error = new Error('test error');
      logger.warn('warn message', error, { data: 'test' });
      
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      expect(consoleSpy.mock.calls[0][0]).toContain('warn message');
      expect(consoleSpy.mock.calls[0][0]).toContain('test error');
      
      consoleSpy.mockRestore();
    });

    it('should support error logging', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      process.env.LOG_LEVEL = 'ERROR';
      
      const logger = createLogger('test');
      const error = new Error('test error');
      logger.error('error message', error, { data: 'test' });
      
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      expect(consoleSpy.mock.calls[0][0]).toContain('error message');
      expect(consoleSpy.mock.calls[0][0]).toContain('test error');
      
      consoleSpy.mockRestore();
    });
  });

  describe('timer functionality', () => {
    it('should create timers with component context', () => {
      const logger = createLogger('test-component', { sessionId: 'session123' });
      const timer = logger.timer('test-operation');
      
      expect(timer).toBeDefined();
      expect(typeof timer.stop).toBe('function');
    });

    it('should include additional context in timer', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      process.env.LOG_LEVEL = 'DEBUG';
      
      const logger = createLogger('test-component', { sessionId: 'session123' });
      const timer = logger.timer('test-operation', { requestId: 'req456' });
      
      // Stop timer to trigger log
      timer.stop();
      
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const logCall = consoleSpy.mock.calls[0][0];
      expect(logCall).toContain('test-component');
      expect(logCall).toContain('sessionId');
      expect(logCall).toContain('requestId');
      expect(logCall).toContain('duration');
      
      consoleSpy.mockRestore();
    });
  });

  describe('withContext method', () => {
    it('should create new logger with additional context', () => {
      const logger = createLogger('test-component', { sessionId: 'session123' });
      const childLogger = logger.withContext({ requestId: 'req456' });
      
      expect(childLogger).toBeInstanceOf(ComponentLogger);
      expect(childLogger).not.toBe(logger);
    });

    it('should merge contexts correctly', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      const logger = createLogger('test-component', { sessionId: 'session123' });
      const childLogger = logger.withContext({ requestId: 'req456', userId: 'user789' });
      
      childLogger.info('test message');
      
      const logCall = consoleSpy.mock.calls[0][0];
      expect(logCall).toContain('test-component');
      expect(logCall).toContain('sessionId');
      expect(logCall).toContain('requestId');
      expect(logCall).toContain('userId');
      
      consoleSpy.mockRestore();
    });

    it('should override base context when keys conflict', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      const logger = createLogger('test-component', { sessionId: 'session123' });
      const childLogger = logger.withContext({ sessionId: 'session456' });
      
      childLogger.info('test message');
      
      const logCall = consoleSpy.mock.calls[0][0];
      expect(logCall).toContain('session456');
      expect(logCall).not.toContain('session123');
      
      consoleSpy.mockRestore();
    });
  });

  describe('edge cases', () => {
    it('should handle empty component name gracefully', () => {
      const logger = createLogger('');
      expect(logger).toBeInstanceOf(ComponentLogger);
    });

    it('should handle undefined context gracefully', () => {
      const logger = createLogger('test', undefined);
      expect(logger).toBeInstanceOf(ComponentLogger);
    });

    it('should handle null error objects', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      process.env.LOG_LEVEL = 'ERROR';
      
      const logger = createLogger('test');
      logger.error('error message', null);
      
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      
      consoleSpy.mockRestore();
    });

    it('should handle non-Error objects as errors', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      process.env.LOG_LEVEL = 'ERROR';
      
      const logger = createLogger('test');
      logger.error('error message', { custom: 'error object' });
      
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const logCall = consoleSpy.mock.calls[0][0];
      expect(logCall).toContain('error message');
      
      consoleSpy.mockRestore();
    });
  });
});