import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setupTestLogging, enableTestLogging, disableTestLogging, createMockLogger } from '../src/test-utils';

describe('Test Utils', () => {
  let originalNodeEnv: string | undefined;
  let originalTestLogs: string | undefined;

  beforeEach(() => {
    originalNodeEnv = process.env.NODE_ENV;
    originalTestLogs = process.env.VIBEKIT_TEST_LOGS;
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

  describe('setupTestLogging', () => {
    it('should not throw when called', () => {
      expect(() => setupTestLogging()).not.toThrow();
    });

    it('should work with different environment configurations', () => {
      process.env.NODE_ENV = 'test';
      expect(() => setupTestLogging()).not.toThrow();
      
      process.env.NODE_ENV = 'development';
      expect(() => setupTestLogging()).not.toThrow();
      
      delete process.env.NODE_ENV;
      expect(() => setupTestLogging()).not.toThrow();
    });
  });

  describe('enableTestLogging', () => {
    it('should set VIBEKIT_TEST_LOGS environment variable', () => {
      delete process.env.VIBEKIT_TEST_LOGS;
      
      enableTestLogging();
      
      expect(process.env.VIBEKIT_TEST_LOGS).toBe('true');
    });

    it('should override existing VIBEKIT_TEST_LOGS value', () => {
      process.env.VIBEKIT_TEST_LOGS = 'false';
      
      enableTestLogging();
      
      expect(process.env.VIBEKIT_TEST_LOGS).toBe('true');
    });
  });

  describe('disableTestLogging', () => {
    it('should remove VIBEKIT_TEST_LOGS environment variable', () => {
      process.env.VIBEKIT_TEST_LOGS = 'true';
      
      disableTestLogging();
      
      expect(process.env.VIBEKIT_TEST_LOGS).toBeUndefined();
    });

    it('should work when VIBEKIT_TEST_LOGS is already undefined', () => {
      delete process.env.VIBEKIT_TEST_LOGS;
      
      expect(() => disableTestLogging()).not.toThrow();
      expect(process.env.VIBEKIT_TEST_LOGS).toBeUndefined();
    });
  });

  describe('createMockLogger', () => {
    it('should create a mock logger with all required methods', () => {
      const mockLogger = createMockLogger();
      
      expect(mockLogger.debug).toBeDefined();
      expect(mockLogger.info).toBeDefined();
      expect(mockLogger.warn).toBeDefined();
      expect(mockLogger.error).toBeDefined();
      expect(mockLogger.timer).toBeDefined();
      expect(mockLogger.withContext).toBeDefined();
      expect(mockLogger.getLogs).toBeDefined();
      expect(mockLogger.clearLogs).toBeDefined();
      
      expect(typeof mockLogger.debug).toBe('function');
      expect(typeof mockLogger.info).toBe('function');
      expect(typeof mockLogger.warn).toBe('function');
      expect(typeof mockLogger.error).toBe('function');
      expect(typeof mockLogger.timer).toBe('function');
      expect(typeof mockLogger.withContext).toBe('function');
      expect(typeof mockLogger.getLogs).toBe('function');
      expect(typeof mockLogger.clearLogs).toBe('function');
    });

    it('should track debug calls', () => {
      const mockLogger = createMockLogger();
      
      mockLogger.debug('test debug message', { key: 'value' });
      
      const logs = mockLogger.getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe('DEBUG');
      expect(logs[0].message).toBe('test debug message');
      expect(logs[0].context).toEqual({ key: 'value' });
    });

    it('should track info calls', () => {
      const mockLogger = createMockLogger();
      
      mockLogger.info('test info message', { requestId: '123' });
      
      const logs = mockLogger.getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe('INFO');
      expect(logs[0].message).toBe('test info message');
      expect(logs[0].context).toEqual({ requestId: '123' });
    });

    it('should track warn calls', () => {
      const mockLogger = createMockLogger();
      
      const error = new Error('test error');
      mockLogger.warn('test warn message', error, { severity: 'high' });
      
      const logs = mockLogger.getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe('WARN');
      expect(logs[0].message).toBe('test warn message');
      expect(logs[0].error).toBe(error);
      expect(logs[0].context).toEqual({ severity: 'high' });
    });

    it('should track error calls', () => {
      const mockLogger = createMockLogger();
      
      const error = new Error('test error');
      mockLogger.error('test error message', error, { userId: 'user123' });
      
      const logs = mockLogger.getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe('ERROR');
      expect(logs[0].message).toBe('test error message');
      expect(logs[0].error).toBe(error);
      expect(logs[0].context).toEqual({ userId: 'user123' });
    });

    it('should provide mock timer functionality', () => {
      const mockLogger = createMockLogger();
      
      const timer = mockLogger.timer();
      
      expect(timer).toBeDefined();
      expect(typeof timer.stop).toBe('function');
      expect(typeof timer.stopWithError).toBe('function');
      expect(typeof timer.stopWithWarning).toBe('function');
      
      // Test timer methods return values
      expect(timer.stop()).toBe(100);
      expect(timer.stopWithError()).toBe(100);
      expect(timer.stopWithWarning()).toBe(100);
    });

    it('should provide withContext functionality', () => {
      const mockLogger = createMockLogger();
      
      const contextLogger = mockLogger.withContext();
      
      expect(contextLogger).toBeDefined();
      expect(typeof contextLogger.debug).toBe('function');
      expect(typeof contextLogger.info).toBe('function');
      expect(typeof contextLogger.warn).toBe('function');
      expect(typeof contextLogger.error).toBe('function');
    });

    it('should accumulate logs from multiple calls', () => {
      const mockLogger = createMockLogger();
      
      mockLogger.debug('debug 1');
      mockLogger.info('info 1');
      mockLogger.warn('warn 1');
      mockLogger.error('error 1');
      
      const logs = mockLogger.getLogs();
      expect(logs).toHaveLength(4);
      expect(logs[0].message).toBe('debug 1');
      expect(logs[1].message).toBe('info 1');
      expect(logs[2].message).toBe('warn 1');
      expect(logs[3].message).toBe('error 1');
    });

    it('should clear logs when requested', () => {
      const mockLogger = createMockLogger();
      
      mockLogger.debug('test message');
      mockLogger.info('another message');
      
      expect(mockLogger.getLogs()).toHaveLength(2);
      
      mockLogger.clearLogs();
      
      expect(mockLogger.getLogs()).toHaveLength(0);
    });

    it('should handle calls without context', () => {
      const mockLogger = createMockLogger();
      
      mockLogger.debug('debug without context');
      mockLogger.info('info without context');
      mockLogger.warn('warn without context');
      mockLogger.error('error without context');
      
      const logs = mockLogger.getLogs();
      expect(logs).toHaveLength(4);
      logs.forEach(log => {
        expect(log.context).toBeUndefined();
      });
    });

    it('should handle calls with null/undefined parameters', () => {
      const mockLogger = createMockLogger();
      
      mockLogger.warn('warn with null', null, null);
      mockLogger.error('error with undefined', undefined, undefined);
      
      const logs = mockLogger.getLogs();
      expect(logs).toHaveLength(2);
      expect(logs[0].error).toBeNull();
      expect(logs[0].context).toBeNull();
      expect(logs[1].error).toBeUndefined();
      expect(logs[1].context).toBeUndefined();
    });

    it('should work with vitest mock functions', () => {
      const mockLogger = createMockLogger();
      
      mockLogger.debug('test message');
      
      // Should be vitest mock functions
      expect(mockLogger.debug).toHaveBeenCalledWith('test message', undefined);
      expect(mockLogger.debug).toHaveBeenCalledTimes(1);
      
      mockLogger.info('info message', { data: 'test' });
      expect(mockLogger.info).toHaveBeenCalledWith('info message', { data: 'test' });
    });

    it('should create independent mock loggers', () => {
      const mockLogger1 = createMockLogger();
      const mockLogger2 = createMockLogger();
      
      mockLogger1.debug('logger 1 message');
      mockLogger2.info('logger 2 message');
      
      expect(mockLogger1.getLogs()).toHaveLength(1);
      expect(mockLogger2.getLogs()).toHaveLength(1);
      expect(mockLogger1.getLogs()[0].message).toBe('logger 1 message');
      expect(mockLogger2.getLogs()[0].message).toBe('logger 2 message');
    });
  });
});