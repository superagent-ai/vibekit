import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { join, resolve } from "path";
import { existsSync, unlinkSync, mkdirSync, writeFileSync } from "fs";
import { TelemetryDB } from "../../packages/vibekit/src/services/telemetry-db";
import { TelemetryRecord } from "../../packages/vibekit/src/types/telemetry-storage";

// Import the functions we want to test (normally would be done through CLI)
import { registerTelemetryCommands } from "../../packages/vibekit/src/cli/commands/telemetry";
import { Command } from "commander";

const TEST_DB_PATH = resolve("./test-telemetry.db");
const TEST_OUTPUT_DIR = resolve("./test-output");

describe("Telemetry CLI Commands", () => {
  let testDb: TelemetryDB;
  let program: Command;
  let consoleSpy: any;
  let testRecords: Array<Omit<TelemetryRecord, 'id'>>;

  beforeEach(async () => {
    // Clean up previous test files
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
    if (existsSync(TEST_OUTPUT_DIR)) {
      // Remove directory recursively
      await import('fs/promises').then(fs => fs.rm(TEST_OUTPUT_DIR, { recursive: true, force: true }));
    }
    
    // Create test directory
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

    // Setup CLI program
    program = new Command();
    (registerTelemetryCommands as any)(program);
    
    // Mock console methods
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
    
    // Clean up test files
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
    if (existsSync(TEST_OUTPUT_DIR)) {
      await import('fs/promises').then(fs => fs.rm(TEST_OUTPUT_DIR, { recursive: true, force: true }));
    }

    // Restore console
    Object.values(consoleSpy).forEach((spy: any) => spy.mockRestore());
  });

  describe("Query Command", () => {
    it("should query all telemetry records", async () => {
      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      
      try {
        await program.parseAsync(['node', 'test', 'telemetry', 'query', '-d', TEST_DB_PATH]);
        
        expect(consoleSpy.log).toHaveBeenCalledWith('ℹ️  Found 5 telemetry records');
        expect(consoleSpy.table).toHaveBeenCalled();
      } finally {
        mockExit.mockRestore();
      }
    });

    it("should filter by session ID", async () => {
      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      
      try {
        await program.parseAsync(['node', 'test', 'telemetry', 'query', '-d', TEST_DB_PATH, '-s', 'session-1']);
        
        expect(consoleSpy.log).toHaveBeenCalledWith('ℹ️  Found 3 telemetry records');
      } finally {
        mockExit.mockRestore();
      }
    });

    it("should filter by agent type", async () => {
      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      
      try {
        await program.parseAsync(['node', 'test', 'telemetry', 'query', '-d', TEST_DB_PATH, '-a', 'codex']);
        
        expect(consoleSpy.log).toHaveBeenCalledWith('ℹ️  Found 2 telemetry records');
      } finally {
        mockExit.mockRestore();
      }
    });

    it("should filter by event type", async () => {
      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      
      try {
        await program.parseAsync(['node', 'test', 'telemetry', 'query', '-d', TEST_DB_PATH, '-e', 'start']);
        
        expect(consoleSpy.log).toHaveBeenCalledWith('ℹ️  Found 2 telemetry records');
      } finally {
        mockExit.mockRestore();
      }
    });

    it("should limit results", async () => {
      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      
      try {
        await program.parseAsync(['node', 'test', 'telemetry', 'query', '-d', TEST_DB_PATH, '-l', '2']);
        
        expect(consoleSpy.log).toHaveBeenCalledWith('ℹ️  Found 2 telemetry records');
      } finally {
        mockExit.mockRestore();
      }
    });

    it("should output JSON format", async () => {
      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      
      try {
        await program.parseAsync(['node', 'test', 'telemetry', 'query', '-d', TEST_DB_PATH, '-f', 'json', '-l', '1']);
        
        expect(consoleSpy.log).toHaveBeenCalledWith('ℹ️  Found 1 telemetry records');
        // JSON output should be logged
        expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('"sessionId":'));
      } finally {
        mockExit.mockRestore();
      }
    });

    it("should handle missing database", async () => {
      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      
      try {
        await program.parseAsync(['node', 'test', 'telemetry', 'query', '-d', './non-existent.db']);
        
        expect(consoleSpy.error).toHaveBeenCalledWith(expect.stringContaining('Telemetry database not found'));
      } finally {
        mockExit.mockRestore();
      }
    });
  });

  describe("Sessions Command", () => {
    it("should show session summaries", async () => {
      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      
      try {
        await program.parseAsync(['node', 'test', 'telemetry', 'sessions', '-d', TEST_DB_PATH]);
        
        expect(consoleSpy.log).toHaveBeenCalledWith('ℹ️  Found 2 sessions');
        expect(consoleSpy.table).toHaveBeenCalled();
      } finally {
        mockExit.mockRestore();
      }
    });

    it("should filter sessions by agent type", async () => {
      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      
      try {
        await program.parseAsync(['node', 'test', 'telemetry', 'sessions', '-d', TEST_DB_PATH, '-a', 'claude']);
        
        expect(consoleSpy.log).toHaveBeenCalledWith('ℹ️  Found 1 sessions');
      } finally {
        mockExit.mockRestore();
      }
    });

    it("should output sessions as JSON", async () => {
      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      
      try {
        await program.parseAsync(['node', 'test', 'telemetry', 'sessions', '-d', TEST_DB_PATH, '-f', 'json']);
        
        expect(consoleSpy.log).toHaveBeenCalledWith('ℹ️  Found 2 sessions');
        expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('"sessionId":'));
      } finally {
        mockExit.mockRestore();
      }
    });
  });

  describe("Performance Command", () => {
    it("should show performance statistics", async () => {
      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      
      try {
        await program.parseAsync(['node', 'test', 'telemetry', 'performance', '-d', TEST_DB_PATH]);
        
        expect(consoleSpy.log).toHaveBeenCalledWith('ℹ️  Performance Statistics by Agent Type:');
        expect(consoleSpy.table).toHaveBeenCalled();
      } finally {
        mockExit.mockRestore();
      }
    });

    it("should filter performance by agent type", async () => {
      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      
      try {
        await program.parseAsync(['node', 'test', 'telemetry', 'performance', '-d', TEST_DB_PATH, '-a', 'claude']);
        
        expect(consoleSpy.log).toHaveBeenCalledWith('ℹ️  Performance Statistics by Agent Type:');
      } finally {
        mockExit.mockRestore();
      }
    });

    it("should output performance as JSON", async () => {
      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      
      try {
        await program.parseAsync(['node', 'test', 'telemetry', 'performance', '-d', TEST_DB_PATH, '-f', 'json']);
        
        expect(consoleSpy.log).toHaveBeenCalledWith('ℹ️  Performance Statistics by Agent Type:');
        expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('"totalEvents":'));
      } finally {
        mockExit.mockRestore();
      }
    });
  });

  describe("Export Command", () => {
    it("should export to JSON file", async () => {
      const outputFile = join(TEST_OUTPUT_DIR, 'export.json');
      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      
      try {
        await program.parseAsync(['node', 'test', 'telemetry', 'export', '-d', TEST_DB_PATH, '-o', outputFile, '-f', 'json']);
        
        expect(existsSync(outputFile)).toBe(true);
        expect(consoleSpy.log).toHaveBeenCalledWith('✅ Data exported to: ' + outputFile);
        
        const exportedData = JSON.parse(require('fs').readFileSync(outputFile, 'utf8'));
        expect(exportedData).toHaveLength(5);
        expect(exportedData[0]).toHaveProperty('sessionId');
      } finally {
        mockExit.mockRestore();
      }
    });

    it("should export to CSV file", async () => {
      const outputFile = join(TEST_OUTPUT_DIR, 'export.csv');
      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      
      try {
        await program.parseAsync(['node', 'test', 'telemetry', 'export', '-d', TEST_DB_PATH, '-o', outputFile, '-f', 'csv']);
        
        expect(existsSync(outputFile)).toBe(true);
        expect(consoleSpy.log).toHaveBeenCalledWith('✅ Data exported to: ' + outputFile);
        
        const csvContent = require('fs').readFileSync(outputFile, 'utf8');
        expect(csvContent).toContain('timestamp,sessionId,agentType,eventType');
        expect(csvContent.split('\n')).toHaveLength(7); // 5 records + header + empty line
      } finally {
        mockExit.mockRestore();
      }
    });

    it("should export filtered data", async () => {
      const outputFile = join(TEST_OUTPUT_DIR, 'filtered.json');
      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      
      try {
        await program.parseAsync(['node', 'test', 'telemetry', 'export', '-d', TEST_DB_PATH, '-o', outputFile, '-a', 'claude']);
        
        expect(existsSync(outputFile)).toBe(true);
        
        const exportedData = JSON.parse(require('fs').readFileSync(outputFile, 'utf8'));
        expect(exportedData).toHaveLength(3);
        expect(exportedData.every((record: any) => record.agentType === 'claude')).toBe(true);
      } finally {
        mockExit.mockRestore();
      }
    });
  });

  describe("Clear Command", () => {
    it("should clear all telemetry data", async () => {
      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      
      try {
        // Verify data exists first
        const recordsBefore = await testDb.getEvents();
        expect(recordsBefore).toHaveLength(5);
        
        await program.parseAsync(['node', 'test', 'telemetry', 'clear', '-d', TEST_DB_PATH]);
        
        expect(consoleSpy.log).toHaveBeenCalledWith('✅ Cleared 5 telemetry records');
        
        // Verify data is cleared
        const recordsAfter = await testDb.getEvents();
        expect(recordsAfter).toHaveLength(0);
      } finally {
        mockExit.mockRestore();
      }
    });

    it("should handle missing database gracefully", async () => {
      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      
      try {
        await program.parseAsync(['node', 'test', 'telemetry', 'clear', '-d', './non-existent.db']);
        
        expect(consoleSpy.warn).toHaveBeenCalledWith('⚠️  No telemetry database found to clear');
      } finally {
        mockExit.mockRestore();
      }
    });
  });

  describe("Time Parsing", () => {
    it("should handle relative time formats", async () => {
      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      
      try {
        // Test with relative time - should find recent records
        await program.parseAsync(['node', 'test', 'telemetry', 'query', '-d', TEST_DB_PATH, '--since', '1h']);
        
        expect(consoleSpy.log).toHaveBeenCalledWith('ℹ️  Found 5 telemetry records');
      } finally {
        mockExit.mockRestore();
      }
    });

    it("should handle since and until filters", async () => {
      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      
      try {
        // Test filtering to a narrow time window
        const now = new Date();
        const past = new Date(now.getTime() - 10000); // 10 seconds ago
        
        await program.parseAsync([
          'node', 'test', 'telemetry', 'query', '-d', TEST_DB_PATH, 
          '--since', past.toISOString(),
          '--until', now.toISOString()
        ]);
        
        expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('Found'));
      } finally {
        mockExit.mockRestore();
      }
    });
  });

  describe("Error Handling", () => {
    it("should handle database errors gracefully", async () => {
      // Create an invalid database file
      writeFileSync(TEST_DB_PATH, 'invalid sqlite content');
      
      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      
      try {
        await program.parseAsync(['node', 'test', 'telemetry', 'query', '-d', TEST_DB_PATH]);
        
        expect(consoleSpy.error).toHaveBeenCalledWith(expect.stringContaining('Failed to query telemetry data'));
      } finally {
        mockExit.mockRestore();
      }
    });

    it("should handle invalid event type filter", async () => {
      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      
      try {
        // This should still work but find no results
        await program.parseAsync(['node', 'test', 'telemetry', 'query', '-d', TEST_DB_PATH, '-e', 'invalid']);
        
        expect(consoleSpy.log).toHaveBeenCalledWith('ℹ️  Found 0 telemetry records');
      } finally {
        mockExit.mockRestore();
      }
    });
  });
}); 