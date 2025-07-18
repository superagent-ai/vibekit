/**
 * Phase 6: Direct Performance Benchmarking Suite
 * 
 * Direct performance comparison between legacy TelemetryDB and 
 * core Drizzle ORM using manually created schema and minimal setup.
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { performance } from 'perf_hooks';
import { resolve } from 'path';
import { existsSync, unlinkSync } from 'fs';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { TelemetryDB } from '../../packages/vibekit/src/services/telemetry-db';
import { telemetryEvents, telemetrySessions, telemetryStats } from '../../packages/vibekit/src/db/schema';
import { TelemetryRecord, TelemetryQueryFilter } from '../../packages/vibekit/src/types/telemetry-storage';
import { eq, and, count, sum, max, min, avg, desc } from 'drizzle-orm';

// Direct Benchmark Configuration
const BENCHMARK_CONFIG = {
  // Test data sizes  
  SMALL_DATASET: 50,
  MEDIUM_DATASET: 200,
  LARGE_DATASET: 1000,
  
  // Iterations for averaging
  ITERATIONS: 3,
};

/**
 * Create database schema manually
 */
async function createDatabaseSchema(dbPath: string): Promise<void> {
  const db = new Database(dbPath);
  
  try {
    // Enable WAL mode for better performance
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('foreign_keys = ON');
    
    // Core tables - simplified for direct testing
    const coreTablesSql = `
      CREATE TABLE IF NOT EXISTS telemetry_sessions (
        id text PRIMARY KEY NOT NULL,
        agent_type text NOT NULL,
        mode text NOT NULL,
        status text DEFAULT 'active' NOT NULL,
        start_time real NOT NULL,
        end_time real,
        duration real,
        event_count integer DEFAULT 0 NOT NULL,
        stream_event_count integer DEFAULT 0 NOT NULL,
        error_count integer DEFAULT 0 NOT NULL,
        sandbox_id text,
        repo_url text,
        metadata text,
        created_at real DEFAULT (unixepoch()) NOT NULL,
        updated_at real DEFAULT (unixepoch()) NOT NULL,
        version integer DEFAULT 1 NOT NULL,
        schema_version text DEFAULT '1.0.0' NOT NULL
      );

      CREATE TABLE IF NOT EXISTS telemetry_events (
        id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        session_id text NOT NULL,
        event_type text NOT NULL,
        agent_type text NOT NULL,
        mode text NOT NULL,
        prompt text NOT NULL,
        stream_data text,
        sandbox_id text,
        repo_url text,
        metadata text,
        timestamp real NOT NULL,
        created_at real DEFAULT (unixepoch()) NOT NULL,
        version integer DEFAULT 1 NOT NULL,
        schema_version text DEFAULT '1.0.0' NOT NULL,
        FOREIGN KEY (session_id) REFERENCES telemetry_sessions(id) ON UPDATE cascade ON DELETE cascade
      );

      CREATE TABLE IF NOT EXISTS telemetry_stats (
        id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        stat_type text NOT NULL,
        stat_key text NOT NULL,
        total_events integer DEFAULT 0 NOT NULL,
        start_events integer DEFAULT 0 NOT NULL,
        stream_events integer DEFAULT 0 NOT NULL,
        end_events integer DEFAULT 0 NOT NULL,
        error_events integer DEFAULT 0 NOT NULL,
        unique_sessions integer DEFAULT 0 NOT NULL,
        agent_breakdown text,
        mode_breakdown text,
        avg_session_duration real,
        min_timestamp real,
        max_timestamp real,
        computed_at real DEFAULT (unixepoch()) NOT NULL,
        updated_at real DEFAULT (unixepoch()) NOT NULL,
        version integer DEFAULT 1 NOT NULL,
        schema_version text DEFAULT '1.0.0' NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_events_timestamp ON telemetry_events (timestamp);
      CREATE INDEX IF NOT EXISTS idx_events_session ON telemetry_events (session_id);
      CREATE INDEX IF NOT EXISTS idx_events_type ON telemetry_events (event_type);
      CREATE INDEX IF NOT EXISTS idx_events_agent ON telemetry_events (agent_type);
      CREATE INDEX IF NOT EXISTS idx_sessions_status ON telemetry_sessions (status);
      CREATE INDEX IF NOT EXISTS idx_sessions_agent ON telemetry_sessions (agent_type);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_stats_type_key ON telemetry_stats (stat_type, stat_key);
    `;

    db.exec(coreTablesSql);
    console.log(`✅ Database schema created successfully: ${dbPath}`);
  } catch (error) {
    console.error(`❌ Failed to create database schema: ${error}`);
    throw error;
  } finally {
    db.close();
  }
}

interface BenchmarkResult {
  operation: string;
  implementation: 'legacy' | 'drizzle';
  dataSize: number;
  averageTime: number;
  minTime: number;
  maxTime: number;
  throughput: number;
  memoryUsage: number;
  success: boolean;
  errorMessage?: string;
}

interface BenchmarkComparison {
  operation: string;
  dataSize: number;
  legacyResult: BenchmarkResult;
  drizzleResult: BenchmarkResult;
  performanceImprovement: number;
  memoryImprovement: number;
  winner: 'legacy' | 'drizzle' | 'tie';
}

class DirectBenchmarker {
  private results: BenchmarkResult[] = [];
  private comparisons: BenchmarkComparison[] = [];
  
  private getMemoryUsage(): number {
    const usage = process.memoryUsage();
    return Math.round(usage.heapUsed / 1024 / 1024 * 100) / 100;
  }
  
  private generateTestData(count: number, sessionPrefix = 'bench'): Array<Omit<TelemetryRecord, 'id'>> {
    const data: Array<Omit<TelemetryRecord, 'id'>> = [];
    const eventTypes: Array<'start' | 'stream' | 'end' | 'error'> = ['start', 'stream', 'end', 'error'];
    const agentTypes = ['claude', 'codex', 'gemini'];
    const modes = ['chat', 'edit'];
    
    for (let i = 0; i < count; i++) {
      data.push({
        sessionId: `${sessionPrefix}-session-${Math.floor(i / 10)}`,
        eventType: eventTypes[i % eventTypes.length],
        agentType: agentTypes[i % agentTypes.length],
        mode: modes[i % modes.length],
        prompt: `Benchmark prompt ${i}`,
        streamData: i % 4 === 1 ? `Stream data chunk ${i}` : undefined,
        sandboxId: i % 3 === 0 ? `sandbox-${i}` : undefined,
        repoUrl: i % 5 === 0 ? `https://github.com/test/repo-${i}` : undefined,
        metadata: i % 7 === 0 ? { 
          testId: i, 
          benchmark: true 
        } : undefined,
        timestamp: Date.now() - (count - i) * 1000,
      });
    }
    
    return data;
  }
  
  private async benchmarkOperation<T>(
    operation: string,
    implementation: 'legacy' | 'drizzle',
    dataSize: number,
    operationFn: () => Promise<T>
  ): Promise<BenchmarkResult> {
    const times: number[] = [];
    const memoryBefore = this.getMemoryUsage();
    let success = true;
    let errorMessage: string | undefined;
    
    try {
      // Warm-up iteration
      await operationFn();
      
      // Benchmark iterations
      for (let i = 0; i < BENCHMARK_CONFIG.ITERATIONS; i++) {
        const start = performance.now();
        await operationFn();
        const end = performance.now();
        times.push(end - start);
      }
    } catch (error) {
      success = false;
      errorMessage = error instanceof Error ? error.message : String(error);
      times.push(999999);
    }
    
    const memoryAfter = this.getMemoryUsage();
    const averageTime = times.reduce((a, b) => a + b, 0) / times.length;
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const throughput = success ? (dataSize / (averageTime / 1000)) : 0;
    
    const result: BenchmarkResult = {
      operation,
      implementation,
      dataSize,
      averageTime,
      minTime,
      maxTime,
      throughput,
      memoryUsage: memoryAfter - memoryBefore,
      success,
      errorMessage,
    };
    
    this.results.push(result);
    return result;
  }
  
  private compareResults(legacyResult: BenchmarkResult, drizzleResult: BenchmarkResult): BenchmarkComparison {
    const performanceImprovement = legacyResult.success && drizzleResult.success
      ? ((legacyResult.averageTime - drizzleResult.averageTime) / legacyResult.averageTime) * 100
      : 0;
    
    const memoryImprovement = legacyResult.success && drizzleResult.success
      ? ((legacyResult.memoryUsage - drizzleResult.memoryUsage) / Math.abs(legacyResult.memoryUsage || 1)) * 100
      : 0;
    
    let winner: 'legacy' | 'drizzle' | 'tie' = 'tie';
    if (drizzleResult.success && !legacyResult.success) {
      winner = 'drizzle';
    } else if (legacyResult.success && !drizzleResult.success) {
      winner = 'legacy';
    } else if (legacyResult.success && drizzleResult.success) {
      if (performanceImprovement > 5) {
        winner = 'drizzle';
      } else if (performanceImprovement < -5) {
        winner = 'legacy';
      }
    }
    
    const comparison: BenchmarkComparison = {
      operation: legacyResult.operation,
      dataSize: legacyResult.dataSize,
      legacyResult,
      drizzleResult,
      performanceImprovement,
      memoryImprovement,
      winner,
    };
    
    this.comparisons.push(comparison);
    return comparison;
  }
  
  generateReport(): string {
    let report = '\n🚀 DIRECT BENCHMARK RESULTS\n';
    report += '='.repeat(35) + '\n\n';
    
    const drizzleWins = this.comparisons.filter(c => c.winner === 'drizzle').length;
    const legacyWins = this.comparisons.filter(c => c.winner === 'legacy').length;
    const ties = this.comparisons.filter(c => c.winner === 'tie').length;
    
    report += `📊 PERFORMANCE SUMMARY:\n`;
    report += `   Drizzle Wins: ${drizzleWins}/${this.comparisons.length}\n`;
    report += `   Legacy Wins:  ${legacyWins}/${this.comparisons.length}\n`;
    report += `   Ties:         ${ties}/${this.comparisons.length}\n\n`;
    
    for (const comp of this.comparisons) {
      const improvement = comp.performanceImprovement > 0 ? 
        `${comp.performanceImprovement.toFixed(1)}% faster` : 
        `${Math.abs(comp.performanceImprovement).toFixed(1)}% slower`;
      
      report += `${comp.operation} (${comp.dataSize} items): `;
      report += `Legacy: ${comp.legacyResult.averageTime.toFixed(2)}ms, `;
      report += `Drizzle: ${comp.drizzleResult.averageTime.toFixed(2)}ms `;
      report += `(${improvement}) - Winner: ${comp.winner.toUpperCase()}\n`;
    }
    
    return report + '\n';
  }
}

describe('Direct Performance Benchmarking', () => {
  let legacyDb: TelemetryDB;
  let drizzleDb: ReturnType<typeof drizzle>;
  let sqliteDb: Database.Database;
  let benchmarker: DirectBenchmarker;
  
  const legacyDbPath = resolve('./test-legacy-direct.db');
  const drizzleDbPath = resolve('./test-drizzle-direct.db');
  
  beforeAll(() => {
    benchmarker = new DirectBenchmarker();
  });
  
  beforeEach(async () => {
    // Clean up any existing test databases
    [legacyDbPath, drizzleDbPath].forEach(path => {
      if (existsSync(path)) {
        unlinkSync(path);
      }
    });
    
    // Initialize legacy TelemetryDB
    legacyDb = new TelemetryDB({
      isEnabled: true,
      path: legacyDbPath,
      streamBatchSize: 50,
      streamFlushIntervalMs: 1000,
    });
    
    // Create database schema for Drizzle manually
    await createDatabaseSchema(drizzleDbPath);
    
    // Initialize Drizzle directly
    sqliteDb = new Database(drizzleDbPath);
    sqliteDb.pragma('journal_mode = WAL');
    drizzleDb = drizzle(sqliteDb);
  });
  
  afterEach(async () => {
    // Cleanup
    await legacyDb.close();
    sqliteDb.close();
    
    // Remove test databases
    [legacyDbPath, drizzleDbPath].forEach(path => {
      if (existsSync(path)) {
        unlinkSync(path);
      }
    });
  });
  
  afterAll(() => {
    const report = benchmarker.generateReport();
    console.log(report);
  });

  describe('Single Insert Operations', () => {
    it('should benchmark single event insertion - Small Dataset', async () => {
      const testData = benchmarker['generateTestData'](BENCHMARK_CONFIG.SMALL_DATASET);
      
      // Create unique session IDs for Drizzle (to handle foreign key constraints)
      const sessionIds = [...new Set(testData.map(d => d.sessionId))];
      
      // Benchmark legacy implementation
      const legacyResult = await benchmarker['benchmarkOperation'](
        'Single Insert Small',
        'legacy',
        BENCHMARK_CONFIG.SMALL_DATASET,
        async () => {
          for (const record of testData) {
            await legacyDb.insertEvent(record);
          }
        }
      );
      
      // Benchmark Drizzle implementation (direct)
      const drizzleResult = await benchmarker['benchmarkOperation'](
        'Single Insert Small',
        'drizzle',
        BENCHMARK_CONFIG.SMALL_DATASET,
        async () => {
          // First create session records
          for (const sessionId of sessionIds) {
            await drizzleDb.insert(telemetrySessions).values({
              id: sessionId,
              agentType: 'claude',
              mode: 'chat',
              startTime: Date.now(),
            }).onConflictDoNothing();
          }
          
          // Then insert events
          for (const record of testData) {
            await drizzleDb.insert(telemetryEvents).values({
              sessionId: record.sessionId,
              eventType: record.eventType,
              agentType: record.agentType,
              mode: record.mode,
              prompt: record.prompt,
              timestamp: record.timestamp,
              sandboxId: record.sandboxId || null,
              repoUrl: record.repoUrl || null,
              streamData: record.streamData || null,
              metadata: record.metadata ? JSON.stringify(record.metadata) : null,
            });
          }
        }
      );
      
      const comparison = benchmarker['compareResults'](legacyResult, drizzleResult);
      
      if (!legacyResult.success) {
        console.log(`❌ Legacy failed: ${legacyResult.errorMessage}`);
      }
      if (!drizzleResult.success) {
        console.log(`❌ Drizzle failed: ${drizzleResult.errorMessage}`);
      }
      
      expect(legacyResult.success).toBe(true);
      expect(drizzleResult.success).toBe(true);
      
      console.log(`📈 Single Insert Small: Legacy ${legacyResult.averageTime.toFixed(2)}ms vs Drizzle ${drizzleResult.averageTime.toFixed(2)}ms (${comparison.performanceImprovement.toFixed(1)}% improvement)`);
    }, 30000);
    
    it('should benchmark single event insertion - Medium Dataset', async () => {
      const testData = benchmarker['generateTestData'](BENCHMARK_CONFIG.MEDIUM_DATASET);
      const sessionIds = [...new Set(testData.map(d => d.sessionId))];
      
      const legacyResult = await benchmarker['benchmarkOperation'](
        'Single Insert Medium',
        'legacy',
        BENCHMARK_CONFIG.MEDIUM_DATASET,
        async () => {
          for (const record of testData) {
            await legacyDb.insertEvent(record);
          }
        }
      );
      
      const drizzleResult = await benchmarker['benchmarkOperation'](
        'Single Insert Medium',
        'drizzle',
        BENCHMARK_CONFIG.MEDIUM_DATASET,
        async () => {
          // Create sessions first
          for (const sessionId of sessionIds) {
            await drizzleDb.insert(telemetrySessions).values({
              id: sessionId,
              agentType: 'claude',
              mode: 'chat',
              startTime: Date.now(),
            }).onConflictDoNothing();
          }
          
          for (const record of testData) {
            await drizzleDb.insert(telemetryEvents).values({
              sessionId: record.sessionId,
              eventType: record.eventType,
              agentType: record.agentType,
              mode: record.mode,
              prompt: record.prompt,
              timestamp: record.timestamp,
              sandboxId: record.sandboxId || null,
              repoUrl: record.repoUrl || null,
              streamData: record.streamData || null,
              metadata: record.metadata ? JSON.stringify(record.metadata) : null,
            });
          }
        }
      );
      
      const comparison = benchmarker['compareResults'](legacyResult, drizzleResult);
      
      if (!legacyResult.success) {
        console.log(`❌ Legacy failed: ${legacyResult.errorMessage}`);
      }
      if (!drizzleResult.success) {
        console.log(`❌ Drizzle failed: ${drizzleResult.errorMessage}`);
      }
      
      expect(legacyResult.success).toBe(true);
      expect(drizzleResult.success).toBe(true);
      
      console.log(`📈 Single Insert Medium: Legacy ${legacyResult.averageTime.toFixed(2)}ms vs Drizzle ${drizzleResult.averageTime.toFixed(2)}ms (${comparison.performanceImprovement.toFixed(1)}% improvement)`);
    }, 60000);
  });

  describe('Batch Insert Operations', () => {
    it('should benchmark batch insertion - Small Dataset', async () => {
      const testData = benchmarker['generateTestData'](BENCHMARK_CONFIG.SMALL_DATASET);
      const sessionIds = [...new Set(testData.map(d => d.sessionId))];
      
      const legacyResult = await benchmarker['benchmarkOperation'](
        'Batch Insert Small',
        'legacy',
        BENCHMARK_CONFIG.SMALL_DATASET,
        async () => {
          await legacyDb.insertBatch(testData);
        }
      );
      
      const drizzleResult = await benchmarker['benchmarkOperation'](
        'Batch Insert Small',
        'drizzle',
        BENCHMARK_CONFIG.SMALL_DATASET,
        async () => {
          // Create sessions first
          for (const sessionId of sessionIds) {
            await drizzleDb.insert(telemetrySessions).values({
              id: sessionId,
              agentType: 'claude',
              mode: 'chat',
              startTime: Date.now(),
            }).onConflictDoNothing();
          }
          
          const events = testData.map(record => ({
            sessionId: record.sessionId,
            eventType: record.eventType,
            agentType: record.agentType,
            mode: record.mode,
            prompt: record.prompt,
            timestamp: record.timestamp,
            sandboxId: record.sandboxId || null,
            repoUrl: record.repoUrl || null,
            streamData: record.streamData || null,
            metadata: record.metadata ? JSON.stringify(record.metadata) : null,
          }));
          await drizzleDb.insert(telemetryEvents).values(events);
        }
      );
      
      const comparison = benchmarker['compareResults'](legacyResult, drizzleResult);
      
      if (!legacyResult.success) {
        console.log(`❌ Legacy failed: ${legacyResult.errorMessage}`);
      }
      if (!drizzleResult.success) {
        console.log(`❌ Drizzle failed: ${drizzleResult.errorMessage}`);
      }
      
      expect(legacyResult.success).toBe(true);
      expect(drizzleResult.success).toBe(true);
      
      console.log(`📈 Batch Insert Small: Legacy ${legacyResult.averageTime.toFixed(2)}ms vs Drizzle ${drizzleResult.averageTime.toFixed(2)}ms (${comparison.performanceImprovement.toFixed(1)}% improvement)`);
    }, 30000);
    
    it('should benchmark batch insertion - Large Dataset', async () => {
      const testData = benchmarker['generateTestData'](BENCHMARK_CONFIG.LARGE_DATASET);
      const sessionIds = [...new Set(testData.map(d => d.sessionId))];
      
      const legacyResult = await benchmarker['benchmarkOperation'](
        'Batch Insert Large',
        'legacy',
        BENCHMARK_CONFIG.LARGE_DATASET,
        async () => {
          await legacyDb.insertBatch(testData);
        }
      );
      
      const drizzleResult = await benchmarker['benchmarkOperation'](
        'Batch Insert Large',
        'drizzle',
        BENCHMARK_CONFIG.LARGE_DATASET,
        async () => {
          // Create sessions first
          for (const sessionId of sessionIds) {
            await drizzleDb.insert(telemetrySessions).values({
              id: sessionId,
              agentType: 'claude',
              mode: 'chat',
              startTime: Date.now(),
            }).onConflictDoNothing();
          }
          
          const events = testData.map(record => ({
            sessionId: record.sessionId,
            eventType: record.eventType,
            agentType: record.agentType,
            mode: record.mode,
            prompt: record.prompt,
            timestamp: record.timestamp,
            sandboxId: record.sandboxId || null,
            repoUrl: record.repoUrl || null,
            streamData: record.streamData || null,
            metadata: record.metadata ? JSON.stringify(record.metadata) : null,
          }));
          await drizzleDb.insert(telemetryEvents).values(events);
        }
      );
      
      const comparison = benchmarker['compareResults'](legacyResult, drizzleResult);
      
      if (!legacyResult.success) {
        console.log(`❌ Legacy failed: ${legacyResult.errorMessage}`);
      }
      if (!drizzleResult.success) {
        console.log(`❌ Drizzle failed: ${drizzleResult.errorMessage}`);
      }
      
      expect(legacyResult.success).toBe(true);
      expect(drizzleResult.success).toBe(true);
      
      console.log(`📈 Batch Insert Large: Legacy ${legacyResult.averageTime.toFixed(2)}ms vs Drizzle ${drizzleResult.averageTime.toFixed(2)}ms (${comparison.performanceImprovement.toFixed(1)}% improvement)`);
    }, 120000);
  });

  describe('Query Operations', () => {
    beforeEach(async () => {
      // Pre-populate both databases with test data
      const testData = benchmarker['generateTestData'](BENCHMARK_CONFIG.MEDIUM_DATASET);
      const sessionIds = [...new Set(testData.map(d => d.sessionId))];
      
      await legacyDb.insertBatch(testData);
      
      // Create sessions first for Drizzle
      for (const sessionId of sessionIds) {
        await drizzleDb.insert(telemetrySessions).values({
          id: sessionId,
          agentType: 'claude',
          mode: 'chat',
          startTime: Date.now(),
        }).onConflictDoNothing();
      }
      
      const events = testData.map(record => ({
        sessionId: record.sessionId,
        eventType: record.eventType,
        agentType: record.agentType,
        mode: record.mode,
        prompt: record.prompt,
        timestamp: record.timestamp,
        sandboxId: record.sandboxId || null,
        repoUrl: record.repoUrl || null,
        streamData: record.streamData || null,
        metadata: record.metadata ? JSON.stringify(record.metadata) : null,
      }));
      await drizzleDb.insert(telemetryEvents).values(events);
    });
    
    it('should benchmark simple queries', async () => {
      const filter: TelemetryQueryFilter = {
        agentType: 'claude',
        limit: 50,
      };
      
      const legacyResult = await benchmarker['benchmarkOperation'](
        'Simple Query',
        'legacy',
        50,
        async () => {
          await legacyDb.getEvents(filter);
        }
      );
      
      const drizzleResult = await benchmarker['benchmarkOperation'](
        'Simple Query',
        'drizzle',
        50,
        async () => {
          await drizzleDb
            .select()
            .from(telemetryEvents)
            .where(eq(telemetryEvents.agentType, 'claude'))
            .limit(50);
        }
      );
      
      const comparison = benchmarker['compareResults'](legacyResult, drizzleResult);
      
      expect(legacyResult.success).toBe(true);
      expect(drizzleResult.success).toBe(true);
      
      console.log(`📈 Simple Query: Legacy ${legacyResult.averageTime.toFixed(2)}ms vs Drizzle ${drizzleResult.averageTime.toFixed(2)}ms (${comparison.performanceImprovement.toFixed(1)}% improvement)`);
    }, 30000);
    
    it('should benchmark statistics queries', async () => {
      const legacyResult = await benchmarker['benchmarkOperation'](
        'Stats Query',
        'legacy',
        1,
        async () => {
          await legacyDb.getStats();
        }
      );
      
      const drizzleResult = await benchmarker['benchmarkOperation'](
        'Stats Query',
        'drizzle',
        1,
        async () => {
          await drizzleDb
            .select({
              totalEvents: count(),
              agentBreakdown: count(telemetryEvents.agentType),
              minTimestamp: min(telemetryEvents.timestamp),
              maxTimestamp: max(telemetryEvents.timestamp),
            })
            .from(telemetryEvents);
        }
      );
      
      const comparison = benchmarker['compareResults'](legacyResult, drizzleResult);
      
      expect(legacyResult.success).toBe(true);
      expect(drizzleResult.success).toBe(true);
      
      console.log(`📈 Stats Query: Legacy ${legacyResult.averageTime.toFixed(2)}ms vs Drizzle ${drizzleResult.averageTime.toFixed(2)}ms (${comparison.performanceImprovement.toFixed(1)}% improvement)`);
    }, 30000);
  });
}); 