/**
 * Factory functions for creating decoupled chat components
 * This allows users to mix and match different implementations
 */

import { ChatClientV2, IProvider, IStorage, IToolAdapter } from '../client/ChatClientV2';
import { ChatClientOptions } from '../types';

export interface ChatFactoryConfig {
  // Provider configuration
  provider?: 'claude' | 'openai' | 'custom';
  providerOptions?: any;
  
  // Storage configuration  
  storage?: 'json' | 'sqlite' | 'postgres' | 'memory' | 'custom';
  storageOptions?: any;
  
  // Tool configuration
  tools?: 'mcp' | 'langchain' | 'custom' | 'none';
  toolOptions?: any;
  
  // Additional features
  features?: {
    rateLimiting?: boolean;
    validation?: boolean;
    logging?: boolean;
    metrics?: boolean;
    sessionManagement?: boolean;
  };
  
  // Environment
  environment?: 'development' | 'production';
}

/**
 * Create a provider based on configuration
 */
export async function createProvider(
  type: string = 'claude',
  options?: any
): Promise<IProvider> {
  switch (type) {
    case 'claude': {
      const { ClaudeProvider } = await import('../providers/claude');
      return new ClaudeProvider(options);
    }
    
    case 'openai': {
      // Future: OpenAI provider
      throw new Error('OpenAI provider not yet implemented');
    }
    
    case 'custom':
      if (!options?.implementation) {
        throw new Error('Custom provider requires implementation');
      }
      return options.implementation;
    
    default:
      throw new Error(`Unknown provider type: ${type}`);
  }
}

/**
 * Create storage based on configuration
 */
export async function createStorage(
  type: string = 'json',
  options?: any
): Promise<IStorage> {
  switch (type) {
    case 'json': {
      const { ChatStorage } = await import('../storage/ChatStorage');
      return new ChatStorage(options?.path);
    }
    
    case 'memory': {
      // In-memory storage for testing
      const { MemoryStorage } = await import('../storage/MemoryStorage');
      return new MemoryStorage();
    }
    
    case 'sqlite': {
      // Future: SQLite storage
      throw new Error('SQLite storage not yet implemented');
    }
    
    case 'postgres': {
      // Future: PostgreSQL storage
      throw new Error('PostgreSQL storage not yet implemented');
    }
    
    case 'custom':
      if (!options?.implementation) {
        throw new Error('Custom storage requires implementation');
      }
      return options.implementation;
    
    default:
      throw new Error(`Unknown storage type: ${type}`);
  }
}

/**
 * Create tool adapter based on configuration
 */
export async function createToolAdapter(
  type: string = 'mcp',
  options?: any
): Promise<IToolAdapter | undefined> {
  switch (type) {
    case 'none':
      return undefined;
    
    case 'mcp': {
      const { MCPClientManager } = await import('@vibe-kit/mcp-client');
      const { MCPToAISDKAdapter } = await import('../adapters/mcp-to-ai-sdk');
      const manager = new MCPClientManager(options);
      return new MCPToAISDKAdapter(manager);
    }
    
    case 'langchain': {
      // Future: LangChain tools
      throw new Error('LangChain adapter not yet implemented');
    }
    
    case 'custom':
      if (!options?.implementation) {
        throw new Error('Custom tool adapter requires implementation');
      }
      return options.implementation;
    
    default:
      throw new Error(`Unknown tool adapter type: ${type}`);
  }
}

/**
 * Create additional features based on configuration
 */
export async function createFeatures(config: ChatFactoryConfig['features']) {
  const features: any = {};
  
  if (config?.rateLimiting) {
    const { RateLimiter } = await import('../utils/rate-limiter');
    features.rateLimiter = new RateLimiter({
      maxRequests: 100,
      windowMs: 60000,
    });
  }
  
  if (config?.validation) {
    const validation = await import('../utils/validation');
    features.validator = {
      validateMessage: validation.validateMessageContent,
    };
  }
  
  if (config?.logging) {
    const { ConsoleLogger } = await import('../utils/logger');
    features.logger = new ConsoleLogger('ai-chat');
  }
  
  if (config?.metrics) {
    const { MetricsCollector } = await import('../utils/logger');
    features.metrics = new MetricsCollector();
  }
  
  if (config?.sessionManagement) {
    const { SessionManager } = await import('../utils/session-manager');
    // Note: SessionManager needs storage instance
    features.sessionManager = SessionManager;
  }
  
  return features;
}

/**
 * Main factory function to create a fully configured ChatClient
 */
export async function createChatClient(
  config: ChatFactoryConfig = {}
): Promise<ChatClientV2> {
  // Set defaults based on environment
  const environment = config.environment || 'development';
  const defaults = environment === 'production' ? {
    provider: 'claude' as const,
    storage: 'json' as const,
    tools: 'mcp' as const,
    features: {
      rateLimiting: true,
      validation: true,
      logging: true,
      metrics: true,
      sessionManagement: true,
    },
  } : {
    provider: 'claude' as const,
    storage: 'json' as const,
    tools: 'mcp' as const,
    features: {
      logging: true,
    },
  };
  
  // Merge with user config
  const finalConfig = {
    ...defaults,
    ...config,
    features: {
      ...defaults.features,
      ...config.features,
    },
  };
  
  // Create components
  const [provider, storage, toolAdapter, features] = await Promise.all([
    createProvider(finalConfig.provider, finalConfig.providerOptions),
    createStorage(finalConfig.storage, finalConfig.storageOptions),
    createToolAdapter(finalConfig.tools || 'none', finalConfig.toolOptions),
    createFeatures(finalConfig.features),
  ]);
  
  // Create client with dependencies
  return new ChatClientV2(
    {
      provider,
      storage,
      toolAdapter,
      ...features,
    },
    finalConfig.providerOptions
  );
}

/**
 * Convenience function for creating a minimal client
 */
export async function createMinimalChatClient(): Promise<ChatClientV2> {
  return createChatClient({
    provider: 'claude',
    storage: 'memory',
    tools: 'none',
    features: {},
  });
}

/**
 * Convenience function for creating a production client
 */
export async function createProductionChatClient(): Promise<ChatClientV2> {
  return createChatClient({
    environment: 'production',
  });
}