/**
 * Request Deduplication System
 * 
 * Prevents duplicate API requests and operations by tracking
 * in-flight requests and caching recent responses.
 */

import crypto from 'crypto';
import { createLogger } from './structured-logger';

const logger = createLogger('RequestDeduplication');

/**
 * Request signature for deduplication
 */
export interface RequestSignature {
  method: string;
  path: string;
  body?: string;
  userId?: string;
}

/**
 * Cached response
 */
export interface CachedResponse<T = any> {
  data: T;
  timestamp: number;
  requestId: string;
  signature: string;
}

/**
 * In-flight request tracking
 */
interface InFlightRequest<T = any> {
  promise: Promise<T>;
  startTime: number;
  requestId: string;
}

/**
 * Deduplication options
 */
export interface DeduplicationOptions {
  cacheTTL?: number;        // How long to cache responses (ms)
  requestTimeout?: number;   // Maximum time for in-flight requests (ms)
  maxCacheSize?: number;    // Maximum number of cached responses
  includeBody?: boolean;    // Include request body in signature
}

/**
 * Request Deduplicator implementation
 */
export class RequestDeduplicator {
  private static instance: RequestDeduplicator;
  private inFlightRequests = new Map<string, InFlightRequest>();
  private responseCache = new Map<string, CachedResponse>();
  private cacheOrder: string[] = [];
  
  private readonly defaultOptions: Required<DeduplicationOptions> = {
    cacheTTL: 5000,          // 5 seconds default
    requestTimeout: 30000,    // 30 seconds default
    maxCacheSize: 100,       // 100 cached responses
    includeBody: true
  };
  
  private constructor() {
    // Cleanup expired cache entries every minute
    setInterval(() => this.cleanupCache(), 60000);
    
    // Cleanup stuck in-flight requests every 30 seconds
    setInterval(() => this.cleanupInFlight(), 30000);
  }
  
  /**
   * Get singleton instance
   */
  static getInstance(): RequestDeduplicator {
    if (!RequestDeduplicator.instance) {
      RequestDeduplicator.instance = new RequestDeduplicator();
    }
    return RequestDeduplicator.instance;
  }
  
  /**
   * Generate request signature
   */
  private generateSignature(req: RequestSignature, includeBody: boolean): string {
    const parts = [
      req.method,
      req.path,
      req.userId || 'anonymous'
    ];
    
    if (includeBody && req.body) {
      parts.push(req.body);
    }
    
    const data = parts.join(':');
    return crypto.createHash('sha256').update(data).digest('hex');
  }
  
  /**
   * Execute request with deduplication
   */
  async execute<T>(
    request: RequestSignature,
    handler: () => Promise<T>,
    options: DeduplicationOptions = {}
  ): Promise<T> {
    const opts = { ...this.defaultOptions, ...options };
    const signature = this.generateSignature(request, opts.includeBody);
    const requestId = crypto.randomUUID();
    
    // Check cache first (only for GET requests)
    if (request.method === 'GET') {
      const cached = this.getCached<T>(signature, opts.cacheTTL);
      if (cached) {
        logger.info('Request served from cache', {
          signature: signature.substring(0, 8),
          path: request.path,
          method: request.method,
          cacheAge: Date.now() - cached.timestamp
        });
        return cached.data;
      }
    }
    
    // Check for in-flight request
    const inFlight = this.inFlightRequests.get(signature);
    if (inFlight) {
      // Check if request has timed out
      if (Date.now() - inFlight.startTime > opts.requestTimeout) {
        logger.warn('In-flight request timed out', {
          signature: signature.substring(0, 8),
          path: request.path,
          method: request.method,
          duration: Date.now() - inFlight.startTime
        });
        this.inFlightRequests.delete(signature);
      } else {
        logger.info('Request deduplicated (waiting for in-flight)', {
          signature: signature.substring(0, 8),
          path: request.path,
          method: request.method,
          originalRequestId: inFlight.requestId,
          newRequestId: requestId
        });
        return inFlight.promise as Promise<T>;
      }
    }
    
    // Execute new request
    logger.info('Executing new request', {
      signature: signature.substring(0, 8),
      path: request.path,
      method: request.method,
      requestId
    });
    
    const promise = this.executeRequest<T>(
      signature,
      requestId,
      handler,
      request.method === 'GET' ? opts.cacheTTL : 0
    );
    
    // Track in-flight request
    this.inFlightRequests.set(signature, {
      promise,
      startTime: Date.now(),
      requestId
    });
    
    return promise;
  }
  
  /**
   * Execute the actual request
   */
  private async executeRequest<T>(
    signature: string,
    requestId: string,
    handler: () => Promise<T>,
    cacheTTL: number
  ): Promise<T> {
    try {
      const result = await handler();
      
      // Cache successful GET responses
      if (cacheTTL > 0) {
        this.cacheResponse(signature, {
          data: result,
          timestamp: Date.now(),
          requestId,
          signature
        });
      }
      
      return result;
    } finally {
      // Clean up in-flight tracking
      this.inFlightRequests.delete(signature);
    }
  }
  
  /**
   * Get cached response
   */
  private getCached<T>(signature: string, ttl: number): CachedResponse<T> | null {
    const cached = this.responseCache.get(signature);
    
    if (!cached) {
      return null;
    }
    
    // Check if cache is still valid
    if (Date.now() - cached.timestamp > ttl) {
      this.responseCache.delete(signature);
      this.removeCacheOrder(signature);
      return null;
    }
    
    return cached as CachedResponse<T>;
  }
  
  /**
   * Cache a response
   */
  private cacheResponse<T>(signature: string, response: CachedResponse<T>): void {
    // Enforce cache size limit
    if (this.cacheOrder.length >= this.defaultOptions.maxCacheSize) {
      const oldest = this.cacheOrder.shift();
      if (oldest) {
        this.responseCache.delete(oldest);
      }
    }
    
    this.responseCache.set(signature, response);
    this.cacheOrder.push(signature);
    
    logger.info('Response cached', {
      signature: signature.substring(0, 8),
      requestId: response.requestId,
      cacheSize: this.responseCache.size
    });
  }
  
  /**
   * Remove from cache order
   */
  private removeCacheOrder(signature: string): void {
    const index = this.cacheOrder.indexOf(signature);
    if (index > -1) {
      this.cacheOrder.splice(index, 1);
    }
  }
  
  /**
   * Clean up expired cache entries
   */
  private cleanupCache(): void {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [signature, cached] of this.responseCache.entries()) {
      if (now - cached.timestamp > this.defaultOptions.cacheTTL) {
        this.responseCache.delete(signature);
        this.removeCacheOrder(signature);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      logger.info('Cleaned expired cache entries', {
        cleaned,
        remaining: this.responseCache.size
      });
    }
  }
  
  /**
   * Clean up stuck in-flight requests
   */
  private cleanupInFlight(): void {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [signature, request] of this.inFlightRequests.entries()) {
      if (now - request.startTime > this.defaultOptions.requestTimeout) {
        this.inFlightRequests.delete(signature);
        cleaned++;
        
        logger.warn('Cleaned stuck in-flight request', {
          signature: signature.substring(0, 8),
          requestId: request.requestId,
          duration: now - request.startTime
        });
      }
    }
    
    if (cleaned > 0) {
      logger.info('Cleaned stuck in-flight requests', {
        cleaned,
        remaining: this.inFlightRequests.size
      });
    }
  }
  
  /**
   * Clear all caches
   */
  clearAll(): void {
    const cacheSize = this.responseCache.size;
    const inFlightSize = this.inFlightRequests.size;
    
    this.responseCache.clear();
    this.cacheOrder = [];
    this.inFlightRequests.clear();
    
    logger.info('Cleared all caches', {
      clearedCache: cacheSize,
      clearedInFlight: inFlightSize
    });
  }
  
  /**
   * Clear cache for specific signature
   */
  clearSignature(signature: string): boolean {
    const hadCache = this.responseCache.delete(signature);
    const hadInFlight = this.inFlightRequests.delete(signature);
    
    if (hadCache) {
      this.removeCacheOrder(signature);
    }
    
    if (hadCache || hadInFlight) {
      logger.info('Cleared signature', {
        signature: signature.substring(0, 8),
        hadCache,
        hadInFlight
      });
    }
    
    return hadCache || hadInFlight;
  }
  
  /**
   * Get deduplicator statistics
   */
  getStats(): {
    cacheSize: number;
    inFlightCount: number;
    cacheHitRate: number;
    oldestCache: number | null;
  } {
    let oldestCache: number | null = null;
    const now = Date.now();
    
    for (const cached of this.responseCache.values()) {
      const age = now - cached.timestamp;
      if (oldestCache === null || age > oldestCache) {
        oldestCache = age;
      }
    }
    
    return {
      cacheSize: this.responseCache.size,
      inFlightCount: this.inFlightRequests.size,
      cacheHitRate: 0, // Would need to track hits/misses for this
      oldestCache
    };
  }
}

/**
 * Express/Next.js middleware for request deduplication
 */
export function withDeduplication<T>(
  handler: (req: any) => Promise<T>,
  options: DeduplicationOptions = {}
): (req: any) => Promise<T> {
  const deduplicator = RequestDeduplicator.getInstance();
  
  return async (req: any): Promise<T> => {
    // Build request signature
    const signature: RequestSignature = {
      method: req.method || 'GET',
      path: req.url || req.path || '',
      body: req.body ? JSON.stringify(req.body) : undefined,
      userId: req.headers?.['x-user-id'] || req.userId
    };
    
    // Execute with deduplication
    return deduplicator.execute(
      signature,
      () => handler(req),
      options
    );
  };
}

/**
 * React hook helper for deduplicated fetching
 */
export async function fetchDeduplicated<T = any>(
  url: string,
  options: RequestInit & { deduplication?: DeduplicationOptions } = {}
): Promise<T> {
  const deduplicator = RequestDeduplicator.getInstance();
  
  const signature: RequestSignature = {
    method: options.method || 'GET',
    path: url,
    body: options.body as string
  };
  
  return deduplicator.execute(
    signature,
    async () => {
      const response = await fetch(url, options);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return response.json();
    },
    options.deduplication
  );
}

// Export singleton instance
export const requestDeduplicator = RequestDeduplicator.getInstance();