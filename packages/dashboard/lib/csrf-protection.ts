/**
 * CSRF Protection for Dashboard Mutations
 * 
 * Implements double-submit cookie pattern for CSRF protection
 * since we're localhost-only and don't need complex token management.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from './structured-logger';

const logger = createLogger('CSRFProtection');

// Configuration
const CSRF_COOKIE_NAME = 'vibekit-csrf-token';
const CSRF_HEADER_NAME = 'x-csrf-token';
const TOKEN_LENGTH = 32;
const COOKIE_MAX_AGE = 24 * 60 * 60; // 24 hours
const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

/**
 * CSRF token validation result
 */
export interface CSRFValidationResult {
  valid: boolean;
  reason?: string;
  token?: string;
}

/**
 * Generate a new CSRF token using Web Crypto API (Edge Runtime compatible)
 */
export function generateCSRFToken(): string {
  // Use Web Crypto API for Edge Runtime compatibility
  const array = new Uint8Array(TOKEN_LENGTH);
  
  // Check if we're in Node.js or browser/Edge Runtime
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
    // Browser/Edge Runtime
    globalThis.crypto.getRandomValues(array);
  } else if (typeof require !== 'undefined') {
    // Node.js fallback
    const crypto = require('crypto');
    return crypto.randomBytes(TOKEN_LENGTH).toString('hex');
  } else {
    // Fallback to Math.random (not cryptographically secure, but better than failing)
    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
  }
  
  // Convert array to hex string
  return Array.from(array)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Get CSRF token from request
 */
export function getCSRFToken(request: NextRequest): string | null {
  // Check cookie first
  const cookieToken = request.cookies.get(CSRF_COOKIE_NAME)?.value;
  return cookieToken || null;
}

/**
 * Validate CSRF token for mutations
 */
export function validateCSRFToken(request: NextRequest): CSRFValidationResult {
  // Skip validation for safe methods
  if (SAFE_METHODS.includes(request.method)) {
    return { valid: true };
  }
  
  // Skip validation for localhost WebSocket upgrades
  const upgrade = request.headers.get('upgrade');
  if (upgrade === 'websocket') {
    return { valid: true };
  }
  
  // Get token from cookie
  const cookieToken = request.cookies.get(CSRF_COOKIE_NAME)?.value;
  
  if (!cookieToken) {
    logger.warn('CSRF validation failed: No token in cookie', {
      method: request.method,
      url: request.url
    });
    return {
      valid: false,
      reason: 'No CSRF token found in cookie'
    };
  }
  
  // For mutations, check header or body
  const headerToken = request.headers.get(CSRF_HEADER_NAME);
  
  // If no header token, check request body for form submissions
  let bodyToken: string | null = null;
  
  if (!headerToken && request.headers.get('content-type')?.includes('application/json')) {
    // For JSON requests, we expect the token in header
    // Body parsing would require await and break middleware flow
    logger.warn('CSRF validation failed: No token in header for JSON request', {
      method: request.method,
      url: request.url
    });
    return {
      valid: false,
      reason: 'CSRF token must be provided in header for JSON requests'
    };
  }
  
  const providedToken = headerToken || bodyToken;
  
  if (!providedToken) {
    logger.warn('CSRF validation failed: No token provided', {
      method: request.method,
      url: request.url
    });
    return {
      valid: false,
      reason: 'No CSRF token provided in request'
    };
  }
  
  // Validate tokens match (constant-time comparison)
  const valid = timingSafeEqual(cookieToken, providedToken);
  
  if (!valid) {
    logger.warn('CSRF validation failed: Token mismatch', {
      method: request.method,
      url: request.url
    });
    return {
      valid: false,
      reason: 'CSRF token mismatch'
    };
  }
  
  return {
    valid: true,
    token: cookieToken
  };
}

/**
 * Add CSRF token to response
 */
export function addCSRFToken(response: NextResponse, token?: string): NextResponse {
  const csrfToken = token || generateCSRFToken();
  
  // Set cookie with security flags
  response.cookies.set(CSRF_COOKIE_NAME, csrfToken, {
    httpOnly: false, // Must be readable by JavaScript
    secure: false,   // We're on localhost
    sameSite: 'strict',
    maxAge: COOKIE_MAX_AGE,
    path: '/'
  });
  
  // Also add token to response header for client to read
  response.headers.set('X-CSRF-Token', csrfToken);
  
  return response;
}

/**
 * Create CSRF-protected response
 */
export function createCSRFResponse(
  request: NextRequest,
  response: NextResponse
): NextResponse {
  // Check if we need to set a new token
  const existingToken = getCSRFToken(request);
  
  if (!existingToken) {
    // Generate and set new token
    return addCSRFToken(response);
  }
  
  // Refresh existing token in response
  return addCSRFToken(response, existingToken);
}

/**
 * CSRF middleware for API routes
 */
export async function csrfMiddleware(
  request: NextRequest,
  handler: (request: NextRequest) => Promise<NextResponse>
): Promise<NextResponse> {
  // Validate CSRF token
  const validation = validateCSRFToken(request);
  
  if (!validation.valid) {
    logger.error('CSRF validation failed', {
      reason: validation.reason,
      method: request.method,
      path: new URL(request.url).pathname
    });
    
    return NextResponse.json(
      {
        error: 'CSRF validation failed',
        message: validation.reason
      },
      { status: 403 }
    );
  }
  
  // Process request
  const response = await handler(request);
  
  // Add CSRF token to response
  return createCSRFResponse(request, response);
}

/**
 * Timing-safe string comparison (Edge Runtime compatible)
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  
  // Edge Runtime compatible timing-safe comparison
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  
  return result === 0;
}

/**
 * React hook helper for CSRF token
 * This would be used in the client-side code
 */
export function getCSRFTokenFromDOM(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  
  // Try to get from cookie
  const cookies = document.cookie.split(';');
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    if (name === CSRF_COOKIE_NAME) {
      return value;
    }
  }
  
  // Try to get from meta tag (if we set it)
  const metaTag = document.querySelector('meta[name="csrf-token"]');
  if (metaTag) {
    return metaTag.getAttribute('content');
  }
  
  return null;
}

/**
 * Fetch wrapper with automatic CSRF token inclusion
 */
export async function fetchWithCSRF(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = getCSRFTokenFromDOM();
  
  if (token) {
    // Add CSRF token to headers
    const headers = new Headers(options.headers);
    headers.set(CSRF_HEADER_NAME, token);
    
    options.headers = headers;
  }
  
  return fetch(url, options);
}

/**
 * Express/Next.js API route wrapper with CSRF protection
 */
export function withCSRFProtection<T extends NextRequest>(
  handler: (request: T) => Promise<NextResponse>
) {
  return async (request: T): Promise<NextResponse> => {
    // Validate CSRF for mutations
    if (!SAFE_METHODS.includes(request.method)) {
      const validation = validateCSRFToken(request);
      
      if (!validation.valid) {
        return NextResponse.json(
          {
            error: 'CSRF validation failed',
            message: validation.reason
          },
          { status: 403 }
        );
      }
    }
    
    // Execute handler
    const response = await handler(request);
    
    // Ensure CSRF token is set
    return createCSRFResponse(request, response);
  };
}

/**
 * CSRF token manager for SSR
 */
export class CSRFTokenManager {
  private static instance: CSRFTokenManager;
  private tokens = new Map<string, { token: string; expires: number }>();
  private readonly TOKEN_TTL = 24 * 60 * 60 * 1000; // 24 hours
  
  private constructor() {
    // Cleanup expired tokens every hour
    setInterval(() => this.cleanup(), 60 * 60 * 1000);
  }
  
  static getInstance(): CSRFTokenManager {
    if (!CSRFTokenManager.instance) {
      CSRFTokenManager.instance = new CSRFTokenManager();
    }
    return CSRFTokenManager.instance;
  }
  
  /**
   * Get or create token for session
   */
  getToken(sessionId: string): string {
    const existing = this.tokens.get(sessionId);
    
    if (existing && existing.expires > Date.now()) {
      return existing.token;
    }
    
    // Generate new token
    const token = generateCSRFToken();
    this.tokens.set(sessionId, {
      token,
      expires: Date.now() + this.TOKEN_TTL
    });
    
    return token;
  }
  
  /**
   * Validate token for session
   */
  validateToken(sessionId: string, token: string): boolean {
    const stored = this.tokens.get(sessionId);
    
    if (!stored || stored.expires < Date.now()) {
      return false;
    }
    
    return timingSafeEqual(stored.token, token);
  }
  
  /**
   * Clean up expired tokens
   */
  private cleanup(): void {
    const now = Date.now();
    
    for (const [sessionId, data] of this.tokens.entries()) {
      if (data.expires < now) {
        this.tokens.delete(sessionId);
      }
    }
  }
}

// Export singleton instance
export const csrfTokenManager = CSRFTokenManager.getInstance();