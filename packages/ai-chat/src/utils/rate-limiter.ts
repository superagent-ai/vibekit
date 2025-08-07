export interface RateLimiterOptions {
  maxRequests: number;
  windowMs: number;
}

export class RateLimiter {
  private requests: number[] = [];
  
  constructor(private options: RateLimiterOptions) {}
  
  async checkLimit(): Promise<boolean> {
    const now = Date.now();
    const windowStart = now - this.options.windowMs;
    
    // Remove old requests outside the window
    this.requests = this.requests.filter(time => time > windowStart);
    
    // Check if we're at the limit
    if (this.requests.length >= this.options.maxRequests) {
      return false;
    }
    
    // Add the current request
    this.requests.push(now);
    return true;
  }
  
  getResetTime(): number {
    if (this.requests.length === 0) {
      return 0;
    }
    
    const oldestRequest = Math.min(...this.requests);
    return oldestRequest + this.options.windowMs;
  }
  
  getRemainingRequests(): number {
    const now = Date.now();
    const windowStart = now - this.options.windowMs;
    const activeRequests = this.requests.filter(time => time > windowStart);
    return Math.max(0, this.options.maxRequests - activeRequests.length);
  }
}

export class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  
  constructor(
    private capacity: number,
    private refillRate: number, // tokens per second
    private refillInterval: number = 1000 // milliseconds
  ) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }
  
  async consume(tokens: number = 1): Promise<boolean> {
    this.refill();
    
    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }
    
    return false;
  }
  
  private refill() {
    const now = Date.now();
    const timePassed = now - this.lastRefill;
    const tokensToAdd = (timePassed / this.refillInterval) * this.refillRate;
    
    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }
  
  getAvailableTokens(): number {
    this.refill();
    return Math.floor(this.tokens);
  }
}