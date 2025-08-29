import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MCPClient } from '../src/client/mcp-client';
import type { MCPServer } from '../src/types/server';

// Mock the MCP SDK
vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn().mockImplementation(() => ({
    connect: vi.fn(),
    close: vi.fn(),
    listTools: vi.fn().mockResolvedValue({ tools: [] }),
    listResources: vi.fn().mockResolvedValue({ resources: [] }),
    listPrompts: vi.fn().mockResolvedValue({ prompts: [] }),
    callTool: vi.fn(),
    readResource: vi.fn(),
    getPrompt: vi.fn(),
  })),
}));

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: vi.fn().mockImplementation(() => ({
    start: vi.fn(),
    close: vi.fn(),
  })),
}));

vi.mock('@modelcontextprotocol/sdk/client/sse.js', () => ({
  SSEClientTransport: vi.fn().mockImplementation(() => ({
    start: vi.fn(),
    close: vi.fn(),
  })),
}));

describe('MCPClient', () => {
  let mockStdioServer: MCPServer;
  let mockHttpServer: MCPServer;

  beforeEach(() => {
    vi.clearAllMocks();

    mockStdioServer = {
      id: 'test-stdio-server',
      name: 'Test Stdio Server',
      description: 'A test server using stdio',
      transport: 'stdio',
      config: {
        command: 'test-command',
        args: ['--test'],
        env: { TEST_ENV: 'test' },
      },
      enabled: true,
    };

    mockHttpServer = {
      id: 'test-http-server',
      name: 'Test HTTP Server',
      description: 'A test server using HTTP',
      transport: 'http',
      config: {
        url: 'http://localhost:3000',
        headers: { 'Authorization': 'Bearer test' },
      },
      enabled: true,
    };
  });

  describe('constructor', () => {
    it('should create client with default client name', () => {
      const client = new MCPClient(mockStdioServer);
      expect(client).toBeInstanceOf(MCPClient);
    });

    it('should create client with custom client name', () => {
      const client = new MCPClient(mockStdioServer, { clientName: 'custom-client' });
      expect(client).toBeInstanceOf(MCPClient);
    });

    it('should create client with environment variable client name', () => {
      process.env.MCP_CLIENT_NAME = 'env-client';
      const client = new MCPClient(mockStdioServer);
      expect(client).toBeInstanceOf(MCPClient);
      delete process.env.MCP_CLIENT_NAME;
    });
  });

  describe('connect', () => {
    it('should connect successfully with stdio transport', async () => {
      const client = new MCPClient(mockStdioServer);
      
      // Mock the private client connection
      const mockClient = {
        connect: vi.fn().mockResolvedValue(undefined),
      };
      (client as any).client = mockClient;

      await expect(client.connect()).resolves.toBeUndefined();
    });

    it('should connect successfully with http transport', async () => {
      const client = new MCPClient(mockHttpServer);
      
      // Mock the private client connection
      const mockClient = {
        connect: vi.fn().mockResolvedValue(undefined),
      };
      (client as any).client = mockClient;

      await expect(client.connect()).resolves.toBeUndefined();
    });

    it('should throw error when already connected', async () => {
      const client = new MCPClient(mockStdioServer);
      (client as any).connected = true;

      await expect(client.connect()).rejects.toThrow('Client is already connected');
    });

    it('should throw error for unsupported transport', async () => {
      const invalidServer = {
        ...mockStdioServer,
        transport: 'unsupported' as any,
      };
      const client = new MCPClient(invalidServer);

      await expect(client.connect()).rejects.toThrow('Unsupported transport: unsupported');
    });
  });

  describe('disconnect', () => {
    it('should disconnect successfully', async () => {
      const client = new MCPClient(mockStdioServer);
      const mockClient = {
        close: vi.fn().mockResolvedValue(undefined),
      };
      const mockTransport = {
        close: vi.fn().mockResolvedValue(undefined),
      };

      (client as any).client = mockClient;
      (client as any).transport = mockTransport;
      (client as any).connected = true;

      await client.disconnect();

      expect(mockClient.close).toHaveBeenCalled();
      // Transport.close is not called directly, only client.close()
    });

    it('should handle disconnect when not connected', async () => {
      const client = new MCPClient(mockStdioServer);
      
      await expect(client.disconnect()).resolves.toBeUndefined();
    });
  });

  describe('isConnected', () => {
    it('should return connection status', () => {
      const client = new MCPClient(mockStdioServer);
      
      expect(client.isConnected()).toBe(false);

      (client as any).connected = true;
      expect(client.isConnected()).toBe(true);
    });
  });

  describe('getServer', () => {
    it('should return server configuration', () => {
      const client = new MCPClient(mockStdioServer);
      
      expect(client.getServer()).toEqual(mockStdioServer);
    });
  });

  describe('getTools', () => {
    it('should get tools when connected', async () => {
      const client = new MCPClient(mockStdioServer);
      const mockTools = [
        { name: 'tool1', description: 'Test tool 1' },
        { name: 'tool2', description: 'Test tool 2' },
      ];

      const mockClient = {
        listTools: vi.fn().mockResolvedValue({ tools: mockTools }),
      };

      (client as any).client = mockClient;
      (client as any).connected = true;

      const result = await client.getTools();
      expect(result).toEqual(mockTools);
      expect(mockClient.listTools).toHaveBeenCalled();
    });

    it('should throw error when not connected', async () => {
      const client = new MCPClient(mockStdioServer);

      await expect(client.getTools()).rejects.toThrow('Client is not connected');
    });
  });

  describe('getResources', () => {
    it('should get resources when connected', async () => {
      const client = new MCPClient(mockStdioServer);
      const mockResources = [
        { uri: 'resource1', name: 'Test resource 1' },
        { uri: 'resource2', name: 'Test resource 2' },
      ];

      const mockClient = {
        listResources: vi.fn().mockResolvedValue({ resources: mockResources }),
      };

      (client as any).client = mockClient;
      (client as any).connected = true;

      const result = await client.getResources();
      expect(result).toEqual(mockResources);
      expect(mockClient.listResources).toHaveBeenCalled();
    });

    it('should throw error when not connected', async () => {
      const client = new MCPClient(mockStdioServer);

      await expect(client.getResources()).rejects.toThrow('Client is not connected');
    });
  });
});