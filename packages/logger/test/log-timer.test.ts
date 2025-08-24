import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { LogTimer, LogLevel, createLogger } from '../src';
import { setupTestLogging } from '../src/test-utils';

describe('LogTimer', () => {
  let originalNodeEnv: string | undefined;
  let originalTestLogs: string | undefined;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    originalNodeEnv = process.env.NODE_ENV;
    originalTestLogs = process.env.VIBEKIT_TEST_LOGS;
    setupTestLogging();
    
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    process.env.NODE_ENV = 'development';
    process.env.VIBEKIT_TEST_LOGS = 'true';
    process.env.LOG_LEVEL = 'DEBUG';
    process.env.LOG_MAX_SIZE = '5000'; // Increase size limit for tests
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
    
    consoleSpy?.mockRestore();
  });

  describe('timer creation', () => {
    it('should create timer via logger', () => {
      const logger = createLogger('test-component');
      const timer = logger.timer('test-operation');
      
      expect(timer).toBeInstanceOf(LogTimer);
    });

    it('should create timer with context', () => {
      const logger = createLogger('test-component', { sessionId: 'session123' });
      const timer = logger.timer('test-operation', { requestId: 'req456' });
      
      expect(timer).toBeInstanceOf(LogTimer);
    });
  });

  describe('timer operations', () => {
    it('should measure duration when stopped', async () => {
      const logger = createLogger('test-component');
      const timer = logger.timer('test-operation');
      
      // Wait a small amount to ensure duration > 0
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const duration = timer.stop();
      
      expect(duration).toBeGreaterThan(0);
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      
      const logCall = consoleSpy.mock.calls[0][0];
      expect(logCall).toContain('Operation completed: test-operation');
      expect(logCall).toContain('duration');
    });

    it('should log at specified level', () => {
      const logger = createLogger('test-component');
      const timer = logger.timer('test-operation');
      
      timer.stop(LogLevel.INFO);
      
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const logCall = consoleSpy.mock.calls[0][0];
      expect(logCall).toContain('[INFO]');
    });

    it('should include additional context when stopped', () => {
      const logger = createLogger('test-component', { sessionId: 'session123' });
      const timer = logger.timer('test-operation');
      
      timer.stop(LogLevel.DEBUG, { status: 'success', items: 5 });
      
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const logCall = consoleSpy.mock.calls[0][0];
      expect(logCall).toContain('sessionId');
      expect(logCall).toContain('status');
      expect(logCall).toContain('items');
      expect(logCall).toContain('duration');
      expect(logCall).toContain('operation');
    });

    it('should support stopWithError method', () => {
      const logger = createLogger('test-component');
      const timer = logger.timer('test-operation');
      
      const error = new Error('operation failed');
      const duration = timer.stopWithError(error, { retries: 3 });
      
      expect(duration).toBeGreaterThanOrEqual(0);
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      
      const logCall = consoleSpy.mock.calls[0][0];
      expect(logCall).toContain('[ERROR]');
      expect(logCall).toContain('operation failed');
      expect(logCall).toContain('retries');
    });

    it('should support stopWithWarning method', () => {
      const logger = createLogger('test-component');
      const timer = logger.timer('test-operation');
      
      const duration = timer.stopWithWarning({ reason: 'slow operation' });
      
      expect(duration).toBeGreaterThanOrEqual(0);
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      
      const logCall = consoleSpy.mock.calls[0][0];
      expect(logCall).toContain('[WARN]');
      expect(logCall).toContain('reason');
    });
  });

  describe('context handling', () => {
    it('should preserve base context in timer logs', () => {
      const logger = createLogger('api-handler', { 
        requestId: 'req123',
        userId: 'user456'
      });
      const timer = logger.timer('database-query');
      
      timer.stop();
      
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const logCall = consoleSpy.mock.calls[0][0];
      expect(logCall).toContain('api-handler');
      expect(logCall).toContain('requestId');
      expect(logCall).toContain('userId');
      expect(logCall).toContain('database-query');
    });

    it('should merge timer context with base context', () => {
      const logger = createLogger('service', { sessionId: 'session789' });
      const timer = logger.timer('async-operation', { operationType: 'fetch' });
      
      timer.stop(LogLevel.INFO, { recordsProcessed: 100 });
      
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const logCall = consoleSpy.mock.calls[0][0];
      expect(logCall).toContain('sessionId');
      expect(logCall).toContain('operationType');
      expect(logCall).toContain('recordsProcessed');
    });

    it('should handle empty contexts gracefully', () => {
      const logger = createLogger('test');
      const timer = logger.timer('operation');
      
      timer.stop();
      
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      expect(() => timer.stop()).not.toThrow();
    });
  });

  describe('performance and precision', () => {
    it('should return consistent duration values', async () => {
      const logger = createLogger('test');
      const timer = logger.timer('test-operation');
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const duration1 = timer.stop();
      
      // Create another timer for comparison
      const timer2 = logger.timer('test-operation-2');
      await new Promise(resolve => setTimeout(resolve, 50));
      const duration2 = timer2.stop();
      
      // Both should be positive and in reasonable range
      expect(duration1).toBeGreaterThan(40);
      expect(duration1).toBeLessThan(100);
      expect(duration2).toBeGreaterThan(40);
      expect(duration2).toBeLessThan(100);
    });

    it('should round duration to nearest millisecond', () => {
      const logger = createLogger('test');
      const timer = logger.timer('test-operation');
      
      const duration = timer.stop();
      
      // Duration should be an integer (rounded)
      expect(Number.isInteger(duration)).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle very short operations', () => {
      const logger = createLogger('test');
      const timer = logger.timer('quick-operation');
      
      // Stop immediately
      const duration = timer.stop();
      
      expect(duration).toBeGreaterThanOrEqual(0);
      expect(consoleSpy).toHaveBeenCalledTimes(1);
    });

    it('should handle multiple stop calls gracefully', () => {
      const logger = createLogger('test');
      const timer = logger.timer('test-operation');
      
      const duration1 = timer.stop();
      const duration2 = timer.stop();
      
      // Both calls should work (though second one will have different timing)
      expect(duration1).toBeGreaterThanOrEqual(0);
      expect(duration2).toBeGreaterThanOrEqual(0);
      expect(consoleSpy).toHaveBeenCalledTimes(2);
    });

    it('should handle long operation names', () => {
      const logger = createLogger('test');
      const longName = 'very-long-operation-name-that-exceeds-normal-length-expectations-and-goes-on-and-on';
      const timer = logger.timer(longName);
      
      timer.stop();
      
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const logCall = consoleSpy.mock.calls[0][0];
      expect(logCall).toContain(longName);
    });

    it('should handle special characters in operation names', () => {
      const logger = createLogger('test');
      const specialName = 'operation-with-émojis-🚀-and-symbols-@#$%';
      const timer = logger.timer(specialName);
      
      timer.stop();
      
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const logCall = consoleSpy.mock.calls[0][0];
      expect(logCall).toContain(specialName);
    });
  });

  describe('integration with log levels', () => {
    it('should respect logger configuration for timer logs', () => {
      process.env.LOG_LEVEL = 'ERROR';
      
      const logger = createLogger('test');
      const timer = logger.timer('test-operation');
      
      // Debug level timer stop should not log
      timer.stop(LogLevel.DEBUG);
      expect(consoleSpy).toHaveBeenCalledTimes(0);
      
      // Error level timer stop should log
      timer.stop(LogLevel.ERROR);
      expect(consoleSpy).toHaveBeenCalledTimes(1);
    });

    it('should suppress timer logs in test environment by default', () => {
      process.env.NODE_ENV = 'test';
      delete process.env.VIBEKIT_TEST_LOGS;
      
      const logger = createLogger('test');
      const timer = logger.timer('test-operation');
      
      timer.stop();
      
      // Should not log in test environment
      expect(consoleSpy).toHaveBeenCalledTimes(0);
    });
  });
});