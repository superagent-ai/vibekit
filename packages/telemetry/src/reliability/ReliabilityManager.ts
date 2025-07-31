import type { TelemetryEvent, ReliabilityConfig } from '../core/types.js';
import { CircuitBreaker } from './CircuitBreaker.js';
import { RateLimiter } from './RateLimiter.js';

export class ReliabilityManager {
  private circuitBreakers = new Map<string, CircuitBreaker>();
  private rateLimiter: RateLimiter;
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
  }
  
  async checkRateLimit(event: TelemetryEvent): Promise<void> {
    if (!this.config.rateLimit?.enabled) return;
    
    const key = `${event.category}:${event.action}`;
    await this.rateLimiter.checkLimit(key);
  }
  
  async executeWithCircuitBreaker<T>(key: string, operation: () => Promise<T>): Promise<T> {
    if (!this.config.circuitBreaker?.enabled) {
      return operation();
    }
    
    let breaker = this.circuitBreakers.get(key);
    if (!breaker) {
      breaker = new CircuitBreaker(
        this.config.circuitBreaker.threshold,
        this.config.circuitBreaker.timeout
      );
      this.circuitBreakers.set(key, breaker);
    }
    
    return breaker.execute(operation);
  }
  
  async executeWithRetry<T>(operation: () => Promise<T>): Promise<T> {
    if (!this.config.retry?.enabled) {
      return operation();
    }
    
    const maxRetries = this.config.retry.maxRetries || 3;
    const backoff = this.config.retry.backoff || 1000;
    
    let lastError: Error;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt === maxRetries) {
          throw lastError;
        }
        
        // Exponential backoff
        const delay = backoff * Math.pow(2, attempt);
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
}