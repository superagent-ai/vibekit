type CircuitState = 'closed' | 'open' | 'half-open';

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private lastFailureTime = 0;
  private successCount = 0;
  private totalRequests = 0;
  
  constructor(
    private threshold: number = 5,
    private timeout: number = 60000,
    private halfOpenRequests: number = 3
  ) {}
  
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    this.totalRequests++;
    
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'half-open';
        this.successCount = 0;
      } else {
        throw new Error('Circuit breaker is open');
      }
    }
    
    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  private onSuccess(): void {
    this.failureCount = 0;
    
    if (this.state === 'half-open') {
      this.successCount++;
      if (this.successCount >= this.halfOpenRequests) {
        this.state = 'closed';
      }
    }
  }
  
  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.failureCount >= this.threshold) {
      this.state = 'open';
    }
  }
  
  getState(): CircuitState {
    return this.state;
  }
  
  getStats(): any {
    return {
      state: this.state,
      failureCount: this.failureCount,
      totalRequests: this.totalRequests,
      successRate: this.totalRequests > 0 
        ? (this.totalRequests - this.failureCount) / this.totalRequests 
        : 0,
      lastFailureTime: this.lastFailureTime,
    };
  }
  
  reset(): void {
    this.state = 'closed';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
  }
}