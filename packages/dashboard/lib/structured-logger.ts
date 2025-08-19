/**
 * Structured logging system for VibeKit Dashboard
 * 
 * Provides:
 * - Consistent log formatting with timestamps
 * - Log levels (debug, info, warn, error)
 * - Context-aware logging with component names
 * - JSON structured output for production
 * - Request ID tracking for tracing
 * - Performance timing utilities
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

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
  private readonly environment: 'development' | 'production';
  private readonly minLevel: LogLevel;
  private readonly enableConsole: boolean;
  private readonly enableFile: boolean;
  
  // Log level priority (higher number = more severe)
  private static readonly LOG_LEVELS: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
  };
  
  // ANSI color codes for console output
  private static readonly COLORS: Record<LogLevel, string> = {
    debug: '\x1b[36m', // Cyan
    info: '\x1b[32m',  // Green
    warn: '\x1b[33m',  // Yellow
    error: '\x1b[31m'  // Red
  };
  
  private static readonly RESET_COLOR = '\x1b[0m';
  
  private constructor() {
    this.environment = (process.env.NODE_ENV as 'development' | 'production') || 'development';
    this.minLevel = (process.env.LOG_LEVEL as LogLevel) || (this.environment === 'production' ? 'info' : 'debug');
    this.enableConsole = process.env.LOG_CONSOLE !== 'false';
    this.enableFile = process.env.LOG_FILE === 'true';
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
    if (StructuredLogger.LOG_LEVELS[level] < StructuredLogger.LOG_LEVELS[this.minLevel]) {
      return;
    }
    
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context
    };
    
    // Add error details if context contains an error
    if (context.error && context.error instanceof Error) {
      entry.error = {
        name: context.error.name,
        message: context.error.message,
        stack: context.error.stack
      };
      // Remove error from context to avoid duplication
      const { error, ...contextWithoutError } = context;
      entry.context = contextWithoutError;
    }
    
    // Output to console if enabled
    if (this.enableConsole) {
      this.outputToConsole(entry);
    }
    
    // TODO: Output to file if enabled
    if (this.enableFile) {
      this.outputToFile(entry);
    }
  }
  
  /**
   * Output formatted log to console
   */
  private outputToConsole(entry: LogEntry): void {
    const color = StructuredLogger.COLORS[entry.level];
    const timestamp = entry.timestamp.substring(11, 23); // HH:mm:ss.SSS
    
    if (this.environment === 'development') {
      // Human-readable format for development
      const contextStr = Object.keys(entry.context).length > 0 
        ? ` ${JSON.stringify(entry.context)}`
        : '';
      
      const errorStr = entry.error 
        ? `\n${entry.error.stack || entry.error.message}`
        : '';
      
      console.log(
        `${color}${timestamp} [${entry.level.toUpperCase()}]${StructuredLogger.RESET_COLOR} ${entry.message}${contextStr}${errorStr}`
      );
    } else {
      // JSON format for production
      console.log(JSON.stringify(entry));
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
    this.log('debug', message, context || {});
  }
  
  info(message: string, context?: LogContext): void {
    this.log('info', message, context || {});
  }
  
  warn(message: string, context?: LogContext): void {
    this.log('warn', message, context || {});
  }
  
  error(message: string, context?: LogContext): void {
    this.log('error', message, context || {});
  }
  
  /**
   * Create a timer for performance measurement
   */
  timer(operation: string): LogTimer {
    return new LogTimer(operation);
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
  
  warn(message: string, context: LogContext = {}): void {
    this.logger.warn(message, { ...this.baseContext, ...context });
  }
  
  error(message: string, context: LogContext = {}): void {
    this.logger.error(message, { ...this.baseContext, ...context });
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
    return new LogTimer(operation, this.baseContext);
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
  
  constructor(operation: string, baseContext: LogContext = {}) {
    this.startTime = performance.now();
    this.operation = operation;
    this.context = baseContext;
    this.logger = StructuredLogger.getInstance();
  }
  
  /**
   * Stop the timer and log the duration
   */
  stop(level: LogLevel = 'debug', additionalContext: LogContext = {}): number {
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
    return this.stop('info', additionalContext);
  }
  
  /**
   * Stop the timer and log as warn level (for slow operations)
   */
  stopWarn(additionalContext: LogContext = {}): number {
    return this.stop('warn', additionalContext);
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
    const level: LogLevel = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
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