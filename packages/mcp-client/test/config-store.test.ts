import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfigStore } from '../src/manager/config-store';
import type { MCPServer, ServerCreateInput } from '../src/types/server';

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
const mockPath = vi.mocked(await import('path'));
const mockOs = vi.mocked(await import('os'));

describe('ConfigStore', () => {
  let configStore: ConfigStore;
  let mockConfig: { [key: string]: MCPServer };

  beforeEach(() => {
    vi.clearAllMocks();
    
    configStore = new ConfigStore();
    
    mockConfig = {
      'test-server-1': {
        id: 'test-server-1',
        name: 'Test Server 1',
        description: 'First test server',
        transport: 'stdio',
        config: {
          command: 'test-command-1',
          args: ['--arg1'],
        },
        enabled: true,
      },
      'test-server-2': {
        id: 'test-server-2',
        name: 'Test Server 2',
        description: 'Second test server',
        transport: 'http',
        config: {
          url: 'http://localhost:3000',
        },
        enabled: false,
      },
    };
  });

  describe('constructor', () => {
    it('should create with default options', () => {
      const store = new ConfigStore();
      expect(store).toBeInstanceOf(ConfigStore);
    });

    it('should create with custom options', () => {
      const options = {
        configPath: '/custom/path',
        configDir: '/custom/dir',
        configFileName: 'custom-config.json',
        metadataKey: 'customKey',
      };
      
      const store = new ConfigStore(options);
      expect(store).toBeInstanceOf(ConfigStore);
    });
  });

  describe('initialize', () => {
    it('should initialize with existing config', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockConfig));

      await configStore.initialize();

      expect(mockFs.access).toHaveBeenCalled();
      expect(mockFs.readFile).toHaveBeenCalled();
    });

    it('should initialize with empty config when file does not exist', async () => {
      mockFs.access.mockRejectedValue(new Error('File not found'));
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);

      await configStore.initialize();

      expect(mockFs.mkdir).toHaveBeenCalled();
      // The save method is called asynchronously, so we don't test its immediate effects
    });

    it('should handle invalid JSON in config file', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue('invalid json');
      mockFs.writeFile.mockResolvedValue(undefined);

      await configStore.initialize();

      // The error is logged but config continues with empty state
      expect((configStore as any).servers.size).toBe(0);
    });
  });

  describe('getAllServers', () => {
    it('should return all servers', async () => {
      (configStore as any).servers = new Map(Object.entries(mockConfig).map(([key, server]) => [server.id, server]));

      const servers = await configStore.getAllServers();
      expect(servers).toEqual(Object.values(mockConfig));
    });

    it('should return empty array when no servers', async () => {
      (configStore as any).servers = new Map();

      const servers = await configStore.getAllServers();
      expect(servers).toEqual([]);
    });
  });

  describe('getServer', () => {
    it('should return specific server', async () => {
      (configStore as any).servers = new Map([['test-server-1', mockConfig['test-server-1']]]);

      const server = configStore.getServer('test-server-1');
      expect(server).toEqual(mockConfig['test-server-1']);
    });

    it('should return undefined for non-existent server', async () => {
      (configStore as any).servers = new Map(Object.entries(mockConfig).map(([key, server]) => [server.id, server]));

      const server = configStore.getServer('non-existent');
      expect(server).toBeUndefined();
    });
  });

  describe('addServer', () => {
    it('should add new server with generated ID', async () => {
      (configStore as any).servers = new Map();
      mockFs.writeFile.mockResolvedValue(undefined);

      const serverInput: ServerCreateInput = {
        name: 'New Server',
        description: 'A new test server',
        transport: 'stdio',
        config: {
          command: 'new-command',
          args: ['--new'],
        },
      };

      const server = await configStore.addServer(serverInput);

      expect(server).toBeTruthy();
      expect(typeof server.id).toBe('string');
      expect(server).toMatchObject({
        ...serverInput,
        status: 'inactive',
      });
      expect((configStore as any).servers.has(server.id)).toBe(true);
    });

    it('should add new server and return server object', async () => {
      (configStore as any).servers = new Map();
      mockFs.writeFile.mockResolvedValue(undefined);

      const serverInput: ServerCreateInput = {
        name: 'New Server',
        description: 'A new test server',
        transport: 'stdio',
        config: {
          command: 'new-command',
          args: ['--new'],
        },
      };

      const server = await configStore.addServer(serverInput);

      expect(server.name).toBe(serverInput.name);
      expect(server).toMatchObject({
        ...serverInput,
        status: 'inactive',
      });
      expect((configStore as any).servers.has(server.id)).toBe(true);
    });

    it('should add server with unique generated ID', async () => {
      (configStore as any).servers = new Map(Object.entries(mockConfig).map(([key, server]) => [server.id, server]));
      mockFs.writeFile.mockResolvedValue(undefined);

      const serverInput: ServerCreateInput = {
        name: 'Another Server',
        description: 'Another test server',
        transport: 'stdio',
        config: {
          command: 'another-command',
        },
      };

      const server = await configStore.addServer(serverInput);
      expect(server.id).not.toBe('test-server-1');
      expect(server.id).not.toBe('test-server-2');
      expect((configStore as any).servers.has(server.id)).toBe(true);
    });
  });

  describe('updateServer', () => {
    it('should update existing server', async () => {
      (configStore as any).servers = new Map(Object.entries(mockConfig).map(([key, server]) => [server.id, server]));
      mockFs.writeFile.mockResolvedValue(undefined);

      const updates = {
        name: 'Updated Server Name',
        description: 'Updated description',
      };

      const updatedServer = await configStore.updateServer('test-server-1', updates);

      expect(updatedServer).toMatchObject({
        ...mockConfig['test-server-1'],
        ...updates,
      });
    });

    it('should throw error for non-existent server', async () => {
      (configStore as any).servers = new Map(Object.entries(mockConfig).map(([key, server]) => [server.id, server]));

      const updates = { name: 'Updated Name' };

      await expect(
        configStore.updateServer('non-existent', updates)
      ).rejects.toThrow('Server non-existent not found');
    });
  });

  describe('removeServer', () => {
    it('should remove existing server', async () => {
      (configStore as any).servers = new Map(Object.entries(mockConfig).map(([key, server]) => [server.id, server]));
      mockFs.writeFile.mockResolvedValue(undefined);

      await configStore.removeServer('test-server-1');

      expect((configStore as any).servers.has('test-server-1')).toBe(false);
    });

    it('should throw error for non-existent server', async () => {
      (configStore as any).servers = new Map(Object.entries(mockConfig).map(([key, server]) => [server.id, server]));
      mockFs.writeFile.mockResolvedValue(undefined);

      await expect(
        configStore.removeServer('non-existent')
      ).rejects.toThrow('Server non-existent not found');
    });
  });

  describe('exportConfig', () => {
    it('should export config as JSON string', async () => {
      (configStore as any).servers = new Map(Object.entries(mockConfig).map(([key, server]) => [server.id, server]));

      const exported = await configStore.exportConfig();
      const parsed = JSON.parse(exported);

      expect(parsed).toHaveProperty('mcpServers');
      expect(Object.keys(parsed.mcpServers)).toHaveLength(2);
    });

    it('should handle empty server list', async () => {
      (configStore as any).servers = new Map();

      const exported = await configStore.exportConfig();
      const parsed = JSON.parse(exported);

      expect(parsed).toEqual({ mcpServers: {} });
    });
  });
});