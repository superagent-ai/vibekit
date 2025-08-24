import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { 
  LogLevel, 
  getLogLevel, 
  getLoggerConfig, 
  shouldLog, 
  LOG_LEVEL_NAMES,
  PRODUCTION_CONFIG,
  DEVELOPMENT_CONFIG 
} from '../src/logger-config';

describe('Logger Configuration', () => {
  let originalNodeEnv: string | undefined;
  let originalLogLevel: string | undefined;

  beforeEach(() => {
    originalNodeEnv = process.env.NODE_ENV;
    originalLogLevel = process.env.LOG_LEVEL;
  });

  afterEach(() => {
    if (originalNodeEnv !== undefined) {
      process.env.NODE_ENV = originalNodeEnv;
    } else {
      delete process.env.NODE_ENV;
    }
    
    if (originalLogLevel !== undefined) {
      process.env.LOG_LEVEL = originalLogLevel;
    } else {
      delete process.env.LOG_LEVEL;
    }
  });

  describe('LogLevel enum', () => {
    it('should have correct numeric values', () => {
      expect(LogLevel.ERROR).toBe(0);
      expect(LogLevel.WARN).toBe(1);
      expect(LogLevel.INFO).toBe(2);
      expect(LogLevel.DEBUG).toBe(3);
    });
  });

  describe('getLogLevel', () => {
    it('should return ERROR for LOG_LEVEL=ERROR', () => {
      process.env.LOG_LEVEL = 'ERROR';
      expect(getLogLevel()).toBe(LogLevel.ERROR);
    });

    it('should return WARN for LOG_LEVEL=WARN', () => {
      process.env.LOG_LEVEL = 'WARN';
      expect(getLogLevel()).toBe(LogLevel.WARN);
    });

    it('should return INFO for LOG_LEVEL=INFO', () => {
      process.env.LOG_LEVEL = 'INFO';
      expect(getLogLevel()).toBe(LogLevel.INFO);
    });

    it('should return DEBUG for LOG_LEVEL=DEBUG', () => {
      process.env.LOG_LEVEL = 'DEBUG';
      expect(getLogLevel()).toBe(LogLevel.DEBUG);
    });

    it('should be case insensitive', () => {
      process.env.LOG_LEVEL = 'error';
      expect(getLogLevel()).toBe(LogLevel.ERROR);
      
      process.env.LOG_LEVEL = 'WaRn';
      expect(getLogLevel()).toBe(LogLevel.WARN);
    });

    it('should default to WARN in production', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.LOG_LEVEL;
      expect(getLogLevel()).toBe(LogLevel.WARN);
    });

    it('should default to INFO in development', () => {
      process.env.NODE_ENV = 'development';
      delete process.env.LOG_LEVEL;
      expect(getLogLevel()).toBe(LogLevel.INFO);
    });

    it('should default to INFO when NODE_ENV is not set', () => {
      delete process.env.NODE_ENV;
      delete process.env.LOG_LEVEL;
      expect(getLogLevel()).toBe(LogLevel.INFO);
    });

    it('should default to INFO for invalid LOG_LEVEL', () => {
      process.env.LOG_LEVEL = 'INVALID';
      delete process.env.NODE_ENV;
      expect(getLogLevel()).toBe(LogLevel.INFO);
    });
  });

  describe('getLoggerConfig', () => {
    it('should return correct default config', () => {
      delete process.env.NODE_ENV;
      delete process.env.LOG_LEVEL;
      
      const config = getLoggerConfig();
      
      expect(config.level).toBe(LogLevel.INFO);
      expect(config.sanitize).toBe(true);
      expect(config.maxSize).toBe(1000);
      expect(config.sampleRate).toBe(1.0);
      expect(config.enableTimestamp).toBe(true);
      expect(config.enableContext).toBe(true);
    });

    it('should respect environment variables', () => {
      process.env.LOG_LEVEL = 'DEBUG';
      process.env.LOG_SANITIZE = 'false';
      process.env.LOG_MAX_SIZE = '5000';
      process.env.LOG_SAMPLE_RATE = '0.5';
      process.env.LOG_TIMESTAMP = 'false';
      process.env.LOG_CONTEXT = 'false';
      
      const config = getLoggerConfig();
      
      expect(config.level).toBe(LogLevel.DEBUG);
      expect(config.sanitize).toBe(false);
      expect(config.maxSize).toBe(5000);
      expect(config.sampleRate).toBe(0.5);
      expect(config.enableTimestamp).toBe(false);
      expect(config.enableContext).toBe(false);
    });

    it('should handle invalid environment variables gracefully', () => {
      process.env.LOG_MAX_SIZE = 'invalid';
      process.env.LOG_SAMPLE_RATE = 'invalid';
      
      const config = getLoggerConfig();
      
      expect(config.maxSize).toBe(NaN); // parseInt returns NaN for invalid
      expect(config.sampleRate).toBe(NaN); // parseFloat returns NaN for invalid
    });
  });

  describe('shouldLog', () => {
    it('should return true when level is equal to config level', () => {
      const config = { level: LogLevel.INFO } as any;
      expect(shouldLog(LogLevel.INFO, config)).toBe(true);
    });

    it('should return true when level is lower than config level', () => {
      const config = { level: LogLevel.INFO } as any;
      expect(shouldLog(LogLevel.ERROR, config)).toBe(true);
      expect(shouldLog(LogLevel.WARN, config)).toBe(true);
    });

    it('should return false when level is higher than config level', () => {
      const config = { level: LogLevel.INFO } as any;
      expect(shouldLog(LogLevel.DEBUG, config)).toBe(false);
    });

    it('should respect sample rate', () => {
      const config = { level: LogLevel.DEBUG, sampleRate: 0 } as any;
      expect(shouldLog(LogLevel.DEBUG, config)).toBe(false);
    });

    it('should use default config when none provided', () => {
      // Should not throw and should use getLoggerConfig()
      expect(() => shouldLog(LogLevel.INFO)).not.toThrow();
    });
  });

  describe('LOG_LEVEL_NAMES', () => {
    it('should have correct mappings', () => {
      expect(LOG_LEVEL_NAMES[LogLevel.ERROR]).toBe('ERROR');
      expect(LOG_LEVEL_NAMES[LogLevel.WARN]).toBe('WARN');
      expect(LOG_LEVEL_NAMES[LogLevel.INFO]).toBe('INFO');
      expect(LOG_LEVEL_NAMES[LogLevel.DEBUG]).toBe('DEBUG');
    });
  });

  describe('predefined configurations', () => {
    it('should have correct production config', () => {
      expect(PRODUCTION_CONFIG.level).toBe(LogLevel.WARN);
      expect(PRODUCTION_CONFIG.sanitize).toBe(true);
      expect(PRODUCTION_CONFIG.maxSize).toBe(1000);
      expect(PRODUCTION_CONFIG.sampleRate).toBe(1.0);
      expect(PRODUCTION_CONFIG.enableTimestamp).toBe(true);
      expect(PRODUCTION_CONFIG.enableContext).toBe(true);
    });

    it('should have correct development config', () => {
      expect(DEVELOPMENT_CONFIG.level).toBe(LogLevel.INFO);
      expect(DEVELOPMENT_CONFIG.sanitize).toBe(false);
      expect(DEVELOPMENT_CONFIG.maxSize).toBe(5000);
      expect(DEVELOPMENT_CONFIG.sampleRate).toBe(1.0);
      expect(DEVELOPMENT_CONFIG.enableTimestamp).toBe(true);
      expect(DEVELOPMENT_CONFIG.enableContext).toBe(true);
    });
  });
});