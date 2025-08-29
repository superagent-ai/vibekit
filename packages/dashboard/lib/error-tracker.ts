/**
 * Error Tracking and Alerting System
 * 
 * Captures, categorizes, and reports errors with automatic alerting
 * for critical issues. Integrates with monitoring systems.
 */

import { EventEmitter } from 'events';
import { createLogger } from './structured-logger';
import { getConfigSection } from './production-config';

const logger = createLogger('ErrorTracker');

/**
 * Error severity levels
 */
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Error categories
 */
export enum ErrorCategory {
  API = 'api',
  DATABASE = 'database',
  FILESYSTEM = 'filesystem',
  NETWORK = 'network',
  AUTHENTICATION = 'authentication',
  VALIDATION = 'validation',
  BUSINESS_LOGIC = 'business_logic',
  SYSTEM = 'system',
  UNKNOWN = 'unknown'
}

/**
 * Error context information
 */
export interface ErrorContext {
  userId?: string;
  sessionId?: string;
  requestId?: string;
  endpoint?: string;
  method?: string;
  ip?: string;
  userAgent?: string;
  timestamp: number;
  environment: string;
  version?: string;
  metadata?: Record<string, any>;
}

/**
 * Tracked error entry
 */
export interface TrackedError {
  id: string;
  message: string;
  stack?: string;
  severity: ErrorSeverity;
  category: ErrorCategory;
  context: ErrorContext;
  count: number;
  firstSeen: number;
  lastSeen: number;
  resolved: boolean;
  fingerprint: string;
}

/**
 * Error statistics
 */
export interface ErrorStats {
  total: number;
  bySeverity: Record<ErrorSeverity, number>;
  byCategory: Record<ErrorCategory, number>;
  rate: number; // errors per minute
  topErrors: Array<{
    fingerprint: string;
    message: string;
    count: number;
    severity: ErrorSeverity;
  }>;
}

/**
 * Alert configuration
 */
export interface AlertConfig {
  enabled: boolean;
  thresholds: {
    errorRate: number; // errors per minute
    criticalErrors: number; // critical errors in window
    uniqueErrors: number; // unique errors in window
  };
  window: number; // time window in ms
  cooldown: number; // cooldown between alerts in ms
  channels: Array<'console' | 'webhook' | 'email' | 'slack'>;
}

/**
 * Error Tracker implementation
 */
export class ErrorTracker extends EventEmitter {
  private errors: Map<string, TrackedError> = new Map();
  private errorHistory: TrackedError[] = [];
  private recentErrors: TrackedError[] = [];
  private alertConfig: AlertConfig;
  private lastAlertTime: Map<string, number> = new Map();
  private errorRateWindow: number[] = [];
  private readonly MAX_ERRORS = 1000;
  private readonly MAX_HISTORY = 10000;
  private readonly RATE_WINDOW = 60000; // 1 minute

  constructor(alertConfig?: Partial<AlertConfig>) {
    super();
    
    this.alertConfig = {
      enabled: true,
      thresholds: {
        errorRate: 10, // 10 errors per minute
        criticalErrors: 3, // 3 critical errors
        uniqueErrors: 20, // 20 unique errors
      },
      window: 300000, // 5 minutes
      cooldown: 600000, // 10 minutes
      channels: ['console'],
      ...alertConfig
    };

    // Cleanup old errors periodically
    setInterval(() => this.cleanup(), 3600000); // Every hour
    
    // Calculate error rate periodically
    setInterval(() => this.calculateErrorRate(), 10000); // Every 10 seconds
  }

  /**
   * Track a new error
   */
  public trackError(
    error: Error | string,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    category: ErrorCategory = ErrorCategory.UNKNOWN,
    context?: Partial<ErrorContext>
  ): string {
    const errorMessage = typeof error === 'string' ? error : error.message;
    const errorStack = typeof error === 'string' ? undefined : error.stack;
    
    // Create fingerprint for error deduplication
    const fingerprint = this.generateFingerprint(errorMessage, errorStack, category);
    
    // Check if we've seen this error before
    let trackedError = this.errors.get(fingerprint);
    
    if (trackedError) {
      // Update existing error
      trackedError.count++;
      trackedError.lastSeen = Date.now();
      
      // Update severity if higher
      if (this.getSeverityLevel(severity) > this.getSeverityLevel(trackedError.severity)) {
        trackedError.severity = severity;
      }
    } else {
      // Create new tracked error
      trackedError = {
        id: this.generateId(),
        message: errorMessage,
        stack: errorStack,
        severity,
        category,
        context: {
          timestamp: Date.now(),
          environment: process.env.NODE_ENV || 'development',
          ...context
        },
        count: 1,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        resolved: false,
        fingerprint
      };
      
      this.errors.set(fingerprint, trackedError);
    }
    
    // Add to history
    this.errorHistory.push({ ...trackedError });
    this.recentErrors.push({ ...trackedError });
    
    // Add to rate window
    this.errorRateWindow.push(Date.now());
    
    // Log the error
    this.logError(trackedError);
    
    // Check for alerts
    this.checkAlerts(trackedError);
    
    // Emit error event
    this.emit('error', trackedError);
    
    // Cleanup if needed
    if (this.errors.size > this.MAX_ERRORS) {
      this.cleanup();
    }
    
    return trackedError.id;
  }

  /**
   * Get error by ID
   */
  public getError(id: string): TrackedError | undefined {
    for (const error of this.errors.values()) {
      if (error.id === id) {
        return error;
      }
    }
    return undefined;
  }

  /**
   * Get all errors
   */
  public getErrors(filter?: {
    severity?: ErrorSeverity;
    category?: ErrorCategory;
    resolved?: boolean;
    since?: number;
  }): TrackedError[] {
    let errors = Array.from(this.errors.values());
    
    if (filter) {
      if (filter.severity) {
        errors = errors.filter(e => e.severity === filter.severity);
      }
      if (filter.category) {
        errors = errors.filter(e => e.category === filter.category);
      }
      if (filter.resolved !== undefined) {
        errors = errors.filter(e => e.resolved === filter.resolved);
      }
      if (filter.since !== undefined) {
        errors = errors.filter(e => e.lastSeen >= filter.since!);
      }
    }
    
    return errors.sort((a, b) => b.lastSeen - a.lastSeen);
  }

  /**
   * Get error statistics
   */
  public getStats(): ErrorStats {
    const errors = Array.from(this.errors.values());
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    // Count errors in last minute
    const recentErrorCount = this.errorRateWindow.filter(
      time => time >= oneMinuteAgo
    ).length;
    
    // Calculate statistics
    const stats: ErrorStats = {
      total: errors.reduce((sum, e) => sum + e.count, 0),
      bySeverity: {
        [ErrorSeverity.LOW]: 0,
        [ErrorSeverity.MEDIUM]: 0,
        [ErrorSeverity.HIGH]: 0,
        [ErrorSeverity.CRITICAL]: 0
      },
      byCategory: {
        [ErrorCategory.API]: 0,
        [ErrorCategory.DATABASE]: 0,
        [ErrorCategory.FILESYSTEM]: 0,
        [ErrorCategory.NETWORK]: 0,
        [ErrorCategory.AUTHENTICATION]: 0,
        [ErrorCategory.VALIDATION]: 0,
        [ErrorCategory.BUSINESS_LOGIC]: 0,
        [ErrorCategory.SYSTEM]: 0,
        [ErrorCategory.UNKNOWN]: 0
      },
      rate: recentErrorCount,
      topErrors: []
    };
    
    // Aggregate by severity and category
    errors.forEach(error => {
      stats.bySeverity[error.severity] = (stats.bySeverity[error.severity] || 0) + error.count;
      stats.byCategory[error.category] = (stats.byCategory[error.category] || 0) + error.count;
    });
    
    // Get top errors
    stats.topErrors = errors
      .filter(e => !e.resolved)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map(e => ({
        fingerprint: e.fingerprint,
        message: e.message,
        count: e.count,
        severity: e.severity
      }));
    
    return stats;
  }

  /**
   * Mark error as resolved
   */
  public resolveError(fingerprint: string): boolean {
    const error = this.errors.get(fingerprint);
    if (error) {
      error.resolved = true;
      this.emit('resolved', error);
      return true;
    }
    return false;
  }

  /**
   * Clear all errors
   */
  public clearErrors(): void {
    this.errors.clear();
    this.errorHistory = [];
    this.recentErrors = [];
    this.errorRateWindow = [];
    logger.info('All errors cleared');
  }

  /**
   * Generate error fingerprint
   */
  private generateFingerprint(message: string, stack?: string, category?: ErrorCategory): string {
    // Use first line of stack trace if available
    const stackLine = stack?.split('\n')[1]?.trim() || '';
    
    // Normalize message (remove numbers, IDs, etc.)
    const normalizedMessage = message
      .replace(/\b\d+\b/g, 'N')
      .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, 'UUID')
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, 'EMAIL');
    
    // Create fingerprint
    const fingerprint = `${category}:${normalizedMessage}:${stackLine}`;
    
    // Simple hash
    let hash = 0;
    for (let i = 0; i < fingerprint.length; i++) {
      const char = fingerprint.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    
    return Math.abs(hash).toString(36);
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get severity level (for comparison)
   */
  private getSeverityLevel(severity: ErrorSeverity): number {
    const levels = {
      [ErrorSeverity.LOW]: 1,
      [ErrorSeverity.MEDIUM]: 2,
      [ErrorSeverity.HIGH]: 3,
      [ErrorSeverity.CRITICAL]: 4
    };
    return levels[severity] || 0;
  }

  /**
   * Log error based on severity
   */
  private logError(error: TrackedError): void {
    const logData = {
      id: error.id,
      message: error.message,
      severity: error.severity,
      category: error.category,
      count: error.count,
      context: error.context
    };
    
    switch (error.severity) {
      case ErrorSeverity.CRITICAL:
        logger.error('Critical error tracked', logData);
        break;
      case ErrorSeverity.HIGH:
        logger.error('High severity error tracked', logData);
        break;
      case ErrorSeverity.MEDIUM:
        logger.warn('Medium severity error tracked', logData);
        break;
      case ErrorSeverity.LOW:
        logger.info('Low severity error tracked', logData);
        break;
    }
  }

  /**
   * Check if alerts should be triggered
   */
  private checkAlerts(error: TrackedError): void {
    if (!this.alertConfig.enabled) return;
    
    const now = Date.now();
    const windowStart = now - this.alertConfig.window;
    
    // Get recent errors in window
    const recentErrors = this.recentErrors.filter(e => e.lastSeen >= windowStart);
    
    // Count critical errors
    const criticalCount = recentErrors.filter(
      e => e.severity === ErrorSeverity.CRITICAL
    ).length;
    
    // Count unique errors
    const uniqueErrors = new Set(recentErrors.map(e => e.fingerprint)).size;
    
    // Calculate error rate
    const errorRate = this.errorRateWindow.filter(
      time => time >= now - this.RATE_WINDOW
    ).length;
    
    // Check thresholds
    const alerts: string[] = [];
    
    if (error.severity === ErrorSeverity.CRITICAL) {
      alerts.push(`Critical error: ${error.message}`);
    }
    
    if (criticalCount >= this.alertConfig.thresholds.criticalErrors) {
      alerts.push(`Critical error threshold exceeded: ${criticalCount} errors`);
    }
    
    if (uniqueErrors >= this.alertConfig.thresholds.uniqueErrors) {
      alerts.push(`Unique error threshold exceeded: ${uniqueErrors} unique errors`);
    }
    
    if (errorRate >= this.alertConfig.thresholds.errorRate) {
      alerts.push(`Error rate threshold exceeded: ${errorRate} errors/minute`);
    }
    
    // Send alerts
    alerts.forEach(alert => this.sendAlert(alert, error));
  }

  /**
   * Send alert through configured channels
   */
  private sendAlert(message: string, error: TrackedError): void {
    const alertKey = `${message}:${error.fingerprint}`;
    const lastAlert = this.lastAlertTime.get(alertKey) || 0;
    const now = Date.now();
    
    // Check cooldown
    if (now - lastAlert < this.alertConfig.cooldown) {
      return; // Still in cooldown
    }
    
    this.lastAlertTime.set(alertKey, now);
    
    // Send through channels
    this.alertConfig.channels.forEach(channel => {
      switch (channel) {
        case 'console':
          console.error(`🚨 ALERT: ${message}`, {
            error: error.message,
            severity: error.severity,
            category: error.category,
            count: error.count
          });
          break;
          
        case 'webhook':
          // Implement webhook alerting
          this.sendWebhookAlert(message, error);
          break;
          
        case 'email':
          // Implement email alerting
          this.sendEmailAlert(message, error);
          break;
          
        case 'slack':
          // Implement Slack alerting
          this.sendSlackAlert(message, error);
          break;
      }
    });
    
    // Emit alert event
    this.emit('alert', { message, error });
  }

  /**
   * Send webhook alert (placeholder)
   */
  private async sendWebhookAlert(message: string, error: TrackedError): Promise<void> {
    // Implement webhook integration
    logger.info('Webhook alert would be sent', { message, errorId: error.id });
  }

  /**
   * Send email alert (placeholder)
   */
  private async sendEmailAlert(message: string, error: TrackedError): Promise<void> {
    // Implement email integration
    logger.info('Email alert would be sent', { message, errorId: error.id });
  }

  /**
   * Send Slack alert (placeholder)
   */
  private async sendSlackAlert(message: string, error: TrackedError): Promise<void> {
    // Implement Slack integration
    logger.info('Slack alert would be sent', { message, errorId: error.id });
  }

  /**
   * Calculate error rate
   */
  private calculateErrorRate(): void {
    const now = Date.now();
    const oneMinuteAgo = now - this.RATE_WINDOW;
    
    // Clean old entries
    this.errorRateWindow = this.errorRateWindow.filter(time => time >= oneMinuteAgo);
  }

  /**
   * Cleanup old errors
   */
  private cleanup(): void {
    const now = Date.now();
    const oneHourAgo = now - 3600000;
    const oneDayAgo = now - 86400000;
    
    // Clean recent errors (keep last hour)
    this.recentErrors = this.recentErrors.filter(e => e.lastSeen >= oneHourAgo);
    
    // Clean resolved errors older than 1 day
    for (const [fingerprint, error] of this.errors.entries()) {
      if (error.resolved && error.lastSeen < oneDayAgo) {
        this.errors.delete(fingerprint);
      }
    }
    
    // Limit history size
    if (this.errorHistory.length > this.MAX_HISTORY) {
      this.errorHistory = this.errorHistory.slice(-this.MAX_HISTORY);
    }
    
    logger.debug('Error tracker cleanup completed', {
      errors: this.errors.size,
      history: this.errorHistory.length,
      recent: this.recentErrors.length
    });
  }
}

// Create singleton instance
export const errorTracker = new ErrorTracker({
  enabled: getConfigSection('monitoring').errorReporting,
  channels: process.env.NODE_ENV === 'production' 
    ? ['console', 'webhook'] 
    : ['console']
});

// Global error handlers
if (typeof process !== 'undefined') {
  process.on('uncaughtException', (error: Error) => {
    errorTracker.trackError(error, ErrorSeverity.CRITICAL, ErrorCategory.SYSTEM);
  });
  
  process.on('unhandledRejection', (reason: any) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    errorTracker.trackError(error, ErrorSeverity.HIGH, ErrorCategory.SYSTEM);
  });
}

// Export helper functions
export function trackError(
  error: Error | string,
  severity?: ErrorSeverity,
  category?: ErrorCategory,
  context?: Partial<ErrorContext>
): string {
  return errorTracker.trackError(error, severity, category, context);
}

export function getErrorStats(): ErrorStats {
  return errorTracker.getStats();
}

export function resolveError(fingerprint: string): boolean {
  return errorTracker.resolveError(fingerprint);
}