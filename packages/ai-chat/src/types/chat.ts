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
    projectId?: string;
    userId?: string;
    [key: string]: any;
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
  onChunk?: (chunk: string) => void;
  onStepFinish?: (step: any) => void;
  maxSteps?: number;
}

export interface ChatClientOptions {
  storageDir?: string;
  provider?: 'claude' | 'openai' | 'gemini';
}