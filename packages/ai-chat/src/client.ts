// Client-only exports (no server-side dependencies)

// Main component export
export { ChatInterface } from './components/ChatInterface';
export type { ChatInterfaceProps } from './components/ChatInterface';

// Hooks (client-safe)
export { useChat, useAuthStatus } from './hooks';
export type { ChatOptions } from './hooks';

// Config exports (client-safe)
export { DEFAULT_MODELS, DEFAULT_CHAT_CONFIG } from './utils/config';

// Types (client-safe)
export type { 
  ModelConfig, 
  ChatConfig,
  AIProvider,
} from './types';