/**
 * Enhanced structured logging system for VibeKit Dashboard
 * 
 * Provides:
 * - Production-safe log levels with filtering
 * - Automatic data sanitization for sensitive information
 * - Consistent log formatting with timestamps
 * - Context-aware logging with component names
 * - JSON structured output for production
 * - Request ID tracking for tracing
 * - Performance timing utilities
 * - Memory and performance optimizations
 */

import { LogLevel, LoggerConfig, getLoggerConfig, shouldLog, LOG_LEVEL_NAMES } from './logger-config';
import { sanitizeLogData, sanitizeMessage } from './log-sanitizer';

export type { LogLevel };

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
  level: LogLevel;
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
  private readonly environment: 'development' | 'production';
  
  // ANSI color codes for console output
  private static readonly COLORS: Record<string, string> = {
    ERROR: '\x1b[31m', // Red
    WARN: '\x1b[33m',  // Yellow
    INFO: '\x1b[32m',  // Green
    DEBUG: '\x1b[36m'  // Cyan
  };
  
  private static readonly RESET_COLOR = '\x1b[0m';
  
  private constructor(config?: LoggerConfig) {
    this.environment = (process.env.NODE_ENV as 'development' | 'production') || 'development';
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
    // Check if this log level should be output
    if (!shouldLog(level, this.config)) {
      return;
    }
    
    // Sanitize message and context
    const sanitizedMessage = this.config.sanitize ? sanitizeMessage(message) : message;
    const sanitizedContext = this.config.sanitize ? sanitizeLogData(context) : context;
    
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: LOG_LEVEL_NAMES[level] as any,
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
      const contextStr = Object.keys(entry.context).length > 0 
        ? ` ${JSON.stringify(entry.context)}`
        : '';
      
      const errorStr = entry.error 
        ? `\n${entry.error.stack || entry.error.message}`
        : '';
      
      console.log(
        `${color}${timestamp} [${levelName}]${StructuredLogger.RESET_COLOR} ${entry.message}${contextStr}${errorStr}`
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
   * Output log to file (placeholder for future implementation)
   */
  private outputToFile(entry: LogEntry): void {
    // TODO: Implement file logging with rotation
    // This could write to a daily log file in .vibekit/logs/
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
      ...(error.cause && { cause: error.cause })
    } : error;
    
    this.log(LogLevel.WARN, message, { ...context, ...(errorData && { error: errorData }) });
  }
  
  error(message: string, error?: Error | any, context?: LogContext): void {
    const errorData = error instanceof Error ? {
      name: error.name,
      message: error.message,
      stack: error.stack,
      ...(error.cause && { cause: error.cause })
    } : error;
    
    this.log(LogLevel.ERROR, message, { ...context, error: errorData });
  }
  
  /**
   * Create a timer for performance measurement
   */
  timer(operation: string): LogTimer {
    return new LogTimer(operation, {}, this.config);
  }
}

/**
 * Component-specific logger that automatically includes component context
 */
export class ComponentLogger {
  private logger: StructuredLogger;
  private baseContext: LogContext;
  
  constructor(component: string, baseContext: LogContext = {}, config?: LoggerConfig) {
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
   * Log an error with automatic error context extraction
   */
  logError(message: string, error: Error, context: LogContext = {}): void {
    this.logger.error(message, { 
      ...this.baseContext, 
      ...context, 
      error 
    });
  }
  
  /**
   * Create a timer with component context
   */
  timer(operation: string): LogTimer {
    return new LogTimer(operation, this.baseContext, getLoggerConfig());
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
   * Stop the timer and log as info level
   */
  stopInfo(additionalContext: LogContext = {}): number {
    return this.stop(LogLevel.INFO, additionalContext);
  }
  
  /**
   * Stop the timer and log as warn level (for slow operations)
   */
  stopWarn(additionalContext: LogContext = {}): number {
    return this.stop(LogLevel.WARN, additionalContext);
  }
}

/**
 * Global logger instance for convenience
 */
export const logger = StructuredLogger.getInstance();

/**
 * Create component-specific loggers
 */
export const createLogger = (component: string, baseContext?: LogContext) => 
  StructuredLogger.create(component, baseContext);

/**
 * Utility functions for common logging patterns
 */
export const logUtils = {
  /**
   * Log a request start
   */
  requestStart(method: string, url: string, requestId: string): LogTimer {
    const logger = createLogger('API');
    logger.info('Request started', { 
      method, 
      url, 
      requestId,
      operation: `${method} ${url}`
    });
    return logger.timer(`${method} ${url}`);
  },
  
  /**
   * Log a request completion
   */
  requestComplete(timer: LogTimer, statusCode: number, requestId: string): void {
    const level: LogLevel = statusCode >= 500 ? LogLevel.ERROR : statusCode >= 400 ? LogLevel.WARN : LogLevel.INFO;
    timer.stop(level, { statusCode, requestId });
  },
  
  /**
   * Log a session event
   */
  sessionEvent(event: string, sessionId: string, context: LogContext = {}): void {
    const logger = createLogger('Session');
    logger.info(`Session ${event}`, { sessionId, event, ...context });
  },
  
  /**
   * Log an execution event
   */
  executionEvent(event: string, executionId: string, context: LogContext = {}): void {
    const logger = createLogger('Execution');
    logger.info(`Execution ${event}`, { executionId, event, ...context });
  }
};