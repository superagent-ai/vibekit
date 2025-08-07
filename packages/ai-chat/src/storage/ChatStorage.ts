import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { ChatSession, ChatMessage } from '../types';
import { StorageInterface } from './StorageInterface';

export class ChatStorage implements StorageInterface {
  private chatDir: string;

  constructor(customDir?: string) {
    this.chatDir = customDir || path.join(os.homedir(), '.vibekit', 'chats');
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.chatDir, { recursive: true });
  }

  async createSession(options: { title: string; projectId?: string }): Promise<ChatSession> {
    await this.initialize();
    
    const session: ChatSession = {
      id: uuidv4(),
      title: options.title,
      projectId: options.projectId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
      metadata: {
        model: 'claude-3-5-sonnet-20241022',
        mcpServers: [],
      },
    };

    await this.saveSession(session);
    return session;
  }

  async saveSession(session: ChatSession): Promise<void> {
    await this.initialize();
    const filePath = path.join(this.chatDir, `${session.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(session, null, 2), 'utf-8');
  }

  async loadSession(id: string): Promise<ChatSession | null> {
    try {
      const filePath = path.join(this.chatDir, `${id}.json`);
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as ChatSession;
    } catch (error) {
      // Session doesn't exist
      return null;
    }
  }

  async deleteSession(id: string): Promise<void> {
    try {
      const filePath = path.join(this.chatDir, `${id}.json`);
      await fs.unlink(filePath);
    } catch (error) {
      // Ignore if file doesn't exist
    }
  }

  async listSessions(): Promise<ChatSession[]> {
    await this.initialize();
    
    try {
      const files = await fs.readdir(this.chatDir);
      const sessions: ChatSession[] = [];

      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const content = await fs.readFile(path.join(this.chatDir, file), 'utf-8');
            const session = JSON.parse(content) as ChatSession;
            // Only include basic metadata in list
            sessions.push({
              ...session,
              messages: [], // Don't load all messages for listing
            });
          } catch (error) {
            console.error(`Failed to load session ${file}:`, error);
          }
        }
      }

      // Sort by most recently updated
      return sessions.sort((a, b) => 
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
    } catch (error) {
      return [];
    }
  }

  async appendMessage(sessionId: string, message: ChatMessage): Promise<void> {
    const session = await this.loadSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Add timestamp if not provided
    if (!message.timestamp) {
      message.timestamp = new Date().toISOString();
    }

    // Add ID if not provided
    if (!message.id) {
      message.id = uuidv4();
    }

    session.messages.push(message);
    session.updatedAt = new Date().toISOString();
    
    await this.saveSession(session);
  }

  async updateSession(id: string, updates: Partial<ChatSession>): Promise<void> {
    const session = await this.loadSession(id);
    if (!session) {
      throw new Error(`Session ${id} not found`);
    }

    // Merge updates
    Object.assign(session, updates);
    session.updatedAt = new Date().toISOString();
    
    await this.saveSession(session);
  }

  async getRecentMessages(sessionId: string, limit: number = 10): Promise<ChatMessage[]> {
    const session = await this.loadSession(sessionId);
    if (!session) {
      return [];
    }

    return session.messages.slice(-limit);
  }

  async clearSession(sessionId: string): Promise<void> {
    const session = await this.loadSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    session.messages = [];
    session.updatedAt = new Date().toISOString();
    
    await this.saveSession(session);
  }
}