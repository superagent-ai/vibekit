import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { VibeKitTelemetryAdapter } from '../adapters/TelemetryAdapter.js';

// Unmock fs for this test file since we need real filesystem operations
vi.unmock('fs');
vi.unmock('fs/promises');

describe('VibeKitTelemetryAdapter', () => {
  let adapter: VibeKitTelemetryAdapter;
  let testDbPath: string;

  beforeEach(async () => {
    testDbPath = join(tmpdir(), `test-adapter-${Date.now()}.db`);
    
    adapter = new VibeKitTelemetryAdapter({
      serviceVersion: '1.0.0',
      localStore: {
        isEnabled: true,
        path: testDbPath,
        streamBatchSize: 10,
        streamFlushIntervalMs: 1000,
      },
    });

    await adapter.initialize();
  });

  afterEach(async () => {
    await adapter.shutdown();
    try {
      const { rm } = await import('fs/promises');
      await rm(testDbPath);
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      const newAdapter = new VibeKitTelemetryAdapter({
        serviceVersion: '1.0.0',
        localStore: {
          isEnabled: true,
          path: join(tmpdir(), `test-init-${Date.now()}.db`),
        },
      });

      await expect(newAdapter.initialize()).resolves.not.toThrow();
      await newAdapter.shutdown();
    });

    it('should configure storage providers correctly', async () => {
      const newAdapter = new VibeKitTelemetryAdapter({
        serviceVersion: '1.0.0',
        localStore: {
          isEnabled: true,
          path: join(tmpdir(), `test-config-${Date.now()}.db`),
          streamBatchSize: 50,
          streamFlushIntervalMs: 2000,
        },
        endpoint: 'http://localhost:4318/v1/traces',
        headers: { 'x-custom': 'header' },
      });

      await expect(newAdapter.initialize()).resolves.not.toThrow();
      await newAdapter.shutdown();
    });
  });

  describe('session tracking', () => {
    it('should start a session and return session ID', async () => {
      const sessionId = await adapter.trackStart(
        'claude',
        'chat',
        'Hello world',
        { testData: 'value' }
      );

      expect(sessionId).toBeTruthy();
      expect(typeof sessionId).toBe('string');
    });

    it('should track stream events with session ID', async () => {
      const sessionId = await adapter.trackStart('claude', 'chat', 'Test prompt');

      await expect(
        adapter.trackStream(
          sessionId,
          'claude',
          'chat',
          'Test prompt',
          'Stream data chunk',
          'sandbox-123',
          'https://github.com/user/repo',
          { streamIndex: 1 }
        )
      ).resolves.not.toThrow();
    });

    it('should end a session successfully', async () => {
      const sessionId = await adapter.trackStart('claude', 'chat', 'Test prompt');

      await expect(
        adapter.trackEnd(
          sessionId,
          'claude',
          'chat',
          'Test prompt',
          'sandbox-123',
          'https://github.com/user/repo',
          { completionTokens: 100 }
        )
      ).resolves.not.toThrow();
    });

    it('should track errors with session ID', async () => {
      const sessionId = await adapter.trackStart('claude', 'chat', 'Test prompt');

      await expect(
        adapter.trackError(
          sessionId,
          'Connection timeout',
          { errorCode: 'TIMEOUT', retries: 3 }
        )
      ).resolves.not.toThrow();
    });
  });

  describe('complete session workflow', () => {
    it('should handle a complete session lifecycle', async () => {
      // Start session
      const sessionId = await adapter.trackStart(
        'claude',
        'code-generation',
        'Create a React component',
        { 
          userId: 'test-user',
          projectId: 'test-project'
        }
      );

      expect(sessionId).toBeTruthy();

      // Track multiple stream events
      for (let i = 0; i < 5; i++) {
        await adapter.trackStream(
          sessionId,
          'claude',
          'code-generation',
          'Create a React component',
          `Code chunk ${i + 1}`,
          'sandbox-123',
          'https://github.com/user/project',
          { chunkIndex: i }
        );
      }

      // End session
      await adapter.trackEnd(
        sessionId,
        'claude',
        'code-generation',
        'Create a React component',
        'sandbox-123',
        'https://github.com/user/project',
        { 
          totalTokens: 500,
          completionTime: 2000
        }
      );

      // Force flush any buffered stream events
      const underlyingService = adapter.getUnderlyingService();
      await underlyingService.flush();
      
      // Verify events were stored by querying the underlying service
      const events = await underlyingService.query({ sessionId });
      
      expect(events).toBeDefined();
      expect(events.length).toBeGreaterThan(0);
      
      // Should have start, stream, and end events
      const eventTypes = events.map(e => e.eventType);
      expect(eventTypes).toContain('start');
      expect(eventTypes).toContain('stream');
      expect(eventTypes).toContain('end');
    });

    it('should handle session with error', async () => {
      const sessionId = await adapter.trackStart('claude', 'chat', 'Test prompt');

      // Track some stream events
      await adapter.trackStream(
        sessionId,
        'claude',
        'chat',
        'Test prompt',
        'Partial response',
        'sandbox-123'
      );

      // Track an error
      await adapter.trackError(
        sessionId,
        'API rate limit exceeded',
        { 
          errorType: 'RATE_LIMIT',
          retryAfter: 60
        }
      );

      // Verify error was tracked
      const underlyingService = adapter.getUnderlyingService();
      const events = await underlyingService.query({ sessionId });
      
      const errorEvents = events.filter(e => e.eventType === 'error');
      expect(errorEvents).toHaveLength(1);
      expect(errorEvents[0].metadata).toMatchObject({
        errorType: 'RATE_LIMIT',
        retryAfter: 60
      });
    });
  });

  describe('analytics and metrics', () => {
    it('should provide analytics dashboard data', async () => {
      // Create some test data
      await adapter.trackStart('claude', 'chat', 'Test 1');
      await adapter.trackStart('gpt', 'code', 'Test 2');

      const analytics = await adapter.getAnalyticsDashboard('24h');
      expect(analytics).toBeDefined();
    });

    it('should support different time windows', async () => {
      const timeWindows = ['1h', '24h', '7d', '30d'];

      for (const window of timeWindows) {
        await expect(
          adapter.getAnalyticsDashboard(window)
        ).resolves.toBeDefined();
      }
    });

    it('should provide telemetry metrics', async () => {
      const metrics = await adapter.getTelemetryMetrics();
      expect(metrics).toBeDefined();
    });
  });

  describe('configuration compatibility', () => {
    it('should handle minimal VibeKit config', async () => {
      const minimalAdapter = new VibeKitTelemetryAdapter({
        serviceVersion: '1.0.0',
      });

      await expect(minimalAdapter.initialize()).resolves.not.toThrow();
      await minimalAdapter.shutdown();
    });

    it('should handle config with OTLP endpoint', async () => {
      const otlpAdapter = new VibeKitTelemetryAdapter({
        serviceVersion: '1.0.0',
        endpoint: 'http://localhost:4318/v1/traces',
        headers: {
          'Authorization': 'Bearer test-token',
          'x-custom-header': 'value',
        },
        localStore: {
          isEnabled: false,
        },
      });

      await expect(otlpAdapter.initialize()).resolves.not.toThrow();
      await otlpAdapter.shutdown();
    });

    it('should handle disabled local storage', async () => {
      const noLocalAdapter = new VibeKitTelemetryAdapter({
        serviceVersion: '1.0.0',
        endpoint: 'http://localhost:4318/v1/traces', // Need at least one storage provider
        localStore: {
          isEnabled: false,
        },
      });

      await expect(noLocalAdapter.initialize()).resolves.not.toThrow();
      
      // Note: trackStart will fail because OTLP endpoint is not available, 
      // but initialization should succeed
      await noLocalAdapter.shutdown();
    });
  });

  describe('error handling', () => {
    it('should handle missing session ID gracefully', async () => {
      // This should not throw, but might warn or handle gracefully
      await expect(
        adapter.trackStream(
          'non-existent-session',
          'claude',
          'chat',
          'Test prompt',
          'Stream data'
        )
      ).resolves.not.toThrow();
    });

    it('should handle invalid metadata gracefully', async () => {
      const sessionId = await adapter.trackStart('claude', 'chat', 'Test');

      // Test with complex metadata that might cause issues
      const complexMetadata = {
        test: 'value',
        nested: {
          array: [1, 2, 3],
          object: { key: 'value' }
        },
        nullValue: null,
        undefinedValue: undefined
      };

      await expect(
        adapter.trackEnd(
          sessionId,
          'claude',
          'chat',
          'Test',
          undefined,
          undefined,
          complexMetadata
        )
      ).resolves.not.toThrow();
    });
  });

  describe('performance', () => {
    it('should handle multiple concurrent sessions', async () => {
      const sessionPromises = Array.from({ length: 10 }, (_, i) =>
        adapter.trackStart('claude', 'chat', `Concurrent test ${i}`)
      );

      const sessionIds = await Promise.all(sessionPromises);
      expect(sessionIds).toHaveLength(10);
      expect(new Set(sessionIds).size).toBe(10); // All unique
    });

    it('should handle rapid stream events', async () => {
      const sessionId = await adapter.trackStart('claude', 'chat', 'Rapid test');

      const streamPromises = Array.from({ length: 50 }, (_, i) =>
        adapter.trackStream(
          sessionId,
          'claude',
          'chat',
          'Rapid test',
          `Chunk ${i}`,
          'sandbox-123'
        )
      );

      await expect(Promise.all(streamPromises)).resolves.not.toThrow();
    });
  });

  describe('underlying service access', () => {
    it('should provide access to underlying telemetry service', () => {
      const underlyingService = adapter.getUnderlyingService();
      expect(underlyingService).toBeDefined();
      expect(typeof underlyingService.trackStart).toBe('function');
      expect(typeof underlyingService.track).toBe('function');
      expect(typeof underlyingService.trackEnd).toBe('function');
      expect(typeof underlyingService.trackError).toBe('function');
    });

    it('should allow direct service usage for advanced features', async () => {
      const underlyingService = adapter.getUnderlyingService();
      
      // Use underlying service directly
      const sessionId = await underlyingService.trackStart(
        'custom-agent',
        'custom-mode',
        'Custom prompt',
        { advanced: true }
      );

      expect(sessionId).toBeTruthy();

      // Track custom event type
      await underlyingService.track({
        sessionId,
        eventType: 'custom',
        category: 'advanced',
        action: 'direct-usage',
        metadata: { customField: 'value' }
      });

      const events = await underlyingService.query({ sessionId });
      expect(events.some(e => e.eventType === 'custom')).toBe(true);
    });
  });
});