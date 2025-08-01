import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

export interface AuthConfig {
  enabled: boolean;
  apiKeys?: string[];
  bearerTokens?: string[];
}

/**
 * Simple API key authentication middleware
 */
export function createAuthMiddleware(config: AuthConfig) {
  // If auth is disabled, allow all requests
  if (!config.enabled) {
    return (req: Request, res: Response, next: NextFunction) => next();
  }

  const validApiKeys = new Set(config.apiKeys || []);
  const validTokens = new Set(config.bearerTokens || []);

  return (req: Request, res: Response, next: NextFunction) => {
    // Check for API key in header
    const apiKey = req.headers['x-api-key'] as string;
    if (apiKey && validApiKeys.has(apiKey)) {
      return next();
    }

    // Check for Bearer token
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      if (validTokens.has(token)) {
        return next();
      }
    }

    // No valid authentication found
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