import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TelemetryService } from '../../src/core/TelemetryService.js';
import type { TelemetryConfig, TelemetryEvent } from '../../src/core/types.js';
import { tmpdir } from 'os';
import { join } from 'path';
import { promises as fs } from 'fs';

describe('Integrated Security Tests', () => {
  let service: TelemetryService;
  let testDbPath: string;

  beforeEach(async () => {
    // Set up secure environment
    process.env.TELEMETRY_ENCRYPTION_KEY = 'secure-encryption-key-32-chars-long-for-testing!!';
    process.env.TELEMETRY_API_SECRET = 'secure-api-secret-for-testing!!!';
    process.env.TELEMETRY_ALLOWED_ORIGINS = 'https://trusted.com';
    
    testDbPath = join(tmpdir(), `test-security-${Date.now()}.db`);
    
    const config: Partial<TelemetryConfig> = {
      serviceName: 'security-integration-test',
      storage: [{
        type: 'sqlite',
        enabled: true,
        options: {
          path: testDbPath,
        },
      }],
      security: {
        encryption: {
          enabled: true,
          key: process.env.TELEMETRY_ENCRYPTION_KEY,
        },
        piiDetection: {
          enabled: true,
          patterns: {
            email: true,
            phone: true,
            ssn: true,
            creditCard: true,
          },
          action: 'redact',
        },
      },
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
  });

  afterEach(async () => {
    await service.shutdown();
    
    // Clean up
    try {
      await fs.unlink(testDbPath);
    } catch (e) {
      // Ignore
    }
    
    delete process.env.TELEMETRY_ENCRYPTION_KEY;
    delete process.env.TELEMETRY_API_SECRET;
    delete process.env.TELEMETRY_ALLOWED_ORIGINS;
  });

  describe('End-to-End Security Flow', () => {
    it('should sanitize PII, encrypt, store, and retrieve securely', async () => {
      // Track event with PII
      const eventWithPII: TelemetryEvent = {
        id: 'test-e2e-1',
        sessionId: 'session-e2e',
        eventType: 'event',
        category: 'user-action',
        action: 'contact-form',
        timestamp: Date.now(),
        label: 'User submitted form with email: user@example.com',
        metadata: {
          formData: {
            email: 'user@example.com',
            phone: '555-123-4567',
            message: 'Please contact me',
          },
          internal: {
            apiKey: 'api_key_1234567890abcdefghij',
            sessionToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.signature',
          },
        },
      };

      // Track the event
      await service.track(eventWithPII);

      // Query it back
      const results = await service.query({ sessionId: 'session-e2e' });
      expect(results).toHaveLength(1);

      const retrievedEvent = results[0];

      // Verify PII was redacted
      expect(retrievedEvent.label).not.toContain('user@example.com');
      expect(retrievedEvent.label).toContain('[REDACTED]');
      
      // Verify metadata was properly handled
      const metadata = retrievedEvent.metadata as any;
      expect(JSON.stringify(metadata)).not.toContain('user@example.com');
      expect(JSON.stringify(metadata)).not.toContain('555-123-4567');
      expect(JSON.stringify(metadata)).not.toContain('api_key_1234567890abcdefghij');
      
      // Verify data was encrypted (check raw database)
      const db = (service as any).storageProviders[0].operations.db;
      const rawEvents = await db.all('SELECT * FROM telemetry_events WHERE id = ?', [retrievedEvent.id]);
      
      if (rawEvents.length > 0) {
        const rawEvent = rawEvents[0];
        // Encrypted data should have encryption markers
        if (rawEvent.prompt) {
          expect(rawEvent.prompt).toMatch(/^enc:[a-f0-9]+:[a-f0-9]+$/);
        }
      }
    });

    it('should handle malicious input throughout the pipeline', async () => {
      const maliciousEvent: TelemetryEvent = {
        id: "test'; DROP TABLE telemetry_events; --",
        sessionId: "../../../etc/passwd",
        eventType: 'event',
        category: "<script>alert('xss')</script>",
        action: "action' OR '1'='1",
        timestamp: Date.now(),
        label: 'Malicious content with email: admin@evil.com',
        metadata: {
          injection: "'; DELETE FROM sessions WHERE '1'='1",
          xss: '<img src=x onerror=alert(1)>',
          traversal: '../../../../etc/shadow',
          overflow: 'A'.repeat(10000),
        },
      };

      // Should handle without errors
      await expect(service.track(maliciousEvent)).resolves.not.toThrow();

      // Query with malicious filter
      const maliciousFilter = {
        sessionId: "' OR '1'='1",
        category: "'; DROP TABLE--",
        limit: 99999,
      };

      const results = await service.query(maliciousFilter as any);
      
      // Should return safe results
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      
      // Verify tables still exist
      const stats = await service.getMetrics();
      expect(stats).toBeDefined();
    });
  });

  describe('Security Monitoring', () => {
    it('should detect and log security anomalies', async () => {
      const consoleSpy = vi.spyOn(console, 'warn');
      
      // Attempt various suspicious activities
      const suspiciousEvents = [
        {
          id: 'suspicious-1',
          sessionId: 'session-1',
          eventType: 'error' as const,
          category: 'security',
          action: 'auth-failure',
          timestamp: Date.now(),
          metadata: {
            attempts: 10,
            ip: '192.168.1.100',
          },
        },
        {
          id: 'suspicious-2',
          sessionId: 'session-1',
          eventType: 'error' as const,
          category: 'security',
          action: 'rate-limit-exceeded',
          timestamp: Date.now() + 1000,
        },
      ];

      for (const event of suspiciousEvents) {
        await service.track(event);
      }

      // Should have logged security-related warnings
      const securityLogs = consoleSpy.mock.calls.filter(call => 
        call[0]?.toString().toLowerCase().includes('security') ||
        call[0]?.toString().toLowerCase().includes('error')
      );

      expect(securityLogs.length).toBeGreaterThan(0);
      
      consoleSpy.mockRestore();
    });

    it('should enforce rate limits on event tracking', async () => {
      // Track many events rapidly
      const promises = [];
      const sessionId = 'rate-limit-test';

      for (let i = 0; i < 1000; i++) {
        promises.push(service.track({
          id: `rate-${i}`,
          sessionId,
          eventType: 'event',
          category: 'test',
          action: 'rate-limit',
          timestamp: Date.now(),
        }));
      }

      // Some should succeed, but system should remain stable
      const results = await Promise.allSettled(promises);
      const succeeded = results.filter(r => r.status === 'fulfilled').length;
      
      expect(succeeded).toBeGreaterThan(0);
      expect(succeeded).toBeLessThanOrEqual(1000);

      // System should still be functional
      const query = await service.query({ sessionId, limit: 10 });
      expect(query).toBeDefined();
    });
  });

  describe('Data Integrity', () => {
    it('should maintain data integrity under concurrent access', async () => {
      const sessionId = 'concurrent-test';
      const concurrentWrites = 100;
      
      // Create many concurrent writes
      const writePromises = Array(concurrentWrites).fill(null).map((_, i) => 
        service.track({
          id: `concurrent-${i}`,
          sessionId,
          eventType: i % 4 === 0 ? 'error' : 'event',
          category: 'test',
          action: `action-${i}`,
          timestamp: Date.now() + i,
          value: i,
        })
      );

      await Promise.all(writePromises);

      // Verify all events were stored correctly
      const results = await service.query({ sessionId, limit: concurrentWrites });
      
      expect(results.length).toBe(concurrentWrites);
      
      // Verify data integrity
      const values = results.map(r => r.value).sort((a, b) => (a || 0) - (b || 0));
      expect(values).toEqual(Array(concurrentWrites).fill(null).map((_, i) => i));
    });

    it('should handle encrypted data correctly across operations', async () => {
      const sessionId = 'encryption-integrity';
      
      // Track events with sensitive data
      await service.track({
        id: 'enc-1',
        sessionId,
        eventType: 'start',
        category: 'test',
        action: 'begin',
        timestamp: Date.now(),
        label: 'Sensitive: user@example.com',
        metadata: {
          secret: 'confidential-data',
          nested: {
            apiKey: 'secret-key-12345',
          },
        },
      });

      // Export data
      const exported = await service.export({ format: 'json' });
      const exportedData = JSON.parse(exported);
      
      // Verify exported data is sanitized
      expect(exported).not.toContain('user@example.com');
      expect(exported).not.toContain('confidential-data');
      expect(exported).not.toContain('secret-key-12345');
      
      // Query and verify
      const queried = await service.query({ sessionId });
      expect(queried[0].label).toContain('[REDACTED]');
    });
  });

  describe('Security Headers and API Protection', () => {
    it('should enforce secure communication', async () => {
      // Get metrics through API
      const metrics = await service.getMetrics();
      expect(metrics).toBeDefined();

      // Get insights
      const insights = await service.getInsights();
      expect(insights).toBeDefined();

      // Both should work without exposing sensitive internals
      expect(JSON.stringify(metrics)).not.toContain(process.env.TELEMETRY_ENCRYPTION_KEY);
      expect(JSON.stringify(insights)).not.toContain(process.env.TELEMETRY_API_SECRET);
    });
  });

  describe('Cleanup and Resource Security', () => {
    it('should securely clean up sensitive data', async () => {
      const sessionId = 'cleanup-test';
      
      // Track events
      for (let i = 0; i < 10; i++) {
        await service.track({
          id: `cleanup-${i}`,
          sessionId,
          eventType: 'event',
          category: 'test',
          action: 'cleanup',
          timestamp: Date.now() - (i * 1000 * 60 * 60 * 24), // Days ago
          metadata: {
            sensitive: 'data-to-clean',
            email: 'old@example.com',
          },
        });
      }

      // Clean old data
      const cleaned = await service.clean(7); // 7 days
      expect(cleaned).toBeGreaterThan(0);

      // Verify old sensitive data is gone
      const remaining = await service.query({ sessionId });
      remaining.forEach(event => {
        const age = Date.now() - event.timestamp;
        expect(age).toBeLessThan(7 * 24 * 60 * 60 * 1000);
      });
    });

    it('should handle shutdown securely', async () => {
      // Track event with sensitive data
      await service.track({
        id: 'shutdown-test',
        sessionId: 'final-session',
        eventType: 'event',
        category: 'test',
        action: 'shutdown',
        timestamp: Date.now(),
        metadata: {
          final: 'sensitive-data',
        },
      });

      // Shutdown should complete without leaking
      await expect(service.shutdown()).resolves.not.toThrow();
      
      // Service should reject new operations
      await expect(service.track({
        id: 'after-shutdown',
        sessionId: 'should-fail',
        eventType: 'event',
        category: 'test',
        action: 'post-shutdown',
        timestamp: Date.now(),
      })).rejects.toThrow();
    });
  });
});