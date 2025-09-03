import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MCPClient } from '../src/client/mcp-client';
import { MCPServer } from '../src/types/server';

describe('MCP Client Error Handling', () => {
  let mockServer: MCPServer;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockServer = {
      id: 'test-server',
      name: 'Test Server',
      description: 'Test server for error handling',
      transport: 'stdio',
      config: {
        command: 'node',
        args: ['test.js'],
      },
      status: 'inactive',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('MCPClient getPrompts Error Handling', () => {
    it('should throw error when client is not connected', async () => {
      const client = new MCPClient(mockServer);

      await expect(client.getPrompts()).rejects.toThrow('Client is not connected');
    });

    it('should return empty array when getPrompts fails after connection', async () => {
      const client = new MCPClient(mockServer);
      
      // Mock the client to simulate connected state
      (client as any).connected = true;
      (client as any).client = {
        listPrompts: vi.fn().mockRejectedValue(new Error('MCP protocol error')),
      };

      // Mock console.error to verify it's called
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await client.getPrompts();

      expect(result).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to get prompts:', expect.any(Error));
      
      consoleErrorSpy.mockRestore();
    });

    it('should handle successful getPrompts when response has prompts', async () => {
      const client = new MCPClient(mockServer);
      const mockPrompts = [
        { name: 'test-prompt', description: 'Test prompt' },
        { name: 'another-prompt', description: 'Another prompt' },
      ];
      
      (client as any).connected = true;
      (client as any).client = {
        listPrompts: vi.fn().mockResolvedValue({ prompts: mockPrompts }),
      };

      const result = await client.getPrompts();

      expect(result).toEqual(mockPrompts);
    });

    it('should return empty array when response has no prompts property', async () => {
      const client = new MCPClient(mockServer);
      
      (client as any).connected = true;
      (client as any).client = {
        listPrompts: vi.fn().mockResolvedValue({}), // No prompts property
      };

      const result = await client.getPrompts();

      expect(result).toEqual([]);
    });

    it('should handle null prompts response gracefully', async () => {
      const client = new MCPClient(mockServer);
      
      (client as any).connected = true;
      (client as any).client = {
        listPrompts: vi.fn().mockResolvedValue({ prompts: null }),
      };

      const result = await client.getPrompts();

      expect(result).toEqual([]);
    });
  });

  describe('MCPClient executeTool Error Handling', () => {
    it('should throw error when client is not connected', async () => {
      const client = new MCPClient(mockServer);

      await expect(client.executeTool('test-tool', {})).rejects.toThrow('Client is not connected');
    });

    it('should return success result when tool execution succeeds', async () => {
      const client = new MCPClient(mockServer);
      const mockResult = { output: 'Tool executed successfully' };
      
      (client as any).connected = true;
      (client as any).client = {
        callTool: vi.fn().mockResolvedValue({ content: mockResult }),
      };

      const result = await client.executeTool('test-tool', { param1: 'value1' });

      expect(result.success).toBe(true);
      expect(result.result).toEqual(mockResult);
      expect(result.error).toBeUndefined();
      expect(typeof result.executionTime).toBe('number');
      expect(result.executionTime).toBeGreaterThanOrEqual(0);
    });

    it('should return failure result when tool execution throws error', async () => {
      const client = new MCPClient(mockServer);
      const errorMessage = 'Tool execution failed';
      
      (client as any).connected = true;
      (client as any).client = {
        callTool: vi.fn().mockRejectedValue(new Error(errorMessage)),
      };

      const result = await client.executeTool('failing-tool', { param1: 'value1' });

      expect(result.success).toBe(false);
      expect(result.result).toBeUndefined();
      expect(result.error).toBe(errorMessage);
      expect(typeof result.executionTime).toBe('number');
      expect(result.executionTime).toBeGreaterThanOrEqual(0);
    });

    it('should handle tool execution with no parameters', async () => {
      const client = new MCPClient(mockServer);
      const mockResult = { output: 'No params tool' };
      
      (client as any).connected = true;
      (client as any).client = {
        callTool: vi.fn().mockResolvedValue({ content: mockResult }),
      };

      const result = await client.executeTool('no-params-tool');

      expect(result.success).toBe(true);
      expect(result.result).toEqual(mockResult);
      expect((client as any).client.callTool).toHaveBeenCalledWith({
        name: 'no-params-tool',
        arguments: {},
      });
    });

    it('should handle non-Error objects thrown during execution', async () => {
      const client = new MCPClient(mockServer);
      
      (client as any).connected = true;
      (client as any).client = {
        callTool: vi.fn().mockRejectedValue('String error'),
      };

      const result = await client.executeTool('string-error-tool');

      expect(result.success).toBe(false);
      // When the thrown value is not an Error, accessing .message returns undefined
      expect(result.error).toBeUndefined();
    });

    it('should record accurate execution time', async () => {
      const client = new MCPClient(mockServer);
      
      (client as any).connected = true;
      (client as any).client = {
        callTool: vi.fn().mockImplementation(() => 
          new Promise(resolve => setTimeout(() => resolve({ content: 'result' }), 100))
        ),
      };

      const result = await client.executeTool('slow-tool');

      expect(result.success).toBe(true);
      expect(result.executionTime).toBeGreaterThanOrEqual(90); // Allow for timing variance
    });
  });
});

// Note: ConfigStore tests are complex and would require extensive mocking
// The key error handling paths in ConfigStore (importConfig/exportConfig) are covered
// by the existing integration tests. For this focused error handling test suite,
// we'll focus on the MCPClient error paths which have specific uncovered lines.