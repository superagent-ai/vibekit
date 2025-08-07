import { v4 as uuidv4 } from 'uuid';
import { ChatSession, ChatMessage } from '../types';
import { IStorage } from '../client/ChatClientV2';

/**
 * In-memory storage implementation
 * Useful for testing and development where persistence isn't needed
 */
export class MemoryStorage implements IStorage {
  private sessions: Map<string, ChatSession> = new Map();
  
  async initialize(): Promise<void> {
    // No initialization needed for memory storage
  }
  
  async createSession(data: { 
    title?: string; 
    projectId?: string;
    metadata?: Record<string, any>;
  }): Promise<ChatSession> {
    const session: ChatSession = {
      id: uuidv4(),
      title: data.title || `Chat ${new Date().toLocaleDateString()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
      metadata: {
        ...data.metadata,
        projectId: data.projectId,
        model: 'claude-3-5-sonnet-20241022',
        mcpServers: [],
      },
    };
    
    this.sessions.set(session.id, session);
    return session;
  }
  
  async loadSession(id: string): Promise<ChatSession | null> {
    return this.sessions.get(id) || null;
  }
  
  async saveSession(session: ChatSession): Promise<void> {
    session.updatedAt = new Date().toISOString();
    this.sessions.set(session.id, session);
  }
  
  async deleteSession(id: string): Promise<void> {
    this.sessions.delete(id);
  }
  
  async listSessions(): Promise<ChatSession[]> {
    return Array.from(this.sessions.values())
      .sort((a, b) => 
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
  }
  
  async appendMessage(sessionId: string, message: ChatMessage): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    
    session.messages.push(message);
    session.updatedAt = new Date().toISOString();
    this.sessions.set(sessionId, session);
  }
  
  // Additional utility methods
  
  async clear(): Promise<void> {
    this.sessions.clear();
  }
  
  async export(): Promise<Record<string, ChatSession>> {
    return Object.fromEntries(this.sessions);
  }
  
  async import(data: Record<string, ChatSession>): Promise<void> {
    this.sessions = new Map(Object.entries(data));
  }
  
  get size(): number {
    return this.sessions.size;
  }
}