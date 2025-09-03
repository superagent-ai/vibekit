export {
  StructuredLogger,
  ComponentLogger,
  LogTimer,
  type LogContext,
  type LogEntry,
  LogLevel
} from './structured-logger';

export {
  type LoggerConfig,
  getLogLevel,
  getLoggerConfig,
  shouldLog,
  LOG_LEVEL_NAMES,
  PRODUCTION_CONFIG,
  DEVELOPMENT_CONFIG
} from './logger-config';

export {
  sanitizeLogData,
  sanitizeMessage,
  sanitizeString,
  sanitizeObject,
  type SanitizeOptions
} from './log-sanitizer';

// Import types for the convenience exports
import { StructuredLogger, type LogContext, type LogTimer, LogLevel } from './structured-logger';

// Convenience exports
export const logger = StructuredLogger.getInstance();

export const createLogger = (component: string, baseContext?: LogContext) => 
  StructuredLogger.create(component, baseContext);

// Utility functions for common logging patterns
export const logUtils = {
  /**
   * Log a request start
   */
  requestStart(method: string, url: string, requestId: string) {
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
  requestComplete(timer: LogTimer, statusCode: number, requestId: string) {
    const level: LogLevel = statusCode >= 500 ? LogLevel.ERROR : statusCode >= 400 ? LogLevel.WARN : LogLevel.INFO;
    timer.stop(level, { statusCode, requestId });
  },
  
  /**
   * Log a session event
   */
  sessionEvent(event: string, sessionId: string, context: LogContext = {}) {
    const logger = createLogger('Session');
    logger.info(`Session ${event}`, { sessionId, event, ...context });
  },
  
  /**
   * Log an execution event
   */
  executionEvent(event: string, executionId: string, context: LogContext = {}) {
    const logger = createLogger('Execution');
    logger.info(`Execution ${event}`, { executionId, event, ...context });
  }
};