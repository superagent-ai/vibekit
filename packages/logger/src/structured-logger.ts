/**
 * Enhanced structured logging system for VibeKit packages
 * 
 * Provides:
 * - Production-safe log levels with filtering
 * - Automatic data sanitization for sensitive information
 * - Consistent log formatting with timestamps
 * - Context-aware logging with component names
 * - JSON structured output for production
 * - Request ID tracking for tracing
 * - Performance timing utilities
 * - Test environment log suppression
 */

import { LogLevel, LoggerConfig, getLoggerConfig, shouldLog, LOG_LEVEL_NAMES } from './logger-config';
import { sanitizeLogData, sanitizeMessage } from './log-sanitizer';

export { LogLevel };

export interface LogContext {
  component?: string;
  requestId?: string;
  sessionId?: string;
  executionId?: string;
  projectId?: string;
  userId?: string;
  operation?: string;
  duration?: number;
  [key: string]: any;
}

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  context: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

export class StructuredLogger {
  private static instance: StructuredLogger;
  private readonly config: LoggerConfig;
  private readonly environment: 'development' | 'production' | 'test';
  
  // ANSI color codes for console output
  private static readonly COLORS: Record<string, string> = {
    ERROR: '\x1b[31m', // Red
    WARN: '\x1b[33m',  // Yellow
    INFO: '\x1b[32m',  // Green
    DEBUG: '\x1b[36m'  // Cyan
  };
  
  private static readonly RESET_COLOR = '\x1b[0m';
  
  private constructor(config?: LoggerConfig) {
    this.environment = (process.env.NODE_ENV as 'development' | 'production' | 'test') || 'development';
    this.config = config || getLoggerConfig();
  }
  
  /**
   * Get singleton instance
   */
  static getInstance(): StructuredLogger {
    if (!StructuredLogger.instance) {
      StructuredLogger.instance = new StructuredLogger();
    }
    return StructuredLogger.instance;
  }
  
  /**
   * Create a logger with specific component context
   */
  static create(component: string, baseContext?: LogContext): ComponentLogger {
    return new ComponentLogger(component, baseContext);
  }
  
  /**
   * Log a message with the specified level
   */
  log(level: LogLevel, message: string, context: LogContext = {}): void {
    // In test environment, suppress logs unless explicitly enabled
    if (this.environment === 'test' && !process.env.VIBEKIT_TEST_LOGS) {
      return;
    }
    
    // Check if this log level should be output
    if (!shouldLog(level, this.config)) {
      return;
    }
    
    // Sanitize message and context
    const sanitizedMessage = this.config.sanitize ? sanitizeMessage(message) : message;
    const sanitizedContext = this.config.sanitize ? sanitizeLogData(context) : context;
    
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: LOG_LEVEL_NAMES[level],
      message: sanitizedMessage,
      context: sanitizedContext
    };
    
    // Add error details if context contains an error
    if (context.error && context.error instanceof Error) {
      entry.error = {
        name: context.error.name,
        message: this.config.sanitize ? sanitizeMessage(context.error.message) : context.error.message,
        stack: context.error.stack
      };
      // Remove error from context to avoid duplication
      const { error, ...contextWithoutError } = sanitizedContext;
      entry.context = contextWithoutError;
    }
    
    // Output to console
    this.outputToConsole(entry);
  }
  
  /**
   * Output formatted log to console
   */
  private outputToConsole(entry: LogEntry): void {
    const levelName = entry.level;
    const color = StructuredLogger.COLORS[levelName];
    const logString = JSON.stringify(entry);
    
    // Enforce size limits
    if (logString.length > this.config.maxSize) {
      const truncated = {
        ...entry,
        message: entry.message.substring(0, Math.floor(this.config.maxSize / 2)),
        context: { ...entry.context, _truncated: true, _originalSize: logString.length },
      };
      console.error(JSON.stringify(truncated));
      return;
    }
    
    if (this.environment === 'development') {
      // Human-readable format for development
      const timestamp = entry.timestamp.substring(11, 23); // HH:mm:ss.SSS
      const componentTag = entry.context.component ? `[${entry.context.component}]` : '';
      const contextStr = Object.keys(entry.context).filter(k => k !== 'component').length > 0 
        ? ` ${JSON.stringify({ ...entry.context, component: undefined })}`
        : '';
      
      const errorStr = entry.error 
        ? `\n${entry.error.stack || entry.error.message}`
        : '';
      
      console.log(
        `${color}${timestamp} [${levelName}]${StructuredLogger.RESET_COLOR} ${componentTag} ${entry.message}${contextStr}${errorStr}`
      );
    } else {
      // JSON format for production - emit to appropriate console method
      switch (entry.level) {
        case 'ERROR':
          console.error(logString);
          break;
        case 'WARN':
          console.warn(logString);
          break;
        default:
          console.log(logString);
          break;
      }
    }
  }
  
  /**
   * Convenience methods for different log levels
   */
  debug(message: string, context?: LogContext): void {
    this.log(LogLevel.DEBUG, message, context || {});
  }
  
  info(message: string, context?: LogContext): void {
    this.log(LogLevel.INFO, message, context || {});
  }
  
  warn(message: string, error?: Error | any, context?: LogContext): void {
    const errorData = error instanceof Error ? {
      name: error.name,
      message: error.message,
      stack: error.stack,
      ...(error.cause ? { cause: error.cause } : {})
    } : error;
    
    this.log(LogLevel.WARN, message, { ...(context || {}), ...(errorData && { error: errorData }) });
  }
  
  error(message: string, error?: Error | any, context?: LogContext): void {
    const errorData = error instanceof Error ? error : (error ? { error } : undefined);
    this.log(LogLevel.ERROR, message, { ...(context || {}), ...(errorData && { error: errorData }) });
  }
  
  /**
   * Create a timer for performance measurement
   */
  timer(operation: string, baseContext?: LogContext): LogTimer {
    return new LogTimer(operation, baseContext || {}, this.config);
  }
}

/**
 * Component-specific logger that automatically includes component context
 */
export class ComponentLogger {
  private logger: StructuredLogger;
  private baseContext: LogContext;
  
  constructor(component: string, baseContext: LogContext = {}) {
    this.logger = StructuredLogger.getInstance();
    this.baseContext = { component, ...baseContext };
  }
  
  /**
   * Create a new logger with additional context
   */
  withContext(additionalContext: LogContext): ComponentLogger {
    return new ComponentLogger(
      this.baseContext.component || 'unknown',
      { ...this.baseContext, ...additionalContext }
    );
  }
  
  /**
   * Log methods with automatic context injection
   */
  debug(message: string, context: LogContext = {}): void {
    this.logger.debug(message, { ...this.baseContext, ...context });
  }
  
  info(message: string, context: LogContext = {}): void {
    this.logger.info(message, { ...this.baseContext, ...context });
  }
  
  warn(message: string, error?: Error | any, context: LogContext = {}): void {
    this.logger.warn(message, error, { ...this.baseContext, ...context });
  }
  
  error(message: string, error?: Error | any, context: LogContext = {}): void {
    this.logger.error(message, error, { ...this.baseContext, ...context });
  }
  
  /**
   * Create a timer with component context
   */
  timer(operation: string, additionalContext?: LogContext): LogTimer {
    return new LogTimer(operation, { ...this.baseContext, ...additionalContext }, getLoggerConfig());
  }
}

/**
 * Performance timer for operation measurement
 */
export class LogTimer {
  private startTime: number;
  private operation: string;
  private context: LogContext;
  private logger: StructuredLogger;
  private config: LoggerConfig;
  
  constructor(operation: string, baseContext: LogContext = {}, config?: LoggerConfig) {
    this.startTime = performance.now();
    this.operation = operation;
    this.context = baseContext;
    this.logger = StructuredLogger.getInstance();
    this.config = config || getLoggerConfig();
  }
  
  /**
   * Stop the timer and log the duration
   */
  stop(level: LogLevel = LogLevel.DEBUG, additionalContext: LogContext = {}): number {
    const duration = Math.round(performance.now() - this.startTime);
    
    this.logger.log(level, `Operation completed: ${this.operation}`, {
      ...this.context,
      ...additionalContext,
      operation: this.operation,
      duration
    });
    
    return duration;
  }
  
  /**
   * Stop the timer with error
   */
  stopWithError(error: Error, additionalContext: LogContext = {}): number {
    return this.stop(LogLevel.ERROR, { ...additionalContext, error });
  }
  
  /**
   * Stop the timer with warning
   */
  stopWithWarning(additionalContext: LogContext = {}): number {
    return this.stop(LogLevel.WARN, additionalContext);
  }
}