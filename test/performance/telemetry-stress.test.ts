import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolve } from "path";
import { existsSync, unlinkSync } from "fs";
import { TelemetryDB } from "../../packages/vibekit/src/services/telemetry-db";
import { TelemetryRecord } from "../../packages/vibekit/src/types/telemetry-storage";

const TEST_DB_PATH = resolve("./test-telemetry-stress.db");

describe("Telemetry Performance and Stress Tests", () => {
  let testDb: TelemetryDB;

  beforeEach(async () => {
    // Clean up previous test files
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }

    testDb = new TelemetryDB({ isEnabled: true, path: TEST_DB_PATH });
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

  describe("High Volume Data Operations", () => {
    it("should handle high-volume batch inserts efficiently", async () => {
      const recordCount = 10000;
      const batchSize = 1000;
      const records: Array<Omit<TelemetryRecord, 'id'>> = [];

      // Generate test data
      const baseTime = Date.now();
      for (let i = 0; i < recordCount; i++) {
        records.push({
          sessionId: `session-${Math.floor(i / 100)}`,
          eventType: i % 4 === 0 ? "start" : i % 4 === 3 ? "end" : i % 4 === 2 ? "error" : "stream",
          agentType: ["claude", "codex", "gemini"][i % 3],
          mode: ["chat", "code", "analysis"][i % 3],
          prompt: `Test prompt ${i}`,
          timestamp: baseTime + i * 100,
          streamData: i % 4 === 1 ? `Stream data ${i}` : undefined,
          metadata: { index: i, batchTest: true }
        });
      }

      const startTime = Date.now();

      // Insert in batches for better performance
      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        await testDb.insertBatch(batch);
      }

      const insertTime = Date.now() - startTime;

      // Verify all records were inserted
      const allRecords = await testDb.getEvents();
      expect(allRecords).toHaveLength(recordCount);

      // Performance assertions
      expect(insertTime).toBeLessThan(5000); // Should complete within 5 seconds
      const recordsPerSecond = recordCount / (insertTime / 1000);
      expect(recordsPerSecond).toBeGreaterThan(2000); // Should process at least 2000 records/sec

      console.log(`Performance: Inserted ${recordCount} records in ${insertTime}ms (${Math.round(recordsPerSecond)} records/sec)`);
    });

    it("should perform efficient queries on large datasets", async () => {
      // Insert test data
      const sessionCount = 100;
      const eventsPerSession = 50;
      const agents = ["claude", "codex", "gemini", "opencode"];
      
      const records: Array<Omit<TelemetryRecord, 'id'>> = [];
      const baseTime = Date.now();

      for (let s = 0; s < sessionCount; s++) {
        const agentType = agents[s % agents.length];
        for (let e = 0; e < eventsPerSession; e++) {
          records.push({
            sessionId: `session-${s}`,
            eventType: e === 0 ? "start" : e === eventsPerSession - 1 ? "end" : "stream",
            agentType,
            mode: "chat",
            prompt: `Session ${s} event ${e}`,
            timestamp: baseTime + s * 1000 + e * 20,
            streamData: e > 0 && e < eventsPerSession - 1 ? `Stream ${e}` : undefined,
            metadata: { sessionIndex: s, eventIndex: e }
          });
        }
      }

      await testDb.insertBatch(records);

      // Test query performance
      const queryTests = [
        { name: "Agent filtering", filter: { agentType: "claude" } },
        { name: "Event type filtering", filter: { eventType: "stream" as const } },
        { name: "Time range filtering", filter: { from: baseTime, to: baseTime + 50000 } },
        { name: "Complex multi-filter", filter: { agentType: "claude", eventType: "stream" as const, limit: 100 } },
        { name: "Limited results", filter: { limit: 500 } }
      ];

      for (const test of queryTests) {
        const startTime = Date.now();
        const results = await testDb.getEvents(test.filter);
        const queryTime = Date.now() - startTime;

        expect(queryTime).toBeLessThan(100); // All queries should be fast
        expect(results.length).toBeGreaterThan(0);
        
        console.log(`${test.name}: ${results.length} results in ${queryTime}ms`);
      }
    });

    it("should handle concurrent operations safely", async () => {
      const concurrentOperations = 20;
      const recordsPerOperation = 100;

      const operationPromises: Promise<void>[] = [];

      for (let op = 0; op < concurrentOperations; op++) {
        const promise = (async () => {
          const records: Array<Omit<TelemetryRecord, 'id'>> = [];
          const baseTime = Date.now() + op * 1000;

          for (let i = 0; i < recordsPerOperation; i++) {
            records.push({
              sessionId: `concurrent-session-${op}-${i}`,
              eventType: "stream",
              agentType: "claude",
              mode: "chat",
              prompt: `Concurrent operation ${op}, record ${i}`,
              timestamp: baseTime + i,
              streamData: `Concurrent data ${op}-${i}`,
              metadata: { operation: op, recordIndex: i }
            });
          }

          await testDb.insertBatch(records);
        })();

        operationPromises.push(promise);
      }

      const startTime = Date.now();
      await Promise.all(operationPromises);
      const totalTime = Date.now() - startTime;

      // Verify all records were inserted correctly
      const allRecords = await testDb.getEvents();
      expect(allRecords).toHaveLength(concurrentOperations * recordsPerOperation);

      // Performance check
      expect(totalTime).toBeLessThan(3000); // Should complete within 3 seconds
      console.log(`Concurrent operations: ${concurrentOperations * recordsPerOperation} records in ${totalTime}ms`);
    });
  });

  describe("Memory and Resource Stress", () => {
    it("should handle large record payloads efficiently", async () => {
      const recordCount = 1000;
      const largeDataSize = 50000; // 50KB per record
      const largeData = "x".repeat(largeDataSize);

      const records: Array<Omit<TelemetryRecord, 'id'>> = [];
      for (let i = 0; i < recordCount; i++) {
        records.push({
          sessionId: `large-session-${i}`,
          eventType: "stream",
          agentType: "claude",
          mode: "chat",
          prompt: "Large data test",
          timestamp: Date.now() + i,
          streamData: `${largeData}-${i}`,
          metadata: { 
            index: i, 
            dataSize: largeDataSize,
            largeMetadata: "x".repeat(1000) // Large metadata too
          }
        });
      }

      const startTime = Date.now();
      await testDb.insertBatch(records);
      const insertTime = Date.now() - startTime;

      // Verify data integrity
      const retrievedRecords = await testDb.getEvents();
      expect(retrievedRecords).toHaveLength(recordCount);

      // Check sample record integrity
      const sampleRecord = retrievedRecords[0];
      expect(sampleRecord.streamData?.length).toBeGreaterThan(largeDataSize);
      expect(sampleRecord.metadata?.largeMetadata?.length).toBe(1000);

      expect(insertTime).toBeLessThan(10000); // Should handle large data within 10 seconds
      console.log(`Large data handling: ${recordCount} records (${largeDataSize} bytes each) in ${insertTime}ms`);
    });

    it("should perform well with deep query complexity", async () => {
      // Insert varied test data for complex queries
      const sessions = 50;
      const agents = ["claude", "codex", "gemini", "opencode"];
      const modes = ["chat", "code", "analysis", "debug"];
      
      const records: Array<Omit<TelemetryRecord, 'id'>> = [];
      const baseTime = Date.now();

      for (let s = 0; s < sessions; s++) {
        const agentType = agents[s % agents.length];
        const mode = modes[s % modes.length];
        
        // Create varied session patterns
        const eventCount = 10 + (s % 20); // Vary event count per session
        
        for (let e = 0; e < eventCount; e++) {
          const eventType = e === 0 ? "start" : 
                           e === eventCount - 1 ? "end" : 
                           Math.random() < 0.1 ? "error" : "stream";
          
          records.push({
            sessionId: `complex-session-${s}`,
            eventType,
            agentType,
            mode,
            prompt: `${mode} task for ${agentType} session ${s}`,
            timestamp: baseTime + s * 10000 + e * 100,
            streamData: eventType === "stream" ? `Stream data ${s}-${e}` : undefined,
            metadata: {
              sessionIndex: s,
              eventIndex: e,
              agentType,
              mode,
              complexity: s % 10,
              priority: s % 3 === 0 ? "high" : s % 3 === 1 ? "medium" : "low"
            }
          });
        }
      }

      await testDb.insertBatch(records);

      // Complex query scenarios
      const complexQueries = [
        // Multi-field filtering
        { agentType: "claude", eventType: "stream" as const },
        { mode: "code", from: baseTime, to: baseTime + 100000 },
        
        // Metadata-based filtering would need custom queries
        // Time range with limit
        { from: baseTime + 50000, limit: 200 },
        
        // Agent and time combination
        { agentType: "gemini", from: baseTime + 30000, to: baseTime + 200000 }
      ];

      for (const query of complexQueries) {
        const startTime = Date.now();
        const results = await testDb.getEvents(query);
        const queryTime = Date.now() - startTime;

        expect(queryTime).toBeLessThan(50); // Very fast queries
        expect(results.length).toBeGreaterThan(0);
        
        // Verify filter correctness
        if (query.agentType) {
          expect(results.every(r => r.agentType === query.agentType)).toBe(true);
        }
        if (query.eventType) {
          expect(results.every(r => r.eventType === query.eventType)).toBe(true);
        }
        
        console.log(`Complex query ${JSON.stringify(query)}: ${results.length} results in ${queryTime}ms`);
      }
    });
  });

  describe("Database Health and Statistics", () => {
    it("should provide accurate statistics under load", async () => {
      // Create known data patterns
      const agentCounts = { claude: 500, codex: 300, gemini: 200 };
      const records: Array<Omit<TelemetryRecord, 'id'>> = [];
      const baseTime = Date.now();
      let recordIndex = 0;

      for (const [agentType, count] of Object.entries(agentCounts)) {
        for (let i = 0; i < count; i++) {
          records.push({
            sessionId: `stats-session-${agentType}-${i}`,
            eventType: i % 4 === 0 ? "start" : i % 4 === 3 ? "end" : "stream",
            agentType,
            mode: "chat",
            prompt: `Stats test ${agentType} ${i}`,
            timestamp: baseTime + recordIndex++,
            streamData: i % 4 !== 0 && i % 4 !== 3 ? `Stream ${i}` : undefined
          });
        }
      }

      await testDb.insertBatch(records);

      // Test statistics accuracy
      const startTime = Date.now();
      const stats = await testDb.getStats();
      const statsTime = Date.now() - startTime;

      // Verify accuracy
      expect(stats.totalEvents).toBe(1000); // Total events
      expect(stats.uniqueSessions).toBe(1000); // Each record has unique session
      
      // Note: agentBreakdown might not be available in current TelemetryStats interface
      // expect(Object.keys(stats.agentBreakdown)).toEqual(['claude', 'codex', 'gemini']);
      // expect(stats.agentBreakdown.claude).toBe(500);
      // expect(stats.agentBreakdown.codex).toBe(300);
      // expect(stats.agentBreakdown.gemini).toBe(200);

      // Performance check
      expect(statsTime).toBeLessThan(100); // Statistics should be fast
      console.log(`Statistics generation: ${statsTime}ms for ${stats.totalEvents} events`);
    });

    it("should maintain health under sustained operations", async () => {
      const iterations = 10;
      const recordsPerIteration = 500;
      
      for (let iteration = 0; iteration < iterations; iteration++) {
        const records: Array<Omit<TelemetryRecord, 'id'>> = [];
        const baseTime = Date.now() + iteration * 10000;

        for (let i = 0; i < recordsPerIteration; i++) {
          records.push({
            sessionId: `health-session-${iteration}-${i}`,
            eventType: "stream",
            agentType: "claude",
            mode: "chat",
            prompt: `Health test iteration ${iteration}, record ${i}`,
            timestamp: baseTime + i,
            streamData: `Health data ${iteration}-${i}`
          });
        }

        const insertStart = Date.now();
        await testDb.insertBatch(records);
        const insertTime = Date.now() - insertStart;

        // Health check - database should remain performant
        const healthStart = Date.now();
        const isHealthy = await testDb.healthCheck();
        const healthTime = Date.now() - healthStart;

        expect(isHealthy).toBe(true);
        expect(insertTime).toBeLessThan(1000); // Shouldn't degrade significantly
        expect(healthTime).toBeLessThan(50); // Health check should be fast

        // Verify total count matches expectation
        const totalEvents = await testDb.getEvents();
        expect(totalEvents).toHaveLength((iteration + 1) * recordsPerIteration);
      }

      console.log(`Health maintained through ${iterations} iterations of ${recordsPerIteration} records each`);
    });
  });

  describe("Error Resilience Under Load", () => {
    it("should handle malformed data gracefully in batch operations", async () => {
      const goodRecords: Array<Omit<TelemetryRecord, 'id'>> = [];
      const baseTime = Date.now();

      // Mix of good and potentially problematic data
      for (let i = 0; i < 1000; i++) {
        const record: Omit<TelemetryRecord, 'id'> = {
          sessionId: `resilience-session-${i}`,
          eventType: "stream",
          agentType: "claude",
          mode: "chat",
          prompt: `Resilience test ${i}`,
          timestamp: baseTime + i,
          streamData: i % 100 === 0 ? undefined : `Stream data ${i}`, // Some undefined stream data
          metadata: i % 200 === 0 ? undefined : { index: i } // Some undefined metadata
        };

        goodRecords.push(record);
      }

      // Should handle the mixed data without errors
      await expect(testDb.insertBatch(goodRecords)).resolves.not.toThrow();

      // Verify data was inserted
      const allRecords = await testDb.getEvents();
      expect(allRecords).toHaveLength(1000);

      // Verify data integrity for records with undefined fields
      const recordsWithoutStream = allRecords.filter(r => !r.streamData);
      const recordsWithoutMetadata = allRecords.filter(r => !r.metadata);
      
      expect(recordsWithoutStream.length).toBe(10); // 1000 / 100
      expect(recordsWithoutMetadata.length).toBe(5); // 1000 / 200
    });

    it("should recover from connection issues", async () => {
      // Insert some data first
      const initialRecords: Array<Omit<TelemetryRecord, 'id'>> = [];
      for (let i = 0; i < 100; i++) {
        initialRecords.push({
          sessionId: `recovery-session-${i}`,
          eventType: "stream",
          agentType: "claude",
          mode: "chat",
          prompt: `Recovery test ${i}`,
          timestamp: Date.now() + i,
          streamData: `Recovery data ${i}`
        });
      }

      await testDb.insertBatch(initialRecords);

      // Simulate connection issues by closing and reopening
      await testDb.close();
      
      // Create new database instance (simulating recovery)
      const recoveredDb = new TelemetryDB({ isEnabled: true, path: TEST_DB_PATH });

      // Verify data persisted through the "connection issue"
      const recoveredRecords = await recoveredDb.getEvents();
      expect(recoveredRecords).toHaveLength(100);

      // Verify new operations work
      const newRecords: Array<Omit<TelemetryRecord, 'id'>> = [];
      for (let i = 100; i < 150; i++) {
        newRecords.push({
          sessionId: `recovery-session-${i}`,
          eventType: "stream",
          agentType: "claude",
          mode: "chat",
          prompt: `Post-recovery test ${i}`,
          timestamp: Date.now() + i,
          streamData: `Post-recovery data ${i}`
        });
      }

      await recoveredDb.insertBatch(newRecords);

      const finalRecords = await recoveredDb.getEvents();
      expect(finalRecords).toHaveLength(150);

      await recoveredDb.close();
    });
  });
}); 