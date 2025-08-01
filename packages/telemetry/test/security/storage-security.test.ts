import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SQLiteProvider } from '../../src/storage/providers/SQLiteProvider.js';
import type { TelemetryEvent, QueryFilter } from '../../src/core/types.js';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('Storage Security Tests', () => {
  let provider: SQLiteProvider;
  let testDbPath: string;

  beforeEach(async () => {
    // Create temporary database for testing
    testDbPath = join(tmpdir(), `test-telemetry-${Date.now()}.db`);
    provider = new SQLiteProvider({ path: testDbPath });
    await provider.initialize();
  });

  afterEach(async () => {
    await provider.shutdown();
    // Clean up test database
    try {
      await fs.unlink(testDbPath);
    } catch (e) {
      // Ignore if already deleted
    }
  });

  describe('SQL Injection Protection', () => {
    it('should sanitize session IDs with SQL injection attempts', async () => {
      const maliciousSessionIds = [
        "'; DROP TABLE telemetry_events; --",
        "1' OR '1'='1",
        "1'; DELETE FROM telemetry_sessions WHERE '1'='1",
        "admin'--",
        "1' UNION SELECT * FROM telemetry_events--",
      ];

      for (const sessionId of maliciousSessionIds) {
        const event: TelemetryEvent = {
          id: `test-${Date.now()}`,
          sessionId,
          eventType: 'event',
          category: 'test',
          action: 'sql-injection',
          timestamp: Date.now(),
        };

        // Should handle without SQL errors
        await expect(provider.store(event)).resolves.not.toThrow();
        
        // Should be able to query it back (properly escaped)
        const results = await provider.query({ sessionId });
        expect(results).toBeDefined();
      }
    });

    it('should sanitize query filters with SQL injection attempts', async () => {
      // First store a normal event
      const event: TelemetryEvent = {
        id: 'test-1',
        sessionId: 'normal-session',
        eventType: 'event',
        category: 'test',
        action: 'query',
        timestamp: Date.now(),
      };
      await provider.store(event);

      const maliciousFilters: QueryFilter[] = [
        { category: "test' OR '1'='1" },
        { action: "query'; DROP TABLE telemetry_events; --" },
        { sessionId: "' UNION SELECT * FROM telemetry_sessions--" },
        { eventType: "event' OR eventType LIKE '%", limit: 1000 },
      ];

      for (const filter of maliciousFilters) {
        // Should handle without SQL errors
        await expect(provider.query(filter)).resolves.toBeDefined();
      }
    });

    it('should prevent second-order SQL injection', async () => {
      // Store event with malicious data
      const maliciousEvent: TelemetryEvent = {
        id: 'mal-1',
        sessionId: 'session-1',
        eventType: 'event',
        category: "test'; DROP TABLE telemetry_events; --",
        action: 'store',
        timestamp: Date.now(),
        metadata: {
          payload: "'; DELETE FROM telemetry_sessions WHERE '1'='1",
        },
      };

      await provider.store(maliciousEvent);

      // Query using the stored malicious data
      const results = await provider.query({ 
        category: maliciousEvent.category 
      });

      // Should work without executing injected SQL
      expect(results).toBeDefined();
      
      // Tables should still exist
      const stats = await provider.getStats();
      expect(stats.totalEvents).toBeGreaterThanOrEqual(1);
    });

    it('should handle numeric injection attempts', async () => {
      const maliciousQueries = [
        { limit: '1; DROP TABLE telemetry_events--' as any },
        { offset: '0 OR 1=1' as any },
        { startTime: '0; DELETE FROM telemetry_events' as any },
        { endTime: '999999999999999 OR TRUE' as any },
      ];

      for (const query of maliciousQueries) {
        // Should either sanitize or reject
        try {
          await provider.query(query);
        } catch (error) {
          // Should throw validation error, not SQL error
          expect(error).toBeDefined();
          expect(String(error)).toMatch(/Invalid|Validation/i);
          expect(String(error)).not.toMatch(/SQL|syntax/i);
        }
      }
    });
  });

  describe('Path Traversal Protection', () => {
    it('should prevent path traversal in session IDs', async () => {
      const pathTraversalIds = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32\\config\\sam',
        'session/../../../sensitive-data',
        'session%2F..%2F..%2Fetc%2Fpasswd',
      ];

      for (const sessionId of pathTraversalIds) {
        const event: TelemetryEvent = {
          id: `test-${Date.now()}`,
          sessionId,
          eventType: 'event',
          category: 'test',
          action: 'path-traversal',
          timestamp: Date.now(),
        };

        // Should handle safely
        await expect(provider.store(event)).resolves.not.toThrow();
        
        // Should convert to safe UUID
        const results = await provider.query({ limit: 10 });
        const storedEvent = results.find(e => e.action === 'path-traversal');
        expect(storedEvent?.sessionId).not.toContain('..');
        expect(storedEvent?.sessionId).not.toContain('/');
        expect(storedEvent?.sessionId).not.toContain('\\');
      }
    });
  });

  describe('Data Type Validation', () => {
    it('should validate and sanitize event types', async () => {
      const invalidEventTypes = [
        'start; DROP TABLE--',
        'custom-type',
        'START', // Wrong case
        null as any,
        123 as any,
        ['array'] as any,
      ];

      for (const eventType of invalidEventTypes) {
        const event: TelemetryEvent = {
          id: `test-${Date.now()}`,
          sessionId: 'test-session',
          eventType: eventType as any,
          category: 'test',
          action: 'type-validation',
          timestamp: Date.now(),
        };

        try {
          await provider.store(event);
          // If it succeeds, it should have been sanitized
          const results = await provider.query({ sessionId: 'test-session' });
          const storedEvent = results[results.length - 1];
          expect(['start', 'stream', 'end', 'error', 'custom']).toContain(storedEvent.eventType);
        } catch (error) {
          // Or it should fail with validation error
          expect(String(error)).toMatch(/Invalid|Validation|eventType/i);
        }
      }
    });

    it('should enforce field length limits', async () => {
      const longString = 'a'.repeat(10000); // Very long string
      
      const event: TelemetryEvent = {
        id: 'test-1',
        sessionId: 'test-session',
        eventType: 'event',
        category: longString,
        action: longString,
        timestamp: Date.now(),
        label: longString,
        metadata: {
          huge: longString.repeat(100), // Extremely large
        },
      };

      // Should either truncate or reject
      try {
        await provider.store(event);
        
        // If stored, check it was truncated
        const results = await provider.query({ sessionId: 'test-session' });
        const stored = results[0];
        
        expect(stored.category.length).toBeLessThan(1000);
        expect(stored.action.length).toBeLessThan(1000);
      } catch (error) {
        // Or should fail with appropriate error
        expect(String(error)).toMatch(/too long|exceeds limit|Invalid/i);
      }
    });
  });

  describe('NoSQL Injection Protection', () => {
    it('should handle JSON injection in metadata', async () => {
      const maliciousMetadata = [
        { $ne: null }, // MongoDB-style operator
        { "'); DROP TABLE telemetry_events; --": true },
        { __proto__: { isAdmin: true } }, // Prototype pollution
        { constructor: { prototype: { isAdmin: true } } },
      ];

      for (const metadata of maliciousMetadata) {
        const event: TelemetryEvent = {
          id: `test-${Date.now()}`,
          sessionId: 'test-session',
          eventType: 'event',
          category: 'test',
          action: 'nosql-injection',
          timestamp: Date.now(),
          metadata,
        };

        // Should handle safely
        await expect(provider.store(event)).resolves.not.toThrow();
        
        // Should store as safe JSON
        const results = await provider.query({ sessionId: 'test-session' });
        const stored = results[results.length - 1];
        
        // Metadata should be serialized safely
        expect(stored.metadata).toBeDefined();
        expect(stored.metadata).not.toHaveProperty('__proto__');
        expect(stored.metadata).not.toHaveProperty('constructor');
      }
    });
  });

  describe('Resource Exhaustion Protection', () => {
    it('should handle large batch operations safely', async () => {
      const events: TelemetryEvent[] = [];
      
      // Create large batch
      for (let i = 0; i < 1000; i++) {
        events.push({
          id: `batch-${i}`,
          sessionId: 'batch-session',
          eventType: 'event',
          category: 'test',
          action: 'batch',
          timestamp: Date.now() + i,
        });
      }

      // Should handle large batch without exhausting resources
      await expect(provider.storeBatch(events)).resolves.not.toThrow();
      
      // Verify they were stored
      const results = await provider.query({ 
        sessionId: 'batch-session',
        limit: 10 
      });
      expect(results.length).toBeGreaterThan(0);
    });

    it('should enforce query limits', async () => {
      // Try to query with excessive limit
      const results = await provider.query({ 
        limit: 999999 
      });
      
      // Should enforce reasonable limit
      expect(results.length).toBeLessThanOrEqual(1000);
    });

    it('should protect against regex DoS in queries', async () => {
      // Store event with normal data
      const event: TelemetryEvent = {
        id: 'test-1',
        sessionId: 'test-session',
        eventType: 'event',
        category: 'test',
        action: 'regex-test',
        timestamp: Date.now(),
        label: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      };
      await provider.store(event);

      // Potentially malicious regex patterns
      const maliciousPatterns = [
        '(a+)+$', // Catastrophic backtracking
        '(a*)*$',
        '(a|a)*$',
        '(.*a){x}', // where x is large
      ];

      for (const pattern of maliciousPatterns) {
        const filter = {
          category: pattern,
        };

        // Should either reject or handle safely
        const start = Date.now();
        try {
          await provider.query(filter);
        } catch (error) {
          // Expected to fail safely
        }
        const duration = Date.now() - start;
        
        // Should not hang (complete within reasonable time)
        expect(duration).toBeLessThan(1000); // 1 second max
      }
    });
  });

  describe('Session Security', () => {
    it('should generate secure session IDs for non-UUID inputs', async () => {
      const predictableIds = [
        '1',
        '2',
        'user123',
        'admin',
        'test',
      ];

      const generatedIds = new Set<string>();

      for (const id of predictableIds) {
        const event: TelemetryEvent = {
          id: `test-${Date.now()}`,
          sessionId: id,
          eventType: 'event',
          category: 'test',
          action: 'session-security',
          timestamp: Date.now(),
        };

        await provider.store(event);
        
        // Query back to see the actual stored ID
        const results = await provider.query({ limit: 100 });
        const stored = results.find(e => e.action === 'session-security');
        
        if (stored) {
          // Should be converted to UUID format
          expect(stored.sessionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
          
          // Should be unique even for sequential inputs
          expect(generatedIds.has(stored.sessionId)).toBe(false);
          generatedIds.add(stored.sessionId);
        }
      }

      // All generated IDs should be unique
      expect(generatedIds.size).toBe(predictableIds.length);
    });
  });
});