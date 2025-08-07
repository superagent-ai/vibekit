/**
 * Plugin system for extending chat functionality
 * Allows for modular extensions without modifying core code
 */

import { ChatMessage, ChatSession } from '../types';

export interface ChatPlugin {
  name: string;
  version: string;
  
  // Lifecycle hooks
  onInitialize?(): Promise<void>;
  onDestroy?(): Promise<void>;
  
  // Message hooks
  beforeSendMessage?(message: string, sessionId: string): Promise<string>;
  afterSendMessage?(message: ChatMessage, sessionId: string): Promise<void>;
  
  // Response hooks
  beforeProcessResponse?(response: any): Promise<any>;
  afterProcessResponse?(response: ChatMessage): Promise<void>;
  
  // Session hooks
  onSessionCreate?(session: ChatSession): Promise<void>;
  onSessionDelete?(sessionId: string): Promise<void>;
  onSessionUpdate?(session: ChatSession): Promise<void>;
  
  // Tool hooks
  beforeToolCall?(toolName: string, args: any): Promise<any>;
  afterToolCall?(toolName: string, result: any): Promise<void>;
  
  // Error hooks
  onError?(error: Error, context: any): Promise<void>;
}

export class PluginManager {
  private plugins: Map<string, ChatPlugin> = new Map();
  private initialized = false;
  
  register(plugin: ChatPlugin): void {
    if (this.plugins.has(plugin.name)) {
      throw new Error(`Plugin ${plugin.name} is already registered`);
    }
    
    this.plugins.set(plugin.name, plugin);
    console.log(`Registered plugin: ${plugin.name} v${plugin.version}`);
  }
  
  unregister(name: string): void {
    this.plugins.delete(name);
  }
  
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    for (const plugin of this.plugins.values()) {
      if (plugin.onInitialize) {
        await plugin.onInitialize();
      }
    }
    
    this.initialized = true;
  }
  
  async destroy(): Promise<void> {
    for (const plugin of this.plugins.values()) {
      if (plugin.onDestroy) {
        await plugin.onDestroy();
      }
    }
    
    this.plugins.clear();
    this.initialized = false;
  }
  
  // Hook execution methods
  
  async executeBeforeSendMessage(message: string, sessionId: string): Promise<string> {
    let processedMessage = message;
    
    for (const plugin of this.plugins.values()) {
      if (plugin.beforeSendMessage) {
        processedMessage = await plugin.beforeSendMessage(processedMessage, sessionId);
      }
    }
    
    return processedMessage;
  }
  
  async executeAfterSendMessage(message: ChatMessage, sessionId: string): Promise<void> {
    for (const plugin of this.plugins.values()) {
      if (plugin.afterSendMessage) {
        await plugin.afterSendMessage(message, sessionId);
      }
    }
  }
  
  async executeBeforeProcessResponse(response: any): Promise<any> {
    let processedResponse = response;
    
    for (const plugin of this.plugins.values()) {
      if (plugin.beforeProcessResponse) {
        processedResponse = await plugin.beforeProcessResponse(processedResponse);
      }
    }
    
    return processedResponse;
  }
  
  async executeAfterProcessResponse(response: ChatMessage): Promise<void> {
    for (const plugin of this.plugins.values()) {
      if (plugin.afterProcessResponse) {
        await plugin.afterProcessResponse(response);
      }
    }
  }
  
  async executeOnSessionCreate(session: ChatSession): Promise<void> {
    for (const plugin of this.plugins.values()) {
      if (plugin.onSessionCreate) {
        await plugin.onSessionCreate(session);
      }
    }
  }
  
  async executeOnSessionDelete(sessionId: string): Promise<void> {
    for (const plugin of this.plugins.values()) {
      if (plugin.onSessionDelete) {
        await plugin.onSessionDelete(sessionId);
      }
    }
  }
  
  async executeOnSessionUpdate(session: ChatSession): Promise<void> {
    for (const plugin of this.plugins.values()) {
      if (plugin.onSessionUpdate) {
        await plugin.onSessionUpdate(session);
      }
    }
  }
  
  async executeBeforeToolCall(toolName: string, args: any): Promise<any> {
    let processedArgs = args;
    
    for (const plugin of this.plugins.values()) {
      if (plugin.beforeToolCall) {
        processedArgs = await plugin.beforeToolCall(toolName, processedArgs);
      }
    }
    
    return processedArgs;
  }
  
  async executeAfterToolCall(toolName: string, result: any): Promise<void> {
    for (const plugin of this.plugins.values()) {
      if (plugin.afterToolCall) {
        await plugin.afterToolCall(toolName, result);
      }
    }
  }
  
  async executeOnError(error: Error, context: any): Promise<void> {
    for (const plugin of this.plugins.values()) {
      if (plugin.onError) {
        await plugin.onError(error, context);
      }
    }
  }
  
  getPlugin(name: string): ChatPlugin | undefined {
    return this.plugins.get(name);
  }
  
  listPlugins(): string[] {
    return Array.from(this.plugins.keys());
  }
}

// Example plugins

/**
 * Analytics plugin - tracks usage metrics
 */
export class AnalyticsPlugin implements ChatPlugin {
  name = 'analytics';
  version = '1.0.0';
  
  private messageCount = 0;
  private sessionCount = 0;
  private toolCallCount = 0;
  
  async afterSendMessage(message: ChatMessage, sessionId: string): Promise<void> {
    this.messageCount++;
    console.log(`Analytics: Message sent (total: ${this.messageCount})`);
  }
  
  async onSessionCreate(session: ChatSession): Promise<void> {
    this.sessionCount++;
    console.log(`Analytics: Session created (total: ${this.sessionCount})`);
  }
  
  async afterToolCall(toolName: string, result: any): Promise<void> {
    this.toolCallCount++;
    console.log(`Analytics: Tool called - ${toolName} (total: ${this.toolCallCount})`);
  }
  
  getStats() {
    return {
      messages: this.messageCount,
      sessions: this.sessionCount,
      toolCalls: this.toolCallCount,
    };
  }
}

/**
 * Moderation plugin - filters inappropriate content
 */
export class ModerationPlugin implements ChatPlugin {
  name = 'moderation';
  version = '1.0.0';
  
  private blockedTerms = ['spam', 'abuse'];
  
  async beforeSendMessage(message: string, sessionId: string): Promise<string> {
    for (const term of this.blockedTerms) {
      if (message.toLowerCase().includes(term)) {
        throw new Error('Message contains inappropriate content');
      }
    }
    return message;
  }
  
  async beforeProcessResponse(response: any): Promise<any> {
    // Could integrate with external moderation API
    return response;
  }
}

/**
 * Caching plugin - caches responses for repeated questions
 */
export class CachingPlugin implements ChatPlugin {
  name = 'caching';
  version = '1.0.0';
  
  private cache = new Map<string, ChatMessage>();
  private maxCacheSize = 100;
  
  async beforeSendMessage(message: string, sessionId: string): Promise<string> {
    const cached = this.cache.get(this.getCacheKey(message));
    if (cached) {
      console.log('Cache hit for message:', message.substring(0, 50));
      // In a real implementation, would return cached response
    }
    return message;
  }
  
  async afterProcessResponse(response: ChatMessage): Promise<void> {
    if (this.cache.size >= this.maxCacheSize) {
      // Remove oldest entry
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    
    // Cache the response
    // In real implementation, would associate with the original message
    this.cache.set(this.getCacheKey(response.content), response);
  }
  
  private getCacheKey(message: string): string {
    return message.toLowerCase().trim();
  }
}