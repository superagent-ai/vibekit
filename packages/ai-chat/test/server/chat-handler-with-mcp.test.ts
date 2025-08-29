import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleChatRequestWithMCP } from '../../src/server/chat-handler-with-mcp';
import { AuthManager } from '../../src/utils/auth';
import type { NextRequest } from 'next/server';

// Mock all dependencies
vi.mock('ai', () => ({
  streamText: vi.fn(),
  tool: vi.fn(),
}));

vi.mock('../../src/utils/auth');
vi.mock('../../src/utils/provider-factory');
vi.mock('../../src/utils/claude-sdk-streaming');
vi.mock('@vibe-kit/mcp-client', () => ({
  MCPClientManager: vi.fn(),
}));

// Mock dynamic imports
vi.mock('path', async () => {
  const actual = await vi.importActual('path');
  return {
    ...actual,
    join: vi.fn((...args) => args.join('/')),
  };
});

vi.mock('os', () => ({
  homedir: vi.fn(() => '/mock/home'),
}));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});

const mockStreamText = vi.mocked((await import('ai')).streamText);
const mockTool = vi.mocked((await import('ai')).tool);
const mockAuthManager = vi.mocked(AuthManager);
const mockGetAuthInfo = vi.mocked((await import('../../src/utils/provider-factory')).getAuthInfo);
const mockShouldUseClaudeCodeSDK = vi.mocked((await import('../../src/utils/provider-factory')).shouldUseClaudeCodeSDK);
const mockCreateAnthropicProviderWithModel = vi.mocked((await import('../../src/utils/provider-factory')).createAnthropicProviderWithModel);
const mockCreateClaudeCodeProvider = vi.mocked((await import('../../src/utils/claude-sdk-streaming')).createClaudeCodeProvider);

describe('handleChatRequestWithMCP', () => {
  let mockAuthManagerInstance: any;
  let mockRequest: Partial<NextRequest>;
  let mockResponse: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup mock auth manager
    mockAuthManagerInstance = {
      hasValidAuth: vi.fn(() => true),
      getErrorMessage: vi.fn(() => ''),
    };
    mockAuthManager.getInstance.mockReturnValue(mockAuthManagerInstance);
    
    // Setup mock provider factory
    mockGetAuthInfo.mockReturnValue({ hasAuth: true });
    mockShouldUseClaudeCodeSDK.mockReturnValue(false);
    mockCreateAnthropicProviderWithModel.mockReturnValue({} as any);
    
    // Setup mock streaming response
    mockResponse = {
      toUIMessageStreamResponse: vi.fn().mockReturnValue(new Response('stream', { status: 200 })),
      fullStream: {
        async *[Symbol.asyncIterator]() {
          yield { type: 'text-delta', textDelta: 'test' };
        }
      }
    };
    mockStreamText.mockReturnValue(mockResponse);
    
    // Setup basic mock request
    mockRequest = {
      url: 'http://localhost:3000/api/chat-mcp',
      json: vi.fn(),
    };
    
    // Mock console methods to reduce noise
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Request Validation', () => {
    it('should return 400 when no messages provided', async () => {
      mockRequest.json = vi.fn().mockResolvedValue({ messages: [] });

      const response = await handleChatRequestWithMCP(mockRequest as NextRequest);

      expect(response.status).toBe(400);
      expect(await response.text()).toBe('Messages are required');
    });

    it('should return 400 when messages is null/undefined', async () => {
      mockRequest.json = vi.fn().mockResolvedValue({ messages: null });

      const response = await handleChatRequestWithMCP(mockRequest as NextRequest);

      expect(response.status).toBe(400);
      expect(await response.text()).toBe('Messages are required');
    });

    it('should handle malformed JSON in request body', async () => {
      mockRequest.json = vi.fn().mockRejectedValue(new Error('Invalid JSON'));

      const response = await handleChatRequestWithMCP(mockRequest as NextRequest);

      expect(response.status).toBe(500);
      const responseBody = await response.json();
      expect(responseBody.error).toContain('Invalid JSON');
    });
  });

  describe('Authentication Handling', () => {
    it('should return 500 when authentication is invalid', async () => {
      mockAuthManagerInstance.hasValidAuth.mockReturnValue(false);
      mockAuthManagerInstance.getErrorMessage.mockReturnValue('No API key configured');
      mockRequest.json = vi.fn().mockResolvedValue({
        messages: [{ role: 'user', content: 'test message' }]
      });

      const response = await handleChatRequestWithMCP(mockRequest as NextRequest);

      expect(response.status).toBe(500);
      const responseBody = await response.json();
      expect(responseBody.error).toBe('No API key configured');
    });

    it('should use default error message when auth error is empty', async () => {
      mockAuthManagerInstance.hasValidAuth.mockReturnValue(false);
      mockAuthManagerInstance.getErrorMessage.mockReturnValue('');
      mockRequest.json = vi.fn().mockResolvedValue({
        messages: [{ role: 'user', content: 'test message' }]
      });

      const response = await handleChatRequestWithMCP(mockRequest as NextRequest);

      expect(response.status).toBe(500);
      const responseBody = await response.json();
      expect(responseBody.error).toBe('No authentication configured');
    });

    it('should proceed when authentication is valid', async () => {
      mockAuthManagerInstance.hasValidAuth.mockReturnValue(true);
      mockRequest.json = vi.fn().mockResolvedValue({
        messages: [{ role: 'user', content: 'test message' }]
      });

      const response = await handleChatRequestWithMCP(mockRequest as NextRequest);

      expect(response.status).toBe(200);
      expect(mockStreamText).toHaveBeenCalled();
    });
  });

  describe('Query Parameter Parsing', () => {
    it('should parse query parameters correctly', async () => {
      mockRequest.url = 'http://localhost:3000/api/chat-mcp?showMCPTools=true&model=gpt-4&temperature=0.5&maxTokens=2048';
      mockRequest.json = vi.fn().mockResolvedValue({
        messages: [{ role: 'user', content: 'test message' }]
      });

      await handleChatRequestWithMCP(mockRequest as NextRequest);

      expect(mockStreamText).toHaveBeenCalledWith(
        expect.objectContaining({
          model: expect.anything(),
          temperature: 0.5,
          maxOutputTokens: 2048,
        })
      );
    });

    it('should prioritize query params over body data', async () => {
      mockRequest.url = 'http://localhost:3000/api/chat-mcp?model=query-model&temperature=0.8';
      mockRequest.json = vi.fn().mockResolvedValue({
        messages: [{ role: 'user', content: 'test message' }],
        data: { model: 'body-model', temperature: 0.2 }
      });

      await handleChatRequestWithMCP(mockRequest as NextRequest);

      // Should use query params, not body data
      expect(mockStreamText).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.8,
        })
      );
    });

    it('should use default values when parameters not provided', async () => {
      mockRequest.json = vi.fn().mockResolvedValue({
        messages: [{ role: 'user', content: 'test message' }]
      });

      await handleChatRequestWithMCP(mockRequest as NextRequest);

      expect(mockStreamText).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.7,
          maxOutputTokens: 4096,
        })
      );
    });
  });

  describe('Message Formatting', () => {
    it('should format user messages correctly', async () => {
      const messages = [
        { role: 'user', content: 'Hello' },
        { role: 'user', content: 123 as any }, // Non-string content
      ];
      mockRequest.json = vi.fn().mockResolvedValue({ messages });

      await handleChatRequestWithMCP(mockRequest as NextRequest);

      expect(mockStreamText).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            { role: 'user', content: 'Hello' },
            { role: 'user', content: '' }, // Non-string converted to empty string
          ]
        })
      );
    });

    it('should format assistant messages with parts array', async () => {
      const messages = [
        { 
          role: 'assistant', 
          content: 'original content',
          parts: [
            { type: 'text', text: 'Part 1' },
            { type: 'image', data: 'base64...' },
            { type: 'text', text: 'Part 2' }
          ]
        }
      ];
      mockRequest.json = vi.fn().mockResolvedValue({ messages });

      await handleChatRequestWithMCP(mockRequest as NextRequest);

      expect(mockStreamText).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            { role: 'assistant', content: 'Part 1Part 2' } // Only text parts combined
          ]
        })
      );
    });

    it('should format system messages correctly', async () => {
      const messages = [
        { role: 'system', content: 'System instruction' },
        { role: 'system', content: null as any }, // Null content
      ];
      mockRequest.json = vi.fn().mockResolvedValue({ messages });

      await handleChatRequestWithMCP(mockRequest as NextRequest);

      expect(mockStreamText).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            { role: 'system', content: 'System instruction' },
            { role: 'system', content: '' }, // Null converted to empty string
          ]
        })
      );
    });

    it('should handle unknown message roles as assistant', async () => {
      const messages = [
        { role: 'unknown' as any, content: 'Mystery message' }
      ];
      mockRequest.json = vi.fn().mockResolvedValue({ messages });

      await handleChatRequestWithMCP(mockRequest as NextRequest);

      expect(mockStreamText).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            { role: 'assistant', content: 'Mystery message' }
          ]
        })
      );
    });
  });

  describe('MCP Tools Integration', () => {
    let mockMCPClientManager: any;

    beforeEach(() => {
      // Reset MCP client manager mock
      mockMCPClientManager = {
        initialize: vi.fn().mockResolvedValue(undefined),
        addServer: vi.fn(),
        connect: vi.fn().mockResolvedValue(undefined),
        isConnected: vi.fn().mockReturnValue(true),
        getTools: vi.fn().mockResolvedValue([]),
      };

      // Mock the MCP client constructor
      const MockMCPClientManager = vi.fn().mockImplementation(() => mockMCPClientManager);
      vi.doMock('@vibe-kit/mcp-client', () => ({
        MCPClientManager: MockMCPClientManager,
      }));
    });

    it('should skip MCP tools when showMCPTools is false', async () => {
      mockRequest.json = vi.fn().mockResolvedValue({
        messages: [{ role: 'user', content: 'test' }],
        data: { showMCPTools: false }
      });

      await handleChatRequestWithMCP(mockRequest as NextRequest);

      expect(mockStreamText).toHaveBeenCalledWith(
        expect.objectContaining({
          model: expect.anything(),
          messages: expect.any(Array),
          temperature: 0.7,
          maxOutputTokens: 4096,
        })
      );
      
      // Check that tools property is not included when showMCPTools is false
      const callArgs = mockStreamText.mock.calls[0][0];
      expect(callArgs).not.toHaveProperty('tools');
    });

    it('should handle MCP client not available', async () => {
      mockRequest.json = vi.fn().mockResolvedValue({
        messages: [{ role: 'user', content: 'test' }],
        data: { showMCPTools: true }
      });

      // Mock dynamic import to fail
      vi.doMock('@vibe-kit/mcp-client', () => {
        throw new Error('MCP client not available');
      });

      const response = await handleChatRequestWithMCP(mockRequest as NextRequest);

      expect(response.status).toBe(200); // Should still succeed without MCP tools
      expect(mockStreamText).toHaveBeenCalledWith(
        expect.objectContaining({
          model: expect.anything(),
          messages: expect.any(Array),
          temperature: 0.7,
          maxOutputTokens: 4096,
        })
      );
      
      // Check that tools property is not included when showMCPTools is false
      const callArgs = mockStreamText.mock.calls[0][0];
      expect(callArgs).not.toHaveProperty('tools');
    });

    it('should handle MCP configuration file not found', async () => {
      const fs = await import('fs');
      vi.mocked(fs.existsSync).mockReturnValue(false);

      mockRequest.json = vi.fn().mockResolvedValue({
        messages: [{ role: 'user', content: 'test' }],
        data: { showMCPTools: true }
      });

      const response = await handleChatRequestWithMCP(mockRequest as NextRequest);

      expect(response.status).toBe(200); // Should succeed without MCP config
    });

    it('should handle invalid MCP configuration JSON', async () => {
      const fs = await import('fs');
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('{ invalid json');

      mockRequest.json = vi.fn().mockResolvedValue({
        messages: [{ role: 'user', content: 'test' }],
        data: { showMCPTools: true }
      });

      const response = await handleChatRequestWithMCP(mockRequest as NextRequest);

      expect(response.status).toBe(200); // Should handle gracefully
    });

    it('should load and connect to MCP servers from config', async () => {
      const fs = await import('fs');
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        mcpServers: {
          filesystem: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem', '/default/path'],
            env: {}
          },
          git: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-git'],
            env: { GIT_CONFIG: '/path/to/config' }
          }
        }
      }));

      const mockServer1 = { id: 'fs-server', name: 'filesystem', status: 'connected' };
      const mockServer2 = { id: 'git-server', name: 'git', status: 'connected' };
      
      mockMCPClientManager.addServer
        .mockResolvedValueOnce(mockServer1)
        .mockResolvedValueOnce(mockServer2);

      mockRequest.json = vi.fn().mockResolvedValue({
        messages: [{ role: 'user', content: 'test' }],
        data: { showMCPTools: true }
      });

      await handleChatRequestWithMCP(mockRequest as NextRequest);

      expect(mockMCPClientManager.initialize).toHaveBeenCalled();
      expect(mockMCPClientManager.addServer).toHaveBeenCalledTimes(2);
      expect(mockMCPClientManager.connect).toHaveBeenCalledWith('fs-server');
      expect(mockMCPClientManager.connect).toHaveBeenCalledWith('git-server');
    });

    it('should filter MCP servers based on mcpServerFilter', async () => {
      const fs = await import('fs');
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        mcpServers: {
          filesystem: { command: 'npx', args: [] },
          git: { command: 'npx', args: [] },
          weather: { command: 'npx', args: [] }
        }
      }));

      const mockServer = { id: 'fs-server', name: 'filesystem', status: 'connected' };
      mockMCPClientManager.addServer.mockResolvedValue(mockServer);

      mockRequest.json = vi.fn().mockResolvedValue({
        messages: [{ role: 'user', content: 'test' }],
        data: { 
          showMCPTools: true,
          mcpServerFilter: ['filesystem'] // Only allow filesystem server
        }
      });

      await handleChatRequestWithMCP(mockRequest as NextRequest);

      expect(mockMCPClientManager.addServer).toHaveBeenCalledTimes(1);
      expect(mockMCPClientManager.addServer).toHaveBeenCalledWith({
        name: 'filesystem',
        transport: 'stdio',
        config: expect.objectContaining({
          command: 'npx',
          args: expect.any(Array)
        })
      });
    });

    it('should configure filesystem server with project root', async () => {
      const fs = await import('fs');
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        mcpServers: {
          filesystem: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem', '/default/path']
          }
        }
      }));

      const mockServer = { id: 'fs-server', name: 'filesystem', status: 'connected' };
      mockMCPClientManager.addServer.mockResolvedValue(mockServer);

      mockRequest.json = vi.fn().mockResolvedValue({
        messages: [{ role: 'user', content: 'test' }],
        data: { 
          showMCPTools: true,
          projectRoot: '/custom/project/path'
        }
      });

      await handleChatRequestWithMCP(mockRequest as NextRequest);

      expect(mockMCPClientManager.addServer).toHaveBeenCalledWith({
        name: 'filesystem',
        transport: 'stdio',
        config: expect.objectContaining({
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem', '/custom/project/path']
        })
      });
    });

    it('should configure git server with project root as repository', async () => {
      const fs = await import('fs');
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        mcpServers: {
          git: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-git']
          }
        }
      }));

      const mockServer = { id: 'git-server', name: 'git', status: 'connected' };
      mockMCPClientManager.addServer.mockResolvedValue(mockServer);

      mockRequest.json = vi.fn().mockResolvedValue({
        messages: [{ role: 'user', content: 'test' }],
        data: { 
          showMCPTools: true,
          projectRoot: '/my/git/repo'
        }
      });

      await handleChatRequestWithMCP(mockRequest as NextRequest);

      expect(mockMCPClientManager.addServer).toHaveBeenCalledWith({
        name: 'git',
        transport: 'stdio',
        config: expect.objectContaining({
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-git', '--repository', '/my/git/repo']
        })
      });
    });

    it('should load tools from connected MCP servers', async () => {
      const fs = await import('fs');
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        mcpServers: {
          filesystem: { command: 'npx', args: [] }
        }
      }));

      const mockServer = { id: 'fs-server', name: 'filesystem', status: 'connected' };
      mockMCPClientManager.addServer.mockResolvedValue(mockServer);
      mockMCPClientManager.getTools.mockResolvedValue([
        {
          name: 'read_file',
          description: 'Read a file from the filesystem',
          inputSchema: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'File path to read' }
            },
            required: ['path']
          }
        }
      ]);

      mockRequest.json = vi.fn().mockResolvedValue({
        messages: [{ role: 'user', content: 'test' }],
        data: { showMCPTools: true }
      });

      await handleChatRequestWithMCP(mockRequest as NextRequest);

      expect(mockMCPClientManager.getTools).toHaveBeenCalledWith('fs-server');
      
      const callArgs = mockStreamText.mock.calls[0][0];
      expect(callArgs).toHaveProperty('tools');
      expect(callArgs.tools).toHaveProperty('filesystem_read_file');
      expect(callArgs.maxSteps).toBe(10);
      expect(callArgs.toolChoice).toBe('auto');
    });

    it('should handle MCP server connection failures gracefully', async () => {
      const fs = await import('fs');
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        mcpServers: {
          filesystem: { command: 'npx', args: [] }
        }
      }));

      const mockServer = { id: 'fs-server', name: 'filesystem', status: 'disconnected' };
      mockMCPClientManager.addServer.mockResolvedValue(mockServer);
      mockMCPClientManager.connect.mockRejectedValue(new Error('Connection failed'));
      mockMCPClientManager.isConnected.mockReturnValue(false);

      mockRequest.json = vi.fn().mockResolvedValue({
        messages: [{ role: 'user', content: 'test' }],
        data: { showMCPTools: true }
      });

      const response = await handleChatRequestWithMCP(mockRequest as NextRequest);

      expect(response.status).toBe(200); // Should continue without failing
      expect(mockMCPClientManager.getTools).not.toHaveBeenCalled();
    });

    it('should handle MCP tool loading errors gracefully', async () => {
      const fs = await import('fs');
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        mcpServers: {
          filesystem: { command: 'npx', args: [] }
        }
      }));

      const mockServer = { id: 'fs-server', name: 'filesystem', status: 'connected' };
      mockMCPClientManager.addServer.mockResolvedValue(mockServer);
      mockMCPClientManager.getTools.mockRejectedValue(new Error('Failed to get tools'));

      mockRequest.json = vi.fn().mockResolvedValue({
        messages: [{ role: 'user', content: 'test' }],
        data: { showMCPTools: true }
      });

      const response = await handleChatRequestWithMCP(mockRequest as NextRequest);

      expect(response.status).toBe(200); // Should continue without failing
      
      const callArgs = mockStreamText.mock.calls[0][0];
      expect(callArgs).not.toHaveProperty('tools');
    });

    it('should add system message with project context when tools are loaded', async () => {
      const fs = await import('fs');
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        mcpServers: {
          filesystem: { command: 'npx', args: [] }
        }
      }));

      const mockServer = { id: 'fs-server', name: 'filesystem', status: 'connected' };
      mockMCPClientManager.addServer.mockResolvedValue(mockServer);
      mockMCPClientManager.getTools.mockResolvedValue([
        { name: 'read_file', inputSchema: { type: 'object', properties: {} } }
      ]);

      mockRequest.json = vi.fn().mockResolvedValue({
        messages: [{ role: 'user', content: 'test' }],
        data: { 
          showMCPTools: true,
          projectName: 'My Awesome Project',
          projectRoot: '/path/to/project'
        }
      });

      await handleChatRequestWithMCP(mockRequest as NextRequest);

      const callArgs = mockStreamText.mock.calls[0][0];
      const systemMessages = callArgs.messages.filter((msg: any) => msg.role === 'system');
      expect(systemMessages.length).toBe(1);
      expect(systemMessages[0].content).toContain('My Awesome Project');
      expect(systemMessages[0].content).toContain('/path/to/project');
    });
  });

  describe('Provider Selection', () => {
    it('should use Claude Code SDK when available and preferred', async () => {
      const mockClaudeModel = { name: 'claude-code-model' };
      mockShouldUseClaudeCodeSDK.mockReturnValue(true);
      mockCreateClaudeCodeProvider.mockReturnValue({
        createLanguageModel: vi.fn().mockReturnValue(mockClaudeModel)
      } as any);
      mockRequest.json = vi.fn().mockResolvedValue({
        messages: [{ role: 'user', content: 'test' }]
      });

      await handleChatRequestWithMCP(mockRequest as NextRequest);

      expect(mockCreateClaudeCodeProvider).toHaveBeenCalled();
      expect(mockStreamText).toHaveBeenCalledWith(
        expect.objectContaining({
          model: mockClaudeModel,
          messages: expect.any(Array),
          temperature: 0.7,
          maxOutputTokens: 4096,
        })
      );
    });

    it('should return error when Claude Code SDK fails', async () => {
      mockShouldUseClaudeCodeSDK.mockReturnValue(true);
      mockCreateClaudeCodeProvider.mockImplementation(() => {
        throw new Error('Claude Code SDK error');
      });
      mockRequest.json = vi.fn().mockResolvedValue({
        messages: [{ role: 'user', content: 'test' }]
      });

      const response = await handleChatRequestWithMCP(mockRequest as NextRequest);

      expect(response.status).toBe(500);
      expect(mockCreateAnthropicProviderWithModel).not.toHaveBeenCalled();
    });

    it('should use Anthropic API directly when Claude Code SDK not preferred', async () => {
      mockShouldUseClaudeCodeSDK.mockReturnValue(false);
      mockRequest.json = vi.fn().mockResolvedValue({
        messages: [{ role: 'user', content: 'test' }]
      });

      await handleChatRequestWithMCP(mockRequest as NextRequest);

      expect(mockCreateClaudeCodeProvider).not.toHaveBeenCalled();
      expect(mockCreateAnthropicProviderWithModel).toHaveBeenCalled();
    });
  });

  describe('Streaming Response Handling', () => {
    it('should use toUIMessageStreamResponse when available', async () => {
      mockRequest.json = vi.fn().mockResolvedValue({
        messages: [{ role: 'user', content: 'test' }]
      });

      const response = await handleChatRequestWithMCP(mockRequest as NextRequest);

      expect(mockResponse.toUIMessageStreamResponse).toHaveBeenCalled();
      expect(response.status).toBe(200);
    });

    it('should fallback to toDataStreamResponse', async () => {
      mockResponse.toUIMessageStreamResponse = undefined;
      mockResponse.toDataStreamResponse = vi.fn().mockReturnValue(new Response('data-stream'));
      
      mockRequest.json = vi.fn().mockResolvedValue({
        messages: [{ role: 'user', content: 'test' }]
      });

      await handleChatRequestWithMCP(mockRequest as NextRequest);

      expect(mockResponse.toDataStreamResponse).toHaveBeenCalled();
    });

    it('should fallback to toTextStreamResponse', async () => {
      mockResponse.toUIMessageStreamResponse = undefined;
      mockResponse.toDataStreamResponse = undefined;
      mockResponse.toTextStreamResponse = vi.fn().mockReturnValue(new Response('text-stream'));
      
      mockRequest.json = vi.fn().mockResolvedValue({
        messages: [{ role: 'user', content: 'test' }]
      });

      await handleChatRequestWithMCP(mockRequest as NextRequest);

      expect(mockResponse.toTextStreamResponse).toHaveBeenCalled();
    });

    it('should throw error when no streaming method is available', async () => {
      mockResponse.toUIMessageStreamResponse = undefined;
      mockResponse.toDataStreamResponse = undefined;
      mockResponse.toTextStreamResponse = undefined;
      
      mockRequest.json = vi.fn().mockResolvedValue({
        messages: [{ role: 'user', content: 'test' }]
      });

      const response = await handleChatRequestWithMCP(mockRequest as NextRequest);

      expect(response.status).toBe(500);
      const responseBody = await response.json();
      expect(responseBody.error).toContain('No valid streaming response method available');
    });
  });

  describe('Project Context Handling', () => {
    it('should not add project context when tools are not enabled', async () => {
      mockRequest.json = vi.fn().mockResolvedValue({
        messages: [{ role: 'user', content: 'test' }],
        data: { 
          showMCPTools: false,
          projectName: 'My Project',
          projectRoot: '/path/to/project'
        }
      });

      await handleChatRequestWithMCP(mockRequest as NextRequest);

      const callArgs = mockStreamText.mock.calls[0][0];
      const systemMessages = callArgs.messages.filter((msg: any) => msg.role === 'system');
      expect(systemMessages.length).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle streamText errors gracefully', async () => {
      mockStreamText.mockImplementation(() => {
        throw new Error('Streaming failed');
      });
      mockRequest.json = vi.fn().mockResolvedValue({
        messages: [{ role: 'user', content: 'test' }]
      });

      const response = await handleChatRequestWithMCP(mockRequest as NextRequest);

      expect(response.status).toBe(500);
      const responseBody = await response.json();
      expect(responseBody.error).toBe('Streaming failed');
      expect(responseBody.details).toBeDefined();
    });

    it('should handle provider creation errors', async () => {
      mockCreateAnthropicProviderWithModel.mockImplementation(() => {
        throw new Error('Provider creation failed');
      });
      mockRequest.json = vi.fn().mockResolvedValue({
        messages: [{ role: 'user', content: 'test' }]
      });

      const response = await handleChatRequestWithMCP(mockRequest as NextRequest);

      expect(response.status).toBe(500);
      const responseBody = await response.json();
      expect(responseBody.error).toBe('Provider creation failed');
    });

    it('should handle non-Error objects thrown', async () => {
      mockRequest.json = vi.fn().mockRejectedValue('String error');

      const response = await handleChatRequestWithMCP(mockRequest as NextRequest);

      expect(response.status).toBe(500);
      const responseBody = await response.json();
      expect(responseBody.error).toBe('Internal server error'); // Since string doesn't have .message
    });
  });
});