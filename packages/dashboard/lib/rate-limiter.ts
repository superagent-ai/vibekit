/**
 * Simple in-memory rate limiter for VibeKit Dashboard
 * 
 * Provides basic rate limiting for API endpoints to prevent abuse.
 * Since this is local-only, we use a simple in-memory store.
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

export class RateLimiter {
  private store = new Map<string, RateLimitEntry>();
  private readonly cleanupInterval: NodeJS.Timeout;
  
  constructor(
    private readonly windowMs: number = 60000, // 1 minute
    private readonly maxRequests: number = 100  // 100 requests per minute
  ) {
    // Clean up expired entries every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }
  
  /**
   * Check if a request should be rate limited
   * @param identifier - Usually IP address or user identifier
   * @returns true if request should be allowed, false if rate limited
   */
  isAllowed(identifier: string): boolean {
    const now = Date.now();
    const entry = this.store.get(identifier);
    
    if (!entry || now > entry.resetTime) {
      // First request or window expired
      this.store.set(identifier, {
        count: 1,
        resetTime: now + this.windowMs
      });
      return true;
    }
    
    if (entry.count >= this.maxRequests) {
      // Rate limit exceeded
      return false;
    }
    
    // Increment counter
    entry.count++;
    return true;
  }
  
  /**
   * Get current rate limit status for an identifier
   */
  getStatus(identifier: string): {
    remaining: number;
    total: number;
    resetTime: number;
  } {
    const entry = this.store.get(identifier);
    const now = Date.now();
    
    if (!entry || now > entry.resetTime) {
      return {
        remaining: this.maxRequests,
        total: this.maxRequests,
        resetTime: now + this.windowMs
      };
    }
    
    return {
      remaining: Math.max(0, this.maxRequests - entry.count),
      total: this.maxRequests,
      resetTime: entry.resetTime
    };
  }
  
  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.resetTime) {
        this.store.delete(key);
      }
    }
  }
  
  /**
   * Clear all rate limit data
   */
  clear(): void {
    this.store.clear();
  }
  
  /**
   * Get statistics
   */
  getStats(): {
    activeEntries: number;
    totalRequests: number;
  } {
    const now = Date.now();
    let totalRequests = 0;
    let activeEntries = 0;
    
    for (const entry of this.store.values()) {
      if (now <= entry.resetTime) {
        activeEntries++;
        totalRequests += entry.count;
      }
    }
    
    return {
      activeEntries,
      totalRequests
    };
  }
  
  /**
   * Cleanup on shutdown
   */
  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.store.clear();
  }
}

// Global rate limiter instances for different API types
export const apiRateLimiter = new RateLimiter(60000, 100);        // 100 requests per minute for general API
export const streamRateLimiter = new RateLimiter(60000, 10);      // 10 stream connections per minute
export const uploadRateLimiter = new RateLimiter(60000, 20);      // 20 uploads per minute

/**
 * Middleware helper for Next.js API routes
 */
export function withRateLimit(
  rateLimiter: RateLimiter,
  getIdentifier: (req: Request) => string = (req) => req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown'
) {
  return function rateLimitMiddleware(req: Request): { allowed: boolean; headers: Record<string, string> } {
    const identifier = getIdentifier(req);
    const allowed = rateLimiter.isAllowed(identifier);
    const status = rateLimiter.getStatus(identifier);
    
    const headers = {
      'X-RateLimit-Limit': status.total.toString(),
      'X-RateLimit-Remaining': status.remaining.toString(),
      'X-RateLimit-Reset': Math.ceil(status.resetTime / 1000).toString()
    };
    
    return { allowed, headers };
  };
}