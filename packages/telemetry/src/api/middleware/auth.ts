import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { createLogger } from '../../utils/logger.js';

export interface AuthConfig {
  enabled: boolean;
  apiKeys?: string[];
  bearerTokens?: string[];
}

/**
 * Simple API key authentication middleware
 */
export function createAuthMiddleware(config: AuthConfig) {
  const logger = createLogger('AuthMiddleware');
  
  // If auth is disabled, allow all requests
  if (!config.enabled) {
    return (req: Request, res: Response, next: NextFunction) => next();
  }

  const validApiKeys = config.apiKeys || [];
  const validTokens = config.bearerTokens || [];

  // Constant-time string comparison to prevent timing attacks
  const constantTimeCompare = (a: string, b: string): boolean => {
    // Early return for different lengths (this is OK since length is not secret)
    if (a.length !== b.length) {
      return false;
    }
    
    // Use crypto.timingSafeEqual for constant-time comparison
    const aBuffer = Buffer.from(a);
    const bBuffer = Buffer.from(b);
    
    try {
      return crypto.timingSafeEqual(aBuffer, bBuffer);
    } catch {
      // If buffers are different lengths (should not happen due to check above)
      return false;
    }
  };

  // Check if the provided key matches any valid key using constant-time comparison
  const isValidApiKey = (key: string): boolean => {
    if (!key) return false;
    
    // Always compare against all keys to maintain constant time
    let found = false;
    for (const validKey of validApiKeys) {
      const matches = constantTimeCompare(key, validKey);
      found = found || matches;
    }
    return found;
  };

  // Check if the provided token matches any valid token using constant-time comparison
  const isValidToken = (token: string): boolean => {
    if (!token) return false;
    
    // Always compare against all tokens to maintain constant time
    let found = false;
    for (const validToken of validTokens) {
      const matches = constantTimeCompare(token, validToken);
      found = found || matches;
    }
    return found;
  };

  return (req: Request, res: Response, next: NextFunction) => {
    // Allow health check endpoint without auth
    if (req.path === '/api/health' || req.path === '/health') {
      return next();
    }

    // Check for API key in header (case-insensitive)
    const apiKeyHeader = req.headers['x-api-key'] || req.headers['X-API-KEY'];
    const apiKey = Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : apiKeyHeader;
    if (apiKey && isValidApiKey(apiKey)) {
      return next();
    }

    // Check for Bearer token
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      if (isValidToken(token)) {
        return next();
      }
    }

    // No valid authentication found
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    logger.warn(`Authentication failed from IP: ${ip}`);
    
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Valid API key or Bearer token required',
    });
  };
}

/**
 * Generate a secure API key
 */
export function generateApiKey(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Hash an API key for secure storage
 */
export function hashApiKey(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}