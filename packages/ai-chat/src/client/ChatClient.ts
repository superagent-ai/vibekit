import { streamText, convertToCoreMessages } from 'ai';
import { MCPClientManager } from '@vibe-kit/mcp-client';
import { ClaudeProvider } from '../providers/claude';
import { MCPToAISDKAdapter } from '../adapters/mcp-to-ai-sdk';
import { ChatStorage } from '../storage/ChatStorage';
import { 
  ChatSession, 
  ChatMessage, 
  SendMessageOptions,
  ChatClientOptions 
} from '../types';

export class ChatClient {
  private serverManager: MCPClientManager;
  private provider: ClaudeProvider;
  private storage: ChatStorage;
  private mcpAdapter: MCPToAISDKAdapter;
  private initialized = false;

  constructor(options: ChatClientOptions = {}) {
    this.serverManager = new MCPClientManager();
    this.provider = new ClaudeProvider();
    this.storage = new ChatStorage(options.storageDir);
    this.mcpAdapter = new MCPToAISDKAdapter(this.serverManager);
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    await this.provider.initialize();
    await this.storage.initialize();
    this.initialized = true;
  }

  async sendMessage(
    message: string, 
    sessionId: string,
    options: SendMessageOptions = {}
  ) {
    await this.initialize();
    
    const session = await this.storage.loadSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Add user message to storage immediately
    const userMessage: ChatMessage = {
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    };
    await this.storage.appendMessage(sessionId, userMessage);

    // Get the Claude client
    const client = await this.provider.getClient();
    const modelId = await this.provider.getModelId();

    // Get MCP tools if enabled
    const tools = options.tools !== false ? await this.mcpAdapter.getTools() : {};

    // Convert chat messages to core messages format
    const coreMessages = convertToCoreMessages(
      session.messages.map(msg => ({
        role: msg.role as any,
        content: msg.content,
      }))
    );

    // Add the new user message
    coreMessages.push({
      role: 'user',
      content: message,
    });

    // Stream the response
    const result = await streamText({
      model: client(modelId),
      messages: coreMessages,
      tools: Object.keys(tools).length > 0 ? tools : undefined,
      temperature: options.temperature ?? 0.7,
      maxTokens: options.maxTokens ?? 4096,
      onFinish: async ({ text, toolCalls, toolResults }) => {
        // Save assistant message to storage
        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: text || '',
          timestamp: new Date().toISOString(),
          toolCalls: toolCalls as any,
          toolResults: toolResults as any,
        };
        await this.storage.appendMessage(sessionId, assistantMessage);

        // Update session metadata with connected MCP servers
        const allServers = this.serverManager.getAllServers();
        const connectedServers = allServers.filter(s => this.serverManager.isConnected(s.id));
        await this.storage.updateSession(sessionId, {
          metadata: {
            model: modelId,
            mcpServers: connectedServers.map(s => s.name),
          },
        });
      },
    });

    return result;
  }

  async createSession(title?: string): Promise<ChatSession> {
    await this.initialize();
    
    let projectId: string | undefined;
    try {
      // Try to get current project if available
      const { getCurrentProject } = await import('@vibe-kit/projects');
      const project = await getCurrentProject();
      projectId = project?.id;
    } catch {
      // Projects package not available, continue without project ID
    }
    
    return this.storage.createSession({
      title: title || `Chat ${new Date().toLocaleDateString()}`,
      projectId,
    });
  }

  async listSessions(): Promise<ChatSession[]> {
    await this.initialize();
    return this.storage.listSessions();
  }

  async loadSession(id: string): Promise<ChatSession | null> {
    await this.initialize();
    return this.storage.loadSession(id);
  }

  async deleteSession(id: string): Promise<void> {
    await this.initialize();
    return this.storage.deleteSession(id);
  }

  async renameSession(id: string, title: string): Promise<void> {
    await this.initialize();
    return this.storage.updateSession(id, { title });
  }

  async clearSession(id: string): Promise<void> {
    await this.initialize();
    const session = await this.storage.loadSession(id);
    if (!session) {
      throw new Error(`Session ${id} not found`);
    }
    
    session.messages = [];
    session.updatedAt = new Date().toISOString();
    await this.storage.saveSession(session);
  }

  // MCP Server management
  async getAvailableServers() {
    return this.mcpAdapter.getAvailableServers();
  }

  async connectMCPServer(serverId: string) {
    return this.mcpAdapter.connectServer(serverId);
  }

  async disconnectMCPServer(serverId: string) {
    return this.mcpAdapter.disconnectServer(serverId);
  }

  async getConnectedServers() {
    const allServers = this.serverManager.getAllServers();
    return allServers.filter(s => this.serverManager.isConnected(s.id));
  }

  // Get authentication status
  getAuthStatus() {
    return this.provider.getAuthStatus();
  }
}