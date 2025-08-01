import type { TelemetryEvent, ReliabilityConfig } from '../core/types.js';
import { CircuitBreaker } from './CircuitBreaker.js';
import { RateLimiter } from './RateLimiter.js';
import { ErrorHandler, type TelemetryError, type ErrorCategory, type ErrorSeverity } from './ErrorHandler.js';
import { AlertingService, type AlertChannel, type AlertRule, type Alert } from './AlertingService.js';
import { HealthChecker, type SystemHealth, type HealthCheckResult } from './HealthChecker.js';
import { BackpressureManager, type BackpressureStats } from './BackpressureManager.js';
import { ResourceMonitor, type ResourceMetrics, type ResourceThresholds } from './ResourceMonitor.js';
import { FallbackStrategy, type FallbackHandler, type FallbackOptions, type FallbackChain } from './FallbackStrategy.js';
import { createLogger } from '../utils/logger.js';

export class ReliabilityManager {
  private circuitBreakers = new Map<string, CircuitBreaker>();
  private rateLimiter: RateLimiter;
  private errorHandler: ErrorHandler;
  private alertingService: AlertingService;
  private healthChecker: HealthChecker;
  private backpressureManager: BackpressureManager;
  private resourceMonitor: ResourceMonitor;
  private config: ReliabilityConfig;
  private logger = createLogger('ReliabilityManager');
  
  constructor(config: ReliabilityConfig = {}) {
    this.config = {
      circuitBreaker: { enabled: true, threshold: 5, timeout: 60000 },
      rateLimit: { enabled: true, maxRequests: 100, windowMs: 60000 },
      retry: { enabled: true, maxRetries: 3, backoff: 1000 },
      ...config,
    };
    
    this.rateLimiter = new RateLimiter(
      this.config.rateLimit?.maxRequests || 100,
      this.config.rateLimit?.windowMs || 60000
    );
    
    this.errorHandler = new ErrorHandler({
      maxErrors: 1000,
      errorWindowMs: 300000, // 5 minutes
      alertThresholds: {
        high: 10,
        critical: 5,
      },
      onErrorThreshold: this.handleErrorThreshold.bind(this),
      onCriticalError: this.handleCriticalError.bind(this),
    });
    
    // Initialize new components
    this.alertingService = new AlertingService();
    this.healthChecker = new HealthChecker(this);
    this.backpressureManager = new BackpressureManager({
      highWaterMark: 1000,
      lowWaterMark: 500,
      strategy: 'drop-oldest',
      onPressure: (level) => {
        this.logger.warn(`Backpressure detected: ${(level * 100).toFixed(1)}%`);
      },
    });
    
    this.resourceMonitor = new ResourceMonitor({
      cpu: { warning: 70, critical: 90 },
      memory: { warning: 70, critical: 85 },
      eventLoop: { warning: 100, critical: 250 },
    });
    
    // Set up resource monitoring alerts
    this.resourceMonitor.on('alert', (alert) => {
      this.handleResourceAlert(alert);
    });
    
    // Start resource monitoring
    this.resourceMonitor.start(5000);
    
    // Start health checks
    this.healthChecker.startPeriodicChecks(60000);
  }
  
  async checkRateLimit(event: TelemetryEvent): Promise<void> {
    if (!this.config.rateLimit?.enabled) return;
    
    const key = `${event.category}:${event.action}`;
    try {
      await this.rateLimiter.checkLimit(key);
    } catch (error) {
      const telemetryError = this.errorHandler.createError(
        `Rate limit exceeded for ${key}`,
        'system',
        'medium',
        { event: event.id, category: event.category, action: event.action },
        event,
        false // Rate limit errors are not retryable immediately
      );
      await this.errorHandler.handleError(telemetryError);
      throw telemetryError;
    }
  }
  
  async executeWithCircuitBreaker<T>(key: string, operation: () => Promise<T>): Promise<T> {
    if (!this.config.circuitBreaker?.enabled) {
      try {
        return await operation();
      } catch (error) {
        await this.errorHandler.handleError(error as Error, 'system');
        throw error;
      }
    }
    
    let breaker = this.circuitBreakers.get(key);
    if (!breaker) {
      breaker = new CircuitBreaker(
        this.config.circuitBreaker.threshold,
        this.config.circuitBreaker.timeout
      );
      this.circuitBreakers.set(key, breaker);
    }
    
    try {
      return await breaker.execute(operation);
    } catch (error) {
      const category: ErrorCategory = key.startsWith('storage:') ? 'storage' : 
                                     key.startsWith('streaming:') ? 'streaming' : 'system';
      
      const severity: ErrorSeverity = breaker.getState() === 'open' ? 'high' : 'medium';
      
      const telemetryError = this.errorHandler.createError(
        `Circuit breaker error for ${key}: ${(error as Error).message}`,
        category,
        severity,
        { 
          circuitBreakerKey: key, 
          circuitBreakerState: breaker.getState(),
          circuitBreakerStats: breaker.getStats()
        },
        undefined,
        breaker.getState() !== 'open' // Only retryable if circuit is not open
      );
      
      await this.errorHandler.handleError(telemetryError);
      throw telemetryError;
    }
  }
  
  async executeWithRetry<T>(operation: () => Promise<T>, context?: string): Promise<T> {
    if (!this.config.retry?.enabled) {
      try {
        return await operation();
      } catch (error) {
        await this.errorHandler.handleError(error as Error, 'system');
        throw error;
      }
    }
    
    const maxRetries = this.config.retry.maxRetries || 3;
    const backoff = this.config.retry.backoff || 1000;
    
    let lastError: Error;
    const attempts: { attempt: number; error: string; delay: number }[] = [];
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Check if error is retryable
        if (!this.errorHandler.isRetryable(lastError)) {
          const telemetryError = this.errorHandler.createError(
            `Non-retryable error in ${context || 'operation'}: ${lastError.message}`,
            'system',
            'medium',
            { attempt, context },
            undefined,
            false
          );
          await this.errorHandler.handleError(telemetryError);
          throw telemetryError;
        }
        
        const delay = backoff * Math.pow(2, attempt);
        attempts.push({ attempt, error: lastError.message, delay });
        
        if (attempt === maxRetries) {
          const telemetryError = this.errorHandler.createError(
            `All retry attempts failed for ${context || 'operation'}: ${lastError.message}`,
            'system',
            'high',
            { maxRetries, attempts, context },
            undefined,
            false
          );
          await this.errorHandler.handleError(telemetryError);
          throw telemetryError;
        }
        
        // Log retry attempt
        this.logger.warn(`Retry attempt ${attempt + 1}/${maxRetries} for ${context || 'operation'} after ${delay}ms: ${lastError.message}`);
        
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError!;
  }
  
  getCircuitBreakerStats(): Record<string, any> {
    const stats: Record<string, any> = {};
    
    for (const [key, breaker] of this.circuitBreakers) {
      stats[key] = breaker.getStats();
    }
    
    return stats;
  }
  
  getRateLimiterStats(): any {
    return this.rateLimiter.getStats();
  }

  // Error handling callback methods
  private async handleErrorThreshold(errors: TelemetryError[], threshold: ErrorSeverity): Promise<void> {
    this.logger.error(`Error threshold reached for ${threshold} severity:`, {
      count: errors.length,
      threshold,
      errors: errors.map(e => ({
        message: e.message,
        category: e.category,
        timestamp: new Date(e.timestamp).toISOString(),
        correlationId: e.correlationId,
      })),
    });

    // Check alert rules with current error context
    await this.alertingService.checkRules({
      errors,
      circuitBreakerStates: this.getCircuitBreakerStats(),
      rateLimiterStats: this.getRateLimiterStats(),
    });
  }

  private async handleCriticalError(error: TelemetryError): Promise<void> {
    this.logger.error('CRITICAL ERROR detected:', {
      message: error.message,
      category: error.category,
      severity: error.severity,
      timestamp: new Date(error.timestamp).toISOString(),
      context: error.context,
      correlationId: error.correlationId,
    });

    // Trigger immediate alert for critical errors
    await this.alertingService.checkRules({
      errors: [error],
      circuitBreakerStates: this.getCircuitBreakerStats(),
      rateLimiterStats: this.getRateLimiterStats(),
    });
  }
  
  private async handleResourceAlert(alert: any): Promise<void> {
    // Convert resource alert to telemetry error for consistent handling
    const telemetryError = this.errorHandler.createError(
      alert.message,
      'system',
      alert.severity === 'critical' ? 'critical' : 'high',
      {
        resourceType: alert.type,
        value: alert.value,
        threshold: alert.threshold,
      },
      undefined,
      false
    );
    
    await this.errorHandler.handleError(telemetryError);
  }

  // Enhanced stats methods
  getErrorStats(): any {
    return this.errorHandler.getErrorStats();
  }

  getHealthStatus(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    details: {
      circuitBreakers: Record<string, any>;
      rateLimiter: any;
      errors: any;
      timestamp: string;
    };
  } {
    const errorStats = this.errorHandler.getErrorStats();
    const circuitBreakerStats = this.getCircuitBreakerStats();
    
    // Determine overall health
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    
    // Check for critical errors in last 5 minutes
    if (errorStats.bySeverity.critical > 0) {
      status = 'unhealthy';
    } else if (errorStats.bySeverity.high > 5 || errorStats.recent > 20) {
      status = 'degraded';
    }
    
    // Check circuit breaker states
    const openCircuits = Object.values(circuitBreakerStats).filter(
      (stats: any) => stats.state === 'open'
    ).length;
    
    if (openCircuits > 0) {
      status = status === 'unhealthy' ? 'unhealthy' : 'degraded';
    }

    return {
      status,
      details: {
        circuitBreakers: circuitBreakerStats,
        rateLimiter: this.getRateLimiterStats(),
        errors: errorStats,
        timestamp: new Date().toISOString(),
      },
    };
  }

  // Enhanced cleanup method
  shutdown(): void {
    this.rateLimiter.shutdown();
    this.errorHandler.shutdown();
    this.circuitBreakers.clear();
    this.resourceMonitor.shutdown();
    this.backpressureManager.shutdown();
    this.healthChecker.stop();
  }

  // Graceful degradation helper
  async executeWithGracefulDegradation<T>(
    primary: () => Promise<T>,
    fallback: () => Promise<T> | T,
    context: string
  ): Promise<T> {
    try {
      return await this.executeWithCircuitBreaker(
        `graceful:${context}`,
        () => this.executeWithRetry(primary, context)
      );
    } catch (error) {
      this.logger.warn(`Primary operation failed for ${context}, using fallback:`, error);
      
      try {
        return await Promise.resolve(fallback());
      } catch (fallbackError) {
        const telemetryError = this.errorHandler.createError(
          `Both primary and fallback operations failed for ${context}`,
          'system',
          'critical',
          { 
            primaryError: (error as Error).message,
            fallbackError: (fallbackError as Error).message,
            context 
          },
          undefined,
          false
        );
        await this.errorHandler.handleError(telemetryError);
        throw telemetryError;
      }
    }
  }

  // Alert management methods
  addAlertChannel(channel: AlertChannel): void {
    this.alertingService.addChannel(channel.name, channel);
  }

  removeAlertChannel(name: string): void {
    this.alertingService.removeChannel(name);
  }

  addAlertRule(rule: AlertRule): void {
    this.alertingService.addRule(rule);
  }

  removeAlertRule(id: string): void {
    this.alertingService.removeRule(id);
  }

  getAlertHistory(duration?: number): Alert[] {
    return this.alertingService.getAlertHistory(duration);
  }

  // Backpressure management
  async pushToQueue<T>(item: T, queueName: string = 'default'): Promise<boolean> {
    return this.backpressureManager.push(item);
  }

  async *consumeFromQueue<T>(queueName: string = 'default'): AsyncGenerator<T, void, unknown> {
    yield* this.backpressureManager.consume<T>();
  }

  getBackpressureStats(): BackpressureStats {
    return this.backpressureManager.getStats();
  }

  // Resource monitoring
  getResourceMetrics(): ResourceMetrics | null {
    return this.resourceMonitor.getLatestMetrics();
  }

  getResourceHistory(duration?: number): ResourceMetrics[] {
    return this.resourceMonitor.getMetricsHistory(duration);
  }

  updateResourceThresholds(thresholds: ResourceThresholds): void {
    this.resourceMonitor.updateThresholds(thresholds);
  }

  // Health check methods
  async getSystemHealth(): Promise<SystemHealth> {
    return this.healthChecker.checkHealth();
  }

  async runHealthCheck(checkName?: string): Promise<HealthCheckResult | SystemHealth> {
    if (checkName) {
      return this.healthChecker.runCheck(checkName);
    }
    return this.healthChecker.runChecks();
  }

  // Fallback strategy helpers
  async executeWithFallbackChain<T>(
    chain: FallbackChain<T>,
    options?: FallbackOptions
  ): Promise<T> {
    return FallbackStrategy.withChain(chain, options);
  }

  createCircuitBreakerHandler<T>(
    handler: FallbackHandler<T>,
    options: {
      threshold: number;
      timeout: number;
      resetTimeout: number;
      fallback?: FallbackHandler<T>;
    }
  ): FallbackHandler<T> {
    return FallbackStrategy.createCircuitBreaker(handler, options);
  }

  // Combined reliability stats
  getReliabilityReport(): {
    health: any;
    errors: any;
    circuitBreakers: Record<string, any>;
    rateLimiter: any;
    backpressure: BackpressureStats;
    resources: ResourceMetrics | null;
    alerts: Alert[];
  } {
    return {
      health: this.getHealthStatus(),
      errors: this.getErrorStats(),
      circuitBreakers: this.getCircuitBreakerStats(),
      rateLimiter: this.getRateLimiterStats(),
      backpressure: this.getBackpressureStats(),
      resources: this.getResourceMetrics(),
      alerts: this.getAlertHistory(300000), // Last 5 minutes
    };
  }
}