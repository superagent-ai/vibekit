import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { ConfigStore } from '../src/manager/config-store';
import type { MCPServer } from '../src/types/server';

// Mock fs
vi.mock('fs', () => ({
  promises: {
    access: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
  }
}));

describe('ConfigStore Easy Coverage Wins', () => {
  let configStore: ConfigStore;
  let mockFs: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    
    mockFs = vi.mocked(fs);
    
    // Setup default mocks
    mockFs.access.mockResolvedValue(undefined);
    mockFs.readFile.mockResolvedValue(JSON.stringify({
      mcpServers: {},
      $metadata: {}
    }));
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.mkdir.mockResolvedValue(undefined);

    configStore = new ConfigStore('/test/config.json');
    await configStore.initialize();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Easy win: clearTimeout logic (lines 128-129)', () => {
    it('should trigger clearTimeout when timer exists', async () => {
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
      
      const server1: MCPServer = {
        id: 'server-1',
        name: 'Server 1',
        transport: 'stdio',
        config: { command: 'node' },
        status: 'inactive',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const server2: MCPServer = {
        id: 'server-2',
        name: 'Server 2', 
        transport: 'stdio',
        config: { command: 'python' },
        status: 'inactive',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Add first server - this sets up a timer
      await configStore.addServer(server1);
      
      // Add second server immediately - this should trigger clearTimeout (line 128-129)
      await configStore.addServer(server2);

      // Verify clearTimeout was called to clear the existing debounce timer
      expect(clearTimeoutSpy).toHaveBeenCalled();
      
      clearTimeoutSpy.mockRestore();
    });

    it('should handle rapid multiple additions triggering clearTimeout', async () => {
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
      
      // Rapidly add multiple servers to trigger multiple clearTimeout calls
      const servers = Array.from({ length: 5 }, (_, i) => ({
        id: `server-${i}`,
        name: `Server ${i}`,
        transport: 'stdio' as const,
        config: { command: 'node' },
        status: 'inactive' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      // Add all servers in rapid succession
      for (const server of servers) {
        await configStore.addServer(server);
      }

      // Should have called clearTimeout multiple times (once for each save after the first)
      expect(clearTimeoutSpy).toHaveBeenCalledTimes(4); // 5 servers = 4 clearTimeout calls
      
      clearTimeoutSpy.mockRestore();
    });
  });
});