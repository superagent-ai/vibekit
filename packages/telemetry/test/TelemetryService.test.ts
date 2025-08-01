import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TelemetryService } from '../src/core/TelemetryService.js';
import type { TelemetryEvent } from '../src/core/types.js';

describe('TelemetryService', () => {
  let service: TelemetryService;

  beforeEach(async () => {
    service = new TelemetryService({
      storage: [{
        type: 'memory' as const,
        enabled: true,
      }],
      analytics: { enabled: false },
      security: { pii: { enabled: false }, encryption: { enabled: false }, retention: { enabled: false } },
      reliability: { circuitBreaker: { enabled: false }, retry: { enabled: false }, rateLimiter: { enabled: false } },
    });
    await service.initialize();
  });

  afterEach(async () => {
    await service.shutdown();
  });

  describe('track', () => {
    it('should track a basic event', async () => {
      const sessionId = `track-basic-${Date.now()}`;
      const event = {
        sessionId,
        category: 'test',
        action: 'basic-event',
      };

      await service.track(event);

      const events = await service.query({ sessionId });
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        sessionId,
        category: 'test',
        action: 'basic-event',
        eventType: 'custom',
      });
      expect(events[0].id).toBeDefined();
      expect(events[0].timestamp).toBeDefined();
    });

    it('should enrich events with metadata', async () => {
      const sessionId = `track-enriched-${Date.now()}`;
      const event = {
        sessionId,
        category: 'test',
        action: 'enriched-event',
        metadata: { custom: 'data' },
      };

      await service.track(event);

      const events = await service.query({ sessionId });
      expect(events[0].metadata).toEqual({ custom: 'data' });
    });
  });

  describe('trackStart', () => {
    it('should track a start event and return session ID', async () => {
      const sessionId = await service.trackStart('agent', 'interactive', 'test prompt');

      expect(sessionId).toBeDefined();
      expect(typeof sessionId).toBe('string');

      const events = await service.query({ sessionId });
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        sessionId,
        category: 'agent',
        action: 'interactive',
        eventType: 'start',
      });
    });
  });

  describe('trackEnd', () => {
    it('should track an end event', async () => {
      const sessionId = await service.trackStart('agent', 'interactive', 'test prompt');
      await service.trackEnd(sessionId, 'success');

      const events = await service.query({ sessionId });
      expect(events).toHaveLength(2);
      
      const endEvent = events.find(e => e.eventType === 'end');
      expect(endEvent).toMatchObject({
        sessionId,
        category: 'agent',
        action: 'end',
        eventType: 'end',
        label: 'success',
      });
    });
  });

  describe('trackError', () => {
    it('should track an error event', async () => {
      const sessionId = await service.trackStart('agent', 'interactive', 'test prompt');
      const error = new Error('Test error');
      
      await service.trackError(sessionId, error, { context: 'test' });

      const events = await service.query({ sessionId });
      const errorEvent = events.find(e => e.eventType === 'error');
      
      expect(errorEvent).toMatchObject({
        sessionId,
        category: 'agent',
        action: 'error',
        eventType: 'error',
        label: 'Test error',
      });
    });
  });

  describe('query', () => {
    let setupSessionId1: string;
    let setupSessionId2: string;
    
    beforeEach(async () => {
      // Setup test data using fresh sessions to avoid conflicts
      setupSessionId1 = `query-session-1-${Date.now()}`;
      setupSessionId2 = `query-session-2-${Date.now()}`;
      
      await service.track({
        sessionId: setupSessionId1,
        category: 'agent',
        action: 'test-1',
      });
      await service.track({
        sessionId: setupSessionId2,
        category: 'user',
        action: 'test-2',
      });
      await service.track({
        sessionId: setupSessionId1,
        category: 'agent',
        action: 'test-3',
      });
    });

    it('should filter by session ID', async () => {
      const events = await service.query({ sessionId: setupSessionId1 });
      expect(events).toHaveLength(2);
      expect(events.every(e => e.sessionId === setupSessionId1)).toBe(true);
    });

    it('should filter by category', async () => {
      // Filter by sessionId AND category to isolate our test data
      const events = await service.query({ 
        category: 'agent',
        sessionId: setupSessionId1 
      });
      expect(events).toHaveLength(2);
      expect(events.every(e => e.category === 'agent')).toBe(true);
    });

    it('should limit results', async () => {
      const events = await service.query({ limit: 1 });
      expect(events).toHaveLength(1);
    });
  });

  describe('export', () => {
    it('should export events in JSON format', async () => {
      const sessionId = `export-json-${Date.now()}`;
      await service.track({
        sessionId,
        category: 'test',
        action: 'export-test',
      });

      const exported = await service.export({ format: 'json' }, { sessionId });
      expect(typeof exported).toBe('string');
      
      const parsed = JSON.parse(exported);
      expect(parsed).toHaveProperty('events');
      expect(Array.isArray(parsed.events)).toBe(true);
      expect(parsed.events).toHaveLength(1);
    });

    it('should export events in CSV format', async () => {
      const sessionId = `export-csv-${Date.now()}`;
      await service.track({
        sessionId,
        category: 'test',
        action: 'export-test',
      });

      const exported = await service.export({ format: 'csv' }, { sessionId });
      expect(typeof exported).toBe('string');
      expect(exported).toContain('id,sessionId,eventType');
      expect(exported).toContain('export-test');
    });
  });

  describe('sessions', () => {
    it('should get active sessions', async () => {
      const sessionId1 = await service.trackStart('agent', 'interactive', 'prompt 1');
      const sessionId2 = await service.trackStart('agent', 'batch', 'prompt 2');
      
      const sessions = await service.getActiveSessions();
      const sessionIds = sessions.map(s => s.id);
      expect(sessionIds).toContain(sessionId1);
      expect(sessionIds).toContain(sessionId2);
      
      // Check that both sessions are active
      const session1 = sessions.find(s => s.id === sessionId1);
      const session2 = sessions.find(s => s.id === sessionId2);
      expect(session1?.status).toBe('active');
      expect(session2?.status).toBe('active');
    });

    it('should get session details', async () => {
      const sessionId = await service.trackStart('agent', 'interactive', 'test prompt');
      await service.track({
        sessionId,
        category: 'agent',
        action: 'step',
      });
      
      const session = await service.getSession(sessionId);
      expect(session).toBeDefined();
      expect(session?.id).toBe(sessionId);
      expect(session?.eventCount).toBe(2); // start + step
    });
  });
});