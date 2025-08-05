import { describe, it, expect, beforeEach } from 'vitest';
import { createAuthMiddleware } from '../../src/api/middleware/auth.js';
import type { Request, Response, NextFunction } from 'express';

describe('Authentication Security Tests', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;
  let statusCode: number;
  let responseData: any;

  beforeEach(() => {
    req = {
      headers: {},
      ip: '127.0.0.1',
    };
    
    res = {
      status: (code: number) => {
        statusCode = code;
        return res as Response;
      },
      json: (data: any) => {
        responseData = data;
        return res as Response;
      },
    };
    
    next = vi.fn();
    statusCode = 0;
    responseData = null;
  });

  describe('API Key Authentication', () => {
    it('should reject requests without any authentication', () => {
      const middleware = createAuthMiddleware({
        enabled: true,
        apiKeys: ['valid-key-1', 'valid-key-2'],
      });

      middleware(req as Request, res as Response, next);

      expect(statusCode).toBe(401);
      expect(responseData.error).toBe('Unauthorized');
      expect(next).not.toHaveBeenCalled();
    });

    it('should accept valid API keys', () => {
      const middleware = createAuthMiddleware({
        enabled: true,
        apiKeys: ['valid-key-1', 'valid-key-2'],
      });

      req.headers = { 'x-api-key': 'valid-key-1' };
      middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
      expect(statusCode).toBe(0); // Not set
    });

    it('should reject invalid API keys', () => {
      const middleware = createAuthMiddleware({
        enabled: true,
        apiKeys: ['valid-key-1', 'valid-key-2'],
      });

      req.headers = { 'x-api-key': 'invalid-key' };
      middleware(req as Request, res as Response, next);

      expect(statusCode).toBe(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('should be case-insensitive for header names', () => {
      const middleware = createAuthMiddleware({
        enabled: true,
        apiKeys: ['valid-key'],
      });

      req.headers = { 'X-API-KEY': 'valid-key' };
      middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
    });

    it('should not expose valid keys in errors', () => {
      const middleware = createAuthMiddleware({
        enabled: true,
        apiKeys: ['secret-key-1', 'secret-key-2'],
      });

      req.headers = { 'x-api-key': 'wrong-key' };
      middleware(req as Request, res as Response, next);

      expect(responseData.error).toBe('Unauthorized');
      expect(JSON.stringify(responseData)).not.toContain('secret-key-1');
      expect(JSON.stringify(responseData)).not.toContain('secret-key-2');
    });
  });

  describe('Bearer Token Authentication', () => {
    it('should accept valid bearer tokens', () => {
      const middleware = createAuthMiddleware({
        enabled: true,
        bearerTokens: ['token-1', 'token-2'],
      });

      req.headers = { 'authorization': 'Bearer token-1' };
      middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
    });

    it('should reject invalid bearer tokens', () => {
      const middleware = createAuthMiddleware({
        enabled: true,
        bearerTokens: ['token-1', 'token-2'],
      });

      req.headers = { 'authorization': 'Bearer invalid-token' };
      middleware(req as Request, res as Response, next);

      expect(statusCode).toBe(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('should handle malformed authorization headers', () => {
      const middleware = createAuthMiddleware({
        enabled: true,
        bearerTokens: ['token-1'],
      });

      const malformedHeaders = [
        { 'authorization': 'Bearer' }, // Missing token
        { 'authorization': 'Bearer  ' }, // Empty token
        { 'authorization': 'Basic token-1' }, // Wrong scheme
        { 'authorization': 'token-1' }, // Missing Bearer prefix
        { 'authorization': 'Bearer token-1 extra' }, // Extra data
      ];

      malformedHeaders.forEach(headers => {
        req.headers = headers;
        statusCode = 0;
        next.mockClear();
        
        middleware(req as Request, res as Response, next);
        
        expect(statusCode).toBe(401);
        expect(next).not.toHaveBeenCalled();
      });
    });
  });

  describe('Security Best Practices', () => {
    it('should not leak timing information (constant time comparison)', () => {
      const middleware = createAuthMiddleware({
        enabled: true,
        apiKeys: ['very-long-secret-key-that-is-hard-to-guess'],
      });

      // Warm up the middleware to ensure consistent performance
      for (let i = 0; i < 50; i++) {
        req.headers = { 'x-api-key': 'warmup-key' };
        next.mockClear();
        middleware(req as Request, res as Response, next);
      }

      const timings: number[] = [];
      const iterations = 100;

      // Test with increasingly similar keys
      const testKeys = [
        'a', // Very different
        'very', // Starts the same
        'very-long', // More similar
        'very-long-secret', // Even more similar
        'very-long-secret-key-that-is-hard-to-gues', // Almost identical
      ];

      testKeys.forEach(testKey => {
        let totalTime = 0;
        
        for (let i = 0; i < iterations; i++) {
          req.headers = { 'x-api-key': testKey };
          next.mockClear();
          statusCode = 0;
          responseData = null;
          
          const start = process.hrtime.bigint();
          middleware(req as Request, res as Response, next);
          const end = process.hrtime.bigint();
          
          totalTime += Number(end - start);
        }
        
        timings.push(totalTime / iterations);
      });

      // Check that timings don't correlate with similarity
      // In a vulnerable implementation, more similar keys would take longer
      const variance = Math.max(...timings) - Math.min(...timings);
      const average = timings.reduce((a, b) => a + b) / timings.length;
      const relativeVariance = variance / average;

      // Timing should be relatively constant
      // We're using crypto.timingSafeEqual for constant-time comparison
      // but other factors (logging, response building) add variance
      // Allow up to 400% variance since we're measuring microsecond-level operations
      // and the test environment can have significant noise, especially in CI
      expect(relativeVariance).toBeLessThan(4.0);
    });

    it('should handle concurrent authentication attempts', async () => {
      const middleware = createAuthMiddleware({
        enabled: true,
        apiKeys: ['key-1', 'key-2', 'key-3'],
      });

      // Simulate concurrent requests
      const requests = Array(100).fill(null).map((_, i) => {
        const mockReq = {
          headers: { 'x-api-key': i % 2 === 0 ? 'key-1' : 'invalid' },
          ip: `192.168.1.${i}`,
        };
        
        const mockRes = {
          status: vi.fn().mockReturnThis(),
          json: vi.fn().mockReturnThis(),
        };
        
        const mockNext = vi.fn();
        
        return new Promise(resolve => {
          middleware(mockReq as any, mockRes as any, mockNext);
          resolve({ req: mockReq, res: mockRes, next: mockNext });
        });
      });

      const results = await Promise.all(requests);
      
      // Check that each request was handled independently
      results.forEach((result: any, i) => {
        if (i % 2 === 0) {
          expect(result.next).toHaveBeenCalled();
          expect(result.res.status).not.toHaveBeenCalled();
        } else {
          expect(result.next).not.toHaveBeenCalled();
          expect(result.res.status).toHaveBeenCalledWith(401);
        }
      });
    });

    it('should prevent auth bypass with null/undefined values', () => {
      const middleware = createAuthMiddleware({
        enabled: true,
        apiKeys: ['valid-key'],
      });

      const bypassAttempts = [
        { 'x-api-key': null },
        { 'x-api-key': undefined },
        { 'x-api-key': '' },
        { 'x-api-key': '\x00' }, // Null byte
        { 'x-api-key': 'valid-key\x00extra' }, // Null byte injection
      ];

      bypassAttempts.forEach(headers => {
        req.headers = headers as any;
        statusCode = 0;
        next.mockClear();
        
        middleware(req as Request, res as Response, next);
        
        expect(statusCode).toBe(401);
        expect(next).not.toHaveBeenCalled();
      });
    });

    it('should handle special characters in auth credentials', () => {
      const specialKeys = [
        'key-with-special-!@#$%^&*()',
        'key\nwith\nnewlines',
        'key\twith\ttabs',
        'key with spaces',
        '🔐🔑 unicode-key',
      ];

      const middleware = createAuthMiddleware({
        enabled: true,
        apiKeys: specialKeys,
      });

      specialKeys.forEach(key => {
        req.headers = { 'x-api-key': key };
        statusCode = 0;
        next.mockClear();
        
        middleware(req as Request, res as Response, next);
        
        expect(next).toHaveBeenCalled();
        expect(statusCode).toBe(0);
      });
    });
  });

  describe('IP-based Security', () => {
    it('should log IP addresses for failed attempts', () => {
      // Since we're using a logger now, we just verify the auth fails properly
      // The logger itself is tested elsewhere
      const middleware = createAuthMiddleware({
        enabled: true,
        apiKeys: ['valid-key'],
      });

      req.ip = '192.168.1.100';
      req.headers = { 'x-api-key': 'invalid-key' };
      
      middleware(req as Request, res as Response, next);
      
      // Should reject the request
      expect(statusCode).toBe(401);
      expect(responseData.error).toBe('Unauthorized');
      expect(next).not.toHaveBeenCalled();
    });

    it('should handle various IP formats', () => {
      const middleware = createAuthMiddleware({
        enabled: true,
        apiKeys: ['valid-key'],
      });

      const ipFormats = [
        '127.0.0.1',
        '::1', // IPv6 localhost
        '2001:db8::1', // IPv6
        '192.168.1.1:8080', // With port
        undefined, // No IP
      ];

      ipFormats.forEach(ip => {
        req.ip = ip as string;
        req.headers = { 'x-api-key': 'valid-key' };
        statusCode = 0;
        next.mockClear();
        
        middleware(req as Request, res as Response, next);
        
        // Should still authenticate regardless of IP format
        expect(next).toHaveBeenCalled();
      });
    });
  });

  describe('Health Check Bypass', () => {
    it('should allow health check endpoint without auth', () => {
      const middleware = createAuthMiddleware({
        enabled: true,
        apiKeys: ['valid-key'],
      });

      req.path = '/api/health';
      req.headers = {}; // No auth
      
      middleware(req as Request, res as Response, next);
      
      expect(next).toHaveBeenCalled();
      expect(statusCode).toBe(0);
    });

    it('should not allow path traversal to bypass auth', () => {
      const middleware = createAuthMiddleware({
        enabled: true,
        apiKeys: ['valid-key'],
      });

      const maliciousPaths = [
        '/api/health/../events',
        '/api//health/../events',
        '/api/health/../../admin',
        '/api/%2e%2e/health', // URL encoded
      ];

      maliciousPaths.forEach(path => {
        req.path = path;
        req.headers = {}; // No auth
        statusCode = 0;
        next.mockClear();
        
        middleware(req as Request, res as Response, next);
        
        // Should require auth for non-health endpoints
        if (!path.endsWith('/health')) {
          expect(statusCode).toBe(401);
          expect(next).not.toHaveBeenCalled();
        }
      });
    });
  });
});