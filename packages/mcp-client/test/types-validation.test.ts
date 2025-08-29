import { describe, it, expect } from 'vitest';
import {
  TransportTypeSchema,
  ServerStatusSchema,
  StdioConfigSchema,
  HttpConfigSchema,
  ServerConfigSchema,
  MCPServerSchema,
  type TransportType,
  type ServerStatus,
  type MCPServer,
  type ServerCreateInput,
  type ServerUpdateInput,
} from '../src/types/server';

import {
  ToolParameterSchema,
  ToolSchema,
  ResourceSchema,
  PromptSchema,
  type Tool,
  type Resource,
  type Prompt,
  type ToolParameter,
  type ToolExecutionResult,
  type ServerCapabilities,
} from '../src/types/tools';

import {
  type MCPTransport,
  type MCPClient,
  type ClientEvents,
} from '../src/client/types';

describe('Type Validation', () => {
  describe('Server Types', () => {
    describe('TransportTypeSchema', () => {
      it('should validate valid transport types', () => {
        expect(TransportTypeSchema.parse('stdio')).toBe('stdio');
        expect(TransportTypeSchema.parse('sse')).toBe('sse');
        expect(TransportTypeSchema.parse('http')).toBe('http');
      });

      it('should reject invalid transport types', () => {
        expect(() => TransportTypeSchema.parse('invalid')).toThrow();
        expect(() => TransportTypeSchema.parse('')).toThrow();
        expect(() => TransportTypeSchema.parse(123)).toThrow();
      });
    });

    describe('ServerStatusSchema', () => {
      it('should validate valid server statuses', () => {
        const validStatuses = ['active', 'inactive', 'error', 'connecting', 'disconnected'];
        
        validStatuses.forEach(status => {
          expect(ServerStatusSchema.parse(status)).toBe(status);
        });
      });

      it('should reject invalid server statuses', () => {
        expect(() => ServerStatusSchema.parse('invalid')).toThrow();
        expect(() => ServerStatusSchema.parse('running')).toThrow();
        expect(() => ServerStatusSchema.parse('')).toThrow();
      });
    });

    describe('StdioConfigSchema', () => {
      it('should validate minimal stdio config', () => {
        const config = { command: 'node' };
        const result = StdioConfigSchema.parse(config);
        expect(result.command).toBe('node');
      });

      it('should validate full stdio config', () => {
        const config = {
          command: 'python',
          args: ['-m', 'server'],
          env: { NODE_ENV: 'test' },
          cwd: '/path/to/project'
        };
        
        const result = StdioConfigSchema.parse(config);
        expect(result.command).toBe('python');
        expect(result.args).toEqual(['-m', 'server']);
        expect(result.env).toEqual({ NODE_ENV: 'test' });
        expect(result.cwd).toBe('/path/to/project');
      });

      it('should reject invalid stdio config', () => {
        expect(() => StdioConfigSchema.parse({})).toThrow();
        expect(() => StdioConfigSchema.parse({ command: 123 })).toThrow();
        expect(() => StdioConfigSchema.parse({ command: 'node', args: 'invalid' })).toThrow();
      });
    });

    describe('HttpConfigSchema', () => {
      it('should validate minimal http config', () => {
        const config = { url: 'https://example.com' };
        const result = HttpConfigSchema.parse(config);
        expect(result.url).toBe('https://example.com');
      });

      it('should validate full http config', () => {
        const config = {
          url: 'https://api.example.com/mcp',
          headers: { 'Authorization': 'Bearer token' },
          timeout: 5000
        };
        
        const result = HttpConfigSchema.parse(config);
        expect(result.url).toBe('https://api.example.com/mcp');
        expect(result.headers).toEqual({ 'Authorization': 'Bearer token' });
        expect(result.timeout).toBe(5000);
      });

      it('should reject invalid http config', () => {
        expect(() => HttpConfigSchema.parse({})).toThrow();
        expect(() => HttpConfigSchema.parse({ url: 'invalid-url' })).toThrow();
        expect(() => HttpConfigSchema.parse({ url: 'https://example.com', timeout: 'invalid' })).toThrow();
      });
    });

    describe('ServerConfigSchema', () => {
      it('should validate stdio server config', () => {
        const config = {
          transport: 'stdio' as const,
          config: { command: 'node', args: ['server.js'] }
        };
        
        const result = ServerConfigSchema.parse(config);
        expect(result.transport).toBe('stdio');
        expect(result.config.command).toBe('node');
      });

      it('should validate http server config', () => {
        const config = {
          transport: 'http' as const,
          config: { url: 'https://example.com' }
        };
        
        const result = ServerConfigSchema.parse(config);
        expect(result.transport).toBe('http');
        expect(result.config.url).toBe('https://example.com');
      });

      it('should validate sse server config', () => {
        const config = {
          transport: 'sse' as const,
          config: { url: 'https://example.com/events' }
        };
        
        const result = ServerConfigSchema.parse(config);
        expect(result.transport).toBe('sse');
        expect(result.config.url).toBe('https://example.com/events');
      });

      it('should reject mismatched transport and config', () => {
        expect(() => ServerConfigSchema.parse({
          transport: 'stdio',
          config: { url: 'https://example.com' }
        })).toThrow();
        
        expect(() => ServerConfigSchema.parse({
          transport: 'http',
          config: { command: 'node' }
        })).toThrow();
      });
    });

    describe('MCPServerSchema', () => {
      it('should validate minimal server', () => {
        const server = {
          id: 'server-1',
          name: 'Test Server',
          transport: 'stdio' as const,
          config: { command: 'node' },
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        
        const result = MCPServerSchema.parse(server);
        expect(result.id).toBe('server-1');
        expect(result.name).toBe('Test Server');
        expect(result.status).toBe('inactive'); // default value
      });

      it('should validate full server', () => {
        const server = {
          id: 'server-2',
          name: 'Full Server',
          description: 'A complete server configuration',
          transport: 'http' as const,
          config: { url: 'https://example.com' },
          status: 'active' as const,
          toolCount: 5,
          resourceCount: 10,
          promptCount: 2,
          lastConnected: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        
        const result = MCPServerSchema.parse(server);
        expect(result.description).toBe('A complete server configuration');
        expect(result.toolCount).toBe(5);
        expect(result.resourceCount).toBe(10);
      });

      it('should reject invalid server data', () => {
        expect(() => MCPServerSchema.parse({})).toThrow();
        expect(() => MCPServerSchema.parse({ id: '', name: 'test' })).toThrow();
        expect(() => MCPServerSchema.parse({ 
          id: 'test', 
          name: 'test', 
          transport: 'invalid' 
        })).toThrow();
      });
    });
  });

  describe('Tool Types', () => {
    describe('ToolParameterSchema', () => {
      it('should validate minimal tool parameter', () => {
        const param = {
          name: 'input',
          type: 'string'
        };
        
        const result = ToolParameterSchema.parse(param);
        expect(result.name).toBe('input');
        expect(result.type).toBe('string');
      });

      it('should validate full tool parameter', () => {
        const param = {
          name: 'query',
          description: 'Search query string',
          type: 'string',
          required: true,
          schema: { minLength: 1 }
        };
        
        const result = ToolParameterSchema.parse(param);
        expect(result.description).toBe('Search query string');
        expect(result.required).toBe(true);
        expect(result.schema).toEqual({ minLength: 1 });
      });

      it('should reject invalid tool parameter', () => {
        expect(() => ToolParameterSchema.parse({})).toThrow();
        expect(() => ToolParameterSchema.parse({ name: '' })).toThrow();
        expect(() => ToolParameterSchema.parse({ name: 'test' })).toThrow(); // missing type
      });
    });

    describe('ToolSchema', () => {
      it('should validate minimal tool', () => {
        const tool = { name: 'search' };
        const result = ToolSchema.parse(tool);
        expect(result.name).toBe('search');
      });

      it('should validate full tool', () => {
        const tool = {
          name: 'advanced_search',
          description: 'Advanced search functionality',
          inputSchema: { type: 'object' },
          parameters: [
            { name: 'query', type: 'string', required: true }
          ]
        };
        
        const result = ToolSchema.parse(tool);
        expect(result.description).toBe('Advanced search functionality');
        expect(result.parameters).toHaveLength(1);
      });
    });

    describe('ResourceSchema', () => {
      it('should validate minimal resource', () => {
        const resource = {
          uri: 'file:///path/to/file.txt',
          name: 'test.txt'
        };
        
        const result = ResourceSchema.parse(resource);
        expect(result.uri).toBe('file:///path/to/file.txt');
        expect(result.name).toBe('test.txt');
      });

      it('should validate full resource', () => {
        const resource = {
          uri: 'https://example.com/api/data',
          name: 'API Data',
          description: 'External API data source',
          mimeType: 'application/json'
        };
        
        const result = ResourceSchema.parse(resource);
        expect(result.description).toBe('External API data source');
        expect(result.mimeType).toBe('application/json');
      });
    });

    describe('PromptSchema', () => {
      it('should validate minimal prompt', () => {
        const prompt = { name: 'generate' };
        const result = PromptSchema.parse(prompt);
        expect(result.name).toBe('generate');
      });

      it('should validate full prompt', () => {
        const prompt = {
          name: 'code_review',
          description: 'Review code for issues',
          arguments: [
            { name: 'language', description: 'Programming language', required: true },
            { name: 'style', description: 'Code style preference', required: false }
          ]
        };
        
        const result = PromptSchema.parse(prompt);
        expect(result.description).toBe('Review code for issues');
        expect(result.arguments).toHaveLength(2);
        expect(result.arguments![0].required).toBe(true);
      });
    });
  });

  describe('TypeScript Interface Types', () => {
    it('should support ServerCreateInput interface', () => {
      const input: ServerCreateInput = {
        name: 'New Server',
        description: 'Test server',
        transport: 'stdio',
        config: { command: 'node', args: ['server.js'] }
      };
      
      expect(input.name).toBe('New Server');
      expect(input.transport).toBe('stdio');
    });

    it('should support ServerUpdateInput interface', () => {
      const update: ServerUpdateInput = {
        name: 'Updated Server',
        config: { command: 'python', args: ['-m', 'server'] }
      };
      
      expect(update.name).toBe('Updated Server');
      expect(update.config).toEqual({ command: 'python', args: ['-m', 'server'] });
    });

    it('should support ToolExecutionResult interface', () => {
      const successResult: ToolExecutionResult = {
        success: true,
        result: { data: 'test' },
        executionTime: 100
      };
      
      const errorResult: ToolExecutionResult = {
        success: false,
        error: 'Tool execution failed',
        executionTime: 50
      };
      
      expect(successResult.success).toBe(true);
      expect(errorResult.success).toBe(false);
    });

    it('should support ServerCapabilities interface', () => {
      const capabilities: ServerCapabilities = {
        tools: [{ name: 'search' }],
        resources: [{ uri: 'file:///test.txt', name: 'test' }],
        prompts: [{ name: 'generate' }]
      };
      
      expect(capabilities.tools).toHaveLength(1);
      expect(capabilities.resources).toHaveLength(1);
      expect(capabilities.prompts).toHaveLength(1);
    });

    it('should support ClientEvents interface', () => {
      // Test that the type exists and has the expected structure
      const events: Partial<ClientEvents> = {};
      
      // TypeScript compilation will verify the interface structure
      expect(typeof events).toBe('object');
    });
  });

  describe('Edge Cases and Validation', () => {
    it('should handle optional fields correctly', () => {
      const server = MCPServerSchema.parse({
        id: 'test',
        name: 'Test',
        transport: 'stdio',
        config: { command: 'node' },
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      // Optional fields should be undefined if not provided
      expect(server.description).toBeUndefined();
      expect(server.toolCount).toBeUndefined();
      expect(server.lastConnected).toBeUndefined();
    });

    it('should validate date fields', () => {
      const now = new Date();
      const server = MCPServerSchema.parse({
        id: 'test',
        name: 'Test',
        transport: 'stdio',
        config: { command: 'node' },
        createdAt: now,
        updatedAt: now,
        lastConnected: now
      });
      
      expect(server.createdAt).toEqual(now);
      expect(server.updatedAt).toEqual(now);
      expect(server.lastConnected).toEqual(now);
    });

    it('should handle complex nested schemas', () => {
      const complexTool = ToolSchema.parse({
        name: 'complex_tool',
        description: 'A complex tool with nested schema',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            options: {
              type: 'object',
              properties: {
                limit: { type: 'number' },
                sort: { type: 'string' }
              }
            }
          },
          required: ['query']
        },
        parameters: [
          {
            name: 'query',
            type: 'string',
            required: true,
            schema: { minLength: 1 }
          }
        ]
      });
      
      expect(complexTool.inputSchema.type).toBe('object');
      expect(complexTool.parameters).toHaveLength(1);
    });
  });
});