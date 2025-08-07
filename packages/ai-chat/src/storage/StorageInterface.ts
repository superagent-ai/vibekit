import { ChatSession, ChatMessage } from '../types';

export interface StorageInterface {
  initialize(): Promise<void>;
  createSession(options: { title: string; projectId?: string }): Promise<ChatSession>;
  saveSession(session: ChatSession): Promise<void>;
  loadSession(id: string): Promise<ChatSession | null>;
  deleteSession(id: string): Promise<void>;
  listSessions(): Promise<ChatSession[]>;
  appendMessage(sessionId: string, message: ChatMessage): Promise<void>;
  updateSession(id: string, updates: Partial<ChatSession>): Promise<void>;
}