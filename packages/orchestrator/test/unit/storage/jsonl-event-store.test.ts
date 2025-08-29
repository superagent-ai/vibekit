import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { JSONLEventStore } from '../../../src/storage/jsonl-event-store';
import { OrchestrationEvent, OrchestrationEventType } from '../../../src/types';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('JSONLEventStore', () => {
  let eventStore: JSONLEventStore;
  const testDir = '.vibekit-test';
  const originalBasePath = '.vibekit/orchestrator/events';

  beforeEach(async () => {
    eventStore = new JSONLEventStore();
    // Override basePath for testing
    (eventStore as any).basePath = path.join(testDir, 'events');
    
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Directory might not exist
    }
  });

  afterEach(async () => {
    await eventStore.close();
    
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Directory might not exist
    }
  });

  describe('appendEvent', () => {
    it('should create event file and append event', async () => {
      const event: OrchestrationEvent = {
        id: 'evt_123',
        type: OrchestrationEventType.SESSION_CREATED,
        timestamp: new Date().toISOString(),
        sessionId: 'sess_456',
        data: { test: 'data' }
      };

      await eventStore.appendEvent('test-stream', event);

      const filePath = path.join(testDir, 'events', 'test-stream.jsonl');
      const content = await fs.readFile(filePath, 'utf8');
      
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(1);
      
      const parsedEvent = JSON.parse(lines[0]);
      expect(parsedEvent.id).toBe('evt_123');
      expect(parsedEvent.type).toBe(OrchestrationEventType.SESSION_CREATED);
      expect(parsedEvent.sessionId).toBe('sess_456');
    });

    it('should append multiple events to same stream', async () => {
      const event1: OrchestrationEvent = {
        id: 'evt_1',
        type: OrchestrationEventType.SESSION_CREATED,
        timestamp: new Date().toISOString(),
        data: {}
      };
      
      const event2: OrchestrationEvent = {
        id: 'evt_2',
        type: OrchestrationEventType.SESSION_STARTED,
        timestamp: new Date().toISOString(),
        data: {}
      };

      await eventStore.appendEvent('test-stream', event1);
      await eventStore.appendEvent('test-stream', event2);

      const events = await eventStore.readEvents('test-stream');
      expect(events).toHaveLength(2);
      expect(events[0].id).toBe('evt_1');
      expect(events[1].id).toBe('evt_2');
    });
  });

  describe('readEvents', () => {
    it('should return empty array for non-existent stream', async () => {
      const events = await eventStore.readEvents('non-existent');
      expect(events).toHaveLength(0);
    });

    it('should read events with filters', async () => {
      const events = [
        {
          id: 'evt_1',
          type: OrchestrationEventType.SESSION_CREATED,
          timestamp: new Date('2023-01-01').toISOString(),
          data: {}
        },
        {
          id: 'evt_2',
          type: OrchestrationEventType.TASK_STARTED,
          timestamp: new Date('2023-01-02').toISOString(),
          data: {}
        },
        {
          id: 'evt_3',
          type: OrchestrationEventType.SESSION_COMPLETED,
          timestamp: new Date('2023-01-03').toISOString(),
          data: {}
        }
      ];

      for (const event of events) {
        await eventStore.appendEvent('test-stream', event);
      }

      // Test type filter
      const sessionEvents = await eventStore.readEvents('test-stream', {
        filter: (event) => event.type.startsWith('session.')
      });
      expect(sessionEvents).toHaveLength(2);

      // Test date filter
      const recentEvents = await eventStore.readEvents('test-stream', {
        since: new Date('2023-01-02')
      });
      expect(recentEvents).toHaveLength(2);

      // Test limit
      const limitedEvents = await eventStore.readEvents('test-stream', {
        limit: 2
      });
      expect(limitedEvents).toHaveLength(2);
    });
  });

  describe('tail', () => {
    it('should call callback for new events', async () => {
      const receivedEvents: OrchestrationEvent[] = [];
      
      const unsubscribe = await eventStore.tail('test-stream', (event) => {
        receivedEvents.push(event);
      });

      // Wait a bit for the watcher to set up
      await new Promise(resolve => setTimeout(resolve, 100));

      const event: OrchestrationEvent = {
        id: 'evt_tail',
        type: OrchestrationEventType.TASK_STARTED,
        timestamp: new Date().toISOString(),
        data: { test: 'tail' }
      };

      await eventStore.appendEvent('test-stream', event);

      // Wait for the file watcher to trigger
      await new Promise(resolve => setTimeout(resolve, 200));

      unsubscribe();

      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0].id).toBe('evt_tail');
    });
  });

  describe('utility methods', () => {
    it('should get stream stats', async () => {
      const event: OrchestrationEvent = {
        id: 'evt_stats',
        type: OrchestrationEventType.SESSION_CREATED,
        timestamp: new Date().toISOString(),
        data: {}
      };

      await eventStore.appendEvent('stats-stream', event);

      const stats = await eventStore.getStreamStats('stats-stream');
      expect(stats.size).toBeGreaterThan(0);
      expect(stats.eventCount).toBe(1);
      expect(stats.lastModified).toBeInstanceOf(Date);
    });

    it('should return zero stats for non-existent stream', async () => {
      const stats = await eventStore.getStreamStats('non-existent');
      expect(stats.size).toBe(0);
      expect(stats.eventCount).toBe(0);
      expect(stats.lastModified).toEqual(new Date(0));
    });
  });
});