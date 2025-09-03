/**
 * Cache Headers Optimization
 * 
 * Provides optimal cache headers for different types of responses
 * to improve performance and reduce unnecessary requests.
 */

import { NextResponse } from 'next/server';

/**
 * Cache control presets
 */
export const CachePresets = {
  // No caching - for sensitive or real-time data
  NO_CACHE: 'no-cache, no-store, must-revalidate',
  
  // Private cache only - for user-specific data
  PRIVATE: 'private, max-age=0, must-revalidate',
  
  // Short cache - for frequently changing data (5 minutes)
  SHORT: 'public, max-age=300, s-maxage=300, stale-while-revalidate=60',
  
  // Medium cache - for moderately stable data (1 hour)
  MEDIUM: 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=300',
  
  // Long cache - for stable data (24 hours)
  LONG: 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=3600',
  
  // Immutable - for versioned assets
  IMMUTABLE: 'public, max-age=31536000, immutable',
  
  // Real-time - for SSE/WebSocket endpoints
  REALTIME: 'no-cache, no-transform',
  
  // API default - short cache with revalidation
  API_DEFAULT: 'private, max-age=0, must-revalidate',
  
  // Static assets
  STATIC: 'public, max-age=31536000, immutable'
} as const;

/**
 * Content types that should be compressed
 */
const COMPRESSIBLE_TYPES = [
  'text/html',
  'text/css',
  'text/javascript',
  'application/javascript',
  'application/json',
  'application/xml',
  'text/xml',
  'text/plain',
  'image/svg+xml'
];

/**
 * Cache configuration for different route patterns
 */
export interface CacheConfig {
  pattern: RegExp;
  cacheControl: string;
  vary?: string[];
  etag?: boolean;
  compress?: boolean;
}

/**
 * Default cache configurations by route pattern
 */
export const DEFAULT_CACHE_CONFIGS: CacheConfig[] = [
  // API routes - no cache by default
  {
    pattern: /^\/api\//,
    cacheControl: CachePresets.NO_CACHE,
    vary: ['Accept', 'Accept-Encoding'],
    etag: true,
    compress: true
  },
  
  // Health check endpoints - no cache
  {
    pattern: /^\/api\/health/,
    cacheControl: CachePresets.NO_CACHE,
    etag: false,
    compress: false
  },
  
  // Session data - no cache
  {
    pattern: /^\/api\/sessions/,
    cacheControl: CachePresets.NO_CACHE,
    vary: ['Accept'],
    etag: false,
    compress: true
  },
  
  // Analytics data - short cache
  {
    pattern: /^\/api\/analytics/,
    cacheControl: CachePresets.SHORT,
    vary: ['Accept'],
    etag: true,
    compress: true
  },
  
  // Static configuration - medium cache
  {
    pattern: /^\/api\/config/,
    cacheControl: CachePresets.MEDIUM,
    vary: ['Accept'],
    etag: true,
    compress: true
  },
  
  // Static assets - long cache
  {
    pattern: /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/,
    cacheControl: CachePresets.STATIC,
    vary: ['Accept-Encoding'],
    etag: true,
    compress: true
  },
  
  // HTML pages - private cache
  {
    pattern: /\.html?$|^\/[^.]*$/,
    cacheControl: CachePresets.PRIVATE,
    vary: ['Accept', 'Accept-Encoding'],
    etag: true,
    compress: true
  }
];

/**
 * Apply cache headers to response
 */
export function applyCacheHeaders(
  response: NextResponse,
  path: string,
  config?: Partial<CacheConfig>
): NextResponse {
  // Find matching configuration
  const defaultConfig = DEFAULT_CACHE_CONFIGS.find(c => c.pattern.test(path));
  const finalConfig = { ...defaultConfig, ...config };
  
  // Apply Cache-Control
  if (finalConfig.cacheControl) {
    response.headers.set('Cache-Control', finalConfig.cacheControl);
  }
  
  // Apply Vary header for proper caching with different representations
  if (finalConfig.vary && finalConfig.vary.length > 0) {
    response.headers.set('Vary', finalConfig.vary.join(', '));
  }
  
  // Add ETag support for conditional requests
  if (finalConfig.etag !== false) {
    // ETag would be generated based on content hash
    // This is a simplified example
    const etag = generateETag(response);
    if (etag) {
      response.headers.set('ETag', etag);
    }
  }
  
  // Add Last-Modified header
  response.headers.set('Last-Modified', new Date().toUTCString());
  
  // Add compression hint
  if (finalConfig.compress && shouldCompress(response)) {
    response.headers.set('Content-Encoding', 'gzip');
  }
  
  return response;
}

/**
 * Generate ETag for response
 */
function generateETag(response: NextResponse): string | null {
  // In production, this would hash the actual content
  // For now, we'll use a timestamp-based approach
  const timestamp = Date.now();
  const weak = true; // Use weak ETags for dynamic content
  
  return weak ? `W/"${timestamp}"` : `"${timestamp}"`;
}

/**
 * Check if response should be compressed
 */
function shouldCompress(response: NextResponse): boolean {
  const contentType = response.headers.get('Content-Type');
  
  if (!contentType) {
    return false;
  }
  
  // Check if content type is compressible
  return COMPRESSIBLE_TYPES.some(type => contentType.includes(type));
}

/**
 * Handle conditional requests (If-None-Match, If-Modified-Since)
 */
export function handleConditionalRequest(
  request: Request,
  response: NextResponse
): NextResponse | null {
  const ifNoneMatch = request.headers.get('If-None-Match');
  const ifModifiedSince = request.headers.get('If-Modified-Since');
  const etag = response.headers.get('ETag');
  const lastModified = response.headers.get('Last-Modified');
  
  // Check ETag match
  if (ifNoneMatch && etag) {
    if (ifNoneMatch === etag || ifNoneMatch === '*') {
      // Return 304 Not Modified
      return new NextResponse(null, {
        status: 304,
        headers: {
          'Cache-Control': response.headers.get('Cache-Control') || '',
          'ETag': etag
        }
      });
    }
  }
  
  // Check Last-Modified
  if (ifModifiedSince && lastModified) {
    const ifModifiedSinceDate = new Date(ifModifiedSince);
    const lastModifiedDate = new Date(lastModified);
    
    if (lastModifiedDate <= ifModifiedSinceDate) {
      // Return 304 Not Modified
      return new NextResponse(null, {
        status: 304,
        headers: {
          'Cache-Control': response.headers.get('Cache-Control') || '',
          'Last-Modified': lastModified
        }
      });
    }
  }
  
  return null;
}

/**
 * Middleware helper for cache optimization
 */
export function withCacheHeaders(
  handler: (request: Request) => Promise<NextResponse>,
  config?: Partial<CacheConfig>
) {
  return async (request: Request): Promise<NextResponse> => {
    // Execute handler
    const response = await handler(request);
    
    // Check for conditional request
    const conditionalResponse = handleConditionalRequest(request, response);
    if (conditionalResponse) {
      return conditionalResponse;
    }
    
    // Apply cache headers
    const url = new URL(request.url);
    return applyCacheHeaders(response, url.pathname, config);
  };
}

/**
 * Get optimal cache control for content type
 */
export function getCacheControlForContentType(contentType: string): string {
  // Images
  if (contentType.startsWith('image/')) {
    return CachePresets.LONG;
  }
  
  // Fonts
  if (contentType.includes('font') || contentType.includes('woff')) {
    return CachePresets.IMMUTABLE;
  }
  
  // JavaScript/CSS
  if (contentType.includes('javascript') || contentType.includes('css')) {
    return CachePresets.LONG;
  }
  
  // JSON API responses
  if (contentType.includes('json')) {
    return CachePresets.API_DEFAULT;
  }
  
  // HTML
  if (contentType.includes('html')) {
    return CachePresets.PRIVATE;
  }
  
  // Default
  return CachePresets.NO_CACHE;
}

/**
 * Create cache key for request deduplication
 */
export function createCacheKey(request: Request): string {
  const url = new URL(request.url);
  const method = request.method;
  const pathname = url.pathname;
  const search = url.search;
  
  // Include important headers in cache key
  const accept = request.headers.get('Accept') || '';
  const contentType = request.headers.get('Content-Type') || '';
  
  return `${method}:${pathname}${search}:${accept}:${contentType}`;
}

/**
 * Parse Cache-Control header
 */
export function parseCacheControl(header: string): Record<string, string | boolean> {
  const directives: Record<string, string | boolean> = {};
  
  header.split(',').forEach(directive => {
    const [key, value] = directive.trim().split('=');
    directives[key] = value || true;
  });
  
  return directives;
}

/**
 * Check if response is cacheable
 */
export function isCacheable(response: NextResponse): boolean {
  // Check status code
  const status = response.status;
  if (![200, 203, 206, 300, 301, 304, 404, 410].includes(status)) {
    return false;
  }
  
  // Check Cache-Control
  const cacheControl = response.headers.get('Cache-Control');
  if (!cacheControl) {
    return false;
  }
  
  const directives = parseCacheControl(cacheControl);
  
  // Not cacheable if no-store is present
  if (directives['no-store']) {
    return false;
  }
  
  // Cacheable if max-age or s-maxage is present
  if (directives['max-age'] || directives['s-maxage']) {
    return true;
  }
  
  // Check for Expires header
  const expires = response.headers.get('Expires');
  if (expires) {
    const expiresDate = new Date(expires);
    return expiresDate > new Date();
  }
  
  return false;
}