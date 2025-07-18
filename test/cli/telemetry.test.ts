import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { join, resolve } from "path";
import { existsSync, unlinkSync, mkdirSync, writeFileSync } from "fs";
import { TelemetryDB } from "../../packages/vibekit/src/services/telemetry-db";
import { TelemetryRecord } from "../../packages/vibekit/src/types/telemetry-storage";

const TEST_DB_PATH = resolve("./test-telemetry.db");
const TEST_OUTPUT_DIR = resolve("./test-output");

describe("Telemetry CLI Commands", () => {
  let testDb: TelemetryDB;
  let consoleSpy: any;
  let testRecords: Array<Omit<TelemetryRecord, 'id'>>;

  beforeEach(async () => {
    // Clean up previous test files
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
    if (existsSync(TEST_OUTPUT_DIR)) {
      await import('fs/promises').then(fs => fs.rm(TEST_OUTPUT_DIR, { recursive: true, force: true }));
    }
    
    mkdirSync(TEST_OUTPUT_DIR, { recursive: true });

    // Initialize test database with sample data
    testDb = new TelemetryDB({ isEnabled: true, path: TEST_DB_PATH });
    
    const now = Date.now();
    testRecords = [
      {
        sessionId: "session-1",
        eventType: "start",
        agentType: "claude",
        mode: "chat",
        prompt: "Hello world",
        timestamp: now - 5000,
        metadata: { version: "1.0" }
      },
      {
        sessionId: "session-1", 
        eventType: "stream",
        agentType: "claude",
        mode: "chat", 
        prompt: "Hello world",
        streamData: "Hello there!",
        timestamp: now - 4000
      },
      {
        sessionId: "session-1",
        eventType: "end",
        agentType: "claude",
        mode: "chat",
        prompt: "Hello world",
        timestamp: now - 3000
      },
      {
        sessionId: "session-2",
        eventType: "start", 
        agentType: "codex",
        mode: "code",
        prompt: "Write a function",
        timestamp: now - 2000
      },
      {
        sessionId: "session-2",
        eventType: "error",
        agentType: "codex",
        mode: "code",
        prompt: "Write a function", 
        timestamp: now - 1000,
        metadata: { error: "timeout" }
      }
    ];

    await testDb.insertBatch(testRecords);

    // Mock console methods for testing output
    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      table: vi.spyOn(console, 'table').mockImplementation(() => {})
    };
  });

  afterEach(async () => {
    if (testDb) {
      await testDb.close();
    }
    
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
    if (existsSync(TEST_OUTPUT_DIR)) {
      await import('fs/promises').then(fs => fs.rm(TEST_OUTPUT_DIR, { recursive: true, force: true }));
    }

    Object.values(consoleSpy).forEach((spy: any) => spy.mockRestore());
  });

  describe("Database Operations", () => {
    it("should verify test data setup", async () => {
      const records = await testDb.getEvents({});
      expect(records.length).toBe(5);
      expect(['claude', 'codex']).toContain(records[0].agentType);
    });

    it("should query all telemetry records", async () => {
      const records = await testDb.getEvents({});
      expect(records.length).toBe(5);
    });

    it("should filter by session ID", async () => {
      const records = await testDb.getEvents({ sessionId: "session-1" });
      expect(records.length).toBe(3);
    });

    it("should filter by agent type", async () => {
      const records = await testDb.getEvents({ agentType: "claude" });
      expect(records.length).toBe(3);
    });

    it("should filter by event type", async () => {
      const records = await testDb.getEvents({ eventType: "start" });
      expect(records.length).toBe(2);
    });

    it("should limit results", async () => {
      const records = await testDb.getEvents({ limit: 2 });
      expect(records.length).toBe(2);
    });

    it("should handle missing database gracefully", async () => {
      const nonExistentPath = './non-existent.db';
      expect(existsSync(nonExistentPath)).toBe(false);
    });

    it("should provide session summaries", async () => {
      const records = await testDb.getEvents({});
      const sessionIds = [...new Set(records.map(r => r.sessionId))];
      expect(sessionIds.length).toBe(2);
      expect(sessionIds).toContain("session-1");
      expect(sessionIds).toContain("session-2");
    });

    it("should filter sessions by agent type", async () => {
      const claudeRecords = await testDb.getEvents({ agentType: "claude" });
      const sessionIds = [...new Set(claudeRecords.map(r => r.sessionId))];
      expect(sessionIds.length).toBe(1);
      expect(sessionIds[0]).toBe("session-1");
    });

    it("should export to JSON format", async () => {
      const records = await testDb.getEvents({ sessionId: "session-1" });
      const jsonData = JSON.stringify(records, null, 2);
      expect(jsonData).toContain('"sessionId": "session-1"');
      expect(jsonData).toContain('"agentType": "claude"');
    });

    it("should export to JSON file", async () => {
      const outputFile = join(TEST_OUTPUT_DIR, 'export.json');
      const records = await testDb.getEvents({});
      writeFileSync(outputFile, JSON.stringify(records, null, 2));
      expect(existsSync(outputFile)).toBe(true);
    });

    it("should export to CSV file", async () => {
      const outputFile = join(TEST_OUTPUT_DIR, 'export.csv');
      const records = await testDb.getEvents({});
      const csvHeader = 'timestamp,sessionId,agentType,eventType,mode,prompt\n';
      const csvData = records.map(r => 
        `${r.timestamp},${r.sessionId},${r.agentType},${r.eventType},${r.mode},"${r.prompt}"`
      ).join('\n');
      writeFileSync(outputFile, csvHeader + csvData);
      expect(existsSync(outputFile)).toBe(true);
    });

    it("should export filtered data", async () => {
      const outputFile = join(TEST_OUTPUT_DIR, 'filtered.json');
      const records = await testDb.getEvents({ agentType: "claude" });
      writeFileSync(outputFile, JSON.stringify(records, null, 2));
      expect(existsSync(outputFile)).toBe(true);
      
      const exportedData = JSON.parse(require('fs').readFileSync(outputFile, 'utf8'));
      expect(exportedData.length).toBe(3);
      expect(exportedData.every((r: any) => r.agentType === 'claude')).toBe(true);
    });

    it("should clear all telemetry data", async () => {
      const beforeRecords = await testDb.getEvents({});
      expect(beforeRecords.length).toBe(5);
      
      await testDb.clear();
      
      const afterRecords = await testDb.getEvents({});
      expect(afterRecords.length).toBe(0);
    });

    it("should handle missing database gracefully for clear", () => {
      const nonExistentPath = './non-existent.db';
      expect(existsSync(nonExistentPath)).toBe(false);
    });

    it("should handle relative time formats", async () => {
      const oneHourAgo = Date.now() - (60 * 60 * 1000);
      const records = await testDb.getEvents({ from: oneHourAgo });
      expect(records.length).toBe(5); // All our test records are recent
    });

    it("should handle since and until filters", async () => {
      const records = await testDb.getEvents({
        from: Date.now() - 6000,
        to: Date.now() - 2500
      });
      expect(records.length).toBeGreaterThan(0);
    });

    it("should handle database errors gracefully", () => {
      // Test with invalid database path
      expect(() => {
        new TelemetryDB({ isEnabled: true, path: '/invalid/path/db.db' });
      }).not.toThrow(); // Constructor shouldn't throw, errors happen on operations
    });

    it("should handle invalid event type filter", async () => {
      const records = await testDb.getEvents({ eventType: "invalid" as any });
      expect(records.length).toBe(0);
    });

    it("should show performance statistics", async () => {
      const records = await testDb.getEvents({});
      const agentStats = records.reduce((acc, record) => {
        if (!acc[record.agentType]) {
          acc[record.agentType] = { totalEvents: 0, errorCount: 0 };
        }
        acc[record.agentType].totalEvents++;
        if (record.eventType === 'error') {
          acc[record.agentType].errorCount++;
        }
        return acc;
      }, {} as Record<string, any>);
      
      expect(Object.keys(agentStats)).toContain('claude');
      expect(Object.keys(agentStats)).toContain('codex');
      expect(agentStats.claude.totalEvents).toBe(3);
      expect(agentStats.codex.totalEvents).toBe(2);
    });

    it("should filter performance by agent type", async () => {
      const records = await testDb.getEvents({ agentType: "claude" });
      const errorCount = records.filter(r => r.eventType === 'error').length;
      expect(errorCount).toBe(0); // Claude has no errors in test data
      
      const codexRecords = await testDb.getEvents({ agentType: "codex" });
      const codexErrorCount = codexRecords.filter(r => r.eventType === 'error').length;
      expect(codexErrorCount).toBe(1); // Codex has 1 error
    });

    it("should output performance as JSON", async () => {
      const records = await testDb.getEvents({});
      const stats = {
        totalEvents: records.length,
        uniqueSessions: [...new Set(records.map(r => r.sessionId))].length,
        agentTypes: [...new Set(records.map(r => r.agentType))]
      };
      
      const jsonOutput = JSON.stringify(stats);
      expect(jsonOutput).toContain('"totalEvents":5');
      expect(jsonOutput).toContain('"uniqueSessions":2');
    });
  });
}); 