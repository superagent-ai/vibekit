import { streamText, convertToCoreMessages } from 'ai';
import { 
  ChatSession, 
  ChatMessage, 
  SendMessageOptions,
  ChatClientOptions 
} from '../types';

// Define interfaces for better decoupling
export interface IProvider {
  initialize(): Promise<void>;
  getClient(): Promise<any>;
  getModelId(): string;
  getAuthStatus(): Promise<{ authenticated: boolean; method: string }>;
}

export interface IStorage {
  initialize(): Promise<void>;
  createSession(data: any): Promise<ChatSession>;
  loadSession(id: string): Promise<ChatSession | null>;
  saveSession(session: ChatSession): Promise<void>;
  deleteSession(id: string): Promise<void>;
  listSessions(): Promise<ChatSession[]>;
  appendMessage(sessionId: string, message: ChatMessage): Promise<void>;
}

export interface IToolAdapter {
  getTools(): Promise<Record<string, any>>;
  executeTool(name: string, args: any): Promise<any>;
}

export interface ChatClientDependencies {
  provider?: IProvider;
  storage?: IStorage;
  toolAdapter?: IToolAdapter;
  logger?: any;
  rateLimiter?: any;
  validator?: any;
}

/**
 * Decoupled ChatClient with dependency injection
 * All dependencies are injected via interfaces, making it highly testable and flexible
 */
export class ChatClientV2 {
  private provider: IProvider;
  private storage: IStorage;
  private toolAdapter?: IToolAdapter;
  private logger?: any;
  private rateLimiter?: any;
  private validator?: any;
  private initialized = false;

  constructor(
    dependencies: ChatClientDependencies,
    private options: ChatClientOptions = {}
  ) {
    // Use provided dependencies or create defaults
    this.provider = dependencies.provider || this.createDefaultProvider();
    this.storage = dependencies.storage || this.createDefaultStorage();
    this.toolAdapter = dependencies.toolAdapter;
    this.logger = dependencies.logger;
    this.rateLimiter = dependencies.rateLimiter;
    this.validator = dependencies.validator;
  }

  private createDefaultProvider(): IProvider {
    // Lazy load to avoid circular dependencies
    const { ClaudeProvider } = require('../providers/claude');
    return new ClaudeProvider();
  }

  private createDefaultStorage(): IStorage {
    // Lazy load to avoid circular dependencies
    const { ChatStorage } = require('../storage/ChatStorage');
    return new ChatStorage(this.options.storageDir);
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    await this.provider.initialize();
    await this.storage.initialize();
    this.initialized = true;
    
    this.logger?.info('ChatClient initialized');
  }

  async sendMessage(
    message: string, 
    sessionId: string,
    options: SendMessageOptions = {}
  ) {
    await this.initialize();
    
    // Rate limiting
    if (this.rateLimiter) {
      const allowed = await this.rateLimiter.checkLimit(sessionId);
      if (!allowed) {
        throw new Error('Rate limit exceeded');
      }
    }
    
    // Validation
    if (this.validator) {
      const validation = this.validator.validateMessage(message);
      if (!validation.valid) {
        throw new Error(`Invalid message: ${validation.error}`);
      }
      message = validation.sanitized || message;
    }
    
    const session = await this.storage.loadSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Add user message to storage
    const userMessage: ChatMessage = {
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    };
    
    await this.storage.appendMessage(sessionId, userMessage);

    // Get AI client and tools
    const client = await this.provider.getClient();
    const modelId = this.provider.getModelId();
    const tools = this.toolAdapter ? await this.toolAdapter.getTools() : undefined;

    // Convert messages for AI SDK
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
      tools: tools && Object.keys(tools).length > 0 ? tools : undefined,
      temperature: options.temperature ?? 0.7,
      maxTokens: options.maxTokens ?? 4096,
      onFinish: async ({ text, toolCalls, toolResults }) => {
        // Save assistant message
        await this.storage.appendMessage(sessionId, {
          role: 'assistant',
          content: text || '',
          timestamp: new Date().toISOString(),
          toolCalls: toolCalls as any,
          toolResults: toolResults as any,
        });
        
        this.logger?.info('Message completed', { sessionId, toolCalls: toolCalls?.length });
      },
    });

    return result;
  }

  async createSession(title?: string): Promise<ChatSession> {
    await this.initialize();
    
    let projectId: string | undefined;
    try {
      // Dynamic import to keep it optional
      const { getCurrentProject } = await import('@vibe-kit/projects');
      const project = await getCurrentProject();
      projectId = project?.id;
    } catch {
      // Projects package not available
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
    await this.storage.deleteSession(id);
  }

  async renameSession(id: string, title: string): Promise<void> {
    await this.initialize();
    const session = await this.storage.loadSession(id);
    if (!session) {
      throw new Error(`Session ${id} not found`);
    }
    
    session.title = title;
    session.updatedAt = new Date().toISOString();
    await this.storage.saveSession(session);
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

  async getAuthStatus() {
    await this.initialize();
    return this.provider.getAuthStatus();
  }
}