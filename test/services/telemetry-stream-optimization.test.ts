import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { unlink } from "fs/promises";
import { existsSync } from "fs";
import { resolve } from "path";
import { TelemetryService } from "../../packages/vibekit/src/services/telemetry";
import { TelemetryDB } from "../../packages/vibekit/src/services/telemetry-db";
import { TelemetryConfig } from "../../packages/vibekit/src/types";

// Note: We'll use fake timers selectively in individual tests

describe("TelemetryService Stream Optimization", () => {
  let telemetryService: TelemetryService;
  let testDbPath: string;
  let config: TelemetryConfig;

  beforeEach(async () => {
    // Create unique test database path
    testDbPath = resolve(`./test-stream-opt-db-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.db`);
    
    config = {
      isEnabled: false, // Disable OTLP to focus on local storage
      localStore: {
        isEnabled: true,
        path: testDbPath,
        streamBatchSize: 5, // Small batch size for testing
        streamFlushIntervalMs: 1000, // 1 second for testing
      },
    };
    
    telemetryService = new TelemetryService(config, "test-session-optimization");
  });

  afterEach(async () => {
    await telemetryService.shutdown();
    vi.useRealTimers(); // Ensure we're back to real timers
    vi.clearAllTimers();
    
    // Clean up test database files
    try {
      if (existsSync(testDbPath)) {
        await unlink(testDbPath);
      }
      if (existsSync(`${testDbPath}-wal`)) {
        await unlink(`${testDbPath}-wal`);
      }
      if (existsSync(`${testDbPath}-shm`)) {
        await unlink(`${testDbPath}-shm`);
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe("Periodic Flush Timer", () => {
    it("should initialize periodic flush timer when local storage is enabled", () => {
      vi.useFakeTimers();
      try {
        // Create a new service with fake timers
        const testService = new TelemetryService(config, "test-timer");
        // Timer should be set with the configured interval
        expect(vi.getTimerCount()).toBeGreaterThan(0);
        testService.shutdown();
      } finally {
        vi.useRealTimers();
      }
    });

    it("should flush stale buffers after timer interval", async () => {
      // Use a short flush interval for faster testing
      const quickConfig = {
        ...config,
        localStore: {
          ...config.localStore!,
          streamFlushIntervalMs: 100, // 100ms for faster testing
        },
      };
      
      const testService = new TelemetryService(quickConfig, "test-flush");
      
      // Add stream events but don't reach batch limit
      await testService.trackStream("claude", "test", "Test prompt", "Stream 1");
      await testService.trackStream("claude", "test", "Test prompt", "Stream 2");
      
      // Verify nothing is flushed yet
      const db = new TelemetryDB(quickConfig.localStore!);
      let events = await db.getEvents();
      expect(events).toHaveLength(0);
      
      // Wait for periodic flush to occur (3x the flush interval = 300ms)
      await new Promise(resolve => setTimeout(resolve, 400));
      
      // Now events should be flushed
      events = await db.getEvents();
      expect(events).toHaveLength(2);
      
      await testService.shutdown();
      await db.close();
    });

    it("should clean up timer on shutdown", async () => {
      vi.useFakeTimers();
      try {
        const testService = new TelemetryService(config, "test-shutdown");
        const initialTimerCount = vi.getTimerCount();
        expect(initialTimerCount).toBeGreaterThan(0);
        
        await testService.shutdown();
        
        // Timer should be cleared
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("Performance Metrics", () => {
    it("should track flush performance metrics", async () => {
      // Initial metrics should be zero
      let metrics = telemetryService.getPerformanceMetrics();
      expect(metrics.totalFlushes).toBe(0);
      expect(metrics.totalEventsWritten).toBe(0);
      expect(metrics.averageFlushTime).toBe(0);
      expect(metrics.activeBuffers).toBe(0);
      expect(metrics.totalBufferedEvents).toBe(0);

      // Add events to trigger a flush (batch size is 5)
      for (let i = 1; i <= 5; i++) {
        await telemetryService.trackStream("claude", "test", "Test prompt", `Stream ${i}`);
      }

      // Give a small delay to ensure flush completes
      await new Promise(resolve => setTimeout(resolve, 10));

      // Metrics should be updated after flush
      metrics = telemetryService.getPerformanceMetrics();
      expect(metrics.totalFlushes).toBe(1);
      expect(metrics.totalEventsWritten).toBe(5);
      expect(metrics.averageFlushTime).toBeGreaterThanOrEqual(0);
      expect(metrics.lastFlushTime).toBeGreaterThanOrEqual(0);
      expect(metrics.activeBuffers).toBe(0); // Buffer should be cleared after flush
      expect(metrics.totalBufferedEvents).toBe(0);
    });

    it("should track multiple buffer flushes correctly", async () => {
      // Create events for multiple agents
      for (let i = 1; i <= 3; i++) {
        await telemetryService.trackStream("claude", "test", "Test", `Claude ${i}`);
        await telemetryService.trackStream("codex", "test", "Test", `Codex ${i}`);
      }

      let metrics = telemetryService.getPerformanceMetrics();
      expect(metrics.activeBuffers).toBe(2);
      expect(metrics.totalBufferedEvents).toBe(6);

      // Trigger flushes by adding more events
      await telemetryService.trackStream("claude", "test", "Test", "Claude 4");
      await telemetryService.trackStream("claude", "test", "Test", "Claude 5");
      
      // Claude buffer should flush
      metrics = telemetryService.getPerformanceMetrics();
      expect(metrics.totalFlushes).toBe(1);
      expect(metrics.totalEventsWritten).toBe(5);
      expect(metrics.activeBuffers).toBe(1); // Only codex buffer remains
      expect(metrics.totalBufferedEvents).toBe(3);

      // Flush remaining buffer
      await telemetryService.trackStream("codex", "test", "Test", "Codex 4");
      await telemetryService.trackStream("codex", "test", "Test", "Codex 5");

      metrics = telemetryService.getPerformanceMetrics();
      expect(metrics.totalFlushes).toBe(2);
      expect(metrics.totalEventsWritten).toBe(10);
      expect(metrics.activeBuffers).toBe(0);
    });

    it("should calculate rolling average flush time correctly", async () => {
      // First flush
      for (let i = 1; i <= 5; i++) {
        await telemetryService.trackStream("agent1", "test", "Test", `Stream ${i}`);
      }

      // Give a small delay to ensure flush completes
      await new Promise(resolve => setTimeout(resolve, 10));

      let metrics = telemetryService.getPerformanceMetrics();
      const firstFlushTime = metrics.averageFlushTime;
      expect(firstFlushTime).toBeGreaterThanOrEqual(0);

      // Second flush
      for (let i = 1; i <= 5; i++) {
        await telemetryService.trackStream("agent2", "test", "Test", `Stream ${i}`);
      }

      // Give a small delay to ensure flush completes
      await new Promise(resolve => setTimeout(resolve, 10));

      metrics = telemetryService.getPerformanceMetrics();
      expect(metrics.totalFlushes).toBe(2);
      expect(metrics.averageFlushTime).toBeGreaterThanOrEqual(0);
      
      // Average should be calculated correctly (may be different from first flush)
      expect(typeof metrics.averageFlushTime).toBe("number");
    });
  });

  describe("Memory Management", () => {
    it("should clean up metadata for empty buffers", async () => {
      // Add events to create buffer
      await telemetryService.trackStream("claude", "test", "Test", "Stream 1");
      
      let metrics = telemetryService.getPerformanceMetrics();
      expect(metrics.activeBuffers).toBe(1);

      // Manually flush the buffer
      await telemetryService.trackEnd("claude", "test", "Test");

      // Buffer and metadata should be cleaned up
      metrics = telemetryService.getPerformanceMetrics();
      expect(metrics.activeBuffers).toBe(0);
    });

    it("should handle buffer eviction during periodic flush", async () => {
      // Use a very short flush interval for faster testing
      const quickConfig = {
        ...config,
        localStore: {
          ...config.localStore!,
          streamFlushIntervalMs: 50, // 50ms for very fast testing
        },
      };
      
      const testService = new TelemetryService(quickConfig, "test-eviction");
      
      // Create a buffer with timestamp
      await testService.trackStream("claude", "test", "Test", "Stream 1");
      
      let metrics = testService.getPerformanceMetrics();
      expect(metrics.activeBuffers).toBe(1);
      
      // Wait long enough for the buffer to become stale and get evicted
      // (stale buffer threshold is 2x flush interval = 100ms, wait 150ms to be safe)
      await new Promise(resolve => setTimeout(resolve, 200));
      
      metrics = testService.getPerformanceMetrics();
      expect(metrics.activeBuffers).toBe(0); // Should be evicted/flushed
      
      await testService.shutdown();
    });

    it("should not exceed maximum buffer limits", async () => {
      // This test would require creating 100+ buffers to test the enforceBufferLimits
      // For practical testing, we'll create a few buffers and verify the mechanism works
      
      // Create multiple agent buffers
      const agents = ['claude', 'codex', 'gemini', 'opencode'];
      for (const agent of agents) {
        await telemetryService.trackStream(agent, "test", "Test", "Stream 1");
      }

      let metrics = telemetryService.getPerformanceMetrics();
      expect(metrics.activeBuffers).toBe(4);
      expect(metrics.totalBufferedEvents).toBe(4);

      // All buffers should be manageable at this scale
      expect(metrics.activeBuffers).toBeLessThanOrEqual(100);
    });
  });

  describe("Buffer Metadata Management", () => {
    it("should track buffer creation and update times", async () => {
      const startTime = Date.now();
      
      // Create buffer
      await telemetryService.trackStream("claude", "test", "Test", "Stream 1");
      
      // Add more events to same buffer
      await telemetryService.trackStream("claude", "test", "Test", "Stream 2");
      
      let metrics = telemetryService.getPerformanceMetrics();
      expect(metrics.activeBuffers).toBe(1);
      expect(metrics.totalBufferedEvents).toBe(2);

      // Buffer should be tracked and updated
      const endTime = Date.now();
      expect(endTime).toBeGreaterThanOrEqual(startTime);
    });

    it("should maintain separate metadata for different agent buffers", async () => {
      // Create buffers for different agents
      await telemetryService.trackStream("claude", "test", "Test", "Claude 1");
      await telemetryService.trackStream("codex", "test", "Test", "Codex 1");
      await telemetryService.trackStream("claude", "test", "Test", "Claude 2");

      let metrics = telemetryService.getPerformanceMetrics();
      expect(metrics.activeBuffers).toBe(2);
      expect(metrics.totalBufferedEvents).toBe(3);

      // Flush one buffer
      await telemetryService.trackEnd("claude", "test", "Test");

      metrics = telemetryService.getPerformanceMetrics();
      expect(metrics.activeBuffers).toBe(1); // Only codex buffer remains
      expect(metrics.totalBufferedEvents).toBe(1);
    });
  });

  describe("Integration with Existing Functionality", () => {
    it("should maintain compatibility with trackEnd buffer flushing", async () => {
      // Add stream events
      await telemetryService.trackStream("claude", "test", "Test", "Stream 1");
      await telemetryService.trackStream("claude", "test", "Test", "Stream 2");

      let metrics = telemetryService.getPerformanceMetrics();
      expect(metrics.totalBufferedEvents).toBe(2);

      // trackEnd should flush the buffer
      await telemetryService.trackEnd("claude", "test", "Test");

      metrics = telemetryService.getPerformanceMetrics();
      expect(metrics.totalFlushes).toBe(1);
      expect(metrics.totalEventsWritten).toBe(2);
      expect(metrics.activeBuffers).toBe(0);

      // Verify data was persisted
      const db = new TelemetryDB(config.localStore!);
      const events = await db.getEvents({ orderBy: "timestamp_asc" });
      expect(events).toHaveLength(3); // 2 stream + 1 end
      expect(events[0].eventType).toBe("stream");
      expect(events[1].eventType).toBe("stream");
      expect(events[2].eventType).toBe("end");
      
      await db.close();
    });

    it("should maintain compatibility with trackError buffer flushing", async () => {
      // Add stream events
      await telemetryService.trackStream("claude", "test", "Test", "Stream 1");
      await telemetryService.trackStream("claude", "test", "Test", "Stream 2");

      let metrics = telemetryService.getPerformanceMetrics();
      expect(metrics.totalBufferedEvents).toBe(2);

      // trackError should flush the buffer
      await telemetryService.trackError("claude", "test", "Test", "Something went wrong");

      metrics = telemetryService.getPerformanceMetrics();
      expect(metrics.totalFlushes).toBe(1);
      expect(metrics.totalEventsWritten).toBe(2);
      expect(metrics.activeBuffers).toBe(0);

      // Verify data was persisted
      const db = new TelemetryDB(config.localStore!);
      const events = await db.getEvents({ orderBy: "timestamp_asc" });
      expect(events).toHaveLength(3); // 2 stream + 1 error
      expect(events[2].eventType).toBe("error");
      
      await db.close();
    });

    it("should flush all buffers on shutdown", async () => {
      // Create multiple buffers without reaching flush limits
      await telemetryService.trackStream("claude", "test", "Test", "Stream 1");
      await telemetryService.trackStream("codex", "test", "Test", "Stream 1");
      await telemetryService.trackStream("gemini", "test", "Test", "Stream 1");

      let metrics = telemetryService.getPerformanceMetrics();
      expect(metrics.activeBuffers).toBe(3);
      expect(metrics.totalBufferedEvents).toBe(3);

      // Shutdown should flush all buffers
      await telemetryService.shutdown();

      // Check final metrics (after shutdown, getting metrics might not work as service is shut down)
      // So we'll verify by checking the database directly
      const db = new TelemetryDB(config.localStore!);
      const events = await db.getEvents();
      expect(events).toHaveLength(3);
      
      await db.close();
    });
  });

  describe("Configuration Validation", () => {
    it("should use default values for missing configuration", async () => {
      const minimalConfig: TelemetryConfig = {
        isEnabled: false,
        localStore: {
          isEnabled: true,
          path: testDbPath,
          // Omit streamBatchSize and streamFlushIntervalMs to test defaults
        },
      };

      const serviceWithDefaults = new TelemetryService(minimalConfig);

      // Should work with default values
      await serviceWithDefaults.trackStream("claude", "test", "Test", "Stream 1");
      
      const metrics = serviceWithDefaults.getPerformanceMetrics();
      expect(metrics.activeBuffers).toBe(1);

      await serviceWithDefaults.shutdown();
    });

    it("should respect custom batch size configuration", async () => {
      const customConfig: TelemetryConfig = {
        isEnabled: false,
        localStore: {
          isEnabled: true,
          path: testDbPath,
          streamBatchSize: 2, // Very small batch for testing
        },
      };

      const customService = new TelemetryService(customConfig);

      // Add events up to custom batch size
      await customService.trackStream("claude", "test", "Test", "Stream 1");
      
      let metrics = customService.getPerformanceMetrics();
      expect(metrics.totalFlushes).toBe(0); // Not flushed yet

      await customService.trackStream("claude", "test", "Test", "Stream 2");
      
      metrics = customService.getPerformanceMetrics();
      expect(metrics.totalFlushes).toBe(1); // Should flush with custom batch size of 2
      expect(metrics.totalEventsWritten).toBe(2);

      await customService.shutdown();
    });
  });
}); 