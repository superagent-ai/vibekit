/**
 * Centralized logging configuration for production environments
 * 
 * This module provides log level management, environment-based configuration,
 * and production-safe logging defaults.
 */

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3
}

export interface LoggerConfig {
  level: LogLevel;
  sanitize: boolean;
  maxSize: number;
  sampleRate: number;
  enableTimestamp: boolean;
  enableContext: boolean;
}

/**
 * Get the current log level based on environment variables
 */
export const getLogLevel = (): LogLevel => {
  const level = process.env.LOG_LEVEL?.toUpperCase();
  switch(level) {
    case 'ERROR': return LogLevel.ERROR;
    case 'WARN': return LogLevel.WARN;
    case 'INFO': return LogLevel.INFO;
    case 'DEBUG': return LogLevel.DEBUG;
    default: 
      // Production default: WARN, Development default: INFO
      return process.env.NODE_ENV === 'production' ? LogLevel.WARN : LogLevel.INFO;
  }
};

/**
 * Get complete logger configuration
 */
export const getLoggerConfig = (): LoggerConfig => {
  return {
    level: getLogLevel(),
    sanitize: process.env.LOG_SANITIZE !== 'false', // Default true for security
    maxSize: parseInt(process.env.LOG_MAX_SIZE || '1000', 10),
    sampleRate: parseFloat(process.env.LOG_SAMPLE_RATE || '1.0'),
    enableTimestamp: process.env.LOG_TIMESTAMP !== 'false',
    enableContext: process.env.LOG_CONTEXT !== 'false'
  };
};

/**
 * Check if a log level should be emitted
 */
export const shouldLog = (level: LogLevel, config?: LoggerConfig): boolean => {
  const logConfig = config || getLoggerConfig();
  
  // Check log level - lower numeric values are MORE severe
  // ERROR(0) should always log, DEBUG(3) only when level >= DEBUG
  if (level > logConfig.level) {
    return false;
  }
  
  // Check sample rate (for high-frequency logs)
  if (logConfig.sampleRate < 1.0 && Math.random() > logConfig.sampleRate) {
    return false;
  }
  
  return true;
};

/**
 * Log level names for output formatting
 */
export const LOG_LEVEL_NAMES: Record<LogLevel, string> = {
  [LogLevel.ERROR]: 'ERROR',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.DEBUG]: 'DEBUG'
};

/**
 * Production-safe default configuration
 */
export const PRODUCTION_CONFIG: LoggerConfig = {
  level: LogLevel.WARN,
  sanitize: true,
  maxSize: 1000,
  sampleRate: 1.0,
  enableTimestamp: true,
  enableContext: true
};

/**
 * Development configuration with more verbose logging
 */
export const DEVELOPMENT_CONFIG: LoggerConfig = {
  level: LogLevel.INFO,
  sanitize: false,
  maxSize: 5000,
  sampleRate: 1.0,
  enableTimestamp: true,
  enableContext: true
};