/**
 * Next.js Middleware for VibeKit Dashboard Security & Production Hardening
 * 
 * Provides:
 * - Localhost-only access enforcement
 * - Request size limiting
 * - Enhanced security headers
 * - Request validation
 * - Rate limiting
 * - Request ID tracking
 */

import { NextRequest, NextResponse } from 'next/server';

// Production configuration
const MAX_REQUEST_SIZE = 10 * 1024 * 1024; // 10MB max request size
const MAX_URL_LENGTH = 2048; // Maximum URL length
const MAX_HEADER_SIZE = 16384; // Maximum total header size (16KB)

// Simple in-memory rate limiting (for localhost usage)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 100; // 100 requests per minute per client

/**
 * Clean up expired rate limit entries
 */
function cleanupRateLimits(): void {
  const now = Date.now();
  for (const [key, data] of rateLimitStore.entries()) {
    if (now > data.resetTime + RATE_LIMIT_WINDOW) {
      rateLimitStore.delete(key);
    }
  }
}

// Cleanup every minute
declare global {
  var rateLimitCleanupInterval: NodeJS.Timeout | undefined;
}

if (typeof globalThis !== 'undefined' && !globalThis.rateLimitCleanupInterval) {
  globalThis.rateLimitCleanupInterval = setInterval(cleanupRateLimits, RATE_LIMIT_WINDOW);
}

export function middleware(request: NextRequest) {
  // Only apply middleware to API routes and pages (not static assets)
  const { pathname } = request.nextUrl;
  
  // Skip middleware for static assets
  if (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Get the host from headers
  const host = request.headers.get('host');
  const forwardedFor = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  
  // Enforce localhost-only access
  const isLocalhost = host?.includes('localhost') || 
                     host?.includes('127.0.0.1') || 
                     host?.includes('::1');
  
  // Check if request comes from non-local IP
  const hasExternalForwarding = forwardedFor && 
    !forwardedFor.includes('127.0.0.1') && 
    !forwardedFor.includes('::1') &&
    !forwardedFor.includes('localhost');
    
  const hasExternalRealIp = realIp && 
    realIp !== '127.0.0.1' && 
    realIp !== '::1' &&
    realIp !== 'localhost';

  // Block non-localhost access
  if (!isLocalhost || hasExternalForwarding || hasExternalRealIp) {
    console.warn('[Security] Blocked non-localhost access:', {
      host,
      forwardedFor,
      realIp,
      userAgent: request.headers.get('user-agent'),
      url: request.url
    });
    
    return new NextResponse('Access denied: Dashboard only available on localhost', {
      status: 403,
      headers: {
        'Content-Type': 'text/plain',
      },
    });
  }
  
  // Generate request ID for tracking
  const requestId = crypto.randomUUID();
  
  // 1. Check URL length
  const fullUrl = pathname + request.nextUrl.search;
  if (fullUrl.length > MAX_URL_LENGTH) {
    console.warn(`[Security] URL too long: ${fullUrl.length} bytes`, { requestId });
    return new NextResponse('URL too long', { 
      status: 414,
      headers: {
        'X-Request-Id': requestId
      }
    });
  }
  
  // 2. Check total headers size
  let totalHeaderSize = 0;
  request.headers.forEach((value, key) => {
    totalHeaderSize += key.length + value.length + 4; // ": " and "\r\n"
  });
  
  if (totalHeaderSize > MAX_HEADER_SIZE) {
    console.warn(`[Security] Headers too large: ${totalHeaderSize} bytes`, { requestId });
    return new NextResponse('Request headers too large', { 
      status: 431,
      headers: {
        'X-Request-Id': requestId
      }
    });
  }
  
  // 3. Check Content-Length for POST/PUT/PATCH requests
  if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
    const contentLength = request.headers.get('content-length');
    if (contentLength) {
      const size = parseInt(contentLength, 10);
      if (isNaN(size)) {
        return new NextResponse('Invalid Content-Length', { 
          status: 400,
          headers: {
            'X-Request-Id': requestId
          }
        });
      }
      if (size > MAX_REQUEST_SIZE) {
        console.warn(`[Security] Request too large: ${size} bytes`, { requestId });
        return new NextResponse('Request entity too large', { 
          status: 413,
          headers: {
            'X-Request-Id': requestId,
            'Retry-After': '60'
          }
        });
      }
    }
  }
  
  // 4. Rate limiting (skip for health endpoints)
  if (!pathname.startsWith('/api/health')) {
    // Use a combination of IP and user agent for client identification
    const clientIp = forwardedFor?.split(',')[0] || realIp || '127.0.0.1';
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const clientKey = `${clientIp}:${userAgent.substring(0, 50)}`;
    
    const now = Date.now();
    const clientData = rateLimitStore.get(clientKey);
    
    if (!clientData || now > clientData.resetTime) {
      // New window or expired window
      rateLimitStore.set(clientKey, {
        count: 1,
        resetTime: now + RATE_LIMIT_WINDOW
      });
    } else if (clientData.count >= RATE_LIMIT_MAX_REQUESTS) {
      console.warn(`[Security] Rate limit exceeded for ${clientKey}`, { requestId });
      return new NextResponse('Too many requests', { 
        status: 429,
        headers: {
          'X-Request-Id': requestId,
          'Retry-After': String(Math.ceil((clientData.resetTime - now) / 1000)),
          'X-RateLimit-Limit': String(RATE_LIMIT_MAX_REQUESTS),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(clientData.resetTime)
        }
      });
    } else {
      clientData.count++;
    }
  }

  // Create response with security headers
  const response = NextResponse.next();
  
  // Add request ID to response
  response.headers.set('X-Request-Id', requestId);
  
  // Add enhanced security headers
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('X-DNS-Prefetch-Control', 'off');
  response.headers.set('X-Download-Options', 'noopen');
  response.headers.set('X-Permitted-Cross-Domain-Policies', 'none');
  
  // Content Security Policy
  // Note: Next.js middleware CSP is supplementary to server.js CSP
  // We use a slightly more permissive policy here to ensure compatibility
  const cspDirectives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval' 'unsafe-inline'", // Required for Next.js
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' ws://127.0.0.1:* http://127.0.0.1:* wss://127.0.0.1:*",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ];
  
  response.headers.set('Content-Security-Policy', cspDirectives.join('; '));
  
  // Prevent caching of sensitive pages
  if (pathname.startsWith('/api/')) {
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    response.headers.set('Pragma', 'no-cache');
  }
  
  // Add CORS headers for localhost only
  response.headers.set('Access-Control-Allow-Origin', `http://localhost:*`);
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  
  return response;
}

export const config = {
  // Apply middleware to all routes except static files
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};