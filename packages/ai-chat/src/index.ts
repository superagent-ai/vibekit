// Client
export { ChatClient, type IProvider, type IStorage, type IToolAdapter, type ChatClientDependencies } from './client/ChatClient';
export * from './client/streaming';

// Providers
export { ClaudeProvider } from './providers/claude';
export { BaseProvider, type AuthStatus } from './providers/base';

// Storage
export { ChatStorage } from './storage/ChatStorage';
export { MemoryStorage } from './storage/MemoryStorage';
export { type StorageInterface } from './storage/StorageInterface';

// Adapters
export { MCPToAISDKAdapter } from './adapters/mcp-to-ai-sdk';

// Types
export * from './types';

// Utils
export { cn } from './utils/cn';
export * from './utils/retry';
export * from './utils/rate-limiter';
export * from './utils/validation';
export * from './utils/logger';
export * from './utils/session-manager';

// Config
export { productionConfig } from './config/production';

// Factory functions for dependency injection
export * from './factory';

// Plugin system for extensibility  
export * from './plugins';

// API handlers
export { POST as chatHandler } from './api/chat';

// Components (re-export for convenience)
export * from './components';