import type { TelemetryEvent } from '../core/types.js';
import { createLogger } from '../utils/logger.js';

export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';
export type ErrorCategory = 'storage' | 'streaming' | 'security' | 'network' | 'validation' | 'system';

export interface TelemetryError extends Error {
  severity: ErrorSeverity;
  category: ErrorCategory;
  context?: Record<string, any>;
  timestamp: number;
  event?: TelemetryEvent;
  retryable: boolean;
  correlationId?: string;
}

export interface ErrorHandlerConfig {
  maxErrors?: number;
  errorWindowMs?: number;
  cleanupInterval?: number;
  aggressiveCleanup?: boolean; // Clean up more frequently when hitting limits
  alertThresholds?: {
    high: number;
    critical: number;
  };
  onErrorThreshold?: (errors: TelemetryError[], threshold: ErrorSeverity) => void;
  onCriticalError?: (error: TelemetryError) => void;
  onMemoryPressure?: (currentSize: number, maxSize: number) => void;
}

export class ErrorHandler {
  private errors: TelemetryError[] = [];
  private config: Required<ErrorHandlerConfig>;
  private cleanupInterval?: NodeJS.Timeout;
  private errorCounter = 0;
  private logger = createLogger('ErrorHandler');

  constructor(config: ErrorHandlerConfig = {}) {
    this.config = {
      maxErrors: config.maxErrors || 1000,
      errorWindowMs: config.errorWindowMs || 300000, // 5 minutes
      cleanupInterval: config.cleanupInterval || 60000, // 1 minute
      aggressiveCleanup: config.aggressiveCleanup ?? true,
      alertThresholds: config.alertThresholds || {
        high: 10,
        critical: 5,
      },
      onErrorThreshold: config.onErrorThreshold || (() => {}),
      onCriticalError: config.onCriticalError || (() => {}),
      onMemoryPressure: config.onMemoryPressure || (() => {}),
    };

    // Start cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupInterval);
  }

  createError(
    message: string,
    category: ErrorCategory,
    severity: ErrorSeverity = 'medium',
    context?: Record<string, any>,
    event?: TelemetryEvent,
    retryable: boolean = true,
    correlationId?: string
  ): TelemetryError {
    const error = new Error(message) as TelemetryError;
    error.severity = severity;
    error.category = category;
    error.context = context;
    error.timestamp = Date.now();
    error.event = event;
    error.retryable = retryable;
    error.correlationId = correlationId;
    return error;
  }

  async handleError(error: Error | TelemetryError, fallbackCategory: ErrorCategory = 'system'): Promise<void> {
    let telemetryError: TelemetryError;

    if (this.isTelemetryError(error)) {
      telemetryError = error;
    } else {
      telemetryError = this.createError(
        error.message,
        fallbackCategory,
        'medium',
        { originalError: error.name },
        undefined,
        true
      );
    }

    // Store error for tracking
    this.errors.push(telemetryError);
    this.errorCounter++;

    // Check for memory pressure and cleanup aggressively if needed
    if (this.errors.length > this.config.maxErrors * 0.9) {
      this.config.onMemoryPressure(this.errors.length, this.config.maxErrors);
      
      if (this.config.aggressiveCleanup) {
        this.cleanup();
      }
    }

    // Trigger periodic cleanup every 50 errors to prevent unbounded growth
    if (this.config.aggressiveCleanup && this.errorCounter % 50 === 0) {
      this.cleanup();
    }

    // Trigger immediate alerts for critical errors
    if (telemetryError.severity === 'critical') {
      try {
        await this.config.onCriticalError(telemetryError);
      } catch (alertError) {
        this.logger.error('Failed to send critical error alert:', alertError);
      }
    }

    // Check error thresholds
    await this.checkErrorThresholds();

    // Log error with appropriate level
    this.logError(telemetryError);
  }

  private async checkErrorThresholds(): Promise<void> {
    const recentErrors = this.getRecentErrors();
    const errorCounts = this.categorizeErrors(recentErrors);

    // Check critical threshold
    if (errorCounts.critical >= this.config.alertThresholds.critical) {
      try {
        await this.config.onErrorThreshold(
          recentErrors.filter(e => e.severity === 'critical'),
          'critical'
        );
      } catch (alertError) {
        this.logger.error('Failed to send critical threshold alert:', alertError);
      }
    }

    // Check high threshold
    if (errorCounts.high >= this.config.alertThresholds.high) {
      try {
        await this.config.onErrorThreshold(
          recentErrors.filter(e => e.severity === 'high'),
          'high'
        );
      } catch (alertError) {
        this.logger.error('Failed to send high threshold alert:', alertError);
      }
    }
  }

  private getRecentErrors(): TelemetryError[] {
    const cutoff = Date.now() - this.config.errorWindowMs;
    return this.errors.filter(error => error.timestamp > cutoff);
  }

  private categorizeErrors(errors: TelemetryError[]): Record<ErrorSeverity, number> {
    return errors.reduce(
      (counts, error) => {
        counts[error.severity]++;
        return counts;
      },
      { low: 0, medium: 0, high: 0, critical: 0 } as Record<ErrorSeverity, number>
    );
  }

  private logError(error: TelemetryError): void {
    const logLevel = this.getLogLevel(error.severity);
    const logMessage = `[${error.category.toUpperCase()}] ${error.message}`;
    const logContext = {
      severity: error.severity,
      category: error.category,
      timestamp: new Date(error.timestamp).toISOString(),
      correlationId: error.correlationId,
      context: error.context,
      retryable: error.retryable,
    };

    switch (logLevel) {
      case 'error':
        this.logger.error(logMessage, logContext);
        break;
      case 'warn':
        this.logger.warn(logMessage, logContext);
        break;
      case 'info':
        this.logger.info(logMessage, logContext);
        break;
      case 'debug':
        this.logger.debug(logMessage, logContext);
        break;
    }
  }

  private getLogLevel(severity: ErrorSeverity): 'error' | 'warn' | 'info' | 'debug' {
    switch (severity) {
      case 'critical':
      case 'high':
        return 'error';
      case 'medium':
        return 'warn';
      case 'low':
        return 'info';
      default:
        return 'debug';
    }
  }

  private isTelemetryError(error: any): error is TelemetryError {
    return error && typeof error === 'object' && 'severity' in error && 'category' in error;
  }

  private cleanup(): void {
    const initialCount = this.errors.length;
    const cutoff = Date.now() - this.config.errorWindowMs * 2; // Keep errors for 2x window
    
    // Remove old errors first
    this.errors = this.errors.filter(error => error.timestamp > cutoff);

    // Limit total errors to prevent memory issues (keep most recent)
    if (this.errors.length > this.config.maxErrors) {
      // Sort by timestamp descending and keep most recent
      this.errors.sort((a, b) => b.timestamp - a.timestamp);
      this.errors = this.errors.slice(0, this.config.maxErrors);
    }

    // Log cleanup if significant number of errors were removed
    const removedCount = initialCount - this.errors.length;
    if (removedCount > 0) {
      this.logger.warn(`[ErrorHandler] Cleaned up ${removedCount} old errors, current size: ${this.errors.length}/${this.config.maxErrors}`);
    }
  }

  getErrorStats(): {
    total: number;
    recent: number;
    bySeverity: Record<ErrorSeverity, number>;
    byCategory: Record<ErrorCategory, number>;
  } {
    const recentErrors = this.getRecentErrors();
    const severityCounts = this.categorizeErrors(recentErrors);
    const categoryCounts = recentErrors.reduce(
      (counts, error) => {
        counts[error.category] = (counts[error.category] || 0) + 1;
        return counts;
      },
      {} as Record<ErrorCategory, number>
    );

    return {
      total: this.errors.length,
      recent: recentErrors.length,
      bySeverity: severityCounts,
      byCategory: categoryCounts,
    };
  }

  getRecentErrorsForCategory(category: ErrorCategory): TelemetryError[] {
    return this.getRecentErrors().filter(error => error.category === category);
  }

  isRetryable(error: Error | TelemetryError): boolean {
    if (this.isTelemetryError(error)) {
      return error.retryable;
    }

    // Default retry logic for generic errors
    const nonRetryablePatterns = [
      /validation/i,
      /authorization/i,
      /authentication/i,
      /invalid.*format/i,
      /malformed/i,
    ];

    return !nonRetryablePatterns.some(pattern => pattern.test(error.message));
  }

  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.errors = [];
  }
}