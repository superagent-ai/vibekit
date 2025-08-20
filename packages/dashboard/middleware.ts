/**
 * Next.js Middleware for VibeKit Dashboard Security
 * 
 * Provides:
 * - Localhost-only access enforcement
 * - Basic security headers
 * - Request validation
 */

import { NextRequest, NextResponse } from 'next/server';

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

  // Create response with security headers
  const response = NextResponse.next();
  
  // Add security headers
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  
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