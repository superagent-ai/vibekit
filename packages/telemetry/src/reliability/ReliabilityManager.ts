import type { TelemetryEvent, ReliabilityConfig } from '../core/types.js';
import { CircuitBreaker } from './CircuitBreaker.js';
import { RateLimiter } from './RateLimiter.js';
import { ErrorHandler, type TelemetryError, type ErrorCategory, type ErrorSeverity } from './ErrorHandler.js';

export class ReliabilityManager {
  private circuitBreakers = new Map<string, CircuitBreaker>();
  private rateLimiter: RateLimiter;
  private errorHandler: ErrorHandler;
  private config: ReliabilityConfig;
  
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
        console.warn(`Retry attempt ${attempt + 1}/${maxRetries} for ${context || 'operation'} after ${delay}ms: ${lastError.message}`);
        
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
    console.error(`Error threshold reached for ${threshold} severity:`, {
      count: errors.length,
      threshold,
      errors: errors.map(e => ({
        message: e.message,
        category: e.category,
        timestamp: new Date(e.timestamp).toISOString(),
        correlationId: e.correlationId,
      })),
    });

    // TODO: Implement alerting integration (Slack, PagerDuty, etc.)
    // This is where you would integrate with your alerting system
  }

  private async handleCriticalError(error: TelemetryError): Promise<void> {
    console.error('CRITICAL ERROR detected:', {
      message: error.message,
      category: error.category,
      severity: error.severity,
      timestamp: new Date(error.timestamp).toISOString(),
      context: error.context,
      correlationId: error.correlationId,
    });

    // TODO: Implement immediate alerting for critical errors
    // This could trigger immediate notifications to on-call engineers
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
      console.warn(`Primary operation failed for ${context}, using fallback:`, error);
      
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
}