import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfigStore } from '../src/manager/config-store';
import type { MCPServer, StdioConfig, HttpConfig } from '../src/types';

// Mock filesystem operations with proper fs.promises structure
vi.mock('fs', () => ({
  promises: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    access: vi.fn(),
    mkdir: vi.fn(),
  },
}));

vi.mock('path', () => ({
  join: vi.fn((...args) => args.join('/')),
  dirname: vi.fn((path) => path.split('/').slice(0, -1).join('/')),
  resolve: vi.fn((path) => path),
}));

vi.mock('os', () => ({
  homedir: vi.fn(() => '/home/test'),
}));

// Get the mocked modules
const mockFs = vi.mocked(await import('fs')).promises;

describe('ConfigStore - Import/Export Edge Cases', () => {
  let configStore: ConfigStore;

  const mockStdioServer: MCPServer = {
    id: 'test-stdio-id',
    name: 'test-stdio',
    transport: 'stdio',
    config: {
      command: 'node',
      args: ['server.js'],
      env: { NODE_ENV: 'test' },
      cwd: '/test/path'
    } as StdioConfig,
    status: 'inactive',
    createdAt: new Date('2023-01-01'),
    updatedAt: new Date('2023-01-02'),
  };

  const mockSSEServer: MCPServer = {
    id: 'test-sse-id', 
    name: 'test-sse',
    transport: 'sse',
    config: {
      url: 'http://localhost:3000/sse',
      headers: { 'Authorization': 'Bearer token' },
      timeout: 5000
    } as HttpConfig,
    status: 'active',
    createdAt: new Date('2023-01-03'),
    updatedAt: new Date('2023-01-04'),
  };

  const mockHttpServer: MCPServer = {
    id: 'test-http-id',
    name: 'test-http',
    transport: 'http',
    config: {
      url: 'http://localhost:4000/api',
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    } as HttpConfig,
    status: 'inactive',
    createdAt: new Date('2023-01-05'),
    updatedAt: new Date('2023-01-06'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Default successful mocks
    mockFs.access.mockRejectedValue(new Error('File not found'));
    mockFs.readFile.mockResolvedValue('{}');
    mockFs.writeFile.mockResolvedValue();
    mockFs.mkdir.mockResolvedValue(undefined);
    
    configStore = new ConfigStore();
  });

  describe('exportConfig - Transport Types', () => {
    it('should export stdio servers correctly', async () => {
      // Set up servers directly in the store
      (configStore as any).servers = new Map([
        [mockStdioServer.id, mockStdioServer]
      ]);

      const exported = await configStore.exportConfig();
      const parsed = JSON.parse(exported);

      expect(parsed).toEqual({
        mcpServers: {
          'test-stdio': {
            command: 'node',
            args: ['server.js'],
            env: { NODE_ENV: 'test' },
            cwd: '/test/path'
          }
        }
      });
    });

    it('should export SSE servers correctly', async () => {
      (configStore as any).servers = new Map([
        [mockSSEServer.id, mockSSEServer]
      ]);

      const exported = await configStore.exportConfig();
      const parsed = JSON.parse(exported);

      expect(parsed).toEqual({
        mcpServers: {
          'test-sse': {
            url: 'http://localhost:3000/sse',
            headers: { 'Authorization': 'Bearer token' },
            timeout: 5000
          }
        }
      });
    });

    it('should export HTTP servers correctly', async () => {
      (configStore as any).servers = new Map([
        [mockHttpServer.id, mockHttpServer]
      ]);

      const exported = await configStore.exportConfig();
      const parsed = JSON.parse(exported);

      expect(parsed).toEqual({
        mcpServers: {
          'test-http': {
            baseUrl: 'http://localhost:4000/api',
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000
          }
        }
      });
    });

    it('should export multiple servers with different transports', async () => {
      (configStore as any).servers = new Map([
        [mockStdioServer.id, mockStdioServer],
        [mockSSEServer.id, mockSSEServer],
        [mockHttpServer.id, mockHttpServer]
      ]);

      const exported = await configStore.exportConfig();
      const parsed = JSON.parse(exported);

      expect(parsed.mcpServers).toHaveProperty('test-stdio');
      expect(parsed.mcpServers).toHaveProperty('test-sse');
      expect(parsed.mcpServers).toHaveProperty('test-http');
      expect(Object.keys(parsed.mcpServers)).toHaveLength(3);
    });

    it('should handle servers with minimal config', async () => {
      const minimalServer: MCPServer = {
        id: 'minimal-id',
        name: 'minimal',
        transport: 'stdio',
        config: { command: 'simple-command' } as StdioConfig,
        status: 'inactive',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (configStore as any).servers = new Map([[minimalServer.id, minimalServer]]);

      const exported = await configStore.exportConfig();
      const parsed = JSON.parse(exported);

      expect(parsed).toEqual({
        mcpServers: {
          'minimal': {
            command: 'simple-command'
          }
        }
      });
    });

    it('should handle empty server list', async () => {
      (configStore as any).servers = new Map();

      const exported = await configStore.exportConfig();
      const parsed = JSON.parse(exported);

      expect(parsed).toEqual({
        mcpServers: {}
      });
    });
  });

  describe('importConfig - New Format', () => {
    it('should import stdio servers correctly', async () => {
      await configStore.initialize();
      
      const importData = JSON.stringify({
        mcpServers: {
          'imported-stdio': {
            command: 'npm',
            args: ['start'],
            env: { PORT: '3000' },
            cwd: '/app'
          }
        }
      });

      await configStore.importConfig(importData);

      const servers = Array.from((configStore as any).servers.values());
      expect(servers).toHaveLength(1);
      
      const server = servers[0];
      expect(server.name).toBe('imported-stdio');
      expect(server.transport).toBe('stdio');
      expect(server.config).toEqual({
        command: 'npm',
        args: ['start'],
        env: { PORT: '3000' },
        cwd: '/app'
      });
      expect(server.status).toBe('inactive');
    });

    it('should import SSE servers correctly', async () => {
      await configStore.initialize();
      
      const importData = JSON.stringify({
        mcpServers: {
          'imported-sse': {
            url: 'http://localhost:8080/events',
            headers: { 'X-API-Key': 'test-key' },
            timeout: 15000
          }
        }
      });

      await configStore.importConfig(importData);

      const servers = Array.from((configStore as any).servers.values());
      expect(servers).toHaveLength(1);
      
      const server = servers[0];
      expect(server.name).toBe('imported-sse');
      expect(server.transport).toBe('sse');
      expect(server.config).toEqual({
        url: 'http://localhost:8080/events',
        headers: { 'X-API-Key': 'test-key' },
        timeout: 15000
      });
    });

    it('should import HTTP servers correctly', async () => {
      await configStore.initialize();
      
      const importData = JSON.stringify({
        mcpServers: {
          'imported-http': {
            baseUrl: 'http://api.example.com',
            headers: { 'User-Agent': 'MCP-Client' },
            timeout: 30000
          }
        }
      });

      await configStore.importConfig(importData);

      const servers = Array.from((configStore as any).servers.values());
      expect(servers).toHaveLength(1);
      
      const server = servers[0];
      expect(server.name).toBe('imported-http');
      expect(server.transport).toBe('http');
      expect(server.config).toEqual({
        url: 'http://api.example.com',
        headers: { 'User-Agent': 'MCP-Client' },
        timeout: 30000
      });
    });

    it('should import multiple servers', async () => {
      await configStore.initialize();
      
      const importData = JSON.stringify({
        mcpServers: {
          'server1': {
            command: 'node',
            args: ['app1.js']
          },
          'server2': {
            url: 'http://localhost:3001/sse'
          },
          'server3': {
            baseUrl: 'http://localhost:3002/api'
          }
        }
      });

      await configStore.importConfig(importData);

      const servers = Array.from((configStore as any).servers.values());
      expect(servers).toHaveLength(3);
      
      const names = servers.map(s => s.name).sort();
      expect(names).toEqual(['server1', 'server2', 'server3']);
    });
  });

  describe('importConfig - Old Format Support', () => {
    it('should import old format servers', async () => {
      await configStore.initialize();
      
      const importData = JSON.stringify({
        servers: [
          {
            name: 'old-server',
            command: 'python',
            args: ['server.py'],
            id: 'ignored-id',
            description: 'ignored',
            status: 'ignored',
            lastConnected: 'ignored',
            createdAt: 'ignored',
            updatedAt: 'ignored',
            toolCount: 5,
            resourceCount: 2,
            promptCount: 1
          }
        ]
      });

      await configStore.importConfig(importData);

      const servers = Array.from((configStore as any).servers.values());
      expect(servers).toHaveLength(1);
      
      const server = servers[0];
      expect(server.name).toBe('old-server');
      expect(server.transport).toBe('stdio');
      expect(server.config).toEqual({
        command: 'python',
        args: ['server.py']
      });
      // Metadata should be filtered out
      expect(server).not.toHaveProperty('toolCount');
      expect(server).not.toHaveProperty('description');
    });

    it('should handle empty old format servers array', async () => {
      await configStore.initialize();
      
      const importData = JSON.stringify({
        servers: []
      });

      await configStore.importConfig(importData);

      const servers = Array.from((configStore as any).servers.values());
      expect(servers).toHaveLength(0);
    });
  });

  describe('importConfig - Merge Behavior', () => {
    beforeEach(async () => {
      await configStore.initialize();
      // Setup existing server
      (configStore as any).servers = new Map([
        [mockStdioServer.id, { ...mockStdioServer }]
      ]);
    });

    it('should merge by default (preserve existing servers)', async () => {
      const importData = JSON.stringify({
        mcpServers: {
          'new-server': {
            command: 'new-command'
          }
        }
      });

      await configStore.importConfig(importData);

      const servers = Array.from((configStore as any).servers.values());
      expect(servers).toHaveLength(2);
      
      const names = servers.map(s => s.name).sort();
      expect(names).toEqual(['new-server', 'test-stdio']);
    });

    it('should update existing server when merging', async () => {
      const importData = JSON.stringify({
        mcpServers: {
          'test-stdio': {
            command: 'updated-command',
            args: ['updated-args'],
            env: { UPDATED: 'true' }
          }
        }
      });

      await configStore.importConfig(importData, true);

      const servers = Array.from((configStore as any).servers.values());
      expect(servers).toHaveLength(1);
      
      const server = servers[0];
      expect(server.name).toBe('test-stdio');
      expect(server.config).toEqual({
        command: 'updated-command',
        args: ['updated-args'],
        env: { UPDATED: 'true' }
      });
      expect(server.status).toBe('inactive'); // Status should be reset
      expect(server.updatedAt).toBeInstanceOf(Date);
    });

    it('should replace all servers when merge is false', async () => {
      const importData = JSON.stringify({
        mcpServers: {
          'replacement-server': {
            command: 'replace-command'
          }
        }
      });

      await configStore.importConfig(importData, false);

      const servers = Array.from((configStore as any).servers.values());
      expect(servers).toHaveLength(1);
      
      const server = servers[0];
      expect(server.name).toBe('replacement-server');
      expect(server.config).toEqual({
        command: 'replace-command'
      });
    });
  });

  describe('importConfig - Transport Detection', () => {
    beforeEach(async () => {
      await configStore.initialize();
    });

    it('should detect stdio transport from command field', async () => {
      const importData = JSON.stringify({
        mcpServers: {
          'stdio-server': {
            command: 'test-command'
          }
        }
      });

      await configStore.importConfig(importData);

      const server = Array.from((configStore as any).servers.values())[0];
      expect(server.transport).toBe('stdio');
    });

    it('should detect SSE transport from url field (without baseUrl)', async () => {
      const importData = JSON.stringify({
        mcpServers: {
          'sse-server': {
            url: 'http://localhost:3000/sse'
          }
        }
      });

      await configStore.importConfig(importData);

      const server = Array.from((configStore as any).servers.values())[0];
      expect(server.transport).toBe('sse');
    });

    it('should detect HTTP transport from baseUrl field', async () => {
      const importData = JSON.stringify({
        mcpServers: {
          'http-server': {
            baseUrl: 'http://api.example.com'
          }
        }
      });

      await configStore.importConfig(importData);

      const server = Array.from((configStore as any).servers.values())[0];
      expect(server.transport).toBe('http');
    });

    it('should prefer HTTP over SSE when both url and baseUrl are present', async () => {
      const importData = JSON.stringify({
        mcpServers: {
          'mixed-server': {
            url: 'http://localhost:3000/sse',
            baseUrl: 'http://api.example.com'
          }
        }
      });

      await configStore.importConfig(importData);

      const server = Array.from((configStore as any).servers.values())[0];
      expect(server.transport).toBe('http');
      expect((server.config as HttpConfig).url).toBe('http://api.example.com');
    });
  });

  describe('importConfig - Error Handling', () => {
    beforeEach(async () => {
      await configStore.initialize();
    });

    it('should throw error for invalid JSON', async () => {
      const invalidJson = '{ invalid json }';

      await expect(configStore.importConfig(invalidJson)).rejects.toThrow('Failed to import config');
    });

    it('should throw error for missing mcpServers and servers', async () => {
      const invalidFormat = JSON.stringify({
        someOtherField: 'value'
      });

      await expect(configStore.importConfig(invalidFormat)).rejects.toThrow('Invalid config format');
    });

    it('should throw error when servers is not an array in old format', async () => {
      const invalidOldFormat = JSON.stringify({
        servers: 'not-an-array'
      });

      await expect(configStore.importConfig(invalidOldFormat)).rejects.toThrow('Invalid config format');
    });

    it('should handle empty config objects gracefully', async () => {
      const emptyConfig = JSON.stringify({
        mcpServers: {
          'empty-server': {}
        }
      });

      await configStore.importConfig(emptyConfig);

      const server = Array.from((configStore as any).servers.values())[0];
      expect(server.name).toBe('empty-server');
      expect(server.transport).toBe('stdio'); // Default transport
    });
  });

  describe('Round-trip Export/Import', () => {
    it('should preserve data through export/import cycle', async () => {
      await configStore.initialize();
      
      // Setup original servers
      (configStore as any).servers = new Map([
        [mockStdioServer.id, mockStdioServer],
        [mockSSEServer.id, mockSSEServer],
        [mockHttpServer.id, mockHttpServer]
      ]);

      // Export
      const exported = await configStore.exportConfig();

      // Clear and import
      (configStore as any).servers = new Map();
      await configStore.importConfig(exported);

      // Verify data is preserved
      const servers = Array.from((configStore as any).servers.values());
      expect(servers).toHaveLength(3);
      
      const names = servers.map(s => s.name).sort();
      expect(names).toEqual(['test-http', 'test-sse', 'test-stdio']);

      // Check that configs are properly reconstructed
      const stdioServer = servers.find(s => s.name === 'test-stdio');
      expect(stdioServer?.transport).toBe('stdio');
      expect(stdioServer?.config).toEqual({
        command: 'node',
        args: ['server.js'],
        env: { NODE_ENV: 'test' },
        cwd: '/test/path'
      });

      const sseServer = servers.find(s => s.name === 'test-sse');
      expect(sseServer?.transport).toBe('sse');
      expect(sseServer?.config).toEqual({
        url: 'http://localhost:3000/sse',
        headers: { 'Authorization': 'Bearer token' },
        timeout: 5000
      });

      const httpServer = servers.find(s => s.name === 'test-http');
      expect(httpServer?.transport).toBe('http');
      expect(httpServer?.config).toEqual({
        url: 'http://localhost:4000/api',
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      });
    });
  });
});