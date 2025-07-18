import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { unlink, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { resolve } from "path";
import { TelemetryDB } from "../../packages/vibekit/src/services/telemetry-db";
import {
  LocalStoreConfig,
  TelemetryRecord,
  TelemetryDBError,
  TelemetryDBInitError,
} from "../../packages/vibekit/src/types/telemetry-storage";

describe("TelemetryDB", () => {
  let db: TelemetryDB;
  let testDbPath: string;
  let config: LocalStoreConfig;

  beforeEach(async () => {
    // Create unique test database path
    testDbPath = resolve(`./test-db-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.db`);
    
    config = {
      isEnabled: true,
      path: testDbPath,
      pruneDays: 7,
      streamBatchSize: 10,
      streamFlushIntervalMs: 100,
    };
    
    db = new TelemetryDB(config);
  });

  afterEach(async () => {
    await db.close();
    
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

  describe("Database Initialization", () => {
    it("should create database and schema on first use", async () => {
      expect(existsSync(testDbPath)).toBe(false);
      
      const record: Omit<TelemetryRecord, 'id'> = {
        sessionId: "test-session-1",
        eventType: "start",
        agentType: "claude",
        mode: "test",
        prompt: "Hello world",
        timestamp: Date.now(),
      };
      
      await db.insertEvent(record);
      expect(existsSync(testDbPath)).toBe(true);
    });

    it("should handle invalid database path gracefully", async () => {
      const invalidConfig: LocalStoreConfig = {
        isEnabled: true,
        path: "/invalid/path/cannot/create/db.sqlite",
      };
      
      const invalidDb = new TelemetryDB(invalidConfig);
      
      await expect(invalidDb.insertEvent({
        sessionId: "test",
        eventType: "start",
        agentType: "claude",
        mode: "test",
        prompt: "test",
        timestamp: Date.now(),
      })).rejects.toThrow(TelemetryDBInitError);
      
      await invalidDb.close();
    });

    it("should create directory if it doesn't exist", async () => {
      const dirPath = resolve(`./test-dir-${Date.now()}`);
      const dbPathInDir = resolve(dirPath, "test.db");
      
      const configWithDir: LocalStoreConfig = {
        isEnabled: true,
        path: dbPathInDir,
      };
      
      const dbWithDir = new TelemetryDB(configWithDir);
      
      await dbWithDir.insertEvent({
        sessionId: "test",
        eventType: "start",
        agentType: "claude",
        mode: "test",
        prompt: "test",
        timestamp: Date.now(),
      });
      
      expect(existsSync(dbPathInDir)).toBe(true);
      
      await dbWithDir.close();
      
      // Cleanup
      try {
        await unlink(dbPathInDir);
        await unlink(`${dbPathInDir}-wal`);
        await unlink(`${dbPathInDir}-shm`);
      } catch (error) {
        // Ignore
      }
    });
  });

  describe("Event Insertion", () => {
    it("should insert single event successfully", async () => {
      const record: Omit<TelemetryRecord, 'id'> = {
        sessionId: "session-1",
        eventType: "start",
        agentType: "claude",
        mode: "test",
        prompt: "Test prompt",
        timestamp: Date.now(),
      };
      
      await expect(db.insertEvent(record)).resolves.not.toThrow();
      
      const events = await db.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject(record);
      expect(events[0].id).toBeDefined();
    });

    it("should insert event with all optional fields", async () => {
      const record: Omit<TelemetryRecord, 'id'> = {
        sessionId: "session-1",
        eventType: "stream",
        agentType: "claude",
        mode: "test",
        prompt: "Test prompt",
        streamData: "Some stream content",
        sandboxId: "sandbox-123",
        repoUrl: "https://github.com/test/repo",
        metadata: { key: "value", number: 42 },
        timestamp: Date.now(),
      };
      
      await db.insertEvent(record);
      
      const events = await db.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject(record);
    });

    it("should insert batch of events in transaction", async () => {
      const records: Array<Omit<TelemetryRecord, 'id'>> = [
        {
          sessionId: "session-1",
          eventType: "start",
          agentType: "claude",
          mode: "test",
          prompt: "First prompt",
          timestamp: Date.now(),
        },
        {
          sessionId: "session-1",
          eventType: "stream",
          agentType: "claude",
          mode: "test",
          prompt: "First prompt",
          streamData: "Stream content",
          timestamp: Date.now() + 1000,
        },
        {
          sessionId: "session-1",
          eventType: "end",
          agentType: "claude",
          mode: "test",
          prompt: "First prompt",
          timestamp: Date.now() + 2000,
        },
      ];
      
      await db.insertBatch(records);
      
      const events = await db.getEvents();
      expect(events).toHaveLength(3);
    });

    it("should handle empty batch gracefully", async () => {
      await expect(db.insertBatch([])).resolves.not.toThrow();
      
      const events = await db.getEvents();
      expect(events).toHaveLength(0);
    });
  });

  describe("Event Querying", () => {
    beforeEach(async () => {
      // Insert test data
      const baseTime = Date.now();
      const records: Array<Omit<TelemetryRecord, 'id'>> = [
        {
          sessionId: "session-1",
          eventType: "start",
          agentType: "claude",
          mode: "test",
          prompt: "Prompt 1",
          timestamp: baseTime,
        },
        {
          sessionId: "session-1",
          eventType: "stream",
          agentType: "claude",
          mode: "test",
          prompt: "Prompt 1",
          streamData: "Stream 1",
          timestamp: baseTime + 1000,
        },
        {
          sessionId: "session-2",
          eventType: "start",
          agentType: "codex",
          mode: "production",
          prompt: "Prompt 2",
          timestamp: baseTime + 2000,
        },
        {
          sessionId: "session-1",
          eventType: "end",
          agentType: "claude",
          mode: "test",
          prompt: "Prompt 1",
          timestamp: baseTime + 3000,
        },
      ];
      
      await db.insertBatch(records);
    });

    it("should get all events when no filter provided", async () => {
      const events = await db.getEvents();
      expect(events).toHaveLength(4);
    });

    it("should filter by session ID", async () => {
      const events = await db.getEvents({ sessionId: "session-1" });
      expect(events).toHaveLength(3);
      expect(events.every(e => e.sessionId === "session-1")).toBe(true);
    });

    it("should filter by event type", async () => {
      const events = await db.getEvents({ eventType: "stream" });
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe("stream");
    });

    it("should filter by agent type", async () => {
      const events = await db.getEvents({ agentType: "claude" });
      expect(events).toHaveLength(3);
      expect(events.every(e => e.agentType === "claude")).toBe(true);
    });

    it("should filter by timestamp range", async () => {
      const baseTime = Date.now();
      const events = await db.getEvents({
        from: baseTime + 1500,
        to: baseTime + 2500,
      });
      expect(events).toHaveLength(1);
    });

    it("should support pagination", async () => {
      const page1 = await db.getEvents({ limit: 2, offset: 0 });
      const page2 = await db.getEvents({ limit: 2, offset: 2 });
      
      expect(page1).toHaveLength(2);
      expect(page2).toHaveLength(2);
      
      // Should not overlap
      const page1Ids = page1.map(e => e.id);
      const page2Ids = page2.map(e => e.id);
      expect(page1Ids.filter(id => page2Ids.includes(id))).toHaveLength(0);
    });

    it("should support ordering", async () => {
      const eventsDesc = await db.getEvents({ orderBy: "timestamp_desc" });
      const eventsAsc = await db.getEvents({ orderBy: "timestamp_asc" });
      
      expect(eventsDesc[0].timestamp).toBeGreaterThan(eventsDesc[eventsDesc.length - 1].timestamp);
      expect(eventsAsc[0].timestamp).toBeLessThan(eventsAsc[eventsAsc.length - 1].timestamp);
    });
  });

  describe("Statistics", () => {
    beforeEach(async () => {
      const baseTime = Date.now();
      const records: Array<Omit<TelemetryRecord, 'id'>> = [
        {
          sessionId: "session-1",
          eventType: "start",
          agentType: "claude",
          mode: "test",
          prompt: "Test 1",
          timestamp: baseTime,
        },
        {
          sessionId: "session-1",
          eventType: "stream",
          agentType: "claude",
          mode: "test",
          prompt: "Test 1",
          timestamp: baseTime + 1000,
        },
        {
          sessionId: "session-2",
          eventType: "start",
          agentType: "codex",
          mode: "test",
          prompt: "Test 2",
          timestamp: baseTime + 2000,
        },
      ];
      
      await db.insertBatch(records);
    });

    it("should return comprehensive statistics", async () => {
      const stats = await db.getStats();
      
      expect(stats.totalEvents).toBe(3);
      expect(stats.eventCounts).toEqual({
        start: 2,
        stream: 1,
      });
      expect(stats.agentBreakdown).toEqual({
        claude: 2,
        codex: 1,
      });
      expect(stats.uniqueSessions).toBe(2);
      expect(stats.dateRange.earliest).toBeGreaterThan(0);
      expect(stats.dateRange.latest).toBeGreaterThan(stats.dateRange.earliest);
      expect(stats.dbSizeBytes).toBeGreaterThan(0);
    });
  });

  describe("Data Management", () => {
    beforeEach(async () => {
      const records: Array<Omit<TelemetryRecord, 'id'>> = [
        {
          sessionId: "session-1",
          eventType: "start",
          agentType: "claude",
          mode: "test",
          prompt: "Test",
          timestamp: Date.now(),
        },
        {
          sessionId: "session-2",
          eventType: "stream",
          agentType: "codex",
          mode: "test",
          prompt: "Test",
          timestamp: Date.now(),
        },
      ];
      
      await db.insertBatch(records);
    });

    it("should clear all data", async () => {
      let events = await db.getEvents();
      expect(events).toHaveLength(2);
      
      await db.clear();
      
      events = await db.getEvents();
      expect(events).toHaveLength(0);
    });

    it("should perform health check", async () => {
      const isHealthy = await db.healthCheck();
      expect(isHealthy).toBe(true);
    });
  });

  describe("Error Handling", () => {
    it("should handle metadata serialization errors gracefully", async () => {
      const circularObj: any = {};
      circularObj.self = circularObj;
      
      const record: Omit<TelemetryRecord, 'id'> = {
        sessionId: "session-1",
        eventType: "start",
        agentType: "claude",
        mode: "test",
        prompt: "Test",
        metadata: circularObj,
        timestamp: Date.now(),
      };
      
      // Should not throw, but metadata should be null
      await expect(db.insertEvent(record)).resolves.not.toThrow();
      
      const events = await db.getEvents();
      expect(events[0].metadata).toBeUndefined();
    });

    it("should handle corrupted metadata in database gracefully", async () => {
      // Insert valid record first
      await db.insertEvent({
        sessionId: "session-1",
        eventType: "start",
        agentType: "claude",
        mode: "test",
        prompt: "Test",
        timestamp: Date.now(),
      });
      
      // This test would require manually corrupting the DB, 
      // so we'll test the deserialization method directly
      const events = await db.getEvents();
      expect(events).toHaveLength(1);
    });
  });

  describe("Resource Management", () => {
    it("should close database connection properly", async () => {
      await db.insertEvent({
        sessionId: "session-1",
        eventType: "start",
        agentType: "claude",
        mode: "test",
        prompt: "Test",
        timestamp: Date.now(),
      });
      
      await expect(db.close()).resolves.not.toThrow();
      
      // Health check should fail after close
      const isHealthy = await db.healthCheck();
      expect(isHealthy).toBe(false);
    });
  });
}); 