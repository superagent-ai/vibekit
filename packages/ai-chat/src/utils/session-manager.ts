import { ChatSession } from '../types';
import { ChatStorage } from '../storage/ChatStorage';

export interface SessionManagerOptions {
  maxSessionsPerUser?: number;
  sessionTTL?: number; // milliseconds
  maxMessagesPerSession?: number;
  cleanupInterval?: number; // milliseconds
}

export class SessionManager {
  private storage: ChatStorage;
  private cleanupTimer?: NodeJS.Timeout;
  
  constructor(
    storage: ChatStorage,
    private options: SessionManagerOptions = {}
  ) {
    this.storage = storage;
    this.startCleanupTimer();
  }
  
  private startCleanupTimer() {
    const interval = this.options.cleanupInterval || 3600000; // 1 hour default
    
    this.cleanupTimer = setInterval(() => {
      this.cleanup().catch(console.error);
    }, interval);
  }
  
  async cleanup(): Promise<void> {
    const sessions = await this.storage.listSessions();
    const now = Date.now();
    const ttl = this.options.sessionTTL || 86400000; // 24 hours default
    
    for (const session of sessions) {
      const sessionAge = now - new Date(session.updatedAt).getTime();
      
      if (sessionAge > ttl) {
        await this.storage.deleteSession(session.id);
        console.log(`Deleted expired session: ${session.id}`);
      }
    }
  }
  
  async enforceSessionLimits(userId?: string): Promise<void> {
    if (!userId || !this.options.maxSessionsPerUser) {
      return;
    }
    
    const sessions = await this.storage.listSessions();
    const userSessions = sessions
      .filter(s => s.metadata?.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    
    // Delete oldest sessions if over limit
    const toDelete = userSessions.slice(this.options.maxSessionsPerUser);
    for (const session of toDelete) {
      await this.storage.deleteSession(session.id);
      console.log(`Deleted session over limit: ${session.id}`);
    }
  }
  
  async enforceMessageLimit(sessionId: string): Promise<void> {
    if (!this.options.maxMessagesPerSession) {
      return;
    }
    
    const session = await this.storage.loadSession(sessionId);
    if (!session) {
      return;
    }
    
    if (session.messages.length > this.options.maxMessagesPerSession) {
      // Keep only the most recent messages
      const messagesToKeep = session.messages.slice(-this.options.maxMessagesPerSession);
      
      // Create a new session with truncated messages
      await this.storage.saveSession({
        ...session,
        messages: messagesToKeep,
      });
      
      console.log(`Truncated messages for session: ${sessionId}`);
    }
  }
  
  async validateSession(sessionId: string): Promise<boolean> {
    const session = await this.storage.loadSession(sessionId);
    
    if (!session) {
      return false;
    }
    
    // Check if session is expired
    if (this.options.sessionTTL) {
      const sessionAge = Date.now() - new Date(session.updatedAt).getTime();
      if (sessionAge > this.options.sessionTTL) {
        await this.storage.deleteSession(sessionId);
        return false;
      }
    }
    
    return true;
  }
  
  destroy() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
  }
}