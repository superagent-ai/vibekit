// Main component export
export { ChatInterface } from './components/ChatInterface';
export type { ChatInterfaceProps } from './components/ChatInterface';

// AI Elements exports
export { 
  Tool, 
  ToolHeader, 
  ToolContent, 
  ToolInput, 
  ToolOutput, 
  ToolSection,
  type ToolState 
} from './components/ai-elements/tool';

// Hooks
export { useChat, useAuthStatus } from './hooks';
export type { ChatOptions } from './hooks';

// Utilities
export { AuthManager } from './utils/auth';
export { DEFAULT_MODELS, DEFAULT_CHAT_CONFIG } from './utils/config';

// Types
export type { 
  AuthStatus, 
  ModelConfig, 
  ChatConfig,
  AIProvider,
} from './types';

// Providers (for advanced users)
export { AnthropicProvider } from './providers';