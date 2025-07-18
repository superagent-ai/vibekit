import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { join, resolve } from "path";
import { existsSync, unlinkSync, mkdirSync, writeFileSync } from "fs";
import { TelemetryDB } from "../../packages/vibekit/src/services/telemetry-db";
import { TelemetryRecord } from "../../packages/vibekit/src/types/telemetry-storage";

// Mock the CLI logger to test utility functions in isolation
class MockTelemetryCliLogger {
  static logs: string[] = [];
  static errors: string[] = [];
  static warnings: string[] = [];
  static tables: any[][] = [];

  static info(message: string): void {
    this.logs.push(`INFO: ${message}`);
  }

  static success(message: string): void {
    this.logs.push(`SUCCESS: ${message}`);
  }

  static error(message: string): void {
    this.errors.push(`ERROR: ${message}`);
  }

  static warn(message: string): void {
    this.warnings.push(`WARN: ${message}`);
  }

  static table(data: any[]): void {
    this.tables.push(data);
  }

  static json(data: any): void {
    this.logs.push(`JSON: ${JSON.stringify(data)}`);
  }

  static reset(): void {
    this.logs = [];
    this.errors = [];
    this.warnings = [];
    this.tables = [];
  }
}

// Re-implement the core telemetry analysis logic for testing
class TelemetryAnalyzer {
  constructor(private db: TelemetryDB) {}

  async getSessionSummaries(filter?: any): Promise<any[]> {
    const records = await this.db.getEvents(filter);
    const sessionMap = new Map();

    for (const record of records) {
      const key = `${record.sessionId}-${record.agentType}`;
      if (!sessionMap.has(key)) {
        sessionMap.set(key, {
          sessionId: record.sessionId,
          agentType: record.agentType,
          eventCount: 0,
          firstEventTime: record.timestamp,
          lastEventTime: record.timestamp,
          firstEvent: new Date(record.timestamp).toISOString(),
          lastEvent: new Date(record.timestamp).toISOString(),
          errorCount: 0,
          streamCount: 0
        });
      }

      const session = sessionMap.get(key);
      session.eventCount++;
      
      // Track actual timestamps for duration calculation
      if (record.timestamp < session.firstEventTime) {
        session.firstEventTime = record.timestamp;
        session.firstEvent = new Date(record.timestamp).toISOString();
      }
      if (record.timestamp > session.lastEventTime) {
        session.lastEventTime = record.timestamp;
        session.lastEvent = new Date(record.timestamp).toISOString();
      }

      if (record.eventType === 'error') {
        session.errorCount++;
      } else if (record.eventType === 'stream') {
        session.streamCount++;
      }
    }

    // Calculate durations using actual timestamps
    for (const session of sessionMap.values()) {
      session.duration = Math.round((session.lastEventTime - session.firstEventTime) / 1000); // seconds
    }

    return Array.from(sessionMap.values()).sort((a, b) => 
      b.lastEventTime - a.lastEventTime
    );
  }

  async getPerformanceStats(filter?: any): Promise<any> {
    const records = await this.db.getEvents(filter);
    
    const agentStats = new Map();

    for (const record of records) {
      if (!agentStats.has(record.agentType)) {
        agentStats.set(record.agentType, {
          totalEvents: 0,
          sessionCount: new Set(),
          errorRate: 0,
          streamEvents: 0
        });
      }

      const stats = agentStats.get(record.agentType);
      stats.totalEvents++;
      stats.sessionCount.add(record.sessionId);
      
      if (record.eventType === 'stream') {
        stats.streamEvents++;
      }
      
      if (record.eventType === 'error') {
        stats.errorRate++;
      }
    }

    // Calculate percentages
    const result: any = {};
    for (const [agentType, stats] of agentStats) {
      result[agentType] = {
        totalEvents: stats.totalEvents,
        uniqueSessions: stats.sessionCount.size,
        errorRate: (stats.errorRate / stats.totalEvents) * 100,
        streamEvents: stats.streamEvents
      };
    }

    return result;
  }
}

// Utility functions to test
function formatRecordsAsCSV(records: TelemetryRecord[]): string {
  if (records.length === 0) return '';
  
  const headers = ['timestamp', 'sessionId', 'agentType', 'eventType', 'mode', 'prompt', 'streamData', 'metadata'];
  const rows = records.map(record => [
    new Date(record.timestamp).toISOString(),
    record.sessionId,
    record.agentType,
    record.eventType,
    record.mode,
    record.prompt,
    record.streamData || '',
    JSON.stringify(record.metadata || {})
  ]);

  return [headers, ...rows].map(row => 
    row.map(cell => `"${cell.toString().replace(/"/g, '""')}"`).join(',')
  ).join('\n');
}

function parseTimestamp(timeStr: string): number {
  // Support relative times like "1h", "30m", "7d"
  const now = Date.now();
  const match = timeStr.match(/^(\d+)([hdmw])$/);
  
  if (match) {
    const amount = parseInt(match[1]);
    const unit = match[2];
    
    switch (unit) {
      case 'm': // minutes
        return now - amount * 60 * 1000;
      case 'h': // hours  
        return now - amount * 60 * 60 * 1000;
      case 'd': // days
        return now - amount * 24 * 60 * 60 * 1000;
      case 'w': // weeks
        return now - amount * 7 * 24 * 60 * 60 * 1000;
      default:
        return new Date(timeStr).getTime();
    }
  }
  
  return new Date(timeStr).getTime();
}

const TEST_DB_PATH = resolve("./test-telemetry-units.db");

describe("Telemetry CLI Unit Tests", () => {
  let testDb: TelemetryDB;
  let analyzer: TelemetryAnalyzer;
  let testRecords: Array<Omit<TelemetryRecord, 'id'>>;

  beforeEach(async () => {
    // Clean up previous test files
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }

    // Initialize test database with sample data
    testDb = new TelemetryDB({ isEnabled: true, path: TEST_DB_PATH });
    analyzer = new TelemetryAnalyzer(testDb);
    
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
    MockTelemetryCliLogger.reset();
  });

  afterEach(async () => {
    if (testDb) {
      await testDb.close();
    }
    
    // Clean up test files
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });

  describe("TelemetryAnalyzer", () => {
    describe("getSessionSummaries", () => {
      it("should return correct session summaries", async () => {
        const sessions = await analyzer.getSessionSummaries();
        
        expect(sessions).toHaveLength(2);
        
        // Check first session (most recent)
        const session1 = sessions.find(s => s.sessionId === "session-2");
        expect(session1).toBeDefined();
        expect(session1.agentType).toBe("codex");
        expect(session1.eventCount).toBe(2);
        expect(session1.errorCount).toBe(1);
        expect(session1.streamCount).toBe(0);
        expect(session1.duration).toBe(1); // 1 second between start and error
        
        // Check second session
        const session2 = sessions.find(s => s.sessionId === "session-1");
        expect(session2).toBeDefined();
        expect(session2.agentType).toBe("claude");
        expect(session2.eventCount).toBe(3);
        expect(session2.errorCount).toBe(0);
        expect(session2.streamCount).toBe(1);
        expect(session2.duration).toBe(2); // 2 seconds between start and end
      });

      it("should filter sessions by agent type", async () => {
        const sessions = await analyzer.getSessionSummaries({ agentType: "claude" });
        
        expect(sessions).toHaveLength(1);
        expect(sessions[0].agentType).toBe("claude");
        expect(sessions[0].sessionId).toBe("session-1");
      });

      it("should filter sessions by time range", async () => {
        const now = Date.now();
        const sessions = await analyzer.getSessionSummaries({ 
          from: now - 4500, // Should only get session-1's stream and end, and session-2
          to: now 
        });
        
        expect(sessions).toHaveLength(2); // Both sessions have events in this range
      });

      it("should handle empty results", async () => {
        const sessions = await analyzer.getSessionSummaries({ agentType: "nonexistent" });
        
        expect(sessions).toHaveLength(0);
      });
    });

    describe("getPerformanceStats", () => {
      it("should return correct performance statistics", async () => {
        const stats = await analyzer.getPerformanceStats();
        
        expect(stats).toHaveProperty("claude");
        expect(stats).toHaveProperty("codex");
        
        // Claude stats
        expect(stats.claude.totalEvents).toBe(3);
        expect(stats.claude.uniqueSessions).toBe(1);
        expect(stats.claude.errorRate).toBe(0);
        expect(stats.claude.streamEvents).toBe(1);
        
        // Codex stats  
        expect(stats.codex.totalEvents).toBe(2);
        expect(stats.codex.uniqueSessions).toBe(1);
        expect(stats.codex.errorRate).toBe(50); // 1 error out of 2 events
        expect(stats.codex.streamEvents).toBe(0);
      });

      it("should filter performance stats by agent", async () => {
        const stats = await analyzer.getPerformanceStats({ agentType: "claude" });
        
        expect(stats).toHaveProperty("claude");
        expect(stats).not.toHaveProperty("codex");
        expect(stats.claude.totalEvents).toBe(3);
      });

      it("should filter performance stats by event type", async () => {
        const stats = await analyzer.getPerformanceStats({ eventType: "error" });
        
        expect(stats).toHaveProperty("codex");
        expect(stats).not.toHaveProperty("claude");
        expect(stats.codex.totalEvents).toBe(1);
        expect(stats.codex.errorRate).toBe(100); // Only error events
      });

      it("should handle empty results", async () => {
        const stats = await analyzer.getPerformanceStats({ agentType: "nonexistent" });
        
        expect(Object.keys(stats)).toHaveLength(0);
      });
    });
  });

  describe("Utility Functions", () => {
    describe("formatRecordsAsCSV", () => {
      it("should format records as valid CSV", () => {
        const csv = formatRecordsAsCSV(testRecords as TelemetryRecord[]);
        
        const lines = csv.split('\n');
        expect(lines).toHaveLength(6); // 5 records + header
        
        // Check header
        expect(lines[0]).toContain('timestamp');
        expect(lines[0]).toContain('sessionId');
        expect(lines[0]).toContain('agentType');
        expect(lines[0]).toContain('eventType');
        
        // Check data rows
        expect(lines[1]).toContain('session-1');
        expect(lines[1]).toContain('claude');
        expect(lines[1]).toContain('start');
        
        // Check CSV escaping
        expect(lines[1]).toMatch(/^".*",".*",".*"/); // Should be quoted
      });

      it("should handle empty records", () => {
        const csv = formatRecordsAsCSV([]);
        expect(csv).toBe('');
      });

      it("should escape quotes in data", () => {
        const recordWithQuotes: TelemetryRecord = {
          sessionId: 'test"session',
          eventType: "start",
          agentType: "claude",
          mode: "chat",
          prompt: 'Say "hello"',
          timestamp: Date.now()
        };
        
        const csv = formatRecordsAsCSV([recordWithQuotes]);
        expect(csv).toContain('""hello""'); // Quotes should be escaped
      });
    });

    describe("parseTimestamp", () => {
      const now = Date.now();
      
      beforeEach(() => {
        vi.spyOn(Date, 'now').mockReturnValue(now);
      });

      afterEach(() => {
        vi.restoreAllMocks();
      });

      it("should parse relative time formats", () => {
        expect(parseTimestamp("1h")).toBe(now - 60 * 60 * 1000);
        expect(parseTimestamp("30m")).toBe(now - 30 * 60 * 1000);
        expect(parseTimestamp("7d")).toBe(now - 7 * 24 * 60 * 60 * 1000);
        expect(parseTimestamp("2w")).toBe(now - 2 * 7 * 24 * 60 * 60 * 1000);
      });

      it("should parse absolute timestamps", () => {
        const isoString = "2024-01-01T00:00:00.000Z";
        expect(parseTimestamp(isoString)).toBe(new Date(isoString).getTime());
      });

      it("should handle invalid formats gracefully", () => {
        const invalidTime = "invalid-time";
        const result = parseTimestamp(invalidTime);
        expect(isNaN(result)).toBe(true);
      });

      it("should handle edge cases", () => {
        expect(parseTimestamp("0m")).toBe(now);
        expect(parseTimestamp("1000d")).toBe(now - 1000 * 24 * 60 * 60 * 1000);
      });
    });
  });

  describe("MockTelemetryCliLogger", () => {
    it("should capture log messages", () => {
      MockTelemetryCliLogger.info("Test info");
      MockTelemetryCliLogger.success("Test success");
      MockTelemetryCliLogger.error("Test error");
      MockTelemetryCliLogger.warn("Test warning");
      
      expect(MockTelemetryCliLogger.logs).toContain("INFO: Test info");
      expect(MockTelemetryCliLogger.logs).toContain("SUCCESS: Test success");
      expect(MockTelemetryCliLogger.errors).toContain("ERROR: Test error");
      expect(MockTelemetryCliLogger.warnings).toContain("WARN: Test warning");
    });

    it("should capture table data", () => {
      const testData = [{ id: 1, name: "test" }];
      MockTelemetryCliLogger.table(testData);
      
      expect(MockTelemetryCliLogger.tables).toHaveLength(1);
      expect(MockTelemetryCliLogger.tables[0]).toEqual(testData);
    });

    it("should capture JSON output", () => {
      const testData = { test: "data" };
      MockTelemetryCliLogger.json(testData);
      
      expect(MockTelemetryCliLogger.logs).toContain(`JSON: ${JSON.stringify(testData)}`);
    });

    it("should reset properly", () => {
      MockTelemetryCliLogger.info("Test");
      MockTelemetryCliLogger.error("Error");
      MockTelemetryCliLogger.reset();
      
      expect(MockTelemetryCliLogger.logs).toHaveLength(0);
      expect(MockTelemetryCliLogger.errors).toHaveLength(0);
    });
  });

  describe("Integration Scenarios", () => {
    it("should handle complex session analysis workflow", async () => {
      // Add more complex test data
      const complexRecords = [
        {
          sessionId: "long-session",
          eventType: "start" as const,
          agentType: "claude",
          mode: "chat",
          prompt: "Complex task",
          timestamp: Date.now() - 10000
        },
        {
          sessionId: "long-session",
          eventType: "stream" as const,
          agentType: "claude",
          mode: "chat",
          prompt: "Complex task",
          streamData: "Thinking...",
          timestamp: Date.now() - 8000
        },
        {
          sessionId: "long-session",
          eventType: "stream" as const,
          agentType: "claude",
          mode: "chat",
          prompt: "Complex task",
          streamData: "Still working...",
          timestamp: Date.now() - 6000
        },
        {
          sessionId: "long-session",
          eventType: "error" as const,
          agentType: "claude",
          mode: "chat",
          prompt: "Complex task",
          timestamp: Date.now() - 4000,
          metadata: { error: "Rate limit" }
        },
        {
          sessionId: "long-session",
          eventType: "start" as const,
          agentType: "claude",
          mode: "chat",
          prompt: "Retry task",
          timestamp: Date.now() - 2000
        },
        {
          sessionId: "long-session",
          eventType: "end" as const,
          agentType: "claude",
          mode: "chat",
          prompt: "Retry task",
          timestamp: Date.now() - 1000
        }
      ];

      await testDb.insertBatch(complexRecords);

      // Test session analysis
      const sessions = await analyzer.getSessionSummaries();
      const longSession = sessions.find(s => s.sessionId === "long-session");
      
      expect(longSession).toBeDefined();
      expect(longSession.eventCount).toBe(6);
      expect(longSession.streamCount).toBe(2);
      expect(longSession.errorCount).toBe(1);
      expect(longSession.duration).toBe(9); // 9 seconds from start to end

      // Test performance analysis
      const perfStats = await analyzer.getPerformanceStats();
      expect(perfStats.claude.totalEvents).toBe(9); // 3 original + 6 new
      expect(perfStats.claude.streamEvents).toBe(3); // 1 original + 2 new
      expect(perfStats.claude.errorRate).toBeCloseTo(11.11, 1); // 1 error out of 9 events
    });

    it("should handle multi-agent comparison scenarios", async () => {
      // Add multi-agent test data
      const multiAgentRecords = [
        ...["gemini", "opencode", "codex"].flatMap(agentType => [
          {
            sessionId: `${agentType}-session`,
            eventType: "start" as const,
            agentType,
            mode: "code",
            prompt: "Generate function",
            timestamp: Date.now() - 5000
          },
          {
            sessionId: `${agentType}-session`,
            eventType: "stream" as const,
            agentType,
            mode: "code",
            prompt: "Generate function",
            streamData: `${agentType} response`,
            timestamp: Date.now() - 3000
          },
          {
            sessionId: `${agentType}-session`,
            eventType: "end" as const,
            agentType,
            mode: "code",
            prompt: "Generate function",
            timestamp: Date.now() - 1000
          }
        ])
      ];

      await testDb.insertBatch(multiAgentRecords);

      const perfStats = await analyzer.getPerformanceStats();
      
      // Should have stats for all agents
      expect(Object.keys(perfStats)).toContain("claude");
      expect(Object.keys(perfStats)).toContain("codex");
      expect(Object.keys(perfStats)).toContain("gemini");
      expect(Object.keys(perfStats)).toContain("opencode");
      
      // Each new agent should have same pattern
      for (const agent of ["gemini", "opencode"]) {
        expect(perfStats[agent].totalEvents).toBe(3);
        expect(perfStats[agent].uniqueSessions).toBe(1);
        expect(perfStats[agent].streamEvents).toBe(1);
        expect(perfStats[agent].errorRate).toBe(0);
      }
    });
  });
}); 