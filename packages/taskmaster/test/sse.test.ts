import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SSEManager } from '../src/utils/sse';
import type { TaskChangeEvent } from '../src/types';

describe('SSEManager', () => {
  let sseManager: SSEManager;
  let mockWriter1: WritableStreamDefaultWriter;
  let mockWriter2: WritableStreamDefaultWriter;

  beforeEach(() => {
    vi.clearAllMocks();
    
    sseManager = new SSEManager();
    
    mockWriter1 = {
      write: vi.fn(),
      close: vi.fn(),
      abort: vi.fn(),
    } as any;

    mockWriter2 = {
      write: vi.fn(),
      close: vi.fn(),
      abort: vi.fn(),
    } as any;

    // Mock TextEncoder globally
    global.TextEncoder = vi.fn().mockImplementation(() => ({
      encode: vi.fn((text: string) => new Uint8Array(Buffer.from(text))),
    }));

    // Suppress console.error for cleaner test output
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('client management', () => {
    it('should add clients correctly', () => {
      expect(sseManager.getClientCount()).toBe(0);

      sseManager.addClient(mockWriter1);
      expect(sseManager.getClientCount()).toBe(1);

      sseManager.addClient(mockWriter2);
      expect(sseManager.getClientCount()).toBe(2);
    });

    it('should remove clients correctly', () => {
      sseManager.addClient(mockWriter1);
      sseManager.addClient(mockWriter2);
      expect(sseManager.getClientCount()).toBe(2);

      sseManager.removeClient(mockWriter1);
      expect(sseManager.getClientCount()).toBe(1);

      sseManager.removeClient(mockWriter2);
      expect(sseManager.getClientCount()).toBe(0);
    });

    it('should handle removing non-existent client', () => {
      expect(sseManager.getClientCount()).toBe(0);
      
      sseManager.removeClient(mockWriter1);
      expect(sseManager.getClientCount()).toBe(0);
    });

    it('should not add duplicate clients', () => {
      sseManager.addClient(mockWriter1);
      sseManager.addClient(mockWriter1); // Add same client again
      
      expect(sseManager.getClientCount()).toBe(1);
    });
  });

  describe('broadcasting', () => {
    const mockEvent: TaskChangeEvent = {
      type: 'updated',
      task: {
        id: 'task-1',
        title: 'Test Task',
        description: 'A test task',
        status: 'todo',
        priority: 'medium',
        tags: ['test'],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
    };

    it('should broadcast events to all clients', () => {
      sseManager.addClient(mockWriter1);
      sseManager.addClient(mockWriter2);

      sseManager.broadcast(mockEvent);

      expect(mockWriter1.write).toHaveBeenCalled();
      expect(mockWriter2.write).toHaveBeenCalled();

      // Check that the data is properly formatted
      const writeCall = mockWriter1.write.mock.calls[0][0];
      expect(writeCall).toBeInstanceOf(Uint8Array);
    });

    it('should format SSE data correctly', () => {
      sseManager.addClient(mockWriter1);
      
      sseManager.broadcast(mockEvent);

      const encoder = new TextEncoder();
      const expectedData = `data: ${JSON.stringify(mockEvent)}\n\n`;
      const expectedEncoded = encoder.encode(expectedData);

      expect(mockWriter1.write).toHaveBeenCalledWith(expectedEncoded);
    });

    it('should handle write errors gracefully', () => {
      mockWriter1.write.mockImplementation(() => {
        throw new Error('Write failed');
      });

      sseManager.addClient(mockWriter1);
      sseManager.addClient(mockWriter2);

      expect(sseManager.getClientCount()).toBe(2);

      sseManager.broadcast(mockEvent);

      // mockWriter1 should be removed due to error, mockWriter2 should still be there
      expect(sseManager.getClientCount()).toBe(1);
      expect(mockWriter2.write).toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledWith('Failed to send SSE event:', expect.any(Error));
    });

    it('should broadcast to no clients when none are connected', () => {
      expect(() => {
        sseManager.broadcast(mockEvent);
      }).not.toThrow();
      
      expect(sseManager.getClientCount()).toBe(0);
    });

    it('should handle complex event data', () => {
      const complexEvent: TaskChangeEvent = {
        type: 'created',
        task: {
          id: 'complex-task',
          title: 'Complex Task with "quotes" and special chars: !@#$%',
          description: 'Multi-line\ndescription\nwith special chars',
          status: 'in-progress',
          priority: 'high',
          tags: ['complex', 'special-chars', 'test'],
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          assignee: 'user@example.com',
          dueDate: '2024-12-31T23:59:59Z',
        },
      };

      sseManager.addClient(mockWriter1);
      
      expect(() => {
        sseManager.broadcast(complexEvent);
      }).not.toThrow();

      expect(mockWriter1.write).toHaveBeenCalled();
    });
  });

  describe('getClientCount', () => {
    it('should return correct client count', () => {
      expect(sseManager.getClientCount()).toBe(0);

      sseManager.addClient(mockWriter1);
      expect(sseManager.getClientCount()).toBe(1);

      sseManager.addClient(mockWriter2);
      expect(sseManager.getClientCount()).toBe(2);

      sseManager.removeClient(mockWriter1);
      expect(sseManager.getClientCount()).toBe(1);

      sseManager.removeClient(mockWriter2);
      expect(sseManager.getClientCount()).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle multiple broadcasts to same clients', () => {
      sseManager.addClient(mockWriter1);

      const event1: TaskChangeEvent = {
        type: 'created',
        task: { id: '1', title: 'Task 1', status: 'todo', priority: 'low', tags: [], createdAt: '', updatedAt: '' },
      };

      const event2: TaskChangeEvent = {
        type: 'updated',
        task: { id: '2', title: 'Task 2', status: 'done', priority: 'high', tags: [], createdAt: '', updatedAt: '' },
      };

      sseManager.broadcast(event1);
      sseManager.broadcast(event2);

      expect(mockWriter1.write).toHaveBeenCalledTimes(2);
    });

    it('should handle empty event data', () => {
      sseManager.addClient(mockWriter1);

      const emptyEvent = {} as TaskChangeEvent;

      expect(() => {
        sseManager.broadcast(emptyEvent);
      }).not.toThrow();

      expect(mockWriter1.write).toHaveBeenCalled();
    });
  });
});