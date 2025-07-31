import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TelemetryService } from "@vibe-kit/telemetry";
import { initializeTelemetryDB, closeTelemetryDB, getTelemetryDB } from "@vibe-kit/db";
import { tmpdir } from "os";
import { join } from "path";
import { rm, mkdir } from "fs/promises";
import { existsSync } from "fs";

describe("Telemetry + DB Integration", () => {
  let telemetryService: TelemetryService;
  let tempDir: string;
  let dbPath: string;

  beforeEach(async () => {
    // Create a temporary directory for test database
    tempDir = join(tmpdir(), `telemetry-db-test-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });
    dbPath = join(tempDir, 'test-telemetry.db');
    
    // Initialize telemetry with SQLite storage
    telemetryService = new TelemetryService({
      serviceName: 'telemetry-db-test',
      serviceVersion: '1.0.0',
      storage: [{
        type: 'sqlite',
        enabled: true,
        options: {
          path: dbPath,
          streamBatchSize: 10,
          streamFlushInterval: 100,
        }
      }],
      analytics: {
        enabled: true
      }
    });
    
    await telemetryService.initialize();
  });

  afterEach(async () => {
    await telemetryService.shutdown();
    await closeTelemetryDB();
    
    // Clean up temp directory
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("Database Persistence", () => {
    it("should persist events to SQLite database", async () => {
      // Create events
      const sessionId = await telemetryService.trackStart('claude', 'chat', 'Test prompt');
      await telemetryService.track({
        sessionId,
        eventType: 'stream',
        category: 'claude',
        action: 'chat',
        metadata: { chunk: 'Hello world' }
      });
      await telemetryService.trackEnd(sessionId, 'completed');
      
      // Verify database file exists
      expect(existsSync(dbPath)).toBe(true);
      
      // Query events
      const events = await telemetryService.query({ sessionId });
      expect(events).toHaveLength(3);
      
      // Shutdown and recreate service to test persistence
      await telemetryService.shutdown();
      
      // Create new service instance with same database
      const newService = new TelemetryService({
        serviceName: 'telemetry-db-test',
        serviceVersion: '1.0.0',
        storage: [{
          type: 'sqlite',
          enabled: true,
          options: {
            path: dbPath,
          }
        }]
      });
      await newService.initialize();
      
      // Events should still be there
      const persistedEvents = await newService.query({ sessionId });
      expect(persistedEvents).toHaveLength(3);
      expect(persistedEvents[0].id).toBe(events[0].id);
      
      await newService.shutdown();
    });

    it("should handle concurrent writes correctly", async () => {
      const sessionIds: string[] = [];
      const promises: Promise<void>[] = [];
      
      // Create multiple concurrent sessions
      for (let i = 0; i < 10; i++) {
        promises.push((async () => {
          const sessionId = await telemetryService.trackStart('claude', 'chat', `Concurrent ${i}`);
          sessionIds.push(sessionId);
          
          // Write multiple events concurrently
          const eventPromises = [];
          for (let j = 0; j < 5; j++) {
            eventPromises.push(telemetryService.track({
              sessionId,
              eventType: 'stream',
              category: 'claude',
              action: 'chat',
              metadata: { index: j }
            }));
          }
          await Promise.all(eventPromises);
          
          await telemetryService.trackEnd(sessionId, 'completed');
        })());
      }
      
      await Promise.all(promises);
      
      // Verify all events were written
      for (const sessionId of sessionIds) {
        const events = await telemetryService.query({ sessionId });
        expect(events).toHaveLength(7); // start + 5 streams + end
      }
      
      // Verify total event count
      const allEvents = await telemetryService.query({});
      expect(allEvents.length).toBe(70); // 10 sessions * 7 events
    });
  });

  describe("Query Performance", () => {
    it("should efficiently query large datasets", async () => {
      // Generate a large dataset
      const sessionCount = 100;
      const eventsPerSession = 20;
      
      console.log('Generating test data...');
      for (let i = 0; i < sessionCount; i++) {
        const sessionId = await telemetryService.trackStart(
          i % 2 === 0 ? 'claude' : 'gemini',
          i % 3 === 0 ? 'chat' : 'code',
          `Session ${i}`
        );
        
        for (let j = 0; j < eventsPerSession; j++) {
          await telemetryService.track({
            sessionId,
            eventType: 'stream',
            category: i % 2 === 0 ? 'claude' : 'gemini',
            action: i % 3 === 0 ? 'chat' : 'code',
            value: j,
            metadata: { index: j }
          });
        }
        
        await telemetryService.trackEnd(sessionId, 'completed');
      }
      
      // Test query performance
      const startTime = Date.now();
      
      // Query by category
      const claudeEvents = await telemetryService.query({ 
        category: 'claude',
        limit: 100 
      });
      
      const queryTime = Date.now() - startTime;
      console.log(`Query time for category filter: ${queryTime}ms`);
      
      expect(claudeEvents.length).toBeLessThanOrEqual(100);
      expect(claudeEvents.every(e => e.category === 'claude')).toBe(true);
      expect(queryTime).toBeLessThan(100); // Should be fast
      
      // Test complex query
      const complexStartTime = Date.now();
      const complexQuery = await telemetryService.query({
        category: 'gemini',
        action: 'code',
        eventType: 'stream',
        limit: 50
      });
      
      const complexQueryTime = Date.now() - complexStartTime;
      console.log(`Query time for complex filter: ${complexQueryTime}ms`);
      
      expect(complexQuery.length).toBeLessThanOrEqual(50);
      expect(complexQuery.every(e => 
        e.category === 'gemini' && 
        e.action === 'code' && 
        e.eventType === 'stream'
      )).toBe(true);
      expect(complexQueryTime).toBeLessThan(200);
    });
  });

  describe("Batch Operations", () => {
    it("should efficiently handle batch inserts", async () => {
      const sessionId = await telemetryService.trackStart('claude', 'chat', 'Batch test');
      
      // Track time for batch insert
      const batchSize = 100;
      const events = [];
      
      for (let i = 0; i < batchSize; i++) {
        events.push({
          sessionId,
          eventType: 'stream' as const,
          category: 'claude',
          action: 'chat',
          value: i,
          metadata: { batch: true, index: i }
        });
      }
      
      const startTime = Date.now();
      
      // Insert all events
      await Promise.all(events.map(e => telemetryService.track(e)));
      
      const batchTime = Date.now() - startTime;
      console.log(`Batch insert time for ${batchSize} events: ${batchTime}ms`);
      
      // Verify all events were inserted
      const storedEvents = await telemetryService.query({ sessionId });
      expect(storedEvents.length).toBe(batchSize + 1); // +1 for start event
      
      await telemetryService.trackEnd(sessionId, 'completed');
    });
  });

  describe("Database Migration Compatibility", () => {
    it("should work with @vibe-kit/db migrations", async () => {
      // Initialize DB directly
      const db = await initializeTelemetryDB({
        dbPath,
        streamBatchSize: 50,
        streamFlushIntervalMs: 100,
      });
      
      // Verify tables exist
      const tables = db.getDb().prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
      const tableNames = tables.map((t: any) => t.name);
      
      expect(tableNames).toContain('telemetry_sessions');
      expect(tableNames).toContain('telemetry_events');
      
      // Use telemetry service with existing DB
      const sessionId = await telemetryService.trackStart('claude', 'chat', 'Migration test');
      await telemetryService.trackEnd(sessionId, 'completed');
      
      // Verify data through direct DB access
      const operations = db.getOperations();
      const events = await operations.queryEvents({ sessionId });
      
      expect(events).toHaveLength(2);
      expect(events[0].sessionId).toBe(sessionId);
    });
  });

  describe("Analytics Integration", () => {
    it("should generate accurate analytics from DB data", async () => {
      // Generate diverse data
      const agentTypes = ['claude', 'gemini', 'grok'];
      const modes = ['chat', 'code', 'analyze'];
      
      for (let i = 0; i < 30; i++) {
        const agentType = agentTypes[i % agentTypes.length];
        const mode = modes[i % modes.length];
        
        const sessionId = await telemetryService.trackStart(agentType, mode, `Test ${i}`);
        
        // Add varying numbers of events
        const eventCount = Math.floor(Math.random() * 10) + 1;
        for (let j = 0; j < eventCount; j++) {
          await telemetryService.track({
            sessionId,
            eventType: 'stream',
            category: agentType,
            action: mode,
            value: j
          });
        }
        
        // Some sessions fail
        const status = i % 5 === 0 ? 'failed' : 'completed';
        if (i % 5 === 0) {
          await telemetryService.trackError(sessionId, new Error('Test error'));
        }
        await telemetryService.trackEnd(sessionId, status);
      }
      
      // Get metrics
      const metrics = await telemetryService.getMetrics();
      
      expect(metrics.events.total).toBeGreaterThan(90); // At least 30 * 3 events
      expect(metrics.events.byCategory.claude).toBeGreaterThan(0);
      expect(metrics.events.byCategory.gemini).toBeGreaterThan(0);
      expect(metrics.events.byCategory.grok).toBeGreaterThan(0);
      expect(metrics.performance.errorRate).toBeGreaterThan(0);
      
      // Get insights
      const insights = await telemetryService.getInsights();
      
      expect(insights.metrics).toBeDefined();
      expect(insights.metrics.sessions.completed).toBeGreaterThan(0);
      expect(insights.metrics.sessions.errored).toBeGreaterThan(0);
    });
  });

  describe("Export from Database", () => {
    it("should export DB data in multiple formats", async () => {
      // Create test data
      for (let i = 0; i < 5; i++) {
        const sessionId = await telemetryService.trackStart('claude', 'chat', `Export test ${i}`);
        await telemetryService.track({
          sessionId,
          eventType: 'stream',
          category: 'claude',
          action: 'chat',
          metadata: { message: `Message ${i}` }
        });
        await telemetryService.trackEnd(sessionId, 'completed');
      }
      
      // Export as JSON
      const jsonExport = await telemetryService.export({ type: 'json' });
      const jsonData = JSON.parse(jsonExport);
      
      expect(jsonData.events).toBeDefined();
      expect(jsonData.events.length).toBe(15); // 5 sessions * 3 events
      expect(jsonData.metadata).toBeDefined();
      expect(jsonData.metadata.exportedAt).toBeDefined();
      
      // Export as CSV
      const csvExport = await telemetryService.export({ type: 'csv' });
      const csvLines = csvExport.split('\n');
      
      expect(csvLines[0]).toContain('id,sessionId,eventType'); // Header
      expect(csvLines.length).toBeGreaterThan(15); // Data rows + header
      
      // Export with filters
      const filteredExport = await telemetryService.export(
        { type: 'json' },
        { eventType: 'stream' }
      );
      const filteredData = JSON.parse(filteredExport);
      
      expect(filteredData.events.length).toBe(5);
      expect(filteredData.events.every((e: any) => e.eventType === 'stream')).toBe(true);
    });
  });
});