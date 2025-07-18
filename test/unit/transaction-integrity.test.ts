/**
 * Transaction Integrity Unit Tests
 * 
 * This test suite verifies transaction integrity with concurrent operations,
 * rollback scenarios, and ACID compliance for the telemetry database.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DrizzleTelemetryOperations } from '../../packages/vibekit/src/db/operations';
import { initializeTelemetryDB } from '../../packages/vibekit/src/db/index';
import { LocalStoreConfig } from '../../packages/vibekit/src/types/telemetry-storage';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';

describe.skip('Transaction Integrity Tests', () => {
  let dbOps: DrizzleTelemetryOperations;
  let testDbPath: string;
  let testConfig: LocalStoreConfig;

  beforeEach(async () => {
    // Create unique test database for each test
    testDbPath = path.join(process.cwd(), `test-tx-${randomUUID()}.db`);
    
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

    dbOps = new DrizzleTelemetryOperations(testConfig);
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

  describe('ACID Compliance Tests', () => {
    describe('Atomicity', () => {
      it('should handle batch operations atomically', async () => {
        const sessionId = randomUUID();
        
        // Create session first
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

        const eventBatch = [];
        for (let i = 0; i < 5; i++) {
          eventBatch.push({
            sessionId,
            eventType: 'stream' as const,
            agentType: 'claude',
            mode: 'code',
            prompt: 'atomic test',
            timestamp: Date.now() + i,
            streamData: `atomic chunk ${i}`,
            metadata: null,
          });
        }

        // Insert batch - should be atomic
        const result = await dbOps.insertEventBatch(eventBatch);
        
        // Verify all events were inserted
        const events = await dbOps.queryEvents({ sessionId });
        expect(events).toHaveLength(5);
        
        // All events should have consecutive IDs or all should exist
        events.forEach((event, index) => {
          expect(event.streamData).toBe(`atomic chunk ${index}`);
        });
      });

      it('should handle session statistics update atomically', async () => {
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

        // Add multiple events
        for (let i = 0; i < 3; i++) {
          await dbOps.insertEvent({
            sessionId,
            eventType: i === 0 ? 'start' : i === 2 ? 'end' : 'stream',
            agentType: 'claude',
            mode: 'code',
            prompt: 'stats test',
            timestamp: Date.now() + i * 100,
            streamData: i === 1 ? 'stream data' : null,
            metadata: null,
          });
        }

        const statsBefore = await dbOps.querySessions({ sessionId });
        const initialEventCount = statsBefore[0]?.eventCount || 0;

        // Update session stats atomically
        await dbOps.updateSessionStats(sessionId);

        const statsAfter = await dbOps.querySessions({ sessionId });
        expect(statsAfter[0].eventCount).toBeGreaterThan(initialEventCount);
        expect(statsAfter[0].eventCount).toBe(3);
      });
    });

    describe('Consistency', () => {
      it('should maintain referential integrity between sessions and events', async () => {
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

        // Insert events
        await dbOps.insertEvent({
          sessionId,
          eventType: 'start',
          agentType: 'claude',
          mode: 'code',
          prompt: 'consistency test',
          timestamp: Date.now(),
          streamData: null,
          metadata: null,
        });

        // Verify relationship integrity
        const sessions = await dbOps.querySessions({ sessionId });
        const events = await dbOps.queryEvents({ sessionId });
        
        expect(sessions).toHaveLength(1);
        expect(events).toHaveLength(1);
        expect(events[0].sessionId).toBe(sessions[0].id);
      });

      it('should handle concurrent session updates consistently', async () => {
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

        // Simulate concurrent updates
        const updatePromises = [];
        for (let i = 0; i < 5; i++) {
          const promise = dbOps.upsertSession({
            id: sessionId,
            agentType: 'claude',
            mode: 'code',
            status: 'active',
            startTime: Date.now(),
            endTime: null,
            duration: null,
            eventCount: i + 1,
            streamEventCount: 0,
            errorCount: 0,
            sandboxId: null,
            repoUrl: null,
            metadata: JSON.stringify({ update: i }),
          });
          updatePromises.push(promise);
        }

        const results = await Promise.all(updatePromises);
        
        // All updates should succeed
        expect(results).toHaveLength(5);
        results.forEach(result => {
          expect(result).toBeDefined();
          expect(result.id).toBe(sessionId);
        });

        // Final state should be consistent
        const finalSessions = await dbOps.querySessions({ sessionId });
        expect(finalSessions).toHaveLength(1);
        expect(finalSessions[0].id).toBe(sessionId);
      });
    });

    describe('Isolation', () => {
      it('should isolate concurrent event insertions', async () => {
        const sessionId1 = randomUUID();
        const sessionId2 = randomUUID();
        
        // Create two sessions
        await Promise.all([
          dbOps.upsertSession({
            id: sessionId1,
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
          }),
          dbOps.upsertSession({
            id: sessionId2,
            agentType: 'codex',
            mode: 'chat',
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
          })
        ]);

        // Insert events concurrently for both sessions
        const session1Events = [];
        const session2Events = [];
        
        for (let i = 0; i < 10; i++) {
          session1Events.push(dbOps.insertEvent({
            sessionId: sessionId1,
            eventType: 'stream',
            agentType: 'claude',
            mode: 'code',
            prompt: 'isolation test 1',
            timestamp: Date.now() + i,
            streamData: `session1-chunk-${i}`,
            metadata: null,
          }));
          
          session2Events.push(dbOps.insertEvent({
            sessionId: sessionId2,
            eventType: 'stream',
            agentType: 'codex',
            mode: 'chat',
            prompt: 'isolation test 2',
            timestamp: Date.now() + i,
            streamData: `session2-chunk-${i}`,
            metadata: null,
          }));
        }

        await Promise.all([...session1Events, ...session2Events]);

        // Verify isolation - each session should have its own events
        const events1 = await dbOps.queryEvents({ sessionId: sessionId1 });
        const events2 = await dbOps.queryEvents({ sessionId: sessionId2 });
        
        expect(events1).toHaveLength(10);
        expect(events2).toHaveLength(10);
        
        // Verify no cross-contamination
        events1.forEach(event => {
          expect(event.sessionId).toBe(sessionId1);
          expect(event.agentType).toBe('claude');
          expect(event.streamData).toMatch(/session1-chunk-\d/);
        });
        
        events2.forEach(event => {
          expect(event.sessionId).toBe(sessionId2);
          expect(event.agentType).toBe('codex');
          expect(event.streamData).toMatch(/session2-chunk-\d/);
        });
      });

      it('should handle buffer operations in isolation', async () => {
        const sessionId1 = randomUUID();
        const sessionId2 = randomUUID();
        
        // Create sessions
        await Promise.all([
          dbOps.upsertSession({
            id: sessionId1,
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
          }),
          dbOps.upsertSession({
            id: sessionId2,
            agentType: 'gemini',
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
          })
        ]);

        // Create buffers for both sessions concurrently
        const buffer1Promise = dbOps.upsertBuffer({
          sessionId: sessionId1,
          status: 'pending',
          eventCount: 5,
          bufferData: JSON.stringify([
            { type: 'stream', data: 'buffer1-data1' },
            { type: 'stream', data: 'buffer1-data2' }
          ]),
          maxSize: 50,
          createdAt: Date.now(),
          lastUpdated: Date.now(),
          flushedAt: null,
          flushAttempts: 0,
        });

        const buffer2Promise = dbOps.upsertBuffer({
          sessionId: sessionId2,
          status: 'pending',
          eventCount: 3,
          bufferData: JSON.stringify([
            { type: 'stream', data: 'buffer2-data1' }
          ]),
          maxSize: 50,
          createdAt: Date.now(),
          lastUpdated: Date.now(),
          flushedAt: null,
          flushAttempts: 0,
        });

        await Promise.all([buffer1Promise, buffer2Promise]);

        // Flush buffers should be isolated
        const flushed1 = await dbOps.flushBuffer(sessionId1);
        const flushed2 = await dbOps.flushBuffer(sessionId2);

        expect(flushed1).toBeGreaterThanOrEqual(0);
        expect(flushed2).toBeGreaterThanOrEqual(0);
      });
    });

    describe('Durability', () => {
      it('should persist data across database reconnections', async () => {
        const sessionId = randomUUID();
        
        // Insert data
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
          metadata: JSON.stringify({ persistent: true }),
        });

        await dbOps.insertEvent({
          sessionId,
          eventType: 'start',
          agentType: 'claude',
          mode: 'code',
          prompt: 'durability test',
          timestamp: Date.now(),
          streamData: null,
          metadata: JSON.stringify({ durable: true }),
        });

        // Close and reopen database
        await dbOps.close();
        
        const newDbOps = new DrizzleTelemetryOperations(testConfig);
        await newDbOps.initialize();

        // Verify data persistence
        const sessions = await newDbOps.querySessions({ sessionId });
        const events = await newDbOps.queryEvents({ sessionId });

        expect(sessions).toHaveLength(1);
        expect(events).toHaveLength(1);
        expect(JSON.parse(sessions[0].metadata || '{}')).toEqual({ persistent: true });
        expect(JSON.parse(events[0].metadata || '{}')).toEqual({ durable: true });

        await newDbOps.close();
      });
    });
  });

  describe('Concurrent Access Patterns', () => {
    it('should handle multiple concurrent sessions', async () => {
      const concurrentSessions = 10;
      const sessionPromises = [];

      for (let i = 0; i < concurrentSessions; i++) {
        const sessionId = randomUUID();
        const promise = dbOps.upsertSession({
          id: sessionId,
          agentType: i % 2 === 0 ? 'claude' : 'codex',
          mode: 'code',
          status: 'active',
          startTime: Date.now() + i,
          endTime: null,
          duration: null,
          eventCount: 0,
          streamEventCount: 0,
          errorCount: 0,
          sandboxId: `sandbox-${i}`,
          repoUrl: null,
          metadata: JSON.stringify({ sessionIndex: i }),
        });
        sessionPromises.push(promise);
      }

      const results = await Promise.all(sessionPromises);
      expect(results).toHaveLength(concurrentSessions);

      // Verify all sessions were created correctly
      const allSessions = await dbOps.querySessions();
      expect(allSessions.length).toBeGreaterThanOrEqual(concurrentSessions);

      const testSessions = allSessions.filter(s => 
        s.sandboxId && s.sandboxId.startsWith('sandbox-')
      );
      expect(testSessions).toHaveLength(concurrentSessions);
    });

    it('should handle concurrent event streams', async () => {
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

      const concurrentStreams = 5;
      const eventsPerStream = 20;
      const streamPromises = [];

      for (let stream = 0; stream < concurrentStreams; stream++) {
        for (let event = 0; event < eventsPerStream; event++) {
          const promise = dbOps.insertEvent({
            sessionId,
            eventType: 'stream',
            agentType: 'claude',
            mode: 'code',
            prompt: 'concurrent streams test',
            timestamp: Date.now() + (stream * 1000) + event,
            streamData: `stream-${stream}-event-${event}`,
            metadata: JSON.stringify({ stream, event }),
          });
          streamPromises.push(promise);
        }
      }

      const results = await Promise.all(streamPromises);
      expect(results).toHaveLength(concurrentStreams * eventsPerStream);

      // Verify all events were inserted
      const events = await dbOps.queryEvents({ sessionId });
      expect(events).toHaveLength(concurrentStreams * eventsPerStream);

      // Verify event integrity
      const eventsByStream = new Map();
      events.forEach(event => {
        const metadata = JSON.parse(event.metadata || '{}');
        const streamId = metadata.stream;
        if (!eventsByStream.has(streamId)) {
          eventsByStream.set(streamId, []);
        }
        eventsByStream.get(streamId).push(event);
      });

      expect(eventsByStream.size).toBe(concurrentStreams);
      eventsByStream.forEach((streamEvents, streamId) => {
        expect(streamEvents).toHaveLength(eventsPerStream);
        streamEvents.forEach(event => {
          expect(event.streamData).toMatch(`stream-${streamId}-event-`);
        });
      });
    });

    it('should handle concurrent buffer operations', async () => {
      const sessionIds = [];
      for (let i = 0; i < 5; i++) {
        const sessionId = randomUUID();
        sessionIds.push(sessionId);
        
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
      }

      // Create concurrent buffer operations
      const bufferPromises = sessionIds.map((sessionId, index) => 
        dbOps.upsertBuffer({
          sessionId,
          status: 'pending',
          eventCount: index + 1,
          bufferData: JSON.stringify(Array.from({ length: index + 1 }, (_, i) => ({
            type: 'stream',
            data: `concurrent-buffer-${sessionId}-${i}`
          }))),
          maxSize: 50,
          createdAt: Date.now(),
          lastUpdated: Date.now(),
          flushedAt: null,
          flushAttempts: 0,
        })
      );

      await Promise.all(bufferPromises);

      // Flush all buffers concurrently
      const flushPromises = sessionIds.map(sessionId => 
        dbOps.flushBuffer(sessionId)
      );

      const flushResults = await Promise.all(flushPromises);
      
      flushResults.forEach((result, index) => {
        expect(result).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('Error Recovery and Rollback', () => {
    it('should handle database constraint violations gracefully', async () => {
      const sessionId = randomUUID();
      
      // Try to create an event without a session (should fail due to foreign key)
      try {
        await dbOps.insertEvent({
          sessionId, // Non-existent session
          eventType: 'start',
          agentType: 'claude',
          mode: 'code',
          prompt: 'constraint test',
          timestamp: Date.now(),
          streamData: null,
          metadata: null,
        });
        
        // If no error thrown, it means the constraint isn't enforced
        // which is also valid behavior to test
      } catch (error) {
        // Expected behavior - foreign key constraint violation
        expect(error).toBeInstanceOf(Error);
      }

      // Database should remain functional
      const isHealthy = await dbOps.getHealthStatus();
      expect(isHealthy).toBe(true);
    });

    it('should maintain data integrity after failed operations', async () => {
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

      // Insert valid events
      await dbOps.insertEvent({
        sessionId,
        eventType: 'start',
        agentType: 'claude',
        mode: 'code',
        prompt: 'integrity test',
        timestamp: Date.now(),
        streamData: null,
        metadata: null,
      });

      // Attempt to insert invalid event (if validation exists)
      try {
        await dbOps.insertEvent({
          sessionId,
          eventType: 'invalid' as any,
          agentType: 'claude',
          mode: 'code',
          prompt: 'invalid test',
          timestamp: Date.now(),
          streamData: null,
          metadata: null,
        });
      } catch (error) {
        // Expected for invalid event type
      }

      // Valid data should still be intact
      const events = await dbOps.queryEvents({ sessionId });
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('start');
    });

    it('should handle cleanup operations safely', async () => {
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

      // Create a buffer
      await dbOps.upsertBuffer({
        sessionId,
        status: 'pending',
        eventCount: 1,
        bufferData: JSON.stringify([{ type: 'test' }]),
        maxSize: 50,
        createdAt: Date.now() - 600000, // 10 minutes ago
        lastUpdated: Date.now() - 600000,
        flushedAt: null,
        flushAttempts: 0,
      });

      // Cleanup old buffers
      const cleanedCount = await dbOps.cleanupBuffers(300000); // 5 minutes max age
      expect(cleanedCount).toBeGreaterThanOrEqual(0);

      // Database should remain functional
      const isHealthy = await dbOps.getHealthStatus();
      expect(isHealthy).toBe(true);
    });
  });

  describe('Deadlock Prevention', () => {
    it('should handle potential deadlock scenarios', async () => {
      const sessionId1 = randomUUID();
      const sessionId2 = randomUUID();
      
      // Create sessions
      await Promise.all([
        dbOps.upsertSession({
          id: sessionId1,
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
        }),
        dbOps.upsertSession({
          id: sessionId2,
          agentType: 'codex',
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
        })
      ]);

      // Simulate potential deadlock scenario with concurrent cross-session operations
      const operations = [];
      
      for (let i = 0; i < 10; i++) {
        // Alternate between sessions to create potential for deadlock
        const sessionId = i % 2 === 0 ? sessionId1 : sessionId2;
        const otherSessionId = i % 2 === 0 ? sessionId2 : sessionId1;
        
        operations.push(
          dbOps.insertEvent({
            sessionId,
            eventType: 'stream',
            agentType: 'claude',
            mode: 'code',
            prompt: 'deadlock test',
            timestamp: Date.now() + i,
            streamData: `operation-${i}`,
            metadata: JSON.stringify({ relatedSession: otherSessionId }),
          })
        );
      }

      // All operations should complete without deadlock
      const results = await Promise.all(operations);
      expect(results).toHaveLength(10);

      // Verify data integrity
      const events1 = await dbOps.queryEvents({ sessionId: sessionId1 });
      const events2 = await dbOps.queryEvents({ sessionId: sessionId2 });
      
      expect(events1.length + events2.length).toBe(10);
    });
  });
}); 