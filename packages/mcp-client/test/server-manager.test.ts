import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MCPClientManager } from '../src/manager/server-manager';
import type { MCPServer, ServerCreateInput } from '../src/types/server';
import { MCPClient } from '../src/client/mcp-client';

// Mock dependencies
vi.mock('../src/client/mcp-client', () => ({
  MCPClient: vi.fn().mockImplementation(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    isConnected: vi.fn().mockReturnValue(false),
    getTools: vi.fn().mockResolvedValue([]),
    getResources: vi.fn().mockResolvedValue([]),
    getPrompts: vi.fn().mockResolvedValue([]),
    executeTool: vi.fn(),
    getServer: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
  })),
}));

vi.mock('../src/manager/config-store', () => ({
  ConfigStore: vi.fn().mockImplementation(() => ({
    initialize: vi.fn(),
    getAllServers: vi.fn().mockReturnValue([]),
    addServer: vi.fn(),
    updateServer: vi.fn(),
    removeServer: vi.fn(),
    getServer: vi.fn(),
    exportConfig: vi.fn(),
    importConfig: vi.fn(),
  })),
}));

vi.mock('p-queue', () => ({
  default: vi.fn().mockImplementation(() => ({
    add: vi.fn((fn) => fn()),
    clear: vi.fn(),
    size: 0,
    pending: 0,
  })),
}));

describe('MCPClientManager', () => {
  let manager: MCPClientManager;
  let mockServer: MCPServer;

  beforeEach(() => {
    vi.clearAllMocks();
    
    manager = new MCPClientManager();
    
    mockServer = {
      id: 'test-server',
      name: 'Test Server',
      description: 'A test MCP server',
      transport: 'stdio',
      config: {
        command: 'test-command',
        args: ['--test'],
      },
      enabled: true,
    };
  });

  describe('constructor', () => {
    it('should create manager with default config', () => {
      const newManager = new MCPClientManager();
      expect(newManager).toBeInstanceOf(MCPClientManager);
    });

    it('should create manager with custom config', () => {
      const config = {
        autoConnect: true,
        reconnectAttempts: 5,
        reconnectDelay: 2000,
      };
      const newManager = new MCPClientManager(config);
      expect(newManager).toBeInstanceOf(MCPClientManager);
    });
  });

  describe('initialize', () => {
    it('should initialize successfully', async () => {
      const mockConfigStore = {
        initialize: vi.fn().mockResolvedValue(undefined),
        getAllServers: vi.fn().mockReturnValue([]),
      };
      (manager as any).configStore = mockConfigStore;

      await expect(manager.initialize()).resolves.toBeUndefined();
      expect(mockConfigStore.initialize).toHaveBeenCalled();
    });

    it('should auto-connect when enabled', async () => {
      const autoConnectManager = new MCPClientManager({ autoConnect: true });
      const mockConfigStore = {
        initialize: vi.fn().mockResolvedValue(undefined),
        getAllServers: vi.fn().mockReturnValue([mockServer]),
      };
      (autoConnectManager as any).configStore = mockConfigStore;

      await autoConnectManager.initialize();
      expect(mockConfigStore.getAllServers).toHaveBeenCalled();
    });
  });

  describe('addServer', () => {
    it('should add server successfully', async () => {
      const serverInput: ServerCreateInput = {
        name: 'New Test Server',
        description: 'A new test server',
        transport: 'stdio',
        config: {
          command: 'new-command',
          args: ['--new'],
        },
      };

      const mockConfigStore = {
        addServer: vi.fn().mockResolvedValue({
          id: 'new-server-id',
          ...serverInput,
          status: 'inactive',
        }),
      };
      (manager as any).configStore = mockConfigStore;

      const result = await manager.addServer(serverInput);
      
      expect(result).toEqual({
        id: 'new-server-id',
        ...serverInput,
        status: 'inactive',
      });
      expect(mockConfigStore.addServer).toHaveBeenCalledWith(serverInput);
    });
  });

  describe('removeServer', () => {
    it('should remove server successfully', async () => {
      const mockClient = {
        disconnect: vi.fn().mockResolvedValue(undefined),
        getServer: vi.fn().mockReturnValue(mockServer),
      };
      const mockConfigStore = {
        removeServer: vi.fn().mockResolvedValue(undefined),
        updateServer: vi.fn(),
      };

      (manager as any).clients.set('test-server', mockClient);
      (manager as any).configStore = mockConfigStore;

      await manager.removeServer('test-server');

      expect(mockClient.disconnect).toHaveBeenCalled();
      expect(mockConfigStore.removeServer).toHaveBeenCalledWith('test-server');
    });

    it('should handle removing non-existent server', async () => {
      const mockConfigStore = {
        removeServer: vi.fn().mockResolvedValue(undefined),
        updateServer: vi.fn(),
      };
      (manager as any).configStore = mockConfigStore;

      await expect(manager.removeServer('non-existent')).resolves.toBeUndefined();
      expect(mockConfigStore.removeServer).toHaveBeenCalledWith('non-existent');
    });
  });

  describe('connectServer', () => {
    it('should connect server successfully', async () => {
      const mockConfigStore = {
        getServer: vi.fn().mockReturnValue(mockServer),
        updateServer: vi.fn(),
      };

      (manager as any).configStore = mockConfigStore;

      // Mock the MCPClient constructor to return a client that connects successfully
      const { MCPClient } = await import('../src/client/mcp-client');
      const mockClient = {
        connect: vi.fn().mockResolvedValue(undefined),
        isConnected: vi.fn().mockReturnValue(true),
        on: vi.fn(),
        off: vi.fn(),
        emit: vi.fn(),
      };
      vi.mocked(MCPClient).mockReturnValueOnce(mockClient as any);

      await manager.connect('test-server');

      expect(mockConfigStore.getServer).toHaveBeenCalledWith('test-server');
      expect(mockConfigStore.updateServer).toHaveBeenCalled();
    });

    it('should throw error for non-existent server', async () => {
      const mockConfigStore = {
        getServer: vi.fn().mockReturnValue(undefined),
        updateServer: vi.fn(),
      };
      (manager as any).configStore = mockConfigStore;

      await expect(manager.connect('non-existent')).rejects.toThrow('Server non-existent not found');
    });
  });

  describe('disconnectServer', () => {
    it('should disconnect server successfully', async () => {
      const mockClient = {
        disconnect: vi.fn().mockResolvedValue(undefined),
        isConnected: vi.fn().mockReturnValue(false),
      };
      const mockConfigStore = {
        updateServer: vi.fn(),
      };

      (manager as any).clients.set('test-server', mockClient);
      (manager as any).configStore = mockConfigStore;

      await manager.disconnect('test-server');

      expect(mockClient.disconnect).toHaveBeenCalled();
    });

    it('should handle disconnecting non-existent server', async () => {
      await expect(manager.disconnect('non-existent')).resolves.toBeUndefined();
    });
  });

  describe('getServerStatus', () => {
    it('should return active status', () => {
      const mockClient = {
        isConnected: vi.fn().mockReturnValue(true),
      };
      const mockConfigStore = {
        getServer: vi.fn().mockReturnValue(mockServer),
      };

      (manager as any).clients.set('test-server', mockClient);
      (manager as any).configStore = mockConfigStore;

      const status = manager.getServerStatus('test-server');
      expect(status).toBe('active');
    });

    it('should return server status when disconnected', () => {
      const mockClient = {
        isConnected: vi.fn().mockReturnValue(false),
      };
      const mockConfigStore = {
        getServer: vi.fn().mockReturnValue({ ...mockServer, status: 'disconnected' }),
      };

      (manager as any).clients.set('test-server', mockClient);
      (manager as any).configStore = mockConfigStore;

      const status = manager.getServerStatus('test-server');
      expect(status).toBe('disconnected');
    });

    it('should return inactive status for non-existent server', () => {
      const mockConfigStore = {
        getServer: vi.fn().mockReturnValue(undefined),
      };
      (manager as any).configStore = mockConfigStore;

      const status = manager.getServerStatus('non-existent');
      expect(status).toBe('inactive');
    });
  });

  describe('listTools', () => {
    it('should list tools from connected servers', async () => {
      const mockClient = {
        isConnected: vi.fn().mockReturnValue(true),
        getTools: vi.fn().mockResolvedValue([
          { name: 'tool1', description: 'Test tool 1' },
          { name: 'tool2', description: 'Test tool 2' },
        ]),
      };

      (manager as any).clients.set('test-server', mockClient);

      const tools = await manager.listTools();
      expect(tools).toHaveLength(2);
      expect(tools[0]).toMatchObject({
        name: 'tool1',
        description: 'Test tool 1',
        serverId: 'test-server',
      });
    });

    it('should filter tools by server ID', async () => {
      const mockClient = {
        isConnected: vi.fn().mockReturnValue(true),
        getTools: vi.fn().mockResolvedValue([
          { name: 'tool1', description: 'Test tool 1' },
        ]),
      };

      (manager as any).clients.set('test-server', mockClient);

      const tools = await manager.listTools('test-server');
      expect(tools).toHaveLength(1);
      expect(mockClient.getTools).toHaveBeenCalled();
    });
  });

  describe('destroy', () => {
    it('should cleanup all resources', async () => {
      const mockClient = {
        disconnect: vi.fn().mockResolvedValue(undefined),
      };

      (manager as any).clients.set('test-server', mockClient);
      (manager as any).reconnectTimers.set('test-server', setTimeout(() => {}, 1000));

      await manager.destroy();

      expect(mockClient.disconnect).toHaveBeenCalled();
      expect((manager as any).clients.size).toBe(0);
      expect((manager as any).reconnectTimers.size).toBe(0);
    });
  });

  describe('connection lifecycle events', () => {
    let mockConfigStore: any;
    let eventSpy: any;

    beforeEach(() => {
      mockConfigStore = {
        updateServer: vi.fn().mockResolvedValue(mockServer),
        getServer: vi.fn().mockReturnValue(mockServer),
      };
      (manager as any).configStore = mockConfigStore;
      eventSpy = vi.spyOn(manager, 'emit');
    });

    describe('handleConnected', () => {
      it('should handle successful connection', async () => {
        const mockClient = {
          isConnected: vi.fn().mockReturnValue(true),
          getTools: vi.fn().mockResolvedValue([{ name: 'tool1' }]),
          getResources: vi.fn().mockResolvedValue([{ name: 'resource1' }]),
          getPrompts: vi.fn().mockResolvedValue([{ name: 'prompt1' }]),
        };
        (manager as any).clients.set('test-server', mockClient);

        await (manager as any).handleConnected('test-server');

        expect(mockConfigStore.updateServer).toHaveBeenCalledWith('test-server', {
          status: 'active',
        });
        expect(mockConfigStore.updateServer).toHaveBeenCalledWith('test-server', {
          lastConnected: expect.any(Date),
          toolCount: 1,
          resourceCount: 1,
          promptCount: 1,
        });
        expect(eventSpy).toHaveBeenCalledWith('server:status', 'test-server', 'active');
        expect(eventSpy).toHaveBeenCalledWith('server:connected', 'test-server');
      });

      it('should handle connection with client capabilities error', async () => {
        const mockClient = {
          isConnected: vi.fn().mockReturnValue(true),
          getTools: vi.fn().mockRejectedValue(new Error('Tools error')),
          getResources: vi.fn().mockRejectedValue(new Error('Resources error')),
          getPrompts: vi.fn().mockRejectedValue(new Error('Prompts error')),
        };
        (manager as any).clients.set('test-server', mockClient);

        await (manager as any).handleConnected('test-server');

        expect(mockConfigStore.updateServer).toHaveBeenCalledWith('test-server', {
          status: 'active',
        });
        expect(mockConfigStore.updateServer).toHaveBeenCalledWith('test-server', {
          lastConnected: expect.any(Date),
          toolCount: 0,
          resourceCount: 0,
          promptCount: 0,
        });
      });
    });

    describe('resource discovery events', () => {
      it('should handle resource:discovered event and update server resource count', async () => {
        // Create a more realistic test by setting up the event listener manually
        let resourceDiscoveredHandler: any;
        
        const mockClient = {
          isConnected: vi.fn().mockReturnValue(true),
          on: vi.fn().mockImplementation((event, handler) => {
            if (event === 'resource:discovered') {
              resourceDiscoveredHandler = handler;
            }
          }),
          connect: vi.fn().mockResolvedValue(undefined),
          getTools: vi.fn().mockResolvedValue([]),
          getResources: vi.fn().mockResolvedValue([]),
          getPrompts: vi.fn().mockResolvedValue([]),
          off: vi.fn(),
          emit: vi.fn(),
          disconnect: vi.fn(),
          executeTool: vi.fn(),
          getServer: vi.fn(),
        };
        (MCPClient as any).mockImplementation(() => mockClient);

        // Mock the server configuration
        const serverConfig = {
          id: 'test-server',
          name: 'Test Server',
          command: 'test-command',
          args: [],
        };
        mockConfigStore.getServer.mockReturnValue(serverConfig);

        // Start the connection process (this sets up event handlers)
        await manager.connect('test-server');

        // Verify the resource:discovered event handler was registered
        expect(mockClient.on).toHaveBeenCalledWith('resource:discovered', expect.any(Function));
        expect(resourceDiscoveredHandler).toBeDefined();

        // Simulate resource discovery
        const discoveredResources = [
          { name: 'resource1', type: 'text' },
          { name: 'resource2', type: 'image' },
          { name: 'resource3', type: 'data' }
        ];

        await resourceDiscoveredHandler(discoveredResources);

        expect(mockConfigStore.updateServer).toHaveBeenCalledWith('test-server', {
          resourceCount: 3,
        });
      });

      it('should handle resource:discovered event with empty resources array', async () => {
        let resourceDiscoveredHandler: any;
        
        const mockClient = {
          isConnected: vi.fn().mockReturnValue(true),
          on: vi.fn().mockImplementation((event, handler) => {
            if (event === 'resource:discovered') {
              resourceDiscoveredHandler = handler;
            }
          }),
          connect: vi.fn().mockResolvedValue(undefined),
          getTools: vi.fn().mockResolvedValue([]),
          getResources: vi.fn().mockResolvedValue([]),
          getPrompts: vi.fn().mockResolvedValue([]),
          off: vi.fn(),
          emit: vi.fn(),
          disconnect: vi.fn(),
          executeTool: vi.fn(),
          getServer: vi.fn(),
        };
        (MCPClient as any).mockImplementation(() => mockClient);

        // Mock the server configuration
        const serverConfig = {
          id: 'test-server',
          name: 'Test Server',
          command: 'test-command',
          args: [],
        };
        mockConfigStore.getServer.mockReturnValue(serverConfig);

        // Start the connection process
        await manager.connect('test-server');

        // Simulate discovery of no resources
        await resourceDiscoveredHandler([]);

        expect(mockConfigStore.updateServer).toHaveBeenCalledWith('test-server', {
          resourceCount: 0,
        });
      });
    });

    describe('handleDisconnected', () => {
      it('should handle disconnection without reconnect', async () => {
        const reconnectManager = new MCPClientManager({ reconnectAttempts: 0 });
        (reconnectManager as any).configStore = mockConfigStore;
        const eventSpy = vi.spyOn(reconnectManager, 'emit');

        await (reconnectManager as any).handleDisconnected('test-server', 'user requested');

        expect(mockConfigStore.updateServer).toHaveBeenCalledWith('test-server', {
          status: 'disconnected',
        });
        expect(eventSpy).toHaveBeenCalledWith('server:status', 'test-server', 'disconnected');
        expect(eventSpy).toHaveBeenCalledWith('server:disconnected', 'test-server');
      });

      it('should schedule reconnect when configured', async () => {
        const reconnectManager = new MCPClientManager({ reconnectAttempts: 3 });
        (reconnectManager as any).configStore = mockConfigStore;
        const scheduleSpy = vi.spyOn(reconnectManager as any, 'scheduleReconnect');

        await (reconnectManager as any).handleDisconnected('test-server');

        expect(scheduleSpy).toHaveBeenCalledWith('test-server');
      });
    });

    describe('handleError', () => {
      it('should handle server error', async () => {
        const error = new Error('Connection failed');

        await (manager as any).handleError('test-server', error);

        expect(mockConfigStore.updateServer).toHaveBeenCalledWith('test-server', {
          status: 'error',
          error: 'Connection failed',
        });
        expect(eventSpy).toHaveBeenCalledWith('server:status', 'test-server', 'error');
        expect(eventSpy).toHaveBeenCalledWith('server:error', 'test-server', error);
      });
    });
  });

  describe('reconnection logic', () => {
    let reconnectManager: MCPClientManager;
    let mockConfigStore: any;

    beforeEach(() => {
      reconnectManager = new MCPClientManager({ 
        reconnectAttempts: 3, 
        reconnectDelay: 100 
      });
      mockConfigStore = {
        updateServer: vi.fn().mockResolvedValue(mockServer),
        getServer: vi.fn().mockReturnValue(mockServer),
      };
      (reconnectManager as any).configStore = mockConfigStore;
    });

    it('should schedule reconnect with exponential backoff', () => {
      const connectSpy = vi.spyOn(reconnectManager, 'connect').mockResolvedValue();
      
      (reconnectManager as any).scheduleReconnect('test-server');

      expect((reconnectManager as any).reconnectTimers.has('test-server')).toBe(true);
      
      // Clean up timer
      const timer = (reconnectManager as any).reconnectTimers.get('test-server');
      if (timer) clearTimeout(timer);
    });

    it('should not reconnect when max attempts reached', () => {
      (reconnectManager as any).reconnectAttempts.set('test-server', 3);
      const connectSpy = vi.spyOn(reconnectManager, 'connect');
      
      (reconnectManager as any).scheduleReconnect('test-server');

      expect((reconnectManager as any).reconnectTimers.has('test-server')).toBe(false);
      expect(connectSpy).not.toHaveBeenCalled();
    });

    it('should increment attempts on reconnect', async () => {
      const connectSpy = vi.spyOn(reconnectManager, 'connect').mockRejectedValue(new Error('Failed'));
      
      // Use a very short delay for testing
      (reconnectManager as any).scheduleReconnect('test-server', { retryDelay: 1 });

      // Wait for the timer to execute
      await new Promise(resolve => setTimeout(resolve, 10));

      expect((reconnectManager as any).reconnectAttempts.get('test-server')).toBe(1);
    });
  });

  describe('tool and resource operations', () => {
    let mockClient: any;
    let mockConfigStore: any;

    beforeEach(() => {
      mockClient = {
        isConnected: vi.fn().mockReturnValue(true),
        getTools: vi.fn().mockResolvedValue([{ name: 'test-tool' }]),
        getResources: vi.fn().mockResolvedValue([{ name: 'test-resource' }]),
        getPrompts: vi.fn().mockResolvedValue([{ name: 'test-prompt' }]),
        executeTool: vi.fn().mockResolvedValue({ result: 'success' }),
      };
      mockConfigStore = {
        getServer: vi.fn().mockReturnValue(mockServer),
      };

      (manager as any).clients.set('test-server', mockClient);
      (manager as any).configStore = mockConfigStore;
    });

    describe('getTools', () => {
      it('should get tools from connected server', async () => {
        const tools = await manager.getTools('test-server');

        expect(tools).toEqual([{ name: 'test-tool' }]);
        expect(mockClient.getTools).toHaveBeenCalled();
      });

      it('should throw error for disconnected server', async () => {
        mockClient.isConnected.mockReturnValue(false);

        await expect(manager.getTools('test-server')).rejects.toThrow(
          'Server test-server is not connected'
        );
      });

      it('should throw error for non-existent server', async () => {
        await expect(manager.getTools('non-existent')).rejects.toThrow(
          'Server non-existent is not connected'
        );
      });
    });

    describe('getResources', () => {
      it('should get resources from connected server', async () => {
        const resources = await manager.getResources('test-server');

        expect(resources).toEqual([{ name: 'test-resource' }]);
        expect(mockClient.getResources).toHaveBeenCalled();
      });

      it('should throw error for disconnected server', async () => {
        mockClient.isConnected.mockReturnValue(false);

        await expect(manager.getResources('test-server')).rejects.toThrow(
          'Server test-server is not connected'
        );
      });
    });

    describe('getPrompts', () => {
      it('should get prompts from connected server', async () => {
        const prompts = await manager.getPrompts('test-server');

        expect(prompts).toEqual([{ name: 'test-prompt' }]);
        expect(mockClient.getPrompts).toHaveBeenCalled();
      });

      it('should throw error for disconnected server', async () => {
        mockClient.isConnected.mockReturnValue(false);

        await expect(manager.getPrompts('test-server')).rejects.toThrow(
          'Server test-server is not connected'
        );
      });
    });

    describe('executeTool', () => {
      it('should execute tool on connected server', async () => {
        const result = await manager.executeTool('test-server', 'test-tool', { param: 'value' });

        expect(result).toEqual({ result: 'success' });
        expect(mockClient.executeTool).toHaveBeenCalledWith('test-tool', { param: 'value' });
      });

      it('should execute tool with default empty params', async () => {
        await manager.executeTool('test-server', 'test-tool');

        expect(mockClient.executeTool).toHaveBeenCalledWith('test-tool', {});
      });

      it('should throw error for disconnected server', async () => {
        mockClient.isConnected.mockReturnValue(false);

        await expect(manager.executeTool('test-server', 'test-tool')).rejects.toThrow(
          'Server test-server is not connected'
        );
      });
    });

    describe('listTools', () => {
      it('should list tools from specific server', async () => {
        const tools = await manager.listTools('test-server');

        expect(tools).toEqual([{ name: 'test-tool' }]);
        expect(mockClient.getTools).toHaveBeenCalled();
      });

      it('should list tools from all connected servers', async () => {
        const mockClient2 = {
          isConnected: vi.fn().mockReturnValue(true),
          getTools: vi.fn().mockResolvedValue([{ name: 'server2-tool' }]),
        };
        (manager as any).clients.set('server2', mockClient2);

        const tools = await manager.listTools();

        expect(tools).toEqual([
          { name: 'test-tool', serverId: 'test-server' },
          { name: 'server2-tool', serverId: 'server2' }
        ]);
      });

      it('should handle errors from individual servers', async () => {
        const mockClient2 = {
          isConnected: vi.fn().mockReturnValue(true),
          getTools: vi.fn().mockRejectedValue(new Error('Server error')),
        };
        (manager as any).clients.set('server2', mockClient2);

        const tools = await manager.listTools();

        expect(tools).toEqual([{ name: 'test-tool', serverId: 'test-server' }]);
      });

      it('should skip disconnected servers', async () => {
        const mockClient2 = {
          isConnected: vi.fn().mockReturnValue(false),
          getTools: vi.fn(),
        };
        (manager as any).clients.set('server2', mockClient2);

        const tools = await manager.listTools();

        expect(tools).toEqual([{ name: 'test-tool', serverId: 'test-server' }]);
        expect(mockClient2.getTools).not.toHaveBeenCalled();
      });
    });
  });

  describe('advanced connection features', () => {
    let mockConfigStore: any;

    beforeEach(() => {
      mockConfigStore = {
        getServer: vi.fn().mockReturnValue(mockServer),
        updateServer: vi.fn().mockResolvedValue(mockServer),
      };
      (manager as any).configStore = mockConfigStore;
    });

    it('should handle connection timeout', async () => {
      const { MCPClient } = await import('../src/client/mcp-client');
      const mockClient = {
        connect: vi.fn().mockImplementation(() => new Promise(() => {})), // Never resolves
        on: vi.fn(),
      };
      vi.mocked(MCPClient).mockReturnValueOnce(mockClient as any);

      await expect(
        manager.connect('test-server', { timeout: 10 })
      ).rejects.toThrow('Connection timeout');

      expect(mockConfigStore.updateServer).toHaveBeenCalledWith('test-server', {
        status: 'connecting',
      });
      expect(mockConfigStore.updateServer).toHaveBeenCalledWith('test-server', {
        status: 'error',
        error: 'Connection timeout',
      });
    });

    it('should skip connection if already connected', async () => {
      const mockClient = {
        isConnected: vi.fn().mockReturnValue(true),
      };
      (manager as any).clients.set('test-server', mockClient);

      await manager.connect('test-server');

      expect(mockConfigStore.updateServer).not.toHaveBeenCalled();
    });

    it('should clear reconnect attempts on successful connection', async () => {
      (manager as any).reconnectAttempts.set('test-server', 2);

      const { MCPClient } = await import('../src/client/mcp-client');
      const mockClient = {
        connect: vi.fn().mockResolvedValue(undefined),
        isConnected: vi.fn().mockReturnValue(true),
        on: vi.fn(),
      };
      vi.mocked(MCPClient).mockReturnValueOnce(mockClient as any);

      await manager.connect('test-server');

      expect((manager as any).reconnectAttempts.has('test-server')).toBe(false);
    });

    it('should handle disconnect with reconnect timer cleanup', async () => {
      const timer = setTimeout(() => {}, 5000);
      (manager as any).reconnectTimers.set('test-server', timer);

      const mockClient = {
        disconnect: vi.fn().mockResolvedValue(undefined),
      };
      (manager as any).clients.set('test-server', mockClient);

      await manager.disconnect('test-server');

      expect((manager as any).reconnectTimers.has('test-server')).toBe(false);
    });

    it('should disconnect all servers', async () => {
      const mockClient1 = { disconnect: vi.fn().mockResolvedValue(undefined) };
      const mockClient2 = { disconnect: vi.fn().mockRejectedValue(new Error('Disconnect failed')) };

      (manager as any).clients.set('server1', mockClient1);
      (manager as any).clients.set('server2', mockClient2);

      await manager.disconnectAll();

      expect(mockClient1.disconnect).toHaveBeenCalled();
      expect(mockClient2.disconnect).toHaveBeenCalled();
    });
  });

  describe('configuration operations', () => {
    let mockConfigStore: any;

    beforeEach(() => {
      mockConfigStore = {
        exportConfig: vi.fn().mockResolvedValue('{"servers":[]}'),
        importConfig: vi.fn().mockResolvedValue(undefined),
        getAllServers: vi.fn().mockReturnValue([mockServer]),
      };
      (manager as any).configStore = mockConfigStore;
    });

    it('should export configuration', async () => {
      const config = await manager.exportConfig();

      expect(config).toBe('{"servers":[]}');
      expect(mockConfigStore.exportConfig).toHaveBeenCalled();
    });

    it('should import configuration without auto-connect', async () => {
      const disconnectAllSpy = vi.spyOn(manager, 'disconnectAll').mockResolvedValue();

      await manager.importConfig('{"servers":[]}');

      expect(disconnectAllSpy).toHaveBeenCalled();
      expect(mockConfigStore.importConfig).toHaveBeenCalledWith('{"servers":[]}');
    });

    it('should import configuration with auto-connect', async () => {
      const autoConnectManager = new MCPClientManager({ autoConnect: true });
      (autoConnectManager as any).configStore = mockConfigStore;
      const disconnectAllSpy = vi.spyOn(autoConnectManager, 'disconnectAll').mockResolvedValue();
      const initializeSpy = vi.spyOn(autoConnectManager, 'initialize').mockResolvedValue();

      await autoConnectManager.importConfig('{"servers":[]}');

      expect(disconnectAllSpy).toHaveBeenCalled();
      expect(mockConfigStore.importConfig).toHaveBeenCalledWith('{"servers":[]}');
      expect(initializeSpy).toHaveBeenCalled();
    });
  });

  describe('server update operations', () => {
    let mockConfigStore: any;

    beforeEach(() => {
      mockConfigStore = {
        getServer: vi.fn().mockReturnValue(mockServer),
        updateServer: vi.fn().mockResolvedValue({ ...mockServer, name: 'Updated Server' }),
      };
      (manager as any).configStore = mockConfigStore;
    });

    it('should update disconnected server', async () => {
      const updates = { name: 'Updated Server' };

      const result = await manager.updateServer('test-server', updates);

      expect(result.name).toBe('Updated Server');
      expect(mockConfigStore.updateServer).toHaveBeenCalledWith('test-server', updates);
    });

    it('should reconnect after update if was connected', async () => {
      const mockClient = {
        isConnected: vi.fn().mockReturnValue(true),
        disconnect: vi.fn().mockResolvedValue(undefined),
      };
      (manager as any).clients.set('test-server', mockClient);

      const disconnectSpy = vi.spyOn(manager, 'disconnect').mockResolvedValue();
      const connectSpy = vi.spyOn(manager, 'connect').mockResolvedValue();

      await manager.updateServer('test-server', { name: 'Updated' });

      expect(disconnectSpy).toHaveBeenCalledWith('test-server');
      expect(connectSpy).toHaveBeenCalledWith('test-server');
    });
  });

  describe('utility methods', () => {
    it('should get server from config store', () => {
      const mockConfigStore = {
        getServer: vi.fn().mockReturnValue(mockServer),
      };
      (manager as any).configStore = mockConfigStore;

      const server = manager.getServer('test-server');

      expect(server).toEqual(mockServer);
      expect(mockConfigStore.getServer).toHaveBeenCalledWith('test-server');
    });

    it('should get all servers from config store', () => {
      const servers = [mockServer];
      const mockConfigStore = {
        getAllServers: vi.fn().mockReturnValue(servers),
      };
      (manager as any).configStore = mockConfigStore;

      const result = manager.getAllServers();

      expect(result).toEqual(servers);
      expect(mockConfigStore.getAllServers).toHaveBeenCalled();
    });

    it('should check if server is connected', () => {
      const mockClient = {
        isConnected: vi.fn().mockReturnValue(true),
      };
      (manager as any).clients.set('test-server', mockClient);

      const isConnected = manager.isConnected('test-server');

      expect(isConnected).toBe(true);
      expect(mockClient.isConnected).toHaveBeenCalled();
    });

    it('should return false for non-existent server connection check', () => {
      const isConnected = manager.isConnected('non-existent');

      expect(isConnected).toBe(false);
    });
  });
});