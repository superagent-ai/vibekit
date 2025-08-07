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
  getModelId(): string | Promise<string>;
  getAuthStatus(): Promise<{ authenticated: boolean; method: string }> | { authenticated: boolean; method: string | null };
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
  executeTool?(name: string, args: any): Promise<any>;
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
 * Modular ChatClient with dependency injection
 * All dependencies are injected via interfaces, making it highly testable and flexible
 */
export class ChatClient {
  private provider: IProvider;
  private storage: IStorage;
  private toolAdapter?: IToolAdapter;
  private logger?: any;
  private rateLimiter?: any;
  private validator?: any;
  private initialized = false;

  constructor(
    dependencies: ChatClientDependencies = {},
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
    
    this.logger?.log('Initializing ChatClient...');
    
    await Promise.all([
      this.provider.initialize(),
      this.storage.initialize(),
    ]);
    
    this.initialized = true;
    this.logger?.log('ChatClient initialized');
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
      const isValid = this.validator.validateMessage(message);
      if (!isValid) {
        throw new Error('Invalid message content');
      }
    }
    
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

    // Get tools if adapter is available and enabled
    const tools = options.tools !== false && this.toolAdapter 
      ? await this.toolAdapter.getTools() 
      : {};

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
      model: client.languageModel(modelId),
      messages: coreMessages,
      tools: Object.keys(tools).length > 0 ? tools : undefined,
      onStepFinish: options.onStepFinish,
      maxSteps: options.maxSteps || 5,
    });

    // Store the response
    const assistantMessage: ChatMessage = {
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
    };

    // Collect the full response
    let fullContent = '';
    for await (const chunk of result.textStream) {
      fullContent += chunk;
      if (options.onChunk) {
        options.onChunk(chunk);
      }
    }

    assistantMessage.content = fullContent;
    await this.storage.appendMessage(sessionId, assistantMessage);

    return assistantMessage;
  }

  async createSession(title?: string): Promise<ChatSession> {
    await this.initialize();
    return this.storage.createSession({
      title: title || `Chat ${new Date().toLocaleDateString()}`,
    });
  }

  async loadSession(sessionId: string): Promise<ChatSession | null> {
    await this.initialize();
    return this.storage.loadSession(sessionId);
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.initialize();
    return this.storage.deleteSession(sessionId);
  }

  async listSessions(): Promise<ChatSession[]> {
    await this.initialize();
    return this.storage.listSessions();
  }

  async getAuthStatus() {
    await this.initialize();
    return this.provider.getAuthStatus();
  }

  // Get the underlying dependencies for advanced use cases
  getProvider(): IProvider {
    return this.provider;
  }

  getStorage(): IStorage {
    return this.storage;
  }

  getToolAdapter(): IToolAdapter | undefined {
    return this.toolAdapter;
  }
}