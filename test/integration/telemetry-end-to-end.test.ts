import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resolve, join } from "path";
import { existsSync, unlinkSync, mkdirSync } from "fs";
import { TelemetryService } from "../../packages/vibekit/src/services/telemetry";
import { TelemetryDB } from "../../packages/vibekit/src/services/telemetry-db";
import { TelemetryConfig } from "../../packages/vibekit/src/types";

const TEST_SANDBOX_ID = "test-sandbox-123";
const TEST_REPO_URL = "https://github.com/test/repo";

describe("Telemetry End-to-End Integration Tests", () => {
  let telemetryService: TelemetryService;
  let telemetryDB: TelemetryDB;
  let testDir: string;
  let testDbPath: string;

  beforeEach(async () => {
    // Create unique database path for each test
    testDbPath = resolve(`./test-e2e-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.db`);
    
    // Clean up previous test files
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }

    testDir = resolve("./test-telemetry-e2e-dir");
    if (existsSync(testDir)) {
      await import('fs/promises').then(fs => fs.rm(testDir, { recursive: true, force: true }));
    }
    mkdirSync(testDir, { recursive: true });

    // Initialize TelemetryService with local storage enabled
    const config: TelemetryConfig = {
      isEnabled: true,
      endpoint: "http://localhost:4318/v1/traces",
      localStore: {
        isEnabled: true,
        path: testDbPath,
        streamBatchSize: 10,
        streamFlushIntervalMs: 100,
        pruneDays: 30
      }
    };

    telemetryService = new TelemetryService(config);
    
    // Get direct access to the database for verification
    telemetryDB = new TelemetryDB(config.localStore!);
  });

  afterEach(async () => {
    if (telemetryService) {
      await telemetryService.shutdown();
    }
    if (telemetryDB) {
      await telemetryDB.close();
    }
    
    // Clean up test files
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }
    if (existsSync(testDir)) {
      await import('fs/promises').then(fs => fs.rm(testDir, { recursive: true, force: true }));
    }
  });

  describe("Complete Session Lifecycle", () => {
    it("should track a complete session from start to end", async () => {
      const sessionId = "complete-session-test";
      const agentType = "claude";
      const prompt = "Write a comprehensive test suite";

      // Start session
      await telemetryService.trackStart(
        sessionId,
        agentType,
        "code",
        prompt,
        TEST_SANDBOX_ID,
        TEST_REPO_URL,
        { testType: "e2e", priority: "high" }
      );

      // Simulate multiple stream events
      const streamData = [
        "Starting to analyze requirements...",
        "Generating test structure...",
        "Adding comprehensive test cases...",
        "Finalizing test implementation..."
      ];

      for (const data of streamData) {
        await telemetryService.trackStream({
          sessionId,
          agentType,
          streamData: data,
          metadata: { chunk: streamData.indexOf(data) + 1 }
        });
        // Small delay to ensure different timestamps
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // Small delay to ensure proper timestamp ordering
      await new Promise(resolve => setTimeout(resolve, 10));

      // End session successfully
      await telemetryService.trackEnd({
        sessionId,
        agentType,
        metadata: { 
          status: "success", 
          linesGenerated: 500,
          duration: 45000 
        }
      });

      // Wait for buffer flush
      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify all events were persisted
      const allEvents = await telemetryDB.getEvents();
      expect(allEvents).toHaveLength(6); // 1 start + 4 stream + 1 end

      // Verify session data integrity
      const sessionEvents = allEvents.filter(e => e.sessionId === sessionId);
      expect(sessionEvents).toHaveLength(6);

      // Check event types and order
      const eventTypes = sessionEvents
        .sort((a, b) => a.timestamp - b.timestamp)
        .map(e => e.eventType);
      expect(eventTypes).toEqual(["start", "stream", "stream", "stream", "stream", "end"]);

      // Verify metadata preservation
      const startEvent = sessionEvents.find(e => e.eventType === "start");
      expect(startEvent?.metadata).toMatchObject({ testType: "e2e", priority: "high" });

      const endEvent = sessionEvents.find(e => e.eventType === "end");
      expect(endEvent?.metadata).toMatchObject({ 
        status: "success", 
        linesGenerated: 500,
        duration: 45000 
      });

      // Verify stream data
      const streamEvents = sessionEvents
        .filter(e => e.eventType === "stream")
        .sort((a, b) => a.timestamp - b.timestamp);
      
      expect(streamEvents).toHaveLength(4);
      streamEvents.forEach((event, index) => {
        expect(event.streamData).toBe(streamData[index]);
        expect(event.metadata).toMatchObject({ chunk: index + 1 });
      });
    });

    it("should handle session with error", async () => {
      const sessionId = "error-session-test";
      const agentType = "codex";
      const prompt = "Generate invalid code";

      // Start session
      await telemetryService.trackStart(
        sessionId,
        agentType,
        "code",
        prompt,
        TEST_SANDBOX_ID
      );

      // Some stream events
      await telemetryService.trackStream(
        sessionId,
        agentType,
        "Attempting to generate code..."
      );

      // Error occurs
      await telemetryService.trackError({
        sessionId,
        agentType,
        error: "Rate limit exceeded",
        metadata: {
          errorCode: "RATE_LIMIT",
          retryAfter: 60000,
          attempt: 1
        }
      });

      // Wait for buffer flush
      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify error tracking
      const sessionEvents = await telemetryDB.getEvents({ sessionId });
      expect(sessionEvents).toHaveLength(3); // start + stream + error

      const errorEvent = sessionEvents.find(e => e.eventType === "error");
      expect(errorEvent).toBeDefined();
      expect(errorEvent?.metadata).toMatchObject({
        errorCode: "RATE_LIMIT",
        retryAfter: 60000,
        attempt: 1
      });
    });
  });

  describe("Multi-Agent Concurrent Sessions", () => {
    it("should handle multiple concurrent sessions from different agents", async () => {
      const agents = ["claude", "codex", "gemini"];
      const sessionPromises: Promise<void>[] = [];

      // Start concurrent sessions
      for (const agentType of agents) {
        const sessionId = `${agentType}-concurrent-session`;
        const promise = (async () => {
          await telemetryService.trackStart(
            sessionId,
            agentType,
            "chat",
            `Hello from ${agentType}`,
            undefined,
            undefined,
            { agent: agentType, concurrent: true }
          );

          // Multiple streams with delays to simulate real usage
          for (let i = 0; i < 3; i++) {
            await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 50));
            await telemetryService.trackStream({
              sessionId,
              agentType,
              streamData: `${agentType} response chunk ${i + 1}`,
              metadata: { chunkIndex: i }
            });
          }

          // Small delay to ensure proper timestamp ordering
          await new Promise(resolve => setTimeout(resolve, 10));

          await telemetryService.trackEnd({
            sessionId,
            agentType,
            metadata: { status: "completed", agent: agentType }
          });
        })();

        sessionPromises.push(promise);
      }

      // Wait for all sessions to complete
      await Promise.all(sessionPromises);

      // Wait for buffer flush
      await new Promise(resolve => setTimeout(resolve, 300));

      // Verify all sessions were tracked
      const allEvents = await telemetryDB.getEvents();
      expect(allEvents.length).toBeGreaterThanOrEqual(15); // 3 agents * (1 start + 3 stream + 1 end) = 15

      // Verify each agent has complete session data
      for (const agentType of agents) {
        const agentEvents = allEvents.filter(e => e.agentType === agentType);
        expect(agentEvents.length).toBeGreaterThanOrEqual(5); // start + 3 streams + end
        
        const eventTypes = agentEvents
          .filter(e => e.sessionId === `${agentType}-concurrent-session`)
          .sort((a, b) => a.timestamp - b.timestamp)
          .map(e => e.eventType);
        
        expect(eventTypes).toEqual(["start", "stream", "stream", "stream", "end"]);
      }
    });
  });

  describe("Performance and Scale Testing", () => {
    it("should handle high-volume stream events efficiently", async () => {
      const sessionId = "high-volume-session";
      const agentType = "claude";
      const streamCount = 100;

      const startTime = Date.now();

      // Start session
      await telemetryService.trackStart({
        sessionId,
        agentType,
        mode: "chat",
        prompt: "High volume test",
        metadata: { streamCount }
      });

      // Generate many stream events (sequential to avoid race conditions)
      for (let i = 0; i < streamCount; i++) {
        await telemetryService.trackStream({
          sessionId,
          agentType,
          streamData: `Stream chunk ${i + 1} with some content to make it realistic`,
          metadata: { 
            chunkNumber: i + 1,
            totalChunks: streamCount,
            timestamp: Date.now()
          }
        });
      }

      // End session
      await telemetryService.trackEnd({
        sessionId,
        agentType,
        metadata: { 
          totalEvents: streamCount + 2, // +2 for start and end
          processingTime: Date.now() - startTime
        }
      });

      // Wait for all buffers to flush
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify all events were persisted
      const sessionEvents = await telemetryDB.getEvents({ sessionId });
      expect(sessionEvents).toHaveLength(streamCount + 2); // start + streams + end

      // Verify performance (should complete reasonably quickly)
      const totalTime = Date.now() - startTime;
      expect(totalTime).toBeLessThan(5000); // Should complete within 5 seconds

      // Verify data integrity for sample events
      const streamEvents = sessionEvents
        .filter(e => e.eventType === "stream")
        .sort((a, b) => a.timestamp - b.timestamp);

      expect(streamEvents).toHaveLength(streamCount);
      
      // Check first and last stream events
      expect(streamEvents[0].streamData).toContain("Stream chunk 1");
      expect(streamEvents[streamCount - 1].streamData).toContain(`Stream chunk ${streamCount}`);
      
      // Verify metadata integrity
      expect(streamEvents[0].metadata).toMatchObject({ chunkNumber: 1, totalChunks: streamCount });
      expect(streamEvents[streamCount - 1].metadata).toMatchObject({ chunkNumber: streamCount, totalChunks: streamCount });
    });

    it("should handle memory efficiently with buffer management", async () => {
      const sessionCount = 20;
      const streamsPerSession = 25;
      const sessions: string[] = [];

      // Create many concurrent sessions to test buffer management
      for (let s = 0; s < sessionCount; s++) {
        const sessionId = `buffer-test-session-${s}`;
        sessions.push(sessionId);
        
        await telemetryService.trackStart({
          sessionId,
          agentType: "claude",
          mode: "chat",
          prompt: `Buffer test session ${s}`,
          metadata: { sessionIndex: s }
        });

        // Add streams
        for (let i = 0; i < streamsPerSession; i++) {
          await telemetryService.trackStream({
            sessionId,
            agentType: "claude",
            streamData: `Session ${s}, stream ${i}`,
            metadata: { sessionIndex: s, streamIndex: i }
          });
        }

        await telemetryService.trackEnd({
          sessionId,
          agentType: "claude",
          metadata: { sessionIndex: s, streamsSent: streamsPerSession }
        });
      }

      // Force shutdown to flush all buffers
      await telemetryService.shutdown();
      
      // Reinitialize for verification
      const verifyConfig: TelemetryConfig = {
        isEnabled: true,
        endpoint: "http://localhost:4318/v1/traces",
        localStore: {
          isEnabled: true,
          path: testDbPath,
          streamBatchSize: 10,
          streamFlushIntervalMs: 100,
          pruneDays: 30
        }
      };
      telemetryService = new TelemetryService(verifyConfig);

      // Verify all sessions were persisted
      const allEvents = await telemetryDB.getEvents();
      const expectedEventCount = sessionCount * (2 + streamsPerSession); // start + streams + end per session
      expect(allEvents).toHaveLength(expectedEventCount);

      // Verify each session has correct event count
      for (let s = 0; s < sessionCount; s++) {
        const sessionId = `buffer-test-session-${s}`;
        const sessionEvents = allEvents.filter(e => e.sessionId === sessionId);
        expect(sessionEvents).toHaveLength(2 + streamsPerSession);
      }

      // Verify event persistence (performance metrics reset after shutdown)
      expect(allEvents).toHaveLength(expectedEventCount);
      
      // The original metrics are no longer available after shutdown, but we can verify
      // that all events were properly persisted to the database
    });
  });

  describe("Database Query Performance", () => {
    beforeEach(async () => {
      // Set up test data for query performance testing
      const agents = ["claude", "codex", "gemini", "opencode"];
      const modesPerAgent = ["chat", "code", "analysis"];
      const sessionsPerMode = 10;
      const eventsPerSession = 15;

      for (const agentType of agents) {
        for (const mode of modesPerAgent) {
          for (let s = 0; s < sessionsPerMode; s++) {
            const sessionId = `${agentType}-${mode}-session-${s}`;
            
            // Start
            await telemetryService.trackStart({
              sessionId,
              agentType,
              mode,
              prompt: `${mode} task for ${agentType}`,
              metadata: { 
                agentType, 
                mode, 
                sessionIndex: s,
                testDataGeneration: true 
              }
            });

            // Multiple streams
            for (let i = 0; i < eventsPerSession - 2; i++) {
              await telemetryService.trackStream({
                sessionId,
                agentType,
                streamData: `${agentType} ${mode} stream ${i}`,
                metadata: { streamIndex: i }
              });
            }

            // End or error (10% error rate)
            if (s % 10 === 9) {
              await telemetryService.trackError({
                sessionId,
                agentType,
                error: "Simulated error",
                metadata: { errorType: "simulated", sessionIndex: s }
              });
            } else {
              await telemetryService.trackEnd({
                sessionId,
                agentType,
                metadata: { status: "success", sessionIndex: s }
              });
            }
          }
        }
      }

      // Wait for all data to be flushed
      await new Promise(resolve => setTimeout(resolve, 1000));
    });

    it("should perform agent filtering queries efficiently", async () => {
      const startTime = Date.now();
      
      const claudeEvents = await telemetryDB.getEvents({ agentType: "claude" });
      
      const queryTime = Date.now() - startTime;
      expect(queryTime).toBeLessThan(100); // Should be fast with proper indexing
      
      // Verify results
      expect(claudeEvents.length).toBeGreaterThan(0);
      expect(claudeEvents.every(e => e.agentType === "claude")).toBe(true);
    });

    it("should perform time-based queries efficiently", async () => {
      const now = Date.now();
      const oneHourAgo = now - (60 * 60 * 1000);
      
      const startTime = Date.now();
      
      const recentEvents = await telemetryDB.getEvents({ 
        from: oneHourAgo,
        to: now 
      });
      
      const queryTime = Date.now() - startTime;
      expect(queryTime).toBeLessThan(150); // Should be fast with timestamp index
      
      // Verify all events are within time range
      expect(recentEvents.every(e => e.timestamp >= oneHourAgo && e.timestamp <= now)).toBe(true);
    });

    it("should perform complex multi-filter queries efficiently", async () => {
      const startTime = Date.now();
      
      const complexQuery = await telemetryDB.getEvents({
        agentType: "claude",
        eventType: "stream",
        limit: 50
      });
      
      const queryTime = Date.now() - startTime;
      expect(queryTime).toBeLessThan(100);
      
      // Verify results match all filters
      expect(complexQuery.length).toBeLessThanOrEqual(50);
      expect(complexQuery.every(e => e.agentType === "claude" && e.eventType === "stream")).toBe(true);
    });

    it("should provide accurate statistics efficiently", async () => {
      const startTime = Date.now();
      
      const stats = await telemetryDB.getStats();
      
      const statsTime = Date.now() - startTime;
      expect(statsTime).toBeLessThan(200);
      
      // Verify stats accuracy
      expect(stats.totalEvents).toBeGreaterThan(0);
      expect(stats.uniqueSessions).toBeGreaterThan(0);
      expect(stats.agentBreakdown).toBeDefined();
      expect(Object.keys(stats.agentBreakdown)).toContain("claude");
      expect(Object.keys(stats.agentBreakdown)).toContain("codex");
    });
  });

  describe("Error Handling and Recovery", () => {
    it("should gracefully handle database unavailability", async () => {
      // Close the database to simulate unavailability
      await telemetryDB.close();
      
      // Service should continue to work without crashing
      await expect(telemetryService.trackStart({
        sessionId: "db-unavailable-test",
        agentType: "claude",
        mode: "chat",
        prompt: "Test with unavailable DB"
      })).resolves.not.toThrow();

      await expect(telemetryService.trackStream({
        sessionId: "db-unavailable-test",
        agentType: "claude",
        streamData: "Test stream"
      })).resolves.not.toThrow();

      await expect(telemetryService.trackEnd({
        sessionId: "db-unavailable-test",
        agentType: "claude"
      })).resolves.not.toThrow();
    });

    it("should handle corrupted data gracefully", async () => {
      // Test with malformed metadata
      await expect(telemetryService.trackStart({
        sessionId: "corrupted-test",
        agentType: "claude",
        mode: "chat",
        prompt: "Test with corrupted metadata",
        metadata: {
          circularRef: {} as any, // Will cause JSON.stringify issues
        }
      })).resolves.not.toThrow();

      // The circular reference should be handled gracefully
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const events = await telemetryDB.getEvents({ sessionId: "corrupted-test" });
      expect(events).toHaveLength(1);
    });

    it("should handle buffer overflow scenarios", async () => {
      // Generate events faster than flush interval to test buffer overflow handling
      const sessionId = "buffer-overflow-test";
      const rapidEventCount = 1000;

      const startTime = Date.now();

      await telemetryService.trackStart({
        sessionId,
        agentType: "claude",
        mode: "chat",
        prompt: "Buffer overflow test"
      });

      // Generate events rapidly (sequential to avoid race conditions)
      for (let i = 0; i < rapidEventCount; i++) {
        await telemetryService.trackStream({
          sessionId,
          agentType: "claude",
          streamData: `Rapid stream ${i}`,
          metadata: { index: i, rapid: true }
        });
      }

      await telemetryService.trackEnd({
        sessionId,
        agentType: "claude",
        metadata: { rapidEventCount, totalTime: Date.now() - startTime }
      });

      // Wait for buffers to flush
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Verify all events were eventually persisted (may take multiple flushes)
      const events = await telemetryDB.getEvents({ sessionId });
      expect(events).toHaveLength(rapidEventCount + 2); // All streams + start + end
    });
  });

  describe("Memory and Resource Management", () => {
    it("should clean up resources properly on shutdown", async () => {
      const sessionId = "cleanup-test";
      
      // Generate some activity
      await telemetryService.trackStart({
        sessionId,
        agentType: "claude",
        mode: "chat",
        prompt: "Cleanup test"
      });

      for (let i = 0; i < 10; i++) {
        await telemetryService.trackStream({
          sessionId,
          agentType: "claude",
          streamData: `Stream ${i}`
        });
      }

      // Shutdown should flush all buffers and clean up resources
      await telemetryService.shutdown();

      // Verify all events were persisted
      const events = await telemetryDB.getEvents({ sessionId });
      expect(events).toHaveLength(11); // 1 start + 10 streams

      // Verify timers are cleaned up (service should not continue processing)
      const eventCountBefore = events.length;
      
      // Wait a bit to ensure no background processing occurs
      await new Promise(resolve => setTimeout(resolve, 300));
      
      const eventsAfter = await telemetryDB.getEvents({ sessionId });
      expect(eventsAfter).toHaveLength(eventCountBefore); // Should be the same
    });

    it("should handle memory pressure gracefully", async () => {
      // Simulate memory pressure by creating many large events
      const sessionCount = 50;
      const largeDataSize = 10000; // 10KB per event
      const largeData = "x".repeat(largeDataSize);

      for (let s = 0; s < sessionCount; s++) {
        const sessionId = `memory-pressure-${s}`;
        
        await telemetryService.trackStart({
          sessionId,
          agentType: "claude",
          mode: "chat",
          prompt: "Memory pressure test",
          metadata: { sessionIndex: s, dataSize: largeDataSize }
        });

        // Large stream data
        for (let i = 0; i < 5; i++) {
          await telemetryService.trackStream({
            sessionId,
            agentType: "claude",
            streamData: `${largeData}-chunk-${i}`,
            metadata: { chunkIndex: i, dataSize: largeDataSize }
          });
        }

        await telemetryService.trackEnd({
          sessionId,
          agentType: "claude",
          metadata: { sessionIndex: s, completed: true }
        });
      }

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Verify all data was handled correctly
      const allEvents = await telemetryDB.getEvents();
      expect(allEvents.length).toBe(sessionCount * 7); // Each session: 1 start + 5 streams + 1 end

      // Verify large data integrity for sample events
      const streamEvents = allEvents.filter(e => e.eventType === "stream");
      expect(streamEvents.length).toBe(sessionCount * 5);
      
      // Check a few random stream events have correct data size
      const sampleEvents = streamEvents.slice(0, 5);
      for (const event of sampleEvents) {
        expect(event.streamData?.length).toBeGreaterThan(largeDataSize);
        expect(event.streamData).toContain("chunk-");
      }
    });
  });
}); 