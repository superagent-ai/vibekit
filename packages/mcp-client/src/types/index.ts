export * from './server';
export * from './tools';

export interface MCPClientConfig {
  configPath?: string;
  autoConnect?: boolean;
  reconnectAttempts?: number;
  reconnectDelay?: number;
}

export interface ConnectionOptions {
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
}