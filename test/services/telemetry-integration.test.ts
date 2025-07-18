import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { unlink } from "fs/promises";
import { existsSync } from "fs";
import { resolve } from "path";
import { TelemetryService } from "../../packages/vibekit/src/services/telemetry";
import { TelemetryDB } from "../../packages/vibekit/src/services/telemetry-db";
import { TelemetryConfig } from "../../packages/vibekit/src/types";

describe("TelemetryService Integration", () => {
  let telemetryService: TelemetryService;
  let testDbPath: string;
  let config: TelemetryConfig;

  beforeEach(async () => {
    // Create unique test database path
    testDbPath = resolve(`./test-integration-db-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.db`);
    
    config = {
      isEnabled: false, // Disable OTLP to focus on local storage
      localStore: {
        isEnabled: true,
        path: testDbPath,
        streamBatchSize: 3, // Small batch size for testing
        streamFlushIntervalMs: 100,
      },
    };
    
    telemetryService = new TelemetryService(config, "test-session-123");
  });

  afterEach(async () => {
    await telemetryService.shutdown();
    
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

  describe("Local Storage Only (OTLP Disabled)", () => {
    it("should persist start events to local database", async () => {
      await telemetryService.trackStart("claude", "test", "Hello world", { key: "value" });
      
      // Access the database directly to verify the event was stored
      const db = new TelemetryDB(config.localStore!);
      const events = await db.getEvents();
      
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        sessionId: "test-session-123",
        eventType: "start",
        agentType: "claude",
        mode: "test",
        prompt: "Hello world",
        metadata: { key: "value" },
      });
      
      await db.close();
    });

    it("should buffer stream events and flush when limit reached", async () => {
      // Send multiple stream events (batch size is 3)
      await telemetryService.trackStream("claude", "test", "Test prompt", "Stream 1");
      await telemetryService.trackStream("claude", "test", "Test prompt", "Stream 2");
      
      // Database should be empty until batch limit is reached
      const db = new TelemetryDB(config.localStore!);
      let events = await db.getEvents();
      expect(events).toHaveLength(0);
      
             // Third stream event should trigger flush
       await telemetryService.trackStream("claude", "test", "Test prompt", "Stream 3");
       
       events = await db.getEvents({ orderBy: "timestamp_asc" });
       expect(events).toHaveLength(3);
       expect(events.every(e => e.eventType === "stream")).toBe(true);
       expect(events.map(e => e.streamData)).toEqual(["Stream 1", "Stream 2", "Stream 3"]);
      
      await db.close();
    });

    it("should flush pending streams on trackEnd", async () => {
      // Add some stream events (less than batch limit)
      await telemetryService.trackStream("claude", "test", "Test prompt", "Stream 1");
      await telemetryService.trackStream("claude", "test", "Test prompt", "Stream 2");
      
      // End the session - should flush streams and add end event
      await telemetryService.trackEnd("claude", "test", "Test prompt", "sandbox-123", "https://github.com/test/repo");
      
      const db = new TelemetryDB(config.localStore!);
      const events = await db.getEvents({ orderBy: "timestamp_asc" });
      
      expect(events).toHaveLength(3);
      expect(events[0].eventType).toBe("stream");
      expect(events[1].eventType).toBe("stream");
      expect(events[2].eventType).toBe("end");
      expect(events[2].sandboxId).toBe("sandbox-123");
      expect(events[2].repoUrl).toBe("https://github.com/test/repo");
      
      await db.close();
    });

    it("should flush pending streams on trackError", async () => {
      // Add some stream events
      await telemetryService.trackStream("claude", "test", "Test prompt", "Stream 1");
      await telemetryService.trackStream("claude", "test", "Test prompt", "Stream 2");
      
      // Error occurs - should flush streams and add error event
      await telemetryService.trackError("claude", "test", "Test prompt", "Something went wrong");
      
      const db = new TelemetryDB(config.localStore!);
      const events = await db.getEvents({ orderBy: "timestamp_asc" });
      
      expect(events).toHaveLength(3);
      expect(events[0].eventType).toBe("stream");
      expect(events[1].eventType).toBe("stream");
      expect(events[2].eventType).toBe("error");
      expect(events[2].metadata).toMatchObject({
        "error.message": "Something went wrong",
      });
      
      await db.close();
    });

    it("should handle multiple agent sessions with separate buffers", async () => {
      // Stream events for claude
      await telemetryService.trackStream("claude", "test", "Claude prompt", "Claude stream 1");
      await telemetryService.trackStream("claude", "test", "Claude prompt", "Claude stream 2");
      
      // Stream events for codex
      await telemetryService.trackStream("codex", "test", "Codex prompt", "Codex stream 1");
      await telemetryService.trackStream("codex", "test", "Codex prompt", "Codex stream 2");
      
      // End both sessions
      await telemetryService.trackEnd("claude", "test", "Claude prompt");
      await telemetryService.trackEnd("codex", "test", "Codex prompt");
      
      const db = new TelemetryDB(config.localStore!);
      const events = await db.getEvents();
      
      expect(events).toHaveLength(6); // 2 streams + 1 end for each agent
      
      const claudeEvents = events.filter(e => e.agentType === "claude");
      const codexEvents = events.filter(e => e.agentType === "codex");
      
      expect(claudeEvents).toHaveLength(3);
      expect(codexEvents).toHaveLength(3);
      
      await db.close();
    });

    it("should flush all buffers on shutdown", async () => {
      // Add stream events for multiple agents without reaching batch limit
      await telemetryService.trackStream("claude", "test", "Test", "Stream 1");
      await telemetryService.trackStream("codex", "test", "Test", "Stream 1");
      
      // Shutdown should flush all pending buffers
      await telemetryService.shutdown();
      
      const db = new TelemetryDB(config.localStore!);
      const events = await db.getEvents();
      
      expect(events).toHaveLength(2);
      expect(events.map(e => e.agentType).sort()).toEqual(["claude", "codex"]);
      
      await db.close();
    });
  });

  describe("OTLP and Local Storage Combined", () => {
    beforeEach(() => {
      // Enable both OTLP and local storage
      config.isEnabled = true;
      config.endpoint = "https://example.com/traces"; // Won't actually send due to no headers/auth
      telemetryService = new TelemetryService(config, "test-session-456");
    });

    it("should persist events to local storage even when OTLP is enabled", async () => {
      await telemetryService.trackStart("claude", "test", "Combined test");
      
      const db = new TelemetryDB(config.localStore!);
      const events = await db.getEvents();
      
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        sessionId: "test-session-456",
        eventType: "start",
        agentType: "claude",
        mode: "test",
        prompt: "Combined test",
      });
      
      await db.close();
    });
  });

  describe("Local Storage Disabled", () => {
    beforeEach(() => {
      config.localStore!.isEnabled = false;
      telemetryService = new TelemetryService(config, "test-session-789");
    });

    it("should not persist events when local storage is disabled", async () => {
      await telemetryService.trackStart("claude", "test", "Should not persist");
      
      // Database file should not exist
      expect(existsSync(testDbPath)).toBe(false);
    });
  });

  describe("Error Resilience", () => {
    it("should continue working even if local database fails", async () => {
      // Use an invalid database path to force errors
      const invalidConfig: TelemetryConfig = {
        isEnabled: false,
        localStore: {
          isEnabled: true,
          path: "/invalid/path/cannot/create/db.sqlite",
        },
      };
      
      const service = new TelemetryService(invalidConfig);
      
      // Should not throw errors even though database initialization fails
      await expect(service.trackStart("claude", "test", "Should not crash")).resolves.not.toThrow();
      await expect(service.trackStream("claude", "test", "Test", "data")).resolves.not.toThrow();
      await expect(service.trackEnd("claude", "test", "Test")).resolves.not.toThrow();
      await expect(service.trackError("claude", "test", "Test", "error")).resolves.not.toThrow();
      
      await service.shutdown();
    });
  });

  describe("Session Management", () => {
    it("should use provided session ID", async () => {
      const customSessionId = "custom-session-id-123";
      const serviceWithCustomSession = new TelemetryService(config, customSessionId);
      
      await serviceWithCustomSession.trackStart("claude", "test", "Custom session test");
      
      const db = new TelemetryDB(config.localStore!);
      const events = await db.getEvents();
      
      expect(events).toHaveLength(1);
      expect(events[0].sessionId).toBe(customSessionId);
      
      await serviceWithCustomSession.shutdown();
      await db.close();
    });

    it("should generate session ID when not provided", async () => {
      const serviceWithAutoSession = new TelemetryService(config);
      
      await serviceWithAutoSession.trackStart("claude", "test", "Auto session test");
      
      const db = new TelemetryDB(config.localStore!);
      const events = await db.getEvents();
      
      expect(events).toHaveLength(1);
      expect(events[0].sessionId).toMatch(/^vibekit-\d+-[a-z0-9]+$/);
      
      await serviceWithAutoSession.shutdown();
      await db.close();
    });
  });
}); 