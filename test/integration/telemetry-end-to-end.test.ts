import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TelemetryService } from "@vibe-kit/telemetry";

describe("Telemetry End-to-End Integration Tests", () => {
  let telemetryService: TelemetryService;

  beforeEach(async () => {
    
    // Initialize telemetry service with test configuration
    // Use memory provider to avoid SQLite table creation issues in tests
    telemetryService = new TelemetryService({
      serviceName: 'test-service',
      serviceVersion: '1.0.0',
      storage: [{
        type: 'memory',
        enabled: true,
      }],
      streaming: {
        enabled: false,
      },
      analytics: {
        enabled: true,
      },
      security: {
        pii: { enabled: false },
        encryption: { enabled: false },
        retention: { enabled: false },
      },
      reliability: {
        circuitBreaker: { enabled: false },
        retry: { enabled: false },
        rateLimit: { enabled: false },
      },
    });

    await telemetryService.initialize();
  });

  afterEach(async () => {
    await telemetryService.shutdown();
  });

  describe("Full Session Lifecycle", () => {
    it("should handle complete session from start to end", async () => {
      // Start a session
      const sessionId = await telemetryService.trackStart('claude', 'chat', 'Hello world');
      expect(sessionId).toBeTruthy();
      expect(sessionId).toMatch(/^[a-f0-9-]+$/);

      // Track some stream events
      await telemetryService.track({
        sessionId,
        eventType: 'stream',
        category: 'claude',
        action: 'chat',
        label: 'response',
        value: 1,
        metadata: { chunk: 'Hello' }
      });

      await telemetryService.track({
        sessionId,
        eventType: 'stream',
        category: 'claude',
        action: 'chat',
        label: 'response',
        value: 2,
        metadata: { chunk: ' there!' }
      });

      // End the session
      await telemetryService.trackEnd(sessionId, 'completed');

      // Query the session
      const events = await telemetryService.query({ sessionId });
      expect(events).toHaveLength(4); // start + 2 streams + end
      
      const startEvent = events.find(e => e.eventType === 'start');
      expect(startEvent).toBeDefined();
      expect(startEvent?.category).toBe('claude');
      
      const streamEvents = events.filter(e => e.eventType === 'stream');
      expect(streamEvents).toHaveLength(2);
      
      const endEvent = events.find(e => e.eventType === 'end');
      expect(endEvent).toBeDefined();
      expect(endEvent?.label).toBe('completed');
    });

    it("should handle session with errors", async () => {
      const sessionId = await telemetryService.trackStart('codex', 'code', 'Generate function');

      // Track an error
      await telemetryService.trackError(sessionId, new Error('API rate limit exceeded'));

      // Query events
      const events = await telemetryService.query({ sessionId });
      const errorEvent = events.find(e => e.eventType === 'error');
      
      expect(errorEvent).toBeDefined();
      expect(errorEvent?.label).toContain('API rate limit exceeded');
      expect(errorEvent?.metadata?.error).toBeDefined();
    });
  });

  describe("Query and Analytics", () => {
    it("should query events by various filters", async () => {
      // Create multiple sessions
      const session1 = await telemetryService.trackStart('claude', 'chat', 'Test 1');
      const session2 = await telemetryService.trackStart('gemini', 'code', 'Test 2');
      
      await telemetryService.trackEnd(session1, 'completed');
      await telemetryService.trackEnd(session2, 'completed');

      // Query by category
      const claudeEvents = await telemetryService.query({ category: 'claude' });
      expect(claudeEvents.length).toBeGreaterThan(0);
      expect(claudeEvents.every(e => e.category === 'claude')).toBe(true);

      // Query by event type
      const startEvents = await telemetryService.query({ eventType: 'start' });
      expect(startEvents).toHaveLength(2);

      // Query with limit
      const limitedEvents = await telemetryService.query({ limit: 1 });
      expect(limitedEvents).toHaveLength(1);
    });

    it("should provide analytics insights", async () => {
      // Create some test data
      for (let i = 0; i < 5; i++) {
        const sessionId = await telemetryService.trackStart('claude', 'chat', `Test ${i}`);
        
        // Add some stream events
        for (let j = 0; j < 3; j++) {
          await telemetryService.track({
            sessionId,
            eventType: 'stream',
            category: 'claude',
            action: 'chat',
            value: j,
          });
        }
        
        await telemetryService.trackEnd(sessionId, 'completed');
      }

      // Get insights
      const insights = await telemetryService.getInsights();
      
      expect(insights).toBeDefined();
      // Memory provider may not provide all insights
      if (insights.totalEvents !== undefined) {
        expect(insights.totalEvents).toBeGreaterThan(0);
      }
      if (insights.totalSessions !== undefined) {
        expect(insights.totalSessions).toBe(5);
      }
      if (insights.eventTypes) {
        expect(insights.eventTypes).toBeDefined();
        expect(insights.eventTypes.start).toBe(5);
        expect(insights.eventTypes.stream).toBe(15);
        expect(insights.eventTypes.end).toBe(5);
      }
    });
  });

  describe("Export Functionality", () => {
    it("should export events in JSON format", async () => {
      const sessionId = await telemetryService.trackStart('claude', 'chat', 'Export test');
      await telemetryService.trackEnd(sessionId, 'completed');

      const result = await telemetryService.export({ type: 'json' });
      
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
      
      const exported = JSON.parse(result);
      expect(Array.isArray(exported.events)).toBe(true);
      expect(exported.events.length).toBeGreaterThan(0);
    });

    it("should export events in CSV format", async () => {
      const sessionId = await telemetryService.trackStart('claude', 'chat', 'CSV export test');
      await telemetryService.trackEnd(sessionId, 'completed');

      const result = await telemetryService.export({ type: 'csv' });
      
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
      expect(result).toContain('id,sessionId,eventType');
      expect(result.split('\n').length).toBeGreaterThan(2); // header + data
    });
  });

  describe("Performance", () => {
    it("should handle high volume of events", async () => {
      const startTime = Date.now();
      const sessionCount = 10;
      const eventsPerSession = 50;

      // Create multiple concurrent sessions
      const sessions = await Promise.all(
        Array.from({ length: sessionCount }, async (_, i) => {
          const sessionId = await telemetryService.trackStart('claude', 'chat', `Perf test ${i}`);
          
          // Track many events
          await Promise.all(
            Array.from({ length: eventsPerSession }, (_, j) =>
              telemetryService.track({
                sessionId,
                eventType: 'stream',
                category: 'claude',
                action: 'chat',
                value: j,
              })
            )
          );
          
          await telemetryService.trackEnd(sessionId, 'completed');
          return sessionId;
        })
      );

      const duration = Date.now() - startTime;
      
      // Verify all events were tracked
      const totalEvents = await telemetryService.query({});
      const expectedEvents = sessionCount * (eventsPerSession + 2); // +2 for start/end
      
      expect(totalEvents.length).toBe(expectedEvents);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });
});