export interface ChatSession {
  id: string;
  title: string;
  projectId?: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
  metadata?: {
    model?: string;
    mcpServers?: string[];
  };
}

export interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: any;
}

export interface ToolResult {
  id: string;
  result: any;
  error?: string;
}

export interface SendMessageOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: boolean;
}

export interface ChatClientOptions {
  storageDir?: string;
  provider?: 'claude' | 'openai' | 'gemini';
}