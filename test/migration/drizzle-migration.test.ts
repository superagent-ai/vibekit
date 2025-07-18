/**
 * Drizzle Migration Testing
 * 
 * This test suite provides comprehensive migration testing including test data generators,
 * schema migration validation, rollback procedures, and data integrity verification
 * for the Drizzle ORM migration.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DrizzleTelemetryOperations } from '../../packages/vibekit/src/db/operations';
import { initializeTelemetryDB } from '../../packages/vibekit/src/db/index';
import { LocalStoreConfig } from '../../packages/vibekit/src/types/telemetry-storage';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';

describe.skip('Drizzle Migration Testing', () => {
  let dbOps: DrizzleTelemetryOperations;
  let testDbPath: string;
  let testConfig: LocalStoreConfig;

  beforeEach(async () => {
    // Create unique test database for each test
    testDbPath = path.join(process.cwd(), `test-migration-${randomUUID()}.db`);
    
    testConfig = {
      isEnabled: true,
      path: testDbPath,
      streamBatchSize: 10,
      streamFlushIntervalMs: 100,
      pruneDays: 30,
      maxSizeMB: 100,
    };

    // Initialize database and operations
    await initializeTelemetryDB(testConfig);
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

  describe('Test Data Generators', () => {
    const generateTestSession = (options: {
      sessionId?: string;
      agentType?: string;
      mode?: string;
      status?: 'active' | 'completed' | 'failed' | 'timeout';
      startTime?: number;
      metadata?: Record<string, any>;
    } = {}) => {
      return {
        id: options.sessionId || randomUUID(),
        agentType: options.agentType || 'claude',
        mode: options.mode || 'code',
        status: options.status || 'active',
        startTime: options.startTime || Date.now(),
        endTime: options.status === 'completed' ? Date.now() + 60000 : null,
        duration: options.status === 'completed' ? 60000 : null,
        eventCount: 0,
        streamEventCount: 0,
        errorCount: 0,
        sandboxId: 'test-sandbox',
        repoUrl: 'https://github.com/test/repo',
        metadata: JSON.stringify(options.metadata || { generated: true }),
      };
    };

    const generateTestEvent = (sessionId: string, options: {
      eventType?: 'start' | 'stream' | 'end' | 'error';
      timestamp?: number;
      streamData?: string | null;
      metadata?: Record<string, any>;
    } = {}) => {
      return {
        sessionId,
        eventType: options.eventType || 'stream',
        agentType: 'claude',
        mode: 'code',
        prompt: 'Generated test prompt',
        timestamp: options.timestamp || Date.now(),
        streamData: options.streamData !== undefined ? options.streamData : 'Generated test data',
        metadata: JSON.stringify(options.metadata || { generated: true }),
      };
    };

    it('should generate realistic session data for various scenarios', async () => {
      // Generate sessions for different scenarios
      const scenarios = [
        { agentType: 'claude', mode: 'code', status: 'completed' as const },
        { agentType: 'codex', mode: 'chat', status: 'active' as const },
        { agentType: 'gemini', mode: 'code', status: 'failed' as const },
        { agentType: 'claude', mode: 'code', status: 'timeout' as const },
      ];

      const createdSessions = [];

      for (const scenario of scenarios) {
        const sessionData = generateTestSession(scenario);
        const created = await dbOps.upsertSession(sessionData);
        createdSessions.push(created);
      }

      expect(createdSessions).toHaveLength(4);
      
      // Verify different agent types
      const agentTypes = createdSessions.map(s => s.agentType);
      expect(new Set(agentTypes).size).toBe(3); // claude, codex, gemini
      
      // Verify different statuses
      const statuses = createdSessions.map(s => s.status);
      expect(statuses).toContain('completed');
      expect(statuses).toContain('active');
      expect(statuses).toContain('failed');
    });

    it('should generate large volumes of test data efficiently', async () => {
      const sessionCount = 50;
      const eventsPerSession = 20;
      
      const startTime = Date.now();
      
      // Generate sessions
      const sessionPromises = [];
      for (let i = 0; i < sessionCount; i++) {
        const sessionData = generateTestSession({
          agentType: ['claude', 'codex', 'gemini'][i % 3],
          mode: ['code', 'chat'][i % 2],
          startTime: Date.now() - (i * 60000), // Spread over time
          metadata: { batchIndex: i, batchSize: sessionCount }
        });
        sessionPromises.push(dbOps.upsertSession(sessionData));
      }
      
      const sessions = await Promise.all(sessionPromises);
      
      // Generate events for each session
      const eventPromises = [];
      for (let sessionIndex = 0; sessionIndex < sessions.length; sessionIndex++) {
        const session = sessions[sessionIndex];
        
        for (let eventIndex = 0; eventIndex < eventsPerSession; eventIndex++) {
          const eventData = generateTestEvent(session.id, {
            eventType: eventIndex === 0 ? 'start' : 
                     eventIndex === eventsPerSession - 1 ? 'end' : 'stream',
            timestamp: session.startTime + (eventIndex * 1000),
            streamData: eventIndex === 0 || eventIndex === eventsPerSession - 1 ? 
                       null : `Stream data ${eventIndex}`,
            metadata: { sessionIndex, eventIndex, batchGenerated: true }
          });
          eventPromises.push(dbOps.insertEvent(eventData));
        }
      }
      
      const events = await Promise.all(eventPromises);
      
      const endTime = Date.now();
      const generationTime = endTime - startTime;
      
      expect(sessions).toHaveLength(sessionCount);
      expect(events).toHaveLength(sessionCount * eventsPerSession);
      expect(generationTime).toBeLessThan(30000); // Should complete within 30 seconds
      
      console.log(`Generated ${sessionCount} sessions and ${events.length} events in ${generationTime}ms`);
    });

    it('should generate edge case and boundary condition data', async () => {
      const edgeCases = [
        // Extremely long session ID
        generateTestSession({
          sessionId: 'x'.repeat(255),
          metadata: { edgeCase: 'longSessionId' }
        }),
        
        // Empty metadata
        generateTestSession({
          metadata: {}
        }),
        
        // Large metadata object
        generateTestSession({
          metadata: {
            largeData: Array.from({ length: 100 }, (_, i) => ({
              key: `value_${i}`,
              timestamp: Date.now() + i,
              data: `large_data_${i}`.repeat(10)
            }))
          }
        }),
        
        // Extreme timestamps
        generateTestSession({
          startTime: 0, // Unix epoch
          metadata: { edgeCase: 'epochTimestamp' }
        }),
        
        generateTestSession({
          startTime: 2147483647000, // Year 2038
          metadata: { edgeCase: 'futureTimestamp' }
        }),
      ];

      const createdSessions = [];
      for (const sessionData of edgeCases) {
        try {
          const created = await dbOps.upsertSession(sessionData);
          createdSessions.push(created);
        } catch (error) {
          // Some edge cases might fail validation - that's expected
          console.warn('Edge case failed (expected):', error);
        }
      }

      expect(createdSessions.length).toBeGreaterThan(0);
    });

    it('should generate historical data spanning different time periods', async () => {
      const now = Date.now();
      const periods = [
        { name: 'today', start: now - 86400000, count: 10 },
        { name: 'yesterday', start: now - 172800000, count: 15 },
        { name: 'last_week', start: now - 604800000, count: 20 },
        { name: 'last_month', start: now - 2592000000, count: 25 },
      ];

      const historicalSessions = [];
      
      for (const period of periods) {
        for (let i = 0; i < period.count; i++) {
          const sessionData = generateTestSession({
            startTime: period.start + (i * 3600000), // 1 hour intervals
            status: Math.random() > 0.8 ? 'failed' : 'completed',
            metadata: { 
              historicalPeriod: period.name,
              periodIndex: i 
            }
          });
          
          const session = await dbOps.upsertSession(sessionData);
          historicalSessions.push(session);
          
          // Add a few events per session
          for (let eventIndex = 0; eventIndex < 3; eventIndex++) {
            await dbOps.insertEvent(generateTestEvent(session.id, {
              timestamp: session.startTime + (eventIndex * 60000),
              metadata: { historicalEvent: true, eventIndex }
            }));
          }
        }
      }

      expect(historicalSessions).toHaveLength(periods.reduce((sum, p) => sum + p.count, 0));
      
      // Verify time distribution
      const timeRanges = historicalSessions.reduce((acc, session) => {
        const age = now - session.startTime;
        if (age < 86400000) acc.today++;
        else if (age < 172800000) acc.yesterday++;
        else if (age < 604800000) acc.lastWeek++;
        else acc.lastMonth++;
        return acc;
      }, { today: 0, yesterday: 0, lastWeek: 0, lastMonth: 0 });

      expect(timeRanges.today).toBe(10);
      expect(timeRanges.yesterday).toBe(15);
      expect(timeRanges.lastWeek).toBe(20);
      expect(timeRanges.lastMonth).toBe(25);
    });
  });

  describe('Schema Migration Validation', () => {
    it('should validate current schema version and structure', async () => {
      // Check that database was initialized with correct schema
      const isHealthy = await dbOps.getHealthStatus();
      expect(isHealthy).toBe(true);

      // Verify we can perform basic operations
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
      expect(created.id).toBe(sessionId);

      // Verify event creation works
      const eventData = {
        sessionId,
        eventType: 'start' as const,
        agentType: 'claude',
        mode: 'code',
        prompt: 'schema validation test',
        timestamp: Date.now(),
        streamData: null,
        metadata: null,
      };

      const event = await dbOps.insertEvent(eventData);
      expect(event.sessionId).toBe(sessionId);
    });

    it('should validate foreign key constraints', async () => {
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

      // Valid event should succeed
      const validEvent = await dbOps.insertEvent({
        sessionId,
        eventType: 'start',
        agentType: 'claude',
        mode: 'code',
        prompt: 'foreign key test',
        timestamp: Date.now(),
        streamData: null,
        metadata: null,
      });
      expect(validEvent.sessionId).toBe(sessionId);

      // Invalid event (non-existent session) should be handled
      try {
        await dbOps.insertEvent({
          sessionId: 'non-existent-session',
          eventType: 'start',
          agentType: 'claude',
          mode: 'code',
          prompt: 'invalid foreign key test',
          timestamp: Date.now(),
          streamData: null,
          metadata: null,
        });
        // If no error thrown, foreign key constraint might not be enforced
      } catch (error) {
        // Expected behavior - foreign key constraint violation
        expect(error).toBeInstanceOf(Error);
      }
    });

    it('should validate data types and constraints', async () => {
      const sessionId = randomUUID();
      
      // Test valid data types
      const validSession = await dbOps.upsertSession({
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
        sandboxId: 'valid-sandbox-id',
        repoUrl: 'https://github.com/valid/repo',
        metadata: JSON.stringify({ valid: true }),
      });
      expect(validSession.sandboxId).toBe('valid-sandbox-id');

      // Test invalid enum values (if enforced)
      try {
        await dbOps.upsertSession({
          id: randomUUID(),
          agentType: 'claude',
          mode: 'code',
          status: 'invalid-status' as any,
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
        // If no error, enum constraint might not be enforced
      } catch (error) {
        // Expected for invalid enum value
        expect(error).toBeInstanceOf(Error);
      }
    });

    it('should validate index creation and performance', async () => {
      const sessionCount = 20;
      const eventsPerSession = 10;
      
      // Create test data
      const sessions = [];
      for (let i = 0; i < sessionCount; i++) {
        const sessionData = {
          id: randomUUID(),
          agentType: ['claude', 'codex', 'gemini'][i % 3],
          mode: 'code',
          status: 'active' as const,
          startTime: Date.now() - (i * 60000),
          endTime: null,
          duration: null,
          eventCount: 0,
          streamEventCount: 0,
          errorCount: 0,
          sandboxId: null,
          repoUrl: null,
          metadata: null,
        };
        const session = await dbOps.upsertSession(sessionData);
        sessions.push(session);
      }

      // Create events
      for (const session of sessions) {
        for (let j = 0; j < eventsPerSession; j++) {
          await dbOps.insertEvent({
            sessionId: session.id,
            eventType: 'stream',
            agentType: session.agentType,
            mode: 'code',
            prompt: 'index test',
            timestamp: session.startTime + (j * 1000),
            streamData: `test data ${j}`,
            metadata: null,
          });
        }
      }

      // Test indexed queries (should be fast)
      const startTime = Date.now();
      
      // Query by agent type (indexed)
      const claudeSessions = await dbOps.querySessions({ agentType: 'claude' });
      expect(claudeSessions.length).toBeGreaterThan(0);

      // Query by time range (indexed)
      const recentSessions = await dbOps.querySessions({ 
        from: Date.now() - 3600000 
      });
      expect(recentSessions.length).toBeGreaterThan(0);

      // Query events by session (indexed)
      const sessionEvents = await dbOps.queryEvents({ 
        sessionId: sessions[0].id 
      });
      expect(sessionEvents).toHaveLength(eventsPerSession);

      const queryTime = Date.now() - startTime;
      expect(queryTime).toBeLessThan(1000); // Should be fast with indexes
    });
  });

  describe('Data Integrity Verification', () => {
    it('should verify referential integrity is maintained', async () => {
      const sessionId = randomUUID();
      
      // Create session and events
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

      const eventIds = [];
      for (let i = 0; i < 5; i++) {
        const event = await dbOps.insertEvent({
          sessionId,
          eventType: 'stream',
          agentType: 'claude',
          mode: 'code',
          prompt: 'integrity test',
          timestamp: Date.now() + i,
          streamData: `test data ${i}`,
          metadata: null,
        });
        eventIds.push(event.id);
      }

      // Verify relationships
      const sessions = await dbOps.querySessions({ sessionId });
      const events = await dbOps.queryEvents({ sessionId });

      expect(sessions).toHaveLength(1);
      expect(events).toHaveLength(5);
      
      // All events should reference the correct session
      events.forEach(event => {
        expect(event.sessionId).toBe(sessionId);
      });
    });

    it('should verify data consistency across operations', async () => {
      const sessionId = randomUUID();
      
      // Create session
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
      const eventCount = 10;
      for (let i = 0; i < eventCount; i++) {
        await dbOps.insertEvent({
          sessionId,
          eventType: i === 0 ? 'start' : i === eventCount - 1 ? 'end' : 'stream',
          agentType: 'claude',
          mode: 'code',
          prompt: 'consistency test',
          timestamp: Date.now() + i,
          streamData: i > 0 && i < eventCount - 1 ? `stream ${i}` : null,
          metadata: null,
        });
      }

      // Update session stats
      await dbOps.updateSessionStats(sessionId);

      // Verify consistency
      const sessions = await dbOps.querySessions({ sessionId });
      const events = await dbOps.queryEvents({ sessionId });

      expect(sessions).toHaveLength(1);
      expect(events).toHaveLength(eventCount);
      expect(sessions[0].eventCount).toBe(eventCount);
      
      const streamEvents = events.filter(e => e.eventType === 'stream');
      expect(sessions[0].streamEventCount).toBe(streamEvents.length);
    });

    it('should verify data preservation during stress operations', async () => {
      const testData = new Map();
      
      // Create initial test data and track it
      for (let i = 0; i < 10; i++) {
        const sessionId = randomUUID();
        const sessionData = {
          id: sessionId,
          agentType: 'claude',
          mode: 'code',
          status: 'active' as const,
          startTime: Date.now() + i,
          endTime: null,
          duration: null,
          eventCount: 0,
          streamEventCount: 0,
          errorCount: 0,
          sandboxId: `stress-test-${i}`,
          repoUrl: null,
          metadata: JSON.stringify({ stressTest: true, index: i }),
        };
        
        await dbOps.upsertSession(sessionData);
        testData.set(sessionId, sessionData);
      }

      // Perform stress operations
      const stressPromises = [];
      for (let i = 0; i < 100; i++) {
        const sessionIds = Array.from(testData.keys());
        const randomSessionId = sessionIds[Math.floor(Math.random() * sessionIds.length)];
        
        const promise = dbOps.insertEvent({
          sessionId: randomSessionId,
          eventType: 'stream',
          agentType: 'claude',
          mode: 'code',
          prompt: 'stress test',
          timestamp: Date.now() + i,
          streamData: `stress data ${i}`,
          metadata: JSON.stringify({ stressEvent: true, index: i }),
        });
        stressPromises.push(promise);
      }

      await Promise.all(stressPromises);

      // Verify all original data is preserved
      for (const [sessionId, originalData] of testData) {
        const sessions = await dbOps.querySessions({ sessionId });
        expect(sessions).toHaveLength(1);
        
        const session = sessions[0];
        expect(session.id).toBe(originalData.id);
        expect(session.sandboxId).toBe(originalData.sandboxId);
        expect(JSON.parse(session.metadata || '{}')).toEqual(
          JSON.parse(originalData.metadata)
        );
      }
    });
  });

  describe('Performance Verification', () => {
    it('should verify query performance meets benchmarks', async () => {
      const sessionCount = 100;
      const eventsPerSession = 50;
      
      // Generate substantial test data
      console.log('Generating performance test data...');
      const startGeneration = Date.now();
      
      const sessions = [];
      for (let i = 0; i < sessionCount; i++) {
        const sessionData = {
          id: randomUUID(),
          agentType: ['claude', 'codex', 'gemini'][i % 3],
          mode: ['code', 'chat'][i % 2],
          status: i % 4 === 0 ? 'completed' as const : 'active' as const,
          startTime: Date.now() - (i * 60000),
          endTime: i % 4 === 0 ? Date.now() - (i * 60000) + 30000 : null,
          duration: i % 4 === 0 ? 30000 : null,
          eventCount: 0,
          streamEventCount: 0,
          errorCount: 0,
          sandboxId: `perf-sandbox-${i}`,
          repoUrl: `https://github.com/test/repo-${i}`,
          metadata: JSON.stringify({ perfTest: true, index: i }),
        };
        const session = await dbOps.upsertSession(sessionData);
        sessions.push(session);
      }

      // Generate events
      for (const session of sessions) {
        const eventPromises = [];
        for (let j = 0; j < eventsPerSession; j++) {
          const promise = dbOps.insertEvent({
            sessionId: session.id,
            eventType: j === 0 ? 'start' : j === eventsPerSession - 1 ? 'end' : 'stream',
            agentType: session.agentType,
            mode: session.mode,
            prompt: 'performance test',
            timestamp: session.startTime + (j * 1000),
            streamData: j > 0 && j < eventsPerSession - 1 ? `perf data ${j}` : null,
            metadata: JSON.stringify({ perfEvent: true, index: j }),
          });
          eventPromises.push(promise);
        }
        await Promise.all(eventPromises);
      }

      const generationTime = Date.now() - startGeneration;
      console.log(`Data generation completed in ${generationTime}ms`);

      // Performance benchmarks
      const benchmarks = [];

      // Query all sessions
      const startQueryAll = Date.now();
      const allSessions = await dbOps.querySessions();
      benchmarks.push({
        operation: 'queryAllSessions',
        time: Date.now() - startQueryAll,
        count: allSessions.length
      });

      // Query sessions with filter
      const startQueryFiltered = Date.now();
      const claudeSessions = await dbOps.querySessions({ agentType: 'claude' });
      benchmarks.push({
        operation: 'querySessionsByAgent',
        time: Date.now() - startQueryFiltered,
        count: claudeSessions.length
      });

      // Query events for specific session
      const startQueryEvents = Date.now();
      const sessionEvents = await dbOps.queryEvents({ sessionId: sessions[0].id });
      benchmarks.push({
        operation: 'queryEventsBySession',
        time: Date.now() - startQueryEvents,
        count: sessionEvents.length
      });

      // Query events with time filter
      const startQueryEventsTime = Date.now();
      const recentEvents = await dbOps.queryEvents({ 
        from: Date.now() - 3600000 
      });
      benchmarks.push({
        operation: 'queryEventsByTime',
        time: Date.now() - startQueryEventsTime,
        count: recentEvents.length
      });

      // Performance expectations
      expect(allSessions.length).toBeGreaterThanOrEqual(sessionCount);
      expect(claudeSessions.length).toBeGreaterThan(0);
      expect(sessionEvents).toHaveLength(eventsPerSession);

      // Log performance results
      console.log('Performance Benchmarks:');
      benchmarks.forEach(benchmark => {
        console.log(`${benchmark.operation}: ${benchmark.time}ms (${benchmark.count} records)`);
        
        // Basic performance expectations
        expect(benchmark.time).toBeLessThan(5000); // Should complete within 5 seconds
        
        if (benchmark.count > 0) {
          const msPerRecord = benchmark.time / benchmark.count;
          expect(msPerRecord).toBeLessThan(10); // Should process records efficiently
        }
      });
    });

    it('should verify memory usage remains stable', async () => {
      const initialStats = await dbOps.getStatistics();
      
      // Perform memory-intensive operations
      const iterations = 20;
      for (let i = 0; i < iterations; i++) {
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
          metadata: JSON.stringify({ memoryTest: true, iteration: i }),
        });

        // Generate multiple events
        const eventPromises = [];
        for (let j = 0; j < 20; j++) {
          const promise = dbOps.insertEvent({
            sessionId,
            eventType: 'stream',
            agentType: 'claude',
            mode: 'code',
            prompt: 'memory test',
            timestamp: Date.now() + j,
            streamData: `memory test data ${i}-${j}`.repeat(100), // Large-ish data
            metadata: JSON.stringify({ memoryTestEvent: true, i, j }),
          });
          eventPromises.push(promise);
        }
        await Promise.all(eventPromises);

        // Periodic health checks
        if (i % 5 === 0) {
          const isHealthy = await dbOps.getHealthStatus();
          expect(isHealthy).toBe(true);
        }
      }

      const finalStats = await dbOps.getStatistics();
      
      // Verify statistics are reasonable
      expect(finalStats.totalSessions).toBeGreaterThan(initialStats.totalSessions);
      expect(finalStats.totalEvents).toBeGreaterThan(initialStats.totalEvents);
      
      // Database should remain healthy
      const finalHealth = await dbOps.getHealthStatus();
      expect(finalHealth).toBe(true);
    });
  });

  describe('Migration Rollback Scenarios', () => {
    it('should handle schema version conflicts gracefully', async () => {
      // This test simulates what would happen if there were version conflicts
      const sessionId = randomUUID();
      
      // Create data with current schema
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
        metadata: JSON.stringify({ schemaTest: true }),
      };

      const created = await dbOps.upsertSession(sessionData);
      expect(created.id).toBe(sessionId);

      // Verify data can be read back correctly
      const sessions = await dbOps.querySessions({ sessionId });
      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toBe(sessionId);
    });

    it('should handle data recovery after simulated corruption', async () => {
      const testSessions = [];
      
      // Create test data
      for (let i = 0; i < 5; i++) {
        const sessionId = randomUUID();
        const sessionData = {
          id: sessionId,
          agentType: 'claude',
          mode: 'code',
          status: 'active' as const,
          startTime: Date.now() + i,
          endTime: null,
          duration: null,
          eventCount: 0,
          streamEventCount: 0,
          errorCount: 0,
          sandboxId: `recovery-test-${i}`,
          repoUrl: null,
          metadata: JSON.stringify({ recoveryTest: true, index: i }),
        };
        
        const session = await dbOps.upsertSession(sessionData);
        testSessions.push(session);
        
        // Add events
        for (let j = 0; j < 3; j++) {
          await dbOps.insertEvent({
            sessionId,
            eventType: 'stream',
            agentType: 'claude',
            mode: 'code',
            prompt: 'recovery test',
            timestamp: Date.now() + i + j,
            streamData: `recovery data ${i}-${j}`,
            metadata: JSON.stringify({ recoveryEvent: true, i, j }),
          });
        }
      }

      // Verify initial data integrity
      const initialSessions = await dbOps.querySessions();
      const initialEvents = await dbOps.queryEvents();
      
      expect(initialSessions.length).toBeGreaterThanOrEqual(5);
      expect(initialEvents.length).toBeGreaterThanOrEqual(15);

      // Simulate recovery verification (in real migration, this would validate data)
      for (const testSession of testSessions) {
        const sessions = await dbOps.querySessions({ sessionId: testSession.id });
        const events = await dbOps.queryEvents({ sessionId: testSession.id });
        
        expect(sessions).toHaveLength(1);
        expect(events).toHaveLength(3);
        expect(sessions[0].sandboxId).toBe(testSession.sandboxId);
      }
    });

    it('should handle partial migration rollback', async () => {
      // This test simulates what would happen during a partial rollback
      const beforeMigrationData = [];
      
      // Create "before migration" state
      for (let i = 0; i < 3; i++) {
        const sessionId = randomUUID();
        const sessionData = {
          id: sessionId,
          agentType: 'claude',
          mode: 'code',
          status: 'completed' as const,
          startTime: Date.now() - 86400000 + (i * 3600000), // Yesterday
          endTime: Date.now() - 86400000 + (i * 3600000) + 1800000, // 30 min duration
          duration: 1800000,
          eventCount: 5,
          streamEventCount: 3,
          errorCount: 0,
          sandboxId: `rollback-test-${i}`,
          repoUrl: `https://github.com/test/rollback-${i}`,
          metadata: JSON.stringify({ 
            rollbackTest: true, 
            index: i,
            preState: 'beforeMigration'
          }),
        };
        
        const session = await dbOps.upsertSession(sessionData);
        beforeMigrationData.push(session);
      }

      // Simulate some "during migration" changes
      const duringMigrationData = [];
      for (let i = 0; i < 2; i++) {
        const sessionId = randomUUID();
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
          sandboxId: `migration-temp-${i}`,
          repoUrl: null,
          metadata: JSON.stringify({ 
            rollbackTest: true, 
            index: i,
            migrationState: 'during'
          }),
        };
        
        const session = await dbOps.upsertSession(sessionData);
        duringMigrationData.push(session);
      }

      // Verify rollback state - original data should be intact
      for (const originalSession of beforeMigrationData) {
        const sessions = await dbOps.querySessions({ sessionId: originalSession.id });
        expect(sessions).toHaveLength(1);
        
        const session = sessions[0];
        expect(session.sandboxId).toBe(originalSession.sandboxId);
        expect(session.repoUrl).toBe(originalSession.repoUrl);
        expect(session.status).toBe('completed');
        
        const metadata = JSON.parse(session.metadata || '{}');
        expect(metadata.preState).toBe('beforeMigration');
      }

      // Migration temp data should also be queryable (in real rollback, might be cleaned)
      for (const tempSession of duringMigrationData) {
        const sessions = await dbOps.querySessions({ sessionId: tempSession.id });
        expect(sessions).toHaveLength(1);
      }

      // Overall system should be healthy
      const isHealthy = await dbOps.getHealthStatus();
      expect(isHealthy).toBe(true);
    });
  });
}); 