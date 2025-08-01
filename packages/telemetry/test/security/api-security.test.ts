import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { TelemetryService } from '../../src/core/TelemetryService.js';
import { TelemetryAPIServer } from '../../src/api/TelemetryAPIServer.js';
import type { TelemetryConfig } from '../../src/core/types.js';

describe('API Security Tests', () => {
  let service: TelemetryService;
  let apiServer: TelemetryAPIServer;
  let app: any;

  beforeEach(async () => {
    // Set secure environment variables
    process.env.TELEMETRY_ALLOWED_ORIGINS = 'https://trusted.example.com,https://app.example.com';
    process.env.TELEMETRY_API_SECRET = 'test-secret-key-32-chars-long-min';
    process.env.TELEMETRY_API_KEYS = 'valid-api-key-1,valid-api-key-2';
    process.env.TELEMETRY_BEARER_TOKENS = 'valid-bearer-token-1,valid-bearer-token-2';
    
    const config: Partial<TelemetryConfig> = {
      serviceName: 'security-test',
      storage: [{
        type: 'memory',
        enabled: true,
      }],
      api: {
        enabled: true,
        port: 0, // Random port
        auth: {
          enabled: true,
          secret: process.env.TELEMETRY_API_SECRET,
        },
      },
    };

    service = new TelemetryService(config);
    await service.initialize();
    
    apiServer = (service as any).apiServer;
    app = (apiServer as any).app;
  });

  afterEach(async () => {
    await service.shutdown();
    // Clean up environment
    delete process.env.TELEMETRY_ALLOWED_ORIGINS;
    delete process.env.TELEMETRY_API_SECRET;
    delete process.env.TELEMETRY_API_KEYS;
    delete process.env.TELEMETRY_BEARER_TOKENS;
  });

  describe('CORS Protection', () => {
    it('should reject requests from unauthorized origins', async () => {
      const response = await request(app)
        .get('/api/health')
        .set('Origin', 'https://evil.example.com')
        .expect(500); // CORS will block it
    });

    it('should allow requests from whitelisted origins', async () => {
      const response = await request(app)
        .get('/api/health')
        .set('Origin', 'https://trusted.example.com')
        .expect(200);
    });

    it('should allow requests with no origin (e.g., curl, mobile apps)', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);
    });

    it('should include proper CORS headers for allowed origins', async () => {
      const response = await request(app)
        .options('/api/health')
        .set('Origin', 'https://trusted.example.com')
        .expect(204);

      expect(response.headers['access-control-allow-origin']).toBe('https://trusted.example.com');
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });
  });

  describe('Authentication', () => {
    it('should reject requests without authentication', async () => {
      const response = await request(app)
        .get('/api/events')
        .expect(401);
      
      expect(response.body.error).toBe('Unauthorized');
    });

    it('should accept valid API key authentication', async () => {
      const response = await request(app)
        .get('/api/events')
        .set('X-API-Key', 'valid-api-key-1')
        .expect(200);
    });

    it('should reject invalid API keys', async () => {
      const response = await request(app)
        .get('/api/events')
        .set('X-API-Key', 'invalid-api-key')
        .expect(401);
    });

    it('should accept valid bearer token authentication', async () => {
      const response = await request(app)
        .get('/api/events')
        .set('Authorization', 'Bearer valid-bearer-token-1')
        .expect(200);
    });

    it('should reject invalid bearer tokens', async () => {
      const response = await request(app)
        .get('/api/events')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });

    it('should not expose sensitive information in error messages', async () => {
      const response = await request(app)
        .get('/api/events')
        .set('X-API-Key', 'wrong-key')
        .expect(401);

      expect(response.body.error).toBe('Unauthorized');
      expect(response.body).not.toHaveProperty('validKeys');
      expect(response.body).not.toHaveProperty('stack');
    });
  });

  describe('Input Validation', () => {
    it('should reject SQL injection attempts in query parameters', async () => {
      const response = await request(app)
        .get('/api/events')
        .query({ sessionId: "'; DROP TABLE telemetry_events; --" })
        .set('X-API-Key', 'valid-api-key-1')
        .expect(400);

      expect(response.body.error).toBe('Validation Error');
    });

    it('should reject XSS attempts in query parameters', async () => {
      const response = await request(app)
        .get('/api/events')
        .query({ category: '<script>alert("xss")</script>' })
        .set('X-API-Key', 'valid-api-key-1')
        .expect(200); // Should sanitize, not reject
      
      // Verify the script tag isn't returned in results
      expect(JSON.stringify(response.body)).not.toContain('<script>');
    });

    it('should enforce parameter length limits', async () => {
      const longString = 'a'.repeat(101); // Over 100 char limit
      const response = await request(app)
        .get('/api/events')
        .query({ category: longString })
        .set('X-API-Key', 'valid-api-key-1')
        .expect(400);

      expect(response.body.error).toBe('Validation Error');
    });

    it('should validate numeric parameters', async () => {
      const response = await request(app)
        .get('/api/events')
        .query({ limit: 'not-a-number' })
        .set('X-API-Key', 'valid-api-key-1')
        .expect(400);

      expect(response.body.error).toBe('Validation Error');
    });

    it('should enforce maximum limit values', async () => {
      const response = await request(app)
        .get('/api/events')
        .query({ limit: 10000 }) // Over max
        .set('X-API-Key', 'valid-api-key-1')
        .expect(400);

      expect(response.body.error).toBe('Validation Error');
    });

    it('should reject invalid session ID formats in path parameters', async () => {
      const response = await request(app)
        .get('/sessions/../../../etc/passwd/events')
        .set('X-API-Key', 'valid-api-key-1')
        .expect(400);

      expect(response.body.error).toBe('Validation Error');
    });

    it('should validate export request body', async () => {
      const response = await request(app)
        .post('/api/export')
        .set('X-API-Key', 'valid-api-key-1')
        .send({ format: 'invalid-format' })
        .expect(400);

      expect(response.body.error).toBe('Validation Error');
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits', async () => {
      // Make multiple requests to trigger rate limit
      const requests = Array(101).fill(null).map(() => 
        request(app)
          .get('/api/events')
          .set('X-API-Key', 'valid-api-key-1')
      );

      const responses = await Promise.all(requests);
      const rateLimited = responses.filter(r => r.status === 429);
      
      expect(rateLimited.length).toBeGreaterThan(0);
      expect(rateLimited[0].body.error || rateLimited[0].text).toContain('Too many requests');
    });

    it('should include rate limit headers', async () => {
      const response = await request(app)
        .get('/api/events')
        .set('X-API-Key', 'valid-api-key-1')
        .expect(200);

      expect(response.headers).toHaveProperty('x-ratelimit-limit');
      expect(response.headers).toHaveProperty('x-ratelimit-remaining');
    });
  });

  describe('Security Headers', () => {
    it('should include security headers', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      // Helmet security headers
      expect(response.headers['x-dns-prefetch-control']).toBe('off');
      expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-xss-protection']).toBe('0'); // Modern practice
    });

    it('should have proper content security policy', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      const csp = response.headers['content-security-policy'];
      expect(csp).toContain("default-src 'self'");
      expect(csp).not.toContain("'unsafe-eval'");
    });
  });

  describe('Error Handling Security', () => {
    it('should not expose stack traces in production', async () => {
      // Force an error
      const response = await request(app)
        .get('/api/sessions/invalid-uuid-format')
        .set('X-API-Key', 'valid-api-key-1')
        .expect(400);

      expect(response.body).not.toHaveProperty('stack');
      expect(response.body).not.toHaveProperty('trace');
    });

    it('should not expose internal paths in errors', async () => {
      const response = await request(app)
        .get('/api/nonexistent')
        .set('X-API-Key', 'valid-api-key-1')
        .expect(404);

      const responseText = JSON.stringify(response.body);
      expect(responseText).not.toContain('/Users/');
      expect(responseText).not.toContain('/home/');
      expect(responseText).not.toContain('node_modules');
    });
  });

  describe('Request Size Limits', () => {
    it('should reject oversized request bodies', async () => {
      const largeData = 'x'.repeat(2 * 1024 * 1024); // 2MB
      
      const response = await request(app)
        .post('/api/export')
        .set('X-API-Key', 'valid-api-key-1')
        .send({ format: 'json', filter: { metadata: largeData } })
        .expect(413); // Payload too large
    });
  });

  describe('Path Traversal Protection', () => {
    it('should prevent path traversal in session IDs', async () => {
      const maliciousIds = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32',
        'valid/../../../etc/shadow',
        'session%2F..%2F..%2Fetc%2Fpasswd',
      ];

      for (const id of maliciousIds) {
        const response = await request(app)
          .get(`/sessions/${id}/events`)
          .set('X-API-Key', 'valid-api-key-1')
          .expect(400);

        expect(response.body.error).toBe('Validation Error');
      }
    });
  });

  describe('HTTP Method Restrictions', () => {
    it('should only allow specific HTTP methods', async () => {
      const response = await request(app)
        .delete('/api/events') // DELETE not allowed
        .set('X-API-Key', 'valid-api-key-1')
        .expect(404);
    });

    it('should reject TRACE method', async () => {
      const response = await request(app)
        .trace('/api/health')
        .expect(404);
    });
  });
});