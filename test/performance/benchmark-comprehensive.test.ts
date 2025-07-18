/**
 * Phase 6: Performance Benchmarking Suite
 * 
 * Comprehensive performance comparison between legacy TelemetryDB and 
 * Drizzle ORM implementation across all key operations and scenarios.
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { performance } from 'perf_hooks';
import { resolve } from 'path';
import { existsSync, unlinkSync, writeFileSync } from 'fs';
import { TelemetryDB } from '../../packages/vibekit/src/services/telemetry-db';
import { DrizzleTelemetryService } from '../../packages/vibekit/src/db/drizzle-telemetry-service';
import { TelemetryRecord, TelemetryQueryFilter } from '../../packages/vibekit/src/types/telemetry-storage';
import { TelemetryConfig } from '../../packages/vibekit/src/types';

// Benchmark Configuration
const BENCHMARK_CONFIG = {
  // Test data sizes
  SMALL_DATASET: 100,
  MEDIUM_DATASET: 1000,
  LARGE_DATASET: 10000,
  STRESS_DATASET: 50000,
  
  // Performance thresholds (ms)
  SINGLE_INSERT_THRESHOLD: 5,
  BATCH_INSERT_THRESHOLD: 100,
  QUERY_THRESHOLD: 50,
  STATS_THRESHOLD: 100,
  
  // Memory thresholds (MB)
  MEMORY_USAGE_THRESHOLD: 100,
  
  // Concurrent operations
  CONCURRENT_OPERATIONS: 10,
  
  // Iterations for averaging
  ITERATIONS: 5,
};

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

class PerformanceBenchmarker {
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
    const agentTypes = ['claude', 'codex', 'gemini', 'opencode'];
    const modes = ['chat', 'edit', 'build'];
    
    for (let i = 0; i < count; i++) {
      data.push({
        sessionId: `${sessionPrefix}-session-${Math.floor(i / 10)}`,
        eventType: eventTypes[i % eventTypes.length],
        agentType: agentTypes[i % agentTypes.length],
        mode: modes[i % modes.length],
        prompt: `Benchmark prompt ${i} - ${'x'.repeat(100)}`, // ~100 char prompts
        streamData: i % 4 === 1 ? `Stream data chunk ${i} - ${'y'.repeat(200)}` : undefined,
        sandboxId: i % 3 === 0 ? `sandbox-${i}` : undefined,
        repoUrl: i % 5 === 0 ? `https://github.com/test/repo-${i}` : undefined,
        metadata: i % 7 === 0 ? { 
          testId: i, 
          benchmark: true, 
          complexity: Math.floor(Math.random() * 10) 
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
   * Generate detailed benchmark report
   */
  generateReport(): string {
    let report = '\n='.repeat(80) + '\n';
    report += '📊 PHASE 6 PERFORMANCE BENCHMARK REPORT\n';
    report += '='.repeat(80) + '\n\n';
    
    // Summary statistics
    const drizzleWins = this.comparisons.filter(c => c.winner === 'drizzle').length;
    const legacyWins = this.comparisons.filter(c => c.winner === 'legacy').length;
    const ties = this.comparisons.filter(c => c.winner === 'tie').length;
    
    report += `📈 OVERALL PERFORMANCE SUMMARY:\n`;
    report += `   Drizzle Wins: ${drizzleWins}/${this.comparisons.length} (${Math.round(drizzleWins/this.comparisons.length*100)}%)\n`;
    report += `   Legacy Wins:  ${legacyWins}/${this.comparisons.length} (${Math.round(legacyWins/this.comparisons.length*100)}%)\n`;
    report += `   Ties:         ${ties}/${this.comparisons.length} (${Math.round(ties/this.comparisons.length*100)}%)\n\n`;
    
    // Detailed comparisons
    report += `📊 DETAILED PERFORMANCE COMPARISONS:\n`;
    report += `${'Operation'.padEnd(25)} ${'Size'.padStart(8)} ${'Legacy(ms)'.padStart(12)} ${'Drizzle(ms)'.padStart(13)} ${'Improvement'.padStart(12)} ${'Winner'.padStart(8)}\n`;
    report += '-'.repeat(85) + '\n';
    
    for (const comp of this.comparisons) {
      const legacyTime = comp.legacyResult.success ? comp.legacyResult.averageTime.toFixed(2) : 'FAILED';
      const drizzleTime = comp.drizzleResult.success ? comp.drizzleResult.averageTime.toFixed(2) : 'FAILED';
      const improvement = comp.performanceImprovement > 0 
        ? `+${comp.performanceImprovement.toFixed(1)}%` 
        : `${comp.performanceImprovement.toFixed(1)}%`;
      const winner = comp.winner.toUpperCase();
      
      report += `${comp.operation.padEnd(25)} ${comp.dataSize.toString().padStart(8)} ${legacyTime.padStart(12)} ${drizzleTime.padStart(13)} ${improvement.padStart(12)} ${winner.padStart(8)}\n`;
    }
    
    // Memory usage analysis
    report += `\n💾 MEMORY USAGE ANALYSIS:\n`;
    const avgLegacyMemory = this.results
      .filter(r => r.implementation === 'legacy' && r.success)
      .reduce((acc, r) => acc + r.memoryUsage, 0) / 
      this.results.filter(r => r.implementation === 'legacy' && r.success).length;
    
    const avgDrizzleMemory = this.results
      .filter(r => r.implementation === 'drizzle' && r.success)
      .reduce((acc, r) => acc + r.memoryUsage, 0) / 
      this.results.filter(r => r.implementation === 'drizzle' && r.success).length;
    
    report += `   Average Legacy Memory:  ${avgLegacyMemory.toFixed(2)} MB\n`;
    report += `   Average Drizzle Memory: ${avgDrizzleMemory.toFixed(2)} MB\n`;
    report += `   Memory Improvement:     ${((avgLegacyMemory - avgDrizzleMemory) / avgLegacyMemory * 100).toFixed(1)}%\n\n`;
    
    // Throughput analysis
    report += `⚡ THROUGHPUT ANALYSIS:\n`;
    const maxLegacyThroughput = Math.max(...this.results.filter(r => r.implementation === 'legacy' && r.success).map(r => r.throughput));
    const maxDrizzleThroughput = Math.max(...this.results.filter(r => r.implementation === 'drizzle' && r.success).map(r => r.throughput));
    
    report += `   Max Legacy Throughput:  ${maxLegacyThroughput.toFixed(0)} ops/sec\n`;
    report += `   Max Drizzle Throughput: ${maxDrizzleThroughput.toFixed(0)} ops/sec\n`;
    report += `   Throughput Improvement: ${((maxDrizzleThroughput - maxLegacyThroughput) / maxLegacyThroughput * 100).toFixed(1)}%\n\n`;
    
    // Performance thresholds validation
    report += `✅ PERFORMANCE THRESHOLD VALIDATION:\n`;
    const thresholdViolations = this.results.filter(r => 
      (r.operation.includes('insert') && r.averageTime > BENCHMARK_CONFIG.SINGLE_INSERT_THRESHOLD) ||
      (r.operation.includes('batch') && r.averageTime > BENCHMARK_CONFIG.BATCH_INSERT_THRESHOLD) ||
      (r.operation.includes('query') && r.averageTime > BENCHMARK_CONFIG.QUERY_THRESHOLD) ||
      (r.operation.includes('stats') && r.averageTime > BENCHMARK_CONFIG.STATS_THRESHOLD)
    );
    
    if (thresholdViolations.length === 0) {
      report += `   ✅ All operations meet performance thresholds\n`;
    } else {
      report += `   ❌ ${thresholdViolations.length} operations exceed thresholds:\n`;
      for (const violation of thresholdViolations) {
        report += `      - ${violation.operation} (${violation.implementation}): ${violation.averageTime.toFixed(2)}ms\n`;
      }
    }
    
    report += '\n' + '='.repeat(80) + '\n';
    
    return report;
  }
  
  /**
   * Save benchmark results to file
   */
  saveResults(filename: string): void {
    const data = {
      timestamp: new Date().toISOString(),
      config: BENCHMARK_CONFIG,
      results: this.results,
      comparisons: this.comparisons,
      summary: {
        totalOperations: this.results.length,
        drizzleWins: this.comparisons.filter(c => c.winner === 'drizzle').length,
        legacyWins: this.comparisons.filter(c => c.winner === 'legacy').length,
        ties: this.comparisons.filter(c => c.winner === 'tie').length,
      }
    };
    
    writeFileSync(filename, JSON.stringify(data, null, 2));
  }
}

describe('Performance Benchmarking Suite', () => {
  let legacyDb: TelemetryDB;
  let drizzleService: DrizzleTelemetryService;
  let benchmarker: PerformanceBenchmarker;
  
  const legacyDbPath = resolve('./test-legacy-benchmark.db');
  const drizzleDbPath = resolve('./test-drizzle-benchmark.db');
  
  beforeAll(() => {
    benchmarker = new PerformanceBenchmarker();
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
    
    // Initialize Drizzle TelemetryService
    const drizzleConfig: TelemetryConfig = {
      isEnabled: true,
      localStore: {
        isEnabled: true,
        path: drizzleDbPath,
        streamBatchSize: 50,
        streamFlushIntervalMs: 1000,
      }
    };
    
    drizzleService = new DrizzleTelemetryService(drizzleConfig);
    await drizzleService.initialize();
  });
  
  afterEach(async () => {
    // Cleanup
    await legacyDb.close();
    await drizzleService.shutdown();
    
    // Remove test databases
    [legacyDbPath, drizzleDbPath].forEach(path => {
      if (existsSync(path)) {
        unlinkSync(path);
      }
    });
  });
  
  afterAll(() => {
    // Generate and save final report
    const report = benchmarker.generateReport();
    console.log(report);
    
    benchmarker.saveResults(resolve('./phase6-benchmark-results.json'));
  });

  describe('Single Insert Operations', () => {
    it('should benchmark single event insertion - Small Dataset', async () => {
      const testData = benchmarker['generateTestData'](BENCHMARK_CONFIG.SMALL_DATASET);
      
      // Benchmark legacy implementation
      const legacyResult = await benchmarker['benchmarkOperation'](
        'Single Insert',
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
        'Single Insert',
        'drizzle',
        BENCHMARK_CONFIG.SMALL_DATASET,
        async () => {
          for (const record of testData) {
            await drizzleService.trackEvent({
              sessionId: record.sessionId,
              agentType: record.agentType,
              mode: record.mode,
              prompt: record.prompt,
              eventType: record.eventType,
              timestamp: record.timestamp,
              sandboxId: record.sandboxId,
              repoUrl: record.repoUrl,
              streamData: record.streamData,
              metadata: record.metadata,
            });
          }
        }
      );
      
      const comparison = benchmarker['compareResults'](legacyResult, drizzleResult);
      
      expect(legacyResult.success).toBe(true);
      expect(drizzleResult.success).toBe(true);
      expect(legacyResult.averageTime).toBeLessThan(BENCHMARK_CONFIG.SINGLE_INSERT_THRESHOLD * BENCHMARK_CONFIG.SMALL_DATASET);
      expect(drizzleResult.averageTime).toBeLessThan(BENCHMARK_CONFIG.SINGLE_INSERT_THRESHOLD * BENCHMARK_CONFIG.SMALL_DATASET);
    }, 30000);
    
    it('should benchmark single event insertion - Medium Dataset', async () => {
      const testData = benchmarker['generateTestData'](BENCHMARK_CONFIG.MEDIUM_DATASET);
      
      const legacyResult = await benchmarker['benchmarkOperation'](
        'Single Insert',
        'legacy',
        BENCHMARK_CONFIG.MEDIUM_DATASET,
        async () => {
          for (const record of testData) {
            await legacyDb.insertEvent(record);
          }
        }
      );
      
      const drizzleResult = await benchmarker['benchmarkOperation'](
        'Single Insert',
        'drizzle',
        BENCHMARK_CONFIG.MEDIUM_DATASET,
        async () => {
          for (const record of testData) {
            await drizzleService.trackEvent({
              sessionId: record.sessionId,
              agentType: record.agentType,
              mode: record.mode,
              prompt: record.prompt,
              eventType: record.eventType,
              timestamp: record.timestamp,
              sandboxId: record.sandboxId,
              repoUrl: record.repoUrl,
              streamData: record.streamData,
              metadata: record.metadata,
            });
          }
        }
      );
      
      benchmarker['compareResults'](legacyResult, drizzleResult);
      
      expect(legacyResult.success).toBe(true);
      expect(drizzleResult.success).toBe(true);
    }, 60000);
  });

  describe('Batch Insert Operations', () => {
    it('should benchmark batch insertion - Small Dataset', async () => {
      const testData = benchmarker['generateTestData'](BENCHMARK_CONFIG.SMALL_DATASET);
      
      const legacyResult = await benchmarker['benchmarkOperation'](
        'Batch Insert',
        'legacy',
        BENCHMARK_CONFIG.SMALL_DATASET,
        async () => {
          await legacyDb.insertBatch(testData);
        }
      );
      
      const drizzleResult = await benchmarker['benchmarkOperation'](
        'Batch Insert',
        'drizzle',
        BENCHMARK_CONFIG.SMALL_DATASET,
        async () => {
          const events = testData.map(record => ({
            sessionId: record.sessionId,
            agentType: record.agentType,
            mode: record.mode,
            prompt: record.prompt,
            eventType: record.eventType,
            timestamp: record.timestamp,
            sandboxId: record.sandboxId,
            repoUrl: record.repoUrl,
            streamData: record.streamData,
            metadata: record.metadata,
          }));
          await drizzleService.trackBatch(events);
        }
      );
      
      benchmarker['compareResults'](legacyResult, drizzleResult);
      
      expect(legacyResult.success).toBe(true);
      expect(drizzleResult.success).toBe(true);
      expect(legacyResult.averageTime).toBeLessThan(BENCHMARK_CONFIG.BATCH_INSERT_THRESHOLD);
      expect(drizzleResult.averageTime).toBeLessThan(BENCHMARK_CONFIG.BATCH_INSERT_THRESHOLD);
    }, 30000);
    
    it('should benchmark batch insertion - Large Dataset', async () => {
      const testData = benchmarker['generateTestData'](BENCHMARK_CONFIG.LARGE_DATASET);
      
      const legacyResult = await benchmarker['benchmarkOperation'](
        'Batch Insert',
        'legacy',
        BENCHMARK_CONFIG.LARGE_DATASET,
        async () => {
          await legacyDb.insertBatch(testData);
        }
      );
      
      const drizzleResult = await benchmarker['benchmarkOperation'](
        'Batch Insert',
        'drizzle',
        BENCHMARK_CONFIG.LARGE_DATASET,
        async () => {
          const events = testData.map(record => ({
            sessionId: record.sessionId,
            agentType: record.agentType,
            mode: record.mode,
            prompt: record.prompt,
            eventType: record.eventType,
            timestamp: record.timestamp,
            sandboxId: record.sandboxId,
            repoUrl: record.repoUrl,
            streamData: record.streamData,
            metadata: record.metadata,
          }));
          await drizzleService.trackBatch(events);
        }
      );
      
      benchmarker['compareResults'](legacyResult, drizzleResult);
      
      expect(legacyResult.success).toBe(true);
      expect(drizzleResult.success).toBe(true);
    }, 120000);
  });

  describe('Query Operations', () => {
    beforeEach(async () => {
      // Pre-populate both databases with test data
      const testData = benchmarker['generateTestData'](BENCHMARK_CONFIG.MEDIUM_DATASET);
      
      await legacyDb.insertBatch(testData);
      
      const events = testData.map(record => ({
        sessionId: record.sessionId,
        agentType: record.agentType,
        mode: record.mode,
        prompt: record.prompt,
        eventType: record.eventType,
        timestamp: record.timestamp,
        sandboxId: record.sandboxId,
        repoUrl: record.repoUrl,
        streamData: record.streamData,
        metadata: record.metadata,
      }));
      await drizzleService.trackBatch(events);
    });
    
    it('should benchmark simple queries', async () => {
      const filter: TelemetryQueryFilter = {
        agentType: 'claude',
        limit: 100,
      };
      
      const legacyResult = await benchmarker['benchmarkOperation'](
        'Simple Query',
        'legacy',
        100,
        async () => {
          await legacyDb.getEvents(filter);
        }
      );
      
      const drizzleResult = await benchmarker['benchmarkOperation'](
        'Simple Query',
        'drizzle',
        100,
        async () => {
          await drizzleService.queryEvents({ agentType: 'claude', limit: 100 });
        }
      );
      
      benchmarker['compareResults'](legacyResult, drizzleResult);
      
      expect(legacyResult.success).toBe(true);
      expect(drizzleResult.success).toBe(true);
      expect(legacyResult.averageTime).toBeLessThan(BENCHMARK_CONFIG.QUERY_THRESHOLD);
      expect(drizzleResult.averageTime).toBeLessThan(BENCHMARK_CONFIG.QUERY_THRESHOLD);
    }, 30000);
    
    it('should benchmark complex filtered queries', async () => {
      const filter: TelemetryQueryFilter = {
        agentType: 'claude',
        eventType: 'stream',
        from: Date.now() - 24 * 60 * 60 * 1000, // Last 24 hours
        to: Date.now(),
        limit: 500,
        offset: 0,
      };
      
      const legacyResult = await benchmarker['benchmarkOperation'](
        'Complex Query',
        'legacy',
        500,
        async () => {
          await legacyDb.getEvents(filter);
        }
      );
      
      const drizzleResult = await benchmarker['benchmarkOperation'](
        'Complex Query',
        'drizzle',
        500,
        async () => {
          await drizzleService.queryEvents({ 
            agentType: 'claude',
            eventType: 'stream',
            fromTime: Date.now() - 24 * 60 * 60 * 1000,
            toTime: Date.now(),
            limit: 500,
            offset: 0,
          });
        }
      );
      
      benchmarker['compareResults'](legacyResult, drizzleResult);
      
      expect(legacyResult.success).toBe(true);
      expect(drizzleResult.success).toBe(true);
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
          await drizzleService.getStatistics();
        }
      );
      
      benchmarker['compareResults'](legacyResult, drizzleResult);
      
      expect(legacyResult.success).toBe(true);
      expect(drizzleResult.success).toBe(true);
      expect(legacyResult.averageTime).toBeLessThan(BENCHMARK_CONFIG.STATS_THRESHOLD);
      expect(drizzleResult.averageTime).toBeLessThan(BENCHMARK_CONFIG.STATS_THRESHOLD);
    }, 30000);
  });

  describe('Concurrent Operations', () => {
    it('should benchmark concurrent insertions', async () => {
      const testData = benchmarker['generateTestData'](BENCHMARK_CONFIG.CONCURRENT_OPERATIONS * 10);
      const chunks = [];
      for (let i = 0; i < BENCHMARK_CONFIG.CONCURRENT_OPERATIONS; i++) {
        chunks.push(testData.slice(i * 10, (i + 1) * 10));
      }
      
      const legacyResult = await benchmarker['benchmarkOperation'](
        'Concurrent Insert',
        'legacy',
        BENCHMARK_CONFIG.CONCURRENT_OPERATIONS * 10,
        async () => {
          const promises = chunks.map(chunk => legacyDb.insertBatch(chunk));
          await Promise.all(promises);
        }
      );
      
      const drizzleResult = await benchmarker['benchmarkOperation'](
        'Concurrent Insert',
        'drizzle',
        BENCHMARK_CONFIG.CONCURRENT_OPERATIONS * 10,
        async () => {
          const promises = chunks.map(chunk => {
            const events = chunk.map(record => ({
              sessionId: record.sessionId,
              agentType: record.agentType,
              mode: record.mode,
              prompt: record.prompt,
              eventType: record.eventType,
              timestamp: record.timestamp,
              sandboxId: record.sandboxId,
              repoUrl: record.repoUrl,
              streamData: record.streamData,
              metadata: record.metadata,
            }));
            return drizzleService.trackBatch(events);
          });
          await Promise.all(promises);
        }
      );
      
      benchmarker['compareResults'](legacyResult, drizzleResult);
      
      expect(legacyResult.success).toBe(true);
      expect(drizzleResult.success).toBe(true);
    }, 60000);
  });

  describe('Memory Usage Testing', () => {
    it('should benchmark memory efficiency under load', async () => {
      const testData = benchmarker['generateTestData'](BENCHMARK_CONFIG.STRESS_DATASET);
      
      const legacyResult = await benchmarker['benchmarkOperation'](
        'Memory Stress Test',
        'legacy',
        BENCHMARK_CONFIG.STRESS_DATASET,
        async () => {
          // Insert in batches to avoid memory overload
          const batchSize = 1000;
          for (let i = 0; i < testData.length; i += batchSize) {
            const batch = testData.slice(i, i + batchSize);
            await legacyDb.insertBatch(batch);
          }
        }
      );
      
      const drizzleResult = await benchmarker['benchmarkOperation'](
        'Memory Stress Test',
        'drizzle',
        BENCHMARK_CONFIG.STRESS_DATASET,
        async () => {
          // Insert in batches to avoid memory overload
          const batchSize = 1000;
          for (let i = 0; i < testData.length; i += batchSize) {
            const batch = testData.slice(i, i + batchSize);
            const events = batch.map(record => ({
              sessionId: record.sessionId,
              agentType: record.agentType,
              mode: record.mode,
              prompt: record.prompt,
              eventType: record.eventType,
              timestamp: record.timestamp,
              sandboxId: record.sandboxId,
              repoUrl: record.repoUrl,
              streamData: record.streamData,
              metadata: record.metadata,
            }));
            await drizzleService.trackBatch(events);
          }
        }
      );
      
      benchmarker['compareResults'](legacyResult, drizzleResult);
      
      expect(legacyResult.success).toBe(true);
      expect(drizzleResult.success).toBe(true);
      expect(legacyResult.memoryUsage).toBeLessThan(BENCHMARK_CONFIG.MEMORY_USAGE_THRESHOLD);
      expect(drizzleResult.memoryUsage).toBeLessThan(BENCHMARK_CONFIG.MEMORY_USAGE_THRESHOLD);
    }, 180000);
  });

  describe('Health Check Operations', () => {
    it('should benchmark health check performance', async () => {
      const legacyResult = await benchmarker['benchmarkOperation'](
        'Health Check',
        'legacy',
        1,
        async () => {
          await legacyDb.healthCheck();
        }
      );
      
      const drizzleResult = await benchmarker['benchmarkOperation'](
        'Health Check',
        'drizzle',
        1,
        async () => {
          await drizzleService.healthCheck();
        }
      );
      
      benchmarker['compareResults'](legacyResult, drizzleResult);
      
      expect(legacyResult.success).toBe(true);
      expect(drizzleResult.success).toBe(true);
      expect(legacyResult.averageTime).toBeLessThan(10); // Health checks should be very fast
      expect(drizzleResult.averageTime).toBeLessThan(10);
    }, 10000);
  });
}); 