import { Message } from 'ai';

export interface MessagePart {
  type: 'text' | 'tool-call' | 'tool-result' | 'image' | 'code';
  content?: string;
  toolName?: string;
  toolCallId?: string;
  args?: any;
  result?: any;
  language?: string;
  imageUrl?: string;
}

export interface ExtendedMessage extends Message {
  parts?: MessagePart[];
}

export interface MessageMetadata {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  processingTime?: number;
  tokenCount?: number;
}