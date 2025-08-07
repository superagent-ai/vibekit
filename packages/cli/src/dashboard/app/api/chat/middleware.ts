import { NextRequest, NextResponse } from 'next/server';

export function corsMiddleware(req: NextRequest) {
  const origin = req.headers.get('origin');
  const allowedOrigins = process.env.CORS_ORIGINS?.split(',') || [
    'http://localhost:3000',
    'http://localhost:3001',
  ];
  
  const headers = new Headers();
  
  if (origin && allowedOrigins.includes(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
  }
  
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  headers.set('Access-Control-Max-Age', '86400');
  
  return headers;
}

export function securityHeaders() {
  const headers = new Headers();
  
  // Security headers
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('X-XSS-Protection', '1; mode=block');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  
  // CSP for API routes (restrictive)
  headers.set(
    'Content-Security-Policy',
    "default-src 'none'; script-src 'none'; style-src 'none'; img-src 'none'; connect-src 'self';"
  );
  
  return headers;
}

export function handleOptions(req: NextRequest): NextResponse {
  const corsHeaders = corsMiddleware(req);
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

export function withMiddleware(
  handler: (req: NextRequest) => Promise<NextResponse>
) {
  return async (req: NextRequest) => {
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      return handleOptions(req);
    }
    
    // Execute the handler
    const response = await handler(req);
    
    // Add CORS headers
    const corsHeaders = corsMiddleware(req);
    corsHeaders.forEach((value, key) => {
      response.headers.set(key, value);
    });
    
    // Add security headers
    const secHeaders = securityHeaders();
    secHeaders.forEach((value, key) => {
      response.headers.set(key, value);
    });
    
    return response;
  };
}