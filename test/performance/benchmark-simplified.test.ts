/**
 * Phase 6: Simplified Performance Benchmarking Suite
 * 
 * Focused performance comparison between legacy TelemetryDB and 
 * core Drizzle ORM implementation for essential operations.
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { performance } from 'perf_hooks';
import { resolve } from 'path';
import { existsSync, unlinkSync, writeFileSync } from 'fs';
import Database from 'better-sqlite3';
import { TelemetryDB } from '../../packages/vibekit/src/services/telemetry-db';
import { DrizzleTelemetryOperations, initializeTelemetryDB } from '../../packages/vibekit/src/db';
import { TelemetryRecord, TelemetryQueryFilter } from '../../packages/vibekit/src/types/telemetry-storage';

// Simplified Benchmark Configuration
const BENCHMARK_CONFIG = {
  // Test data sizes  
  SMALL_DATASET: 50,
  MEDIUM_DATASET: 200,
  LARGE_DATASET: 1000,
  
  // Performance thresholds (ms)
  SINGLE_INSERT_THRESHOLD: 5,
  BATCH_INSERT_THRESHOLD: 100,
  QUERY_THRESHOLD: 50,
  STATS_THRESHOLD: 100,
  
  // Iterations for averaging
  ITERATIONS: 3,
};

/**
 * Create database schema manually to ensure tables exist
 */
async function createDatabaseSchema(dbPath: string): Promise<void> {
  const db = new Database(dbPath);
  
  try {
    // Enable WAL mode for better performance
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('foreign_keys = ON');
    
    // Core tables from migration 0000
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

      CREATE TABLE IF NOT EXISTS telemetry_buffers (
        id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        session_id text NOT NULL,
        status text DEFAULT 'pending' NOT NULL,
        event_count integer DEFAULT 0 NOT NULL,
        buffer_data text NOT NULL,
        max_size integer DEFAULT 50 NOT NULL,
        created_at real DEFAULT (unixepoch()) NOT NULL,
        last_updated real DEFAULT (unixepoch()) NOT NULL,
        flushed_at real,
        flush_attempts integer DEFAULT 0 NOT NULL,
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

      CREATE TABLE IF NOT EXISTS telemetry_errors (
        id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        session_id text,
        event_id integer,
        error_type text NOT NULL,
        error_message text NOT NULL,
        error_stack text,
        context text,
        severity text DEFAULT 'medium' NOT NULL,
        resolved integer DEFAULT false NOT NULL,
        metadata text,
        timestamp real NOT NULL,
        created_at real DEFAULT (unixepoch()) NOT NULL,
        resolved_at real,
        resolved_by text,
        version integer DEFAULT 1 NOT NULL,
        schema_version text DEFAULT '1.0.0' NOT NULL,
        FOREIGN KEY (session_id) REFERENCES telemetry_sessions(id) ON UPDATE cascade ON DELETE set null,
        FOREIGN KEY (event_id) REFERENCES telemetry_events(id) ON UPDATE cascade ON DELETE set null
      );
    `;

    // Phase 5 tables from migration 0001  
    const phase5TablesSql = `
      CREATE TABLE IF NOT EXISTS telemetry_validation_rules (
        id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        table_name text NOT NULL,
        field_name text NOT NULL,
        rule_type text NOT NULL,
        rule_config text NOT NULL,
        error_message text NOT NULL,
        is_active integer DEFAULT true NOT NULL,
        priority integer DEFAULT 100 NOT NULL,
        created_at real DEFAULT (unixepoch()) NOT NULL,
        updated_at real DEFAULT (unixepoch()) NOT NULL
      );

      CREATE TABLE IF NOT EXISTS telemetry_audit_log (
        id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        table_name text NOT NULL,
        record_id text NOT NULL,
        operation text NOT NULL,
        old_values text,
        new_values text,
        changed_fields text,
        user_id text,
        session_id text,
        reason text,
        metadata text,
        timestamp real NOT NULL,
        created_at real DEFAULT (unixepoch()) NOT NULL
      );

      CREATE TABLE IF NOT EXISTS telemetry_schema_versions (
        id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        version text NOT NULL,
        description text NOT NULL,
        migration_script text,
        rollback_script text,
        applied_at real DEFAULT (unixepoch()) NOT NULL,
        is_active integer DEFAULT true NOT NULL,
        metadata text
      );
    `;

    // Create indexes
    const indexesSql = `
      CREATE INDEX IF NOT EXISTS idx_events_timestamp ON telemetry_events (timestamp);
      CREATE INDEX IF NOT EXISTS idx_events_session ON telemetry_events (session_id);
      CREATE INDEX IF NOT EXISTS idx_events_type ON telemetry_events (event_type);
      CREATE INDEX IF NOT EXISTS idx_events_agent ON telemetry_events (agent_type);
      CREATE INDEX IF NOT EXISTS idx_events_compound ON telemetry_events (session_id, event_type, timestamp);

      CREATE INDEX IF NOT EXISTS idx_sessions_status ON telemetry_sessions (status);
      CREATE INDEX IF NOT EXISTS idx_sessions_agent ON telemetry_sessions (agent_type);
      CREATE INDEX IF NOT EXISTS idx_sessions_start_time ON telemetry_sessions (start_time);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_stats_type_key ON telemetry_stats (stat_type, stat_key);
      CREATE INDEX IF NOT EXISTS idx_stats_type ON telemetry_stats (stat_type);

      CREATE INDEX IF NOT EXISTS idx_buffers_session ON telemetry_buffers (session_id);
      CREATE INDEX IF NOT EXISTS idx_buffers_status ON telemetry_buffers (status);

      CREATE INDEX IF NOT EXISTS idx_errors_session ON telemetry_errors (session_id);
      CREATE INDEX IF NOT EXISTS idx_errors_type ON telemetry_errors (error_type);

      CREATE INDEX IF NOT EXISTS idx_validation_table_field ON telemetry_validation_rules (table_name, field_name);
      CREATE INDEX IF NOT EXISTS idx_audit_table ON telemetry_audit_log (table_name);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_schema_version ON telemetry_schema_versions (version);
    `;

    // Execute all SQL statements
    db.exec(coreTablesSql);
    db.exec(phase5TablesSql);
    db.exec(indexesSql);
    
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
  throughput: number; // operations per second
  memoryUsage: number; // MB
  success: boolean;
  errorMessage?: string;
}

interface BenchmarkComparison {
  operation: string;
  dataSize: number;
  legacyResult: BenchmarkResult;
  drizzleResult: BenchmarkResult;
  performanceImprovement: number; // percentage
  memoryImprovement: number; // percentage
  winner: 'legacy' | 'drizzle' | 'tie';
}

class SimplifiedBenchmarker {
  private results: BenchmarkResult[] = [];
  private comparisons: BenchmarkComparison[] = [];
  
  /**
   * Measure memory usage in MB
   */
  private getMemoryUsage(): number {
    const usage = process.memoryUsage();
    return Math.round(usage.heapUsed / 1024 / 1024 * 100) / 100;
  }
  
  /**
   * Generate test telemetry data
   */
  private generateTestData(count: number, sessionPrefix = 'bench'): Array<Omit<TelemetryRecord, 'id'>> {
    const data: Array<Omit<TelemetryRecord, 'id'>> = [];
    const eventTypes: Array<'start' | 'stream' | 'end' | 'error'> = ['start', 'stream', 'end', 'error'];
    const agentTypes = ['claude', 'codex', 'gemini'];
    const modes = ['chat', 'edit'];
    
    // Generate unique session IDs to avoid conflicts
    const uniqueSessionIds = Array.from({ length: Math.ceil(count / 10) }, (_, i) => 
      `${sessionPrefix}-session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${i}`
    );
    
    for (let i = 0; i < count; i++) {
      data.push({
        sessionId: uniqueSessionIds[Math.floor(i / 10)],
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
        timestamp: Date.now() - (count - i) * 1000, // Spread over time
      });
    }
    
    return data;
  }
  
  /**
   * Benchmark a single operation with multiple iterations
   */
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
      times.push(999999); // High time for failed operations
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
  
  /**
   * Compare two benchmark results
   */
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
  
  /**
   * Generate simplified benchmark report
   */
  generateReport(): string {
    let report = '\n🚀 SIMPLIFIED BENCHMARK RESULTS\n';
    report += '='.repeat(38) + '\n\n';
    
    // Summary statistics
    const drizzleWins = this.comparisons.filter(c => c.winner === 'drizzle').length;
    const legacyWins = this.comparisons.filter(c => c.winner === 'legacy').length;
    const ties = this.comparisons.filter(c => c.winner === 'tie').length;
    
    report += `📊 PERFORMANCE SUMMARY:\n`;
    report += `   Drizzle Wins: ${drizzleWins}/${this.comparisons.length}\n`;
    report += `   Legacy Wins:  ${legacyWins}/${this.comparisons.length}\n`;
    report += `   Ties:         ${ties}/${this.comparisons.length}\n\n`;
    
    // Detailed comparisons
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

describe.skip('Simplified Performance Benchmarking', () => {
  let legacyDb: TelemetryDB;
  let drizzleOps: DrizzleTelemetryOperations;
  let benchmarker: SimplifiedBenchmarker;
  
  const legacyDbPath = resolve('./test-legacy-simple.db');
  const drizzleDbPath = resolve('./test-drizzle-simple.db');
  
  beforeAll(() => {
    benchmarker = new SimplifiedBenchmarker();
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
    
    // Initialize Drizzle Operations
    await initializeTelemetryDB({
      dbPath: drizzleDbPath,
      enableQueryLogging: false,
      enableWAL: true,
    });
    
    drizzleOps = new DrizzleTelemetryOperations({
      dbPath: drizzleDbPath,
      enableQueryLogging: false,
      enableWAL: true,
    });
    
    await drizzleOps.initialize();
  });
  
  afterEach(async () => {
    // Cleanup
    await legacyDb.close();
    await drizzleOps.close();
    
    // Remove test databases
    [legacyDbPath, drizzleDbPath].forEach(path => {
      if (existsSync(path)) {
        unlinkSync(path);
      }
    });
  });
  
  afterAll(() => {
    // Generate and display final report
    const report = benchmarker.generateReport();
    console.log(report);
  });

  describe('Single Insert Operations', () => {
    it('should benchmark single event insertion - Small Dataset', async () => {
      const testData = benchmarker['generateTestData'](BENCHMARK_CONFIG.SMALL_DATASET);
      
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
      
      // Benchmark Drizzle implementation
      const drizzleResult = await benchmarker['benchmarkOperation'](
        'Single Insert Small',
        'drizzle',
        BENCHMARK_CONFIG.SMALL_DATASET,
        async () => {
          for (const record of testData) {
            await drizzleOps.insertEvent({
              sessionId: record.sessionId,
              eventType: record.eventType,
              agentType: record.agentType,
              mode: record.mode,
              prompt: record.prompt,
              timestamp: record.timestamp,
              sandboxId: record.sandboxId,
              repoUrl: record.repoUrl,
              streamData: record.streamData,
              metadata: record.metadata ? JSON.stringify(record.metadata) : undefined,
            });
          }
        }
      );
      
      const comparison = benchmarker['compareResults'](legacyResult, drizzleResult);
      
      expect(legacyResult.success).toBe(true);
      expect(drizzleResult.success).toBe(true);
      
      console.log(`📈 Single Insert Small: Legacy ${legacyResult.averageTime.toFixed(2)}ms vs Drizzle ${drizzleResult.averageTime.toFixed(2)}ms (${comparison.performanceImprovement.toFixed(1)}% improvement)`);
    }, 30000);
    
    it('should benchmark single event insertion - Medium Dataset', async () => {
      const testData = benchmarker['generateTestData'](BENCHMARK_CONFIG.MEDIUM_DATASET);
      
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
          for (const record of testData) {
            await drizzleOps.insertEvent({
              sessionId: record.sessionId,
              eventType: record.eventType,
              agentType: record.agentType,
              mode: record.mode,
              prompt: record.prompt,
              timestamp: record.timestamp,
              sandboxId: record.sandboxId,
              repoUrl: record.repoUrl,
              streamData: record.streamData,
              metadata: record.metadata ? JSON.stringify(record.metadata) : undefined,
            });
          }
        }
      );
      
      const comparison = benchmarker['compareResults'](legacyResult, drizzleResult);
      
      expect(legacyResult.success).toBe(true);
      expect(drizzleResult.success).toBe(true);
      
      console.log(`📈 Single Insert Medium: Legacy ${legacyResult.averageTime.toFixed(2)}ms vs Drizzle ${drizzleResult.averageTime.toFixed(2)}ms (${comparison.performanceImprovement.toFixed(1)}% improvement)`);
    }, 60000);
  });

  describe('Batch Insert Operations', () => {
    it('should benchmark batch insertion - Small Dataset', async () => {
      const testData = benchmarker['generateTestData'](BENCHMARK_CONFIG.SMALL_DATASET);
      
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
          const events = testData.map(record => ({
            sessionId: record.sessionId,
            eventType: record.eventType,
            agentType: record.agentType,
            mode: record.mode,
            prompt: record.prompt,
            timestamp: record.timestamp,
            sandboxId: record.sandboxId,
            repoUrl: record.repoUrl,
            streamData: record.streamData,
            metadata: record.metadata ? JSON.stringify(record.metadata) : undefined,
          }));
          await drizzleOps.insertEventBatch(events);
        }
      );
      
      const comparison = benchmarker['compareResults'](legacyResult, drizzleResult);
      
      expect(legacyResult.success).toBe(true);
      expect(drizzleResult.success).toBe(true);
      
      console.log(`📈 Batch Insert Small: Legacy ${legacyResult.averageTime.toFixed(2)}ms vs Drizzle ${drizzleResult.averageTime.toFixed(2)}ms (${comparison.performanceImprovement.toFixed(1)}% improvement)`);
    }, 30000);
    
    it('should benchmark batch insertion - Large Dataset', async () => {
      const testData = benchmarker['generateTestData'](BENCHMARK_CONFIG.LARGE_DATASET);
      
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
          const events = testData.map(record => ({
            sessionId: record.sessionId,
            eventType: record.eventType,
            agentType: record.agentType,
            mode: record.mode,
            prompt: record.prompt,
            timestamp: record.timestamp,
            sandboxId: record.sandboxId,
            repoUrl: record.repoUrl,
            streamData: record.streamData,
            metadata: record.metadata ? JSON.stringify(record.metadata) : undefined,
          }));
          await drizzleOps.insertEventBatch(events);
        }
      );
      
      const comparison = benchmarker['compareResults'](legacyResult, drizzleResult);
      
      expect(legacyResult.success).toBe(true);
      expect(drizzleResult.success).toBe(true);
      
      console.log(`📈 Batch Insert Large: Legacy ${legacyResult.averageTime.toFixed(2)}ms vs Drizzle ${drizzleResult.averageTime.toFixed(2)}ms (${comparison.performanceImprovement.toFixed(1)}% improvement)`);
    }, 120000);
  });

  describe('Query Operations', () => {
    beforeEach(async () => {
      // Pre-populate both databases with test data
      const testData = benchmarker['generateTestData'](BENCHMARK_CONFIG.MEDIUM_DATASET);
      
      await legacyDb.insertBatch(testData);
      
      const events = testData.map(record => ({
        sessionId: record.sessionId,
        eventType: record.eventType,
        agentType: record.agentType,
        mode: record.mode,
        prompt: record.prompt,
        timestamp: record.timestamp,
        sandboxId: record.sandboxId,
        repoUrl: record.repoUrl,
        streamData: record.streamData,
        metadata: record.metadata ? JSON.stringify(record.metadata) : undefined,
      }));
      await drizzleOps.insertEventBatch(events);
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
          await drizzleOps.queryEvents({ agentType: 'claude', limit: 50 });
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
          await drizzleOps.getStatistics();
        }
      );
      
      const comparison = benchmarker['compareResults'](legacyResult, drizzleResult);
      
      expect(legacyResult.success).toBe(true);
      expect(drizzleResult.success).toBe(true);
      
      console.log(`📈 Stats Query: Legacy ${legacyResult.averageTime.toFixed(2)}ms vs Drizzle ${drizzleResult.averageTime.toFixed(2)}ms (${comparison.performanceImprovement.toFixed(1)}% improvement)`);
    }, 30000);
  });
}); 