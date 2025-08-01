import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SSEProvider } from '../src/streaming/providers/SSEProvider.js';
import type { TelemetryEvent, StreamingConfig } from '../src/core/types.js';
import http from 'http';

describe('SSEProvider', () => {
  let provider: SSEProvider;
  let config: StreamingConfig;

  beforeEach(async () => {
    config = {
      enabled: true,
      type: 'sse',
      port: 3003, // Use different port for testing
    };
    
    provider = new SSEProvider();
  });

  afterEach(async () => {
    await provider.shutdown();
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      await expect(provider.initialize(config)).resolves.not.toThrow();
    });

    it('should start HTTP server on configured port', async () => {
      await provider.initialize(config);
      
      // Test that server is responding (basic connectivity test)
      const response = await new Promise<http.IncomingMessage>((resolve, reject) => {
        const req = http.request({
          hostname: 'localhost',
          port: config.port,
          path: '/events',
          method: 'GET',
          headers: {
            'Accept': 'text/event-stream',
          }
        }, resolve);
        
        req.on('error', reject);
        req.setTimeout(1000);
        req.end();
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('text/event-stream');
    });
  });

  describe('event streaming', () => {
    beforeEach(async () => {
      await provider.initialize(config);
    });

    it('should stream telemetry events', async () => {
      const testEvent: TelemetryEvent = {
        id: 'test-1',
        sessionId: 'session-1',
        eventType: 'start',
        category: 'test',
        action: 'test-action',
        timestamp: Date.now(),
        context: { environment: 'test', version: '1.0.0' }
      };

      // This is a basic test - in real scenarios you'd need to 
      // set up an SSE client to receive events
      await expect(provider.stream(testEvent)).resolves.not.toThrow();
    });

    it('should handle broadcast messages', async () => {
      const testData = { message: 'test broadcast' };
      
      await expect(provider.broadcast('test-channel', testData)).resolves.not.toThrow();
    });

    it('should handle subscription management', () => {
      const handler = vi.fn();
      
      // Test subscribe/unsubscribe (server-side handlers)
      provider.subscribe('test-channel', handler);
      provider.unsubscribe('test-channel', handler);
      
      // No exceptions should be thrown
    });
  });

  describe('error handling', () => {
    it('should handle stream errors gracefully', async () => {
      await provider.initialize(config);
      
      const invalidEvent = {
        // Missing required fields
        sessionId: 'test'
      } as any;

      await expect(provider.stream(invalidEvent)).resolves.not.toThrow();
    });

    it('should handle shutdown gracefully', async () => {
      await provider.initialize(config);
      await expect(provider.shutdown()).resolves.not.toThrow();
    });

    it('should handle multiple shutdowns gracefully', async () => {
      await provider.initialize(config);
      await provider.shutdown();
      await expect(provider.shutdown()).resolves.not.toThrow();
    });
  });

  describe('client management', () => {
    beforeEach(async () => {
      await provider.initialize(config);
    });

    it('should handle 404 for unknown paths', async () => {
      const response = await new Promise<http.IncomingMessage>((resolve, reject) => {
        const req = http.request({
          hostname: 'localhost',
          port: config.port,
          path: '/unknown',
          method: 'GET',
        }, resolve);
        
        req.on('error', reject);
        req.setTimeout(1000);
        req.end();
      });

      expect(response.statusCode).toBe(404);
    });

    it('should handle subscription requests with missing parameters', async () => {
      const response = await new Promise<http.IncomingMessage>((resolve, reject) => {
        const req = http.request({
          hostname: 'localhost',
          port: config.port,
          path: '/subscribe', // Missing required query parameters
          method: 'GET',
        }, resolve);
        
        req.on('error', reject);
        req.setTimeout(1000);
        req.end();
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('provider properties', () => {
    it('should return correct provider name', () => {
      expect(provider.name).toBe('sse');
    });
  });
});