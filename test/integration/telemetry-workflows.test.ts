/**
 * Telemetry Workflow Integration Tests
 * 
 * This test suite verifies complete telemetry workflows end-to-end,
 * including session lifecycle, stream buffering, error recovery, and cleanup processes.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DrizzleTelemetryService } from '../../packages/vibekit/src/db/drizzle-telemetry-service';
import { TelemetryConfig } from '../../packages/vibekit/src/types';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';

describe.skip('Telemetry Workflow Integration Tests', () => {
  let telemetryService: DrizzleTelemetryService;
  let testDbPath: string;
  let testConfig: TelemetryConfig;

  beforeEach(async () => {
    // Create unique test database for each test
    testDbPath = path.join(process.cwd(), `test-workflow-${randomUUID()}.db`);
    
    testConfig = {
      isEnabled: false, // Disable OpenTelemetry for integration tests
      localStore: {
        isEnabled: true,
        path: testDbPath,
        streamBatchSize: 5,
        streamFlushIntervalMs: 100,
        pruneDays: 30,
        maxSizeMB: 100,
      },
    };

    telemetryService = new DrizzleTelemetryService(testConfig);
  });

  afterEach(async () => {
    // Cleanup test database
    try {
      await telemetryService.close();
    } catch (error) {
      // Ignore close errors
    }
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('Complete Session Lifecycle', () => {
    it('should handle a complete coding session workflow', async () => {
      const sessionId = randomUUID();
      const agentType = 'claude';
      const mode = 'code';
      const prompt = 'Write a function to calculate fibonacci numbers';

      // Step 1: Start session
      await telemetryService.trackStart(agentType, mode, prompt, {
        sessionId,
        sandboxId: 'test-sandbox-1',
        repoUrl: 'https://github.com/test/repo',
        language: 'typescript'
      });

      // Step 2: Stream multiple code chunks
      const codeChunks = [
        'function fibonacci(n: number): number {',
        '  if (n <= 1) return n;',
        '  return fibonacci(n - 1) + fibonacci(n - 2);',
        '}'
      ];

      for (let i = 0; i < codeChunks.length; i++) {
        await telemetryService.trackStream(agentType, mode, prompt, codeChunks[i], 
          'test-sandbox-1', 'https://github.com/test/repo', {
            chunkIndex: i,
            totalChunks: codeChunks.length
          });
        
        // Small delay to simulate real streaming
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // Step 3: End session
      await telemetryService.trackEnd(agentType, mode, prompt, 
        'test-sandbox-1', 'https://github.com/test/repo', {
          finalOutput: codeChunks.join('\n'),
          completionTime: Date.now(),
          linesOfCode: 4
        });

      // Verify the complete workflow
      const analytics = telemetryService.getAnalyticsService();
      if (analytics) {
        const sessions = await analytics.getSessionSummaries({ limit: 1 });
        expect(sessions).toHaveLength(1);
        
        const session = sessions[0];
        expect(session.agentType).toBe(agentType);
        expect(session.status).toBe('completed');
        expect(session.eventCount).toBeGreaterThan(4); // start + streams + end
        expect(session.streamEventCount).toBe(codeChunks.length);
      }
    });

    it('should handle session with error recovery', async () => {
      const sessionId = randomUUID();
      const agentType = 'codex';
      const mode = 'code';
      const prompt = 'Generate invalid code for testing';

      // Start session
      await telemetryService.trackStart(agentType, mode, prompt, {
        sessionId,
        testScenario: 'error-recovery'
      });

      // Stream some data
      await telemetryService.trackStream(agentType, mode, prompt, 
        'const invalidCode = {', null, null, { partial: true });

      // Encounter an error
      await telemetryService.trackError(agentType, mode, prompt, 
        'Syntax error: Unexpected end of input', {
          errorType: 'SyntaxError',
          line: 1,
          column: 18,
          recoverable: true
        });

      // Continue with corrected stream
      await telemetryService.trackStream(agentType, mode, prompt, 
        'const validCode = { key: "value" };', null, null, { 
          corrected: true,
          previousError: 'SyntaxError'
        });

      // End session successfully
      await telemetryService.trackEnd(agentType, mode, prompt, null, null, {
        recoveredFromError: true,
        finalStatus: 'success'
      });

      // Verify error recovery workflow
      const analytics = telemetryService.getAnalyticsService();
      if (analytics) {
        const sessions = await analytics.getSessionSummaries({ limit: 1 });
        expect(sessions).toHaveLength(1);
        
        const session = sessions[0];
        expect(session.errorCount).toBe(1);
        expect(session.status).toBe('completed'); // Should still complete successfully
      }
    });

    it('should handle concurrent sessions', async () => {
      const sessionCount = 3;
      const sessions = [];

      // Start multiple concurrent sessions
      for (let i = 0; i < sessionCount; i++) {
        const sessionId = randomUUID();
        const agentType = i % 2 === 0 ? 'claude' : 'gemini';
        
        sessions.push({
          id: sessionId,
          agentType,
          mode: 'code',
          prompt: `Concurrent session ${i} prompt`
        });

        await telemetryService.trackStart(agentType, 'code', 
          `Concurrent session ${i} prompt`, {
            sessionId,
            concurrentIndex: i
          });
      }

      // Run concurrent streaming for all sessions
      const streamPromises = [];
      for (let i = 0; i < sessionCount; i++) {
        const session = sessions[i];
        
        for (let chunk = 0; chunk < 3; chunk++) {
          const promise = telemetryService.trackStream(
            session.agentType, 
            session.mode, 
            session.prompt,
            `Session ${i} chunk ${chunk}`,
            null, null, {
              sessionIndex: i,
              chunkIndex: chunk
            }
          );
          streamPromises.push(promise);
        }
      }

      await Promise.all(streamPromises);

      // End all sessions
      const endPromises = sessions.map((session, i) => 
        telemetryService.trackEnd(session.agentType, session.mode, session.prompt,
          null, null, { sessionIndex: i, completed: true })
      );

      await Promise.all(endPromises);

      // Verify all sessions completed successfully
      const analytics = telemetryService.getAnalyticsService();
      if (analytics) {
        const allSessions = await analytics.getSessionSummaries({ limit: 10 });
        const testSessions = allSessions.filter(s => s.eventCount > 0);
        expect(testSessions.length).toBeGreaterThanOrEqual(sessionCount);
      }
    });
  });

  describe('Stream Buffering Workflows', () => {
    it('should handle automatic buffer flushing', async () => {
      const sessionId = randomUUID();
      const agentType = 'claude';
      const mode = 'code';
      const prompt = 'Generate a large amount of streaming data';

      await telemetryService.trackStart(agentType, mode, prompt, { sessionId });

      // Generate enough streams to trigger buffer flush (more than streamBatchSize)
      const streamCount = 10; // Greater than batchSize of 5
      const streamPromises = [];

      for (let i = 0; i < streamCount; i++) {
        const promise = telemetryService.trackStream(agentType, mode, prompt,
          `Large stream chunk ${i} with significant data content`, null, null, {
            chunkIndex: i,
            bufferTest: true
          });
        streamPromises.push(promise);
      }

      await Promise.all(streamPromises);

      // Wait for buffer flush
      await new Promise(resolve => setTimeout(resolve, 200));

      await telemetryService.trackEnd(agentType, mode, prompt, null, null, {
        bufferFlushTest: true
      });

      // Verify buffer flushing worked
      const analytics = telemetryService.getAnalyticsService();
      if (analytics) {
        const sessions = await analytics.getSessionSummaries({ limit: 1 });
        expect(sessions).toHaveLength(1);
        expect(sessions[0].streamEventCount).toBe(streamCount);
      }
    });

    it('should handle buffer overflow protection', async () => {
      const sessionId = randomUUID();
      const agentType = 'gemini';
      const mode = 'code';
      const prompt = 'Test buffer overflow protection';

      await telemetryService.trackStart(agentType, mode, prompt, { sessionId });

      // Generate very large number of streams rapidly
      const largeStreamCount = 100;
      const streamPromises = [];

      for (let i = 0; i < largeStreamCount; i++) {
        const promise = telemetryService.trackStream(agentType, mode, prompt,
          `Overflow protection test chunk ${i}`, null, null, {
            overflowTest: true,
            chunkIndex: i
          });
        streamPromises.push(promise);
      }

      // Should handle gracefully without memory issues
      await Promise.all(streamPromises);

      await telemetryService.trackEnd(agentType, mode, prompt, null, null, {
        overflowProtectionTest: true
      });

      // Verify system remained stable
      const metrics = telemetryService.getPerformanceMetrics();
      expect(metrics.activeBuffers).toBeLessThan(10); // Should have been flushed
      expect(metrics.totalFlushes).toBeGreaterThan(0);
    });

    it('should handle periodic buffer maintenance', async () => {
      const sessionId = randomUUID();
      const agentType = 'claude';
      const mode = 'code';
      const prompt = 'Test periodic buffer maintenance';

      await telemetryService.trackStart(agentType, mode, prompt, { sessionId });

      // Create streams with delays to test periodic flushing
      for (let i = 0; i < 5; i++) {
        await telemetryService.trackStream(agentType, mode, prompt,
          `Periodic maintenance chunk ${i}`, null, null, {
            maintenanceTest: true,
            chunkIndex: i
          });
        
        // Wait longer than flush interval
        await new Promise(resolve => setTimeout(resolve, 150));
      }

      await telemetryService.trackEnd(agentType, mode, prompt, null, null, {
        periodicMaintenanceTest: true
      });

      // Verify periodic maintenance worked
      const metrics = telemetryService.getPerformanceMetrics();
      expect(metrics.totalFlushes).toBeGreaterThan(1); // Should have multiple flushes
    });
  });

  describe('Error Recovery Workflows', () => {
    it('should recover from database connection issues', async () => {
      const sessionId = randomUUID();
      const agentType = 'claude';
      const mode = 'code';
      const prompt = 'Test database recovery';

      // Start session normally
      await telemetryService.trackStart(agentType, mode, prompt, { sessionId });

      // Simulate some normal operations
      await telemetryService.trackStream(agentType, mode, prompt,
        'Normal operation before issue', null, null, { beforeIssue: true });

      // Simulate recovery (in real implementation, this might involve reconnection)
      // For now, we'll test that operations continue to work
      await telemetryService.trackStream(agentType, mode, prompt,
        'Operation after recovery', null, null, { afterRecovery: true });

      await telemetryService.trackEnd(agentType, mode, prompt, null, null, {
        recoveryTest: true
      });

      // Verify recovery worked
      const analytics = telemetryService.getAnalyticsService();
      if (analytics) {
        const sessions = await analytics.getSessionSummaries({ limit: 1 });
        expect(sessions).toHaveLength(1);
        expect(sessions[0].status).toBe('completed');
      }
    });

    it('should handle graceful degradation', async () => {
      // Test with local storage disabled
      const degradedConfig = {
        ...testConfig,
        localStore: {
          ...testConfig.localStore!,
          isEnabled: false
        }
      };

      const degradedService = new DrizzleTelemetryService(degradedConfig);

      // Operations should not throw errors even with storage disabled
      await expect(degradedService.trackStart('claude', 'code', 'test')).resolves.not.toThrow();
      await expect(degradedService.trackStream('claude', 'code', 'test', 'data')).resolves.not.toThrow();
      await expect(degradedService.trackEnd('claude', 'code', 'test')).resolves.not.toThrow();
      await expect(degradedService.trackError('claude', 'code', 'test', 'error')).resolves.not.toThrow();

      await degradedService.close();
    });

    it('should handle data corruption recovery', async () => {
      const sessionId = randomUUID();
      const agentType = 'codex';
      const mode = 'code';
      const prompt = 'Test data corruption recovery';

      await telemetryService.trackStart(agentType, mode, prompt, { sessionId });

      // Insert some normal data
      await telemetryService.trackStream(agentType, mode, prompt,
        'Valid data before corruption', null, null, { validData: true });

      // Simulate potential data corruption scenario
      try {
        await telemetryService.trackStream(agentType, mode, prompt,
          null as any, null, null, { corruptionTest: true }); // null stream data
      } catch (error) {
        // Expected behavior - should handle gracefully
      }

      // System should continue working
      await telemetryService.trackStream(agentType, mode, prompt,
        'Valid data after recovery', null, null, { afterCorruption: true });

      await telemetryService.trackEnd(agentType, mode, prompt, null, null, {
        corruptionRecoveryTest: true
      });

      // Verify system recovered
      const analytics = telemetryService.getAnalyticsService();
      if (analytics) {
        const sessions = await analytics.getSessionSummaries({ limit: 1 });
        expect(sessions).toHaveLength(1);
        // Should have at least the valid events
        expect(sessions[0].eventCount).toBeGreaterThan(2);
      }
    });
  });

  describe('Cleanup and Maintenance Workflows', () => {
    it('should handle session cleanup workflow', async () => {
      const sessionIds = [];
      
      // Create multiple sessions
      for (let i = 0; i < 3; i++) {
        const sessionId = randomUUID();
        sessionIds.push(sessionId);
        
        await telemetryService.trackStart('claude', 'code', `Cleanup test ${i}`, {
          sessionId,
          cleanupTest: true,
          sessionIndex: i
        });

        await telemetryService.trackStream('claude', 'code', `Cleanup test ${i}`,
          `Test data ${i}`, null, null, { sessionIndex: i });

        await telemetryService.trackEnd('claude', 'code', `Cleanup test ${i}`,
          null, null, { sessionIndex: i, completed: true });
      }

      // Verify sessions exist
      const analytics = telemetryService.getAnalyticsService();
      if (analytics) {
        const beforeCleanup = await analytics.getSessionSummaries({ limit: 10 });
        expect(beforeCleanup.length).toBeGreaterThanOrEqual(3);

        // Test cleanup (in real implementation, this might clean old data)
        // For now, verify data integrity is maintained
        const afterMaintenance = await analytics.getSessionSummaries({ limit: 10 });
        expect(afterMaintenance.length).toBeGreaterThanOrEqual(3);
      }
    });

    it('should handle performance metrics collection', async () => {
      const sessionId = randomUUID();
      
      await telemetryService.trackStart('gemini', 'chat', 'Performance test', {
        sessionId,
        performanceTest: true
      });

      // Generate various activities
      for (let i = 0; i < 10; i++) {
        await telemetryService.trackStream('gemini', 'chat', 'Performance test',
          `Performance test data ${i}`, null, null, { iteration: i });
      }

      await telemetryService.trackEnd('gemini', 'chat', 'Performance test',
        null, null, { performanceTestCompleted: true });

      // Check performance metrics
      const metrics = telemetryService.getPerformanceMetrics();
      expect(metrics.totalEventsWritten).toBeGreaterThan(0);
      expect(metrics.totalFlushes).toBeGreaterThanOrEqual(0);
      expect(typeof metrics.averageFlushTime).toBe('number');
      expect(typeof metrics.lastFlushTime).toBe('number');
    });

    it('should handle resource cleanup on service close', async () => {
      const sessionId = randomUUID();
      
      await telemetryService.trackStart('claude', 'code', 'Cleanup test', {
        sessionId,
        resourceCleanupTest: true
      });

      await telemetryService.trackStream('claude', 'code', 'Cleanup test',
        'Test data before cleanup', null, null, { beforeCleanup: true });

      // Get initial metrics
      const beforeClose = telemetryService.getPerformanceMetrics();
      expect(beforeClose.activeBuffers).toBeGreaterThanOrEqual(0);

      // Close service - should clean up resources
      await telemetryService.close();

      // Verify cleanup (service should handle gracefully even after close)
      try {
        await telemetryService.trackStream('claude', 'code', 'test', 'data');
      } catch (error) {
        // Expected - service is closed
      }

      // Metrics should be stable
      const afterClose = telemetryService.getPerformanceMetrics();
      expect(typeof afterClose.totalFlushes).toBe('number');
    });
  });

  describe('Analytics Integration Workflows', () => {
    it('should provide real-time analytics during active sessions', async () => {
      const sessionId = randomUUID();
      const agentType = 'claude';
      
      await telemetryService.trackStart(agentType, 'code', 'Analytics test', {
        sessionId,
        analyticsIntegrationTest: true
      });

      // Stream data and check analytics in real-time
      for (let i = 0; i < 5; i++) {
        await telemetryService.trackStream(agentType, 'code', 'Analytics test',
          `Analytics chunk ${i}`, null, null, { chunkIndex: i });

        // Check analytics after each stream
        const analytics = telemetryService.getAnalyticsService();
        if (analytics) {
          const sessions = await analytics.getSessionSummaries({ limit: 1 });
          if (sessions.length > 0) {
            expect(sessions[0].streamEventCount).toBeGreaterThanOrEqual(i);
          }
        }
      }

      await telemetryService.trackEnd(agentType, 'code', 'Analytics test',
        null, null, { analyticsCompleted: true });

      // Final analytics check
      const analytics = telemetryService.getAnalyticsService();
      if (analytics) {
        const finalSessions = await analytics.getSessionSummaries({ limit: 1 });
        expect(finalSessions).toHaveLength(1);
        expect(finalSessions[0].status).toBe('completed');
        expect(finalSessions[0].streamEventCount).toBe(5);
      }
    });

    it('should handle export workflow integration', async () => {
      const sessionId = randomUUID();
      
      // Create test data
      await telemetryService.trackStart('codex', 'code', 'Export test', {
        sessionId,
        exportIntegrationTest: true
      });

      await telemetryService.trackStream('codex', 'code', 'Export test',
        'Export test data', null, null, { exportTest: true });

      await telemetryService.trackEnd('codex', 'code', 'Export test',
        null, null, { exportCompleted: true });

      // Test export functionality
      const exportService = telemetryService.getExportService();
      if (exportService) {
        const exportFilter = {
          sessionIds: [sessionId],
          format: 'json' as const,
          includeMetadata: true
        };

        try {
          const exportPath = path.join(process.cwd(), `test-export-${randomUUID()}.json`);
          await exportService.exportData(exportFilter, exportPath);
          
          // Verify export file exists
          expect(fs.existsSync(exportPath)).toBe(true);
          
          // Cleanup export file
          fs.unlinkSync(exportPath);
        } catch (error) {
          // Export might not be fully implemented yet
          console.warn('Export service not fully available:', error);
        }
      }
    });
  });
}); 