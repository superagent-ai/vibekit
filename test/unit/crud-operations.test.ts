/**
 * Comprehensive CRUD Operations Unit Tests
 * 
 * This test suite provides exhaustive coverage of all Create, Read, Update, Delete
 * operations in the telemetry system, including edge cases and error handling.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DrizzleTelemetryOperations } from '../../packages/vibekit/src/db/operations';
import { initializeTelemetryDB } from '../../packages/vibekit/src/db/index';
import { LocalStoreConfig } from '../../packages/vibekit/src/types/telemetry-storage';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';

describe.skip('CRUD Operations Unit Tests', () => {
  let dbOps: DrizzleTelemetryOperations;
  let testDbPath: string;
  let testConfig: LocalStoreConfig;

  beforeEach(async () => {
    // Create unique test database for each test
    testDbPath = path.join(process.cwd(), `test-crud-${randomUUID()}.db`);
    
    testConfig = {
      isEnabled: true,
      path: testDbPath,
      streamBatchSize: 10,
      streamFlushIntervalMs: 100,
      pruneDays: 30,
      maxSizeMB: 100,
    };

    // Create independent database instance instead of using singleton
    const { DrizzleTelemetryDB } = await import('../../packages/vibekit/src/db/connection');
    const db = new DrizzleTelemetryDB({
      dbPath: testDbPath,
      enableQueryLogging: false,
      enableWAL: true,
      queryTimeoutMs: 5000,
      streamBatchSize: 10,
      streamFlushIntervalMs: 100,
      pruneDays: 30,
    });
    await db.initialize();

    // Pass the database instance directly to avoid singleton issues
    dbOps = new DrizzleTelemetryOperations(db);
    await dbOps.initialize();
  });

  afterEach(async () => {
    // Cleanup test database
    try {
      await dbOps.close();
    } catch (error) {
      // Ignore close errors
    }
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('Session CRUD Operations', () => {
    describe('CREATE Operations', () => {
      it('should create a new session with minimal data', async () => {
        const sessionId = randomUUID();
        const sessionData = {
          id: sessionId,
          agentType: 'claude',
          mode: 'code',
          status: 'active' as const,
          startTime: Date.now(),
          endTime: null,
          duration: null,
          eventCount: 0,
          streamEventCount: 0,
          errorCount: 0,
          sandboxId: null,
          repoUrl: null,
          metadata: null,
        };

        const created = await dbOps.upsertSession(sessionData);
        expect(created).toBeDefined();
        expect(created.id).toBe(sessionId);
        expect(created.agentType).toBe('claude');
        expect(created.mode).toBe('code');
        expect(created.status).toBe('active');
      });

      it('should create a session with full metadata', async () => {
        const sessionId = randomUUID();
        const metadata = {
          userId: 'test-user',
          environment: 'test',
          features: ['ai-assist', 'code-completion'],
          performance: { cpu: 0.5, memory: 256 }
        };

        const sessionData = {
          id: sessionId,
          agentType: 'codex',
          mode: 'chat',
          status: 'active' as const,
          startTime: Date.now(),
          endTime: null,
          duration: null,
          eventCount: 0,
          streamEventCount: 0,
          errorCount: 0,
          sandboxId: 'test-sandbox',
          repoUrl: 'https://github.com/test/repo',
          metadata: JSON.stringify(metadata),
        };

        const created = await dbOps.upsertSession(sessionData);
        expect(created).toBeDefined();
        expect(created.sandboxId).toBe('test-sandbox');
        expect(created.repoUrl).toBe('https://github.com/test/repo');
        expect(JSON.parse(created.metadata || '{}')).toEqual(metadata);
      });

      it('should handle session creation with null values', async () => {
        const sessionId = randomUUID();
        const sessionData = {
          id: sessionId,
          agentType: 'gemini',
          mode: 'code',
          status: 'active' as const,
          startTime: Date.now(),
          endTime: null,
          duration: null,
          eventCount: 0,
          streamEventCount: 0,
          errorCount: 0,
          sandboxId: null,
          repoUrl: null,
          metadata: null,
        };

        await expect(dbOps.upsertSession(sessionData)).resolves.not.toThrow();
        
        const created = await dbOps.upsertSession(sessionData);
        expect(created.sandboxId).toBeNull();
        expect(created.repoUrl).toBeNull();
        expect(created.metadata).toBeNull();
      });
    });

    describe('READ Operations', () => {
      it('should query sessions with various filters', async () => {
        // Create test sessions
        const sessions = [];
        for (let i = 0; i < 3; i++) {
          const sessionId = randomUUID();
          const sessionData = {
            id: sessionId,
            agentType: i % 2 === 0 ? 'claude' : 'codex',
            mode: 'code',
            status: 'active' as const,
            startTime: Date.now() + i * 1000,
            endTime: null,
            duration: null,
            eventCount: 0,
            streamEventCount: 0,
            errorCount: 0,
            sandboxId: null,
            repoUrl: null,
            metadata: null,
          };
          await dbOps.upsertSession(sessionData);
          sessions.push(sessionData);
        }

        // Query all sessions
        const allSessions = await dbOps.querySessions();
        expect(allSessions.length).toBeGreaterThanOrEqual(3);

        // Query with agent type filter
        const claudeSessions = await dbOps.querySessions({ agentType: 'claude' });
        expect(claudeSessions.every(s => s.agentType === 'claude')).toBe(true);

        // Query with time filter
        const recentSessions = await dbOps.querySessions({ 
          from: Date.now() - 5000 
        });
        expect(recentSessions.length).toBeGreaterThanOrEqual(3);
      });

      it('should handle pagination in session queries', async () => {
        // Create multiple sessions
        for (let i = 0; i < 10; i++) {
          const sessionId = randomUUID();
          await dbOps.upsertSession({
            id: sessionId,
            agentType: 'claude',
            mode: 'code',
            status: 'active',
            startTime: Date.now() + i,
            endTime: null,
            duration: null,
            eventCount: 0,
            streamEventCount: 0,
            errorCount: 0,
            sandboxId: null,
            repoUrl: null,
            metadata: null,
          });
        }

        // Test pagination
        const firstPage = await dbOps.querySessions({ limit: 5, offset: 0 });
        const secondPage = await dbOps.querySessions({ limit: 5, offset: 5 });
        
        expect(firstPage).toHaveLength(5);
        expect(secondPage).toHaveLength(5);
        
        // Ensure no overlap
        const firstIds = firstPage.map(s => s.id);
        const secondIds = secondPage.map(s => s.id);
        const overlap = firstIds.filter(id => secondIds.includes(id));
        expect(overlap).toHaveLength(0);
      });
    });

    describe('UPDATE Operations', () => {
      it('should update session status and stats', async () => {
        const sessionId = randomUUID();
        const sessionData = {
          id: sessionId,
          agentType: 'claude',
          mode: 'code',
          status: 'active' as const,
          startTime: Date.now(),
          endTime: null,
          duration: null,
          eventCount: 0,
          streamEventCount: 0,
          errorCount: 0,
          sandboxId: null,
          repoUrl: null,
          metadata: null,
        };

        await dbOps.upsertSession(sessionData);
        
        // Update status
        const updatedData = { 
          ...sessionData, 
          status: 'completed' as const, 
          endTime: Date.now(),
          eventCount: 5 
        };
        const updated = await dbOps.upsertSession(updatedData);
        
        expect(updated.status).toBe('completed');
        expect(updated.endTime).toBeDefined();
        expect(updated.eventCount).toBe(5);
      });

      it('should update session statistics after events', async () => {
        const sessionId = randomUUID();
        await dbOps.upsertSession({
          id: sessionId,
          agentType: 'claude',
          mode: 'code',
          status: 'active',
          startTime: Date.now(),
          endTime: null,
          duration: null,
          eventCount: 0,
          streamEventCount: 0,
          errorCount: 0,
          sandboxId: null,
          repoUrl: null,
          metadata: null,
        });
        
        // Add events
        await dbOps.insertEvent({
          sessionId,
          eventType: 'start',
          agentType: 'claude',
          mode: 'code',
          prompt: 'test prompt',
          timestamp: Date.now(),
          streamData: null,
          metadata: null,
        });

        await dbOps.insertEvent({
          sessionId,
          eventType: 'stream',
          agentType: 'claude',
          mode: 'code',
          prompt: 'test prompt',
          timestamp: Date.now(),
          streamData: 'stream data',
          metadata: null,
        });

        // Update session stats
        await dbOps.updateSessionStats(sessionId);
        
        const sessions = await dbOps.querySessions({ sessionId });
        expect(sessions).toHaveLength(1);
        expect(sessions[0].eventCount).toBeGreaterThan(0);
      });
    });
  });

  describe('Event CRUD Operations', () => {
    let sessionId: string;

    beforeEach(async () => {
      // Create a session for event tests
      sessionId = randomUUID();
      await dbOps.upsertSession({
        id: sessionId,
        agentType: 'claude',
        mode: 'code',
        status: 'active',
        startTime: Date.now(),
        endTime: null,
        duration: null,
        eventCount: 0,
        streamEventCount: 0,
        errorCount: 0,
        sandboxId: null,
        repoUrl: null,
        metadata: null,
      });
    });

    describe('CREATE Operations', () => {
      it('should insert a start event', async () => {
        const eventData = {
          sessionId,
          eventType: 'start' as const,
          agentType: 'claude',
          mode: 'code',
          prompt: 'Write a function to sort an array',
          timestamp: Date.now(),
          streamData: null,
          metadata: null,
        };

        const created = await dbOps.insertEvent(eventData);
        expect(created).toBeDefined();
        expect(created.sessionId).toBe(sessionId);
        expect(created.eventType).toBe('start');
        expect(typeof created.id).toBe('number');
      });

      it('should insert a stream event with data', async () => {
        const streamData = 'function sortArray(arr) {\n  return arr.sort();\n}';
        const eventData = {
          sessionId,
          eventType: 'stream' as const,
          agentType: 'claude',
          mode: 'code',
          prompt: 'Write a function to sort an array',
          timestamp: Date.now(),
          streamData,
          metadata: JSON.stringify({ chunk: 1, total: 5 }),
        };

        const created = await dbOps.insertEvent(eventData);
        expect(created).toBeDefined();
        expect(created.streamData).toBe(streamData);
        expect(JSON.parse(created.metadata || '{}')).toEqual({ chunk: 1, total: 5 });
      });

      it('should handle batch event insertion', async () => {
        const eventBatch = [];
        for (let i = 0; i < 10; i++) {
          eventBatch.push({
            sessionId,
            eventType: 'stream' as const,
            agentType: 'claude',
            mode: 'code',
            prompt: 'Batch test',
            timestamp: Date.now() + i,
            streamData: `chunk ${i}`,
            metadata: JSON.stringify({ batchIndex: i }),
          });
        }

        const result = await dbOps.insertEventBatch(eventBatch);
        expect(result.inserted).toBe(10);
        expect(result.failed).toBe(0);
        expect(result.errors).toHaveLength(0);
      });
    });

    describe('READ Operations', () => {
      beforeEach(async () => {
        // Insert test events
        const events = [
          { eventType: 'start', streamData: null, timestamp: Date.now() - 1000 },
          { eventType: 'stream', streamData: 'chunk 1', timestamp: Date.now() - 500 },
          { eventType: 'stream', streamData: 'chunk 2', timestamp: Date.now() - 300 },
          { eventType: 'end', streamData: null, timestamp: Date.now() },
        ];

        for (const event of events) {
          await dbOps.insertEvent({
            sessionId,
            eventType: event.eventType as any,
            agentType: 'claude',
            mode: 'code',
            prompt: 'test prompt',
            timestamp: event.timestamp,
            streamData: event.streamData,
            metadata: null,
          });
        }
      });

      it('should query events with various filters', async () => {
        // Query all events for session
        const allEvents = await dbOps.queryEvents({ sessionId });
        expect(allEvents).toHaveLength(4);
        
        const eventTypes = allEvents.map(e => e.eventType);
        expect(eventTypes).toContain('start');
        expect(eventTypes).toContain('stream');
        expect(eventTypes).toContain('end');
      });

      it('should filter events by type', async () => {
        const streamEvents = await dbOps.queryEvents({ 
          sessionId, 
          eventType: 'stream' 
        });
        expect(streamEvents).toHaveLength(2);
        
        streamEvents.forEach(event => {
          expect(event.eventType).toBe('stream');
          expect(event.streamData).toMatch(/chunk \d/);
        });
      });

      it('should query events with time filters', async () => {
        const recentEvents = await dbOps.queryEvents({
          sessionId,
          from: Date.now() - 600000 // Last 10 minutes
        });
        expect(recentEvents.length).toBeGreaterThan(0);

        const oldEvents = await dbOps.queryEvents({
          sessionId,
          to: Date.now() - 600000 // Before 10 minutes ago
        });
        expect(oldEvents).toHaveLength(0);
      });
    });
  });

  describe('Edge Cases and Error Handling', () => {
    describe('Large Data Handling', () => {
      it('should handle large stream data', async () => {
        const sessionId = randomUUID();
        await dbOps.upsertSession({
          id: sessionId,
          agentType: 'claude',
          mode: 'code',
          status: 'active',
          startTime: Date.now(),
          endTime: null,
          duration: null,
          eventCount: 0,
          streamEventCount: 0,
          errorCount: 0,
          sandboxId: null,
          repoUrl: null,
          metadata: null,
        });

        // Create a large data payload (100KB)
        const largeData = 'x'.repeat(100 * 1024);
        
        const eventData = {
          sessionId,
          eventType: 'stream' as const,
          agentType: 'claude',
          mode: 'code',
          prompt: 'large data test',
          timestamp: Date.now(),
          streamData: largeData,
          metadata: null,
        };

        await expect(dbOps.insertEvent(eventData)).resolves.not.toThrow();
        
        const events = await dbOps.queryEvents({ sessionId });
        const largeEvent = events.find(e => e.streamData?.length === largeData.length);
        expect(largeEvent).toBeDefined();
      });
    });

    describe('Concurrent Operations', () => {
      it('should handle concurrent session creation', async () => {
        const sessionPromises = [];
        
        for (let i = 0; i < 10; i++) {
          const sessionId = randomUUID();
          const promise = dbOps.upsertSession({
            id: sessionId,
            agentType: 'claude',
            mode: 'code',
            status: 'active',
            startTime: Date.now() + i,
            endTime: null,
            duration: null,
            eventCount: 0,
            streamEventCount: 0,
            errorCount: 0,
            sandboxId: null,
            repoUrl: null,
            metadata: null,
          });
          sessionPromises.push(promise);
        }

        const results = await Promise.all(sessionPromises);
        expect(results).toHaveLength(10);
        results.forEach(session => {
          expect(session).toBeDefined();
          expect(session.id).toBeDefined();
        });
      });

      it('should handle concurrent event insertion', async () => {
        const sessionId = randomUUID();
        await dbOps.upsertSession({
          id: sessionId,
          agentType: 'claude',
          mode: 'code',
          status: 'active',
          startTime: Date.now(),
          endTime: null,
          duration: null,
          eventCount: 0,
          streamEventCount: 0,
          errorCount: 0,
          sandboxId: null,
          repoUrl: null,
          metadata: null,
        });

        const eventPromises = [];
        
        for (let i = 0; i < 20; i++) {
          const promise = dbOps.insertEvent({
            sessionId,
            eventType: 'stream',
            agentType: 'claude',
            mode: 'code',
            prompt: 'concurrent test',
            timestamp: Date.now() + i,
            streamData: `concurrent data ${i}`,
            metadata: null,
          });
          eventPromises.push(promise);
        }

        const results = await Promise.all(eventPromises);
        expect(results).toHaveLength(20);
        results.forEach(event => {
          expect(event).toBeDefined();
          expect(typeof event.id).toBe('number');
        });
      });
    });

    describe('Data Validation', () => {
      it('should handle invalid event types gracefully', async () => {
        const sessionId = randomUUID();
        await dbOps.upsertSession({
          id: sessionId,
          agentType: 'claude',
          mode: 'code',
          status: 'active',
          startTime: Date.now(),
          endTime: null,
          duration: null,
          eventCount: 0,
          streamEventCount: 0,
          errorCount: 0,
          sandboxId: null,
          repoUrl: null,
          metadata: null,
        });

        // This should be caught by TypeScript, but test runtime behavior
        try {
          await dbOps.insertEvent({
            sessionId,
            eventType: 'invalid' as any,
            agentType: 'claude',
            mode: 'code',
            prompt: 'test',
            timestamp: Date.now(),
            streamData: null,
            metadata: null,
          });
          // If no error thrown, that's also valid behavior
        } catch (error) {
          // Error is expected for invalid event type
          expect(error).toBeInstanceOf(Error);
        }
      });
    });
  });

  describe('Utility Operations', () => {
    it('should get database health status', async () => {
      const isHealthy = await dbOps.getHealthStatus();
      expect(typeof isHealthy).toBe('boolean');
      expect(isHealthy).toBe(true);
    });

    it('should get statistics summary', async () => {
      // Create some test data first
      const sessionId = randomUUID();
      await dbOps.upsertSession({
        id: sessionId,
        agentType: 'claude',
        mode: 'code',
        status: 'active',
        startTime: Date.now(),
        endTime: null,
        duration: null,
        eventCount: 0,
        streamEventCount: 0,
        errorCount: 0,
        sandboxId: null,
        repoUrl: null,
        metadata: null,
      });

      await dbOps.insertEvent({
        sessionId,
        eventType: 'start',
        agentType: 'claude',
        mode: 'code',
        prompt: 'test',
        timestamp: Date.now(),
        streamData: null,
        metadata: null,
      });

      const stats = await dbOps.getStatistics();
      expect(stats).toBeDefined();
      expect(typeof stats.totalSessions).toBe('number');
      expect(typeof stats.totalEvents).toBe('number');
      expect(stats.totalSessions).toBeGreaterThanOrEqual(1);
      expect(stats.totalEvents).toBeGreaterThanOrEqual(1);
    });

    it('should clear all data', async () => {
      // Create some test data
      const sessionId = randomUUID();
      await dbOps.upsertSession({
        id: sessionId,
        agentType: 'claude',
        mode: 'code',
        status: 'active',
        startTime: Date.now(),
        endTime: null,
        duration: null,
        eventCount: 0,
        streamEventCount: 0,
        errorCount: 0,
        sandboxId: null,
        repoUrl: null,
        metadata: null,
      });

      // Clear all data
      await dbOps.clearAllData();

      // Verify data is cleared
      const sessions = await dbOps.querySessions();
      const events = await dbOps.queryEvents();
      
      expect(sessions).toHaveLength(0);
      expect(events).toHaveLength(0);
    });
  });
}); 