interface RateLimitWindow {
  start: number;
  count: number;
}

export class RateLimiter {
  private windows = new Map<string, RateLimitWindow>();
  private cleanupInterval?: NodeJS.Timeout;
  
  constructor(
    private maxRequests: number = 100,
    private windowMs: number = 60000
  ) {
    // Clean up old windows every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000);
  }
  
  async checkLimit(key: string): Promise<void> {
    const now = Date.now();
    let window = this.windows.get(key);
    
    if (!window || now - window.start > this.windowMs) {
      window = { start: now, count: 0 };
      this.windows.set(key, window);
    }
    
    if (window.count >= this.maxRequests) {
      const resetTime = window.start + this.windowMs;
      const waitTime = resetTime - now;
      throw new Error(`Rate limit exceeded for ${key}. Try again in ${Math.ceil(waitTime / 1000)} seconds`);
    }
    
    window.count++;
  }
  
  reset(key: string): void {
    this.windows.delete(key);
  }
  
  resetAll(): void {
    this.windows.clear();
  }
  
  getStats(): any {
    const stats: Record<string, any> = {};
    const now = Date.now();
    
    for (const [key, window] of this.windows) {
      if (now - window.start <= this.windowMs) {
        stats[key] = {
          count: window.count,
          remaining: Math.max(0, this.maxRequests - window.count),
          resetTime: window.start + this.windowMs,
        };
      }
    }
    
    return {
      activeWindows: Object.keys(stats).length,
      totalWindows: this.windows.size,
      windows: stats,
    };
  }
  
  private cleanup(): void {
    const now = Date.now();
    
    for (const [key, window] of this.windows) {
      if (now - window.start > this.windowMs * 2) {
        this.windows.delete(key);
      }
    }
  }
  
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.windows.clear();
  }
}