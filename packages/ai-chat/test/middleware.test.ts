import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { corsMiddleware, securityHeaders, handleOptions, withMiddleware } from '../src/server/middleware';

describe('corsMiddleware', () => {
  beforeEach(() => {
    delete process.env.CORS_ORIGINS;
  });

  it('should set CORS headers for allowed origin', () => {
    const req = new NextRequest('http://localhost:3000/api/test', {
      headers: { origin: 'http://localhost:3000' },
    });

    const headers = corsMiddleware(req);

    expect(headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3000');
    expect(headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, PATCH, DELETE, OPTIONS');
    expect(headers.get('Access-Control-Allow-Headers')).toBe('Content-Type, Authorization');
    expect(headers.get('Access-Control-Max-Age')).toBe('86400');
  });

  it('should not set CORS origin for disallowed origin', () => {
    const req = new NextRequest('http://localhost:3000/api/test', {
      headers: { origin: 'http://malicious-site.com' },
    });

    const headers = corsMiddleware(req);

    expect(headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, PATCH, DELETE, OPTIONS');
  });

  it('should use custom CORS origins from environment', () => {
    process.env.CORS_ORIGINS = 'https://myapp.com,https://staging.myapp.com';
    
    const req = new NextRequest('http://localhost:3000/api/test', {
      headers: { origin: 'https://myapp.com' },
    });

    const headers = corsMiddleware(req);

    expect(headers.get('Access-Control-Allow-Origin')).toBe('https://myapp.com');
  });

  it('should handle requests without origin header', () => {
    const req = new NextRequest('http://localhost:3000/api/test');

    const headers = corsMiddleware(req);

    expect(headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, PATCH, DELETE, OPTIONS');
  });

  it('should include localhost:3001 in default allowed origins', () => {
    const req = new NextRequest('http://localhost:3000/api/test', {
      headers: { origin: 'http://localhost:3001' },
    });

    const headers = corsMiddleware(req);

    expect(headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3001');
  });
});

describe('securityHeaders', () => {
  it('should set all required security headers', () => {
    const headers = securityHeaders();

    expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(headers.get('X-Frame-Options')).toBe('DENY');
    expect(headers.get('X-XSS-Protection')).toBe('1; mode=block');
    expect(headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(headers.get('Permissions-Policy')).toBe('camera=(), microphone=(), geolocation=()');
  });

  it('should set restrictive CSP for API routes', () => {
    const headers = securityHeaders();

    const csp = headers.get('Content-Security-Policy');
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("script-src 'none'");
    expect(csp).toContain("style-src 'none'");
    expect(csp).toContain("img-src 'none'");
    expect(csp).toContain("connect-src 'self'");
  });
});

describe('handleOptions', () => {
  it('should return 200 response with CORS headers for OPTIONS request', () => {
    const req = new NextRequest('http://localhost:3000/api/test', {
      method: 'OPTIONS',
      headers: { origin: 'http://localhost:3000' },
    });

    const response = handleOptions(req);

    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3000');
    expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, PATCH, DELETE, OPTIONS');
  });

  it('should handle OPTIONS request without origin', () => {
    const req = new NextRequest('http://localhost:3000/api/test', {
      method: 'OPTIONS',
    });

    const response = handleOptions(req);

    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, PATCH, DELETE, OPTIONS');
  });
});

describe('withMiddleware', () => {
  it('should handle OPTIONS requests with preflight response', async () => {
    const mockHandler = vi.fn();
    const wrappedHandler = withMiddleware(mockHandler);

    const req = new NextRequest('http://localhost:3000/api/test', {
      method: 'OPTIONS',
      headers: { origin: 'http://localhost:3000' },
    });

    const response = await wrappedHandler(req);

    expect(mockHandler).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3000');
  });

  it('should call handler for non-OPTIONS requests and add middleware headers', async () => {
    const mockResponse = new NextResponse('success');
    const mockHandler = vi.fn().mockResolvedValue(mockResponse);
    const wrappedHandler = withMiddleware(mockHandler);

    const req = new NextRequest('http://localhost:3000/api/test', {
      method: 'POST',
      headers: { origin: 'http://localhost:3000' },
    });

    const response = await wrappedHandler(req);

    expect(mockHandler).toHaveBeenCalledWith(req);
    expect(response).toBe(mockResponse);
    
    // Check CORS headers were added
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3000');
    expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, PATCH, DELETE, OPTIONS');
    
    // Check security headers were added
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
    expect(response.headers.get('X-XSS-Protection')).toBe('1; mode=block');
    expect(response.headers.get('Content-Security-Policy')).toContain("default-src 'none'");
  });

  it('should handle handler errors gracefully', async () => {
    const mockHandler = vi.fn().mockRejectedValue(new Error('Handler error'));
    const wrappedHandler = withMiddleware(mockHandler);

    const req = new NextRequest('http://localhost:3000/api/test', {
      method: 'GET',
    });

    await expect(wrappedHandler(req)).rejects.toThrow('Handler error');
    expect(mockHandler).toHaveBeenCalledWith(req);
  });

  it('should preserve existing response headers while adding middleware headers', async () => {
    const mockResponse = new NextResponse('success');
    mockResponse.headers.set('Custom-Header', 'custom-value');
    
    const mockHandler = vi.fn().mockResolvedValue(mockResponse);
    const wrappedHandler = withMiddleware(mockHandler);

    const req = new NextRequest('http://localhost:3000/api/test', {
      method: 'GET',
      headers: { origin: 'http://localhost:3000' },
    });

    const response = await wrappedHandler(req);

    // Original headers should be preserved
    expect(response.headers.get('Custom-Header')).toBe('custom-value');
    
    // Middleware headers should be added
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3000');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('should override existing middleware headers', async () => {
    const mockResponse = new NextResponse('success');
    mockResponse.headers.set('X-Frame-Options', 'SAMEORIGIN'); // Will be overridden
    
    const mockHandler = vi.fn().mockResolvedValue(mockResponse);
    const wrappedHandler = withMiddleware(mockHandler);

    const req = new NextRequest('http://localhost:3000/api/test', {
      method: 'GET',
    });

    const response = await wrappedHandler(req);

    // Middleware should override existing security headers
    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
  });
});