import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { SafeFileWriter } from './safe-file-writer';
import { SessionIdGenerator } from './session-id-generator';
import { createLogger } from './structured-logger';

export interface SessionInfo {
  sessionId: string;
  agentName: string;
  status: 'running' | 'completed' | 'failed' | 'abandoned';
  startTime: number;
  lastHeartbeat: number;
  endTime?: number;
  exitCode?: number;
  pid?: number;
  projectId?: string;
  projectRoot?: string;
  taskId?: string;
  subtaskId?: string;
}

export interface SessionCheckpoint {
  sessionId: string;
  lastProcessedLine: number;
  lastEventSent: number;
  lastFlushTime: number;
  bufferSize: number;
  clientConnections: string[];
  terminalPid?: number;
}

/**
 * SessionManager handles session lifecycle, heartbeat tracking, and recovery
 * 
 * Features:
 * - 30-second heartbeat intervals
 * - 5-minute grace period for abandoned detection
 * - Process PID tracking for crash detection
 * - Checkpoint management for recovery
 */
export class SessionManager {
  private static readonly HEARTBEAT_INTERVAL = 30000; // 30 seconds
  private static readonly GRACE_PERIOD = 5 * 60 * 1000; // 5 minutes
  private static readonly SESSIONS_ROOT = path.join(os.homedir(), '.vibekit', 'sessions');
  private static readonly CHECKPOINTS_DIR = path.join(SessionManager.SESSIONS_ROOT, 'checkpoints');
  
  private static activeSessions = new Map<string, {
    info: SessionInfo;
    heartbeatTimer?: NodeJS.Timeout;
  }>();
  
  private static cleanupTimer?: NodeJS.Timeout;
  private static logger = createLogger('SessionManager');
  
  /**
   * Initialize the session manager
   */
  static async initialize(): Promise<void> {
    // Ensure directories exist
    await fs.mkdir(this.CHECKPOINTS_DIR, { recursive: true });
    
    // Start cleanup timer for abandoned session detection
    if (!this.cleanupTimer) {
      this.cleanupTimer = setInterval(() => {
        this.detectAbandonedSessions().catch(err => this.logger.error('Failed to detect abandoned sessions', err));
      }, 60000); // Check every minute
    }
    
    // Load any existing active sessions on startup
    await this.loadActiveSessions();
  }
  
  /**
   * Create a new session
   */
  static async createSession(
    agentName: string,
    options?: {
      sessionId?: string;
      projectId?: string;
      projectRoot?: string;
      taskId?: string;
      subtaskId?: string;
    }
  ): Promise<SessionInfo> {
    const sessionId = options?.sessionId || SessionIdGenerator.generate();
    
    const sessionInfo: SessionInfo = {
      sessionId,
      agentName,
      status: 'running',
      startTime: Date.now(),
      lastHeartbeat: Date.now(),
      pid: process.pid,
      projectId: options?.projectId,
      projectRoot: options?.projectRoot,
      taskId: options?.taskId,
      subtaskId: options?.subtaskId
    };
    
    // Store in memory
    this.activeSessions.set(sessionId, { info: sessionInfo });
    
    // Persist to disk
    await this.persistSession(sessionInfo);
    
    // Start heartbeat
    await this.startHeartbeat(sessionId);
    
    // Create initial checkpoint
    await this.saveCheckpoint({
      sessionId,
      lastProcessedLine: 0,
      lastEventSent: 0,
      lastFlushTime: Date.now(),
      bufferSize: 0,
      clientConnections: [],
      terminalPid: process.pid
    });
    
    return sessionInfo;
  }
  
  /**
   * Update session heartbeat
   */
  static async updateHeartbeat(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      // Add helpful debugging for old timestamp-based session IDs
      const isNumericId = /^\d+$/.test(sessionId);
      const errorMsg = isNumericId 
        ? `Session ${sessionId} not found (appears to be old timestamp-based ID, should use short UUID format)`
        : `Session ${sessionId} not found`;
      throw new Error(errorMsg);
    }
    
    session.info.lastHeartbeat = Date.now();
    await this.persistSession(session.info);
  }
  
  /**
   * Start heartbeat for a session
   */
  private static async startHeartbeat(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return;
    }
    
    // Clear existing timer if any
    if (session.heartbeatTimer) {
      clearInterval(session.heartbeatTimer);
    }
    
    // Start new heartbeat timer
    session.heartbeatTimer = setInterval(async () => {
      try {
        await this.updateHeartbeat(sessionId);
      } catch (error) {
        this.logger.error('Failed to update heartbeat for session', error, { sessionId });
        // Stop heartbeat if session no longer exists
        this.stopHeartbeat(sessionId);
      }
    }, this.HEARTBEAT_INTERVAL);
    
    // Update immediately
    await this.updateHeartbeat(sessionId);
  }
  
  /**
   * Stop heartbeat for a session
   */
  private static stopHeartbeat(sessionId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (session?.heartbeatTimer) {
      clearInterval(session.heartbeatTimer);
      session.heartbeatTimer = undefined;
    }
  }
  
  /**
   * Complete a session
   */
  static async completeSession(sessionId: string, exitCode: number): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      // Try to load from disk
      const diskSession = await this.loadSession(sessionId);
      if (diskSession) {
        diskSession.status = exitCode === 0 ? 'completed' : 'failed';
        diskSession.endTime = Date.now();
        diskSession.exitCode = exitCode;
        await this.persistSession(diskSession);
      }
      return;
    }
    
    // Update session info
    session.info.status = exitCode === 0 ? 'completed' : 'failed';
    session.info.endTime = Date.now();
    session.info.exitCode = exitCode;
    
    // Stop heartbeat
    this.stopHeartbeat(sessionId);
    
    // Persist final state
    await this.persistSession(session.info);
    
    // Remove from active sessions
    this.activeSessions.delete(sessionId);
  }
  
  /**
   * Mark a session as abandoned
   */
  static async markAsAbandoned(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.info.status = 'abandoned';
      session.info.endTime = Date.now();
      
      this.stopHeartbeat(sessionId);
      await this.persistSession(session.info);
      this.activeSessions.delete(sessionId);
    } else {
      // Try to update on disk
      const diskSession = await this.loadSession(sessionId);
      if (diskSession && diskSession.status === 'running') {
        diskSession.status = 'abandoned';
        diskSession.endTime = Date.now();
        await this.persistSession(diskSession);
      }
    }
    
    this.logger.info('Session marked as abandoned', { sessionId });
  }
  
  /**
   * Detect and clean up abandoned sessions
   */
  static async detectAbandonedSessions(): Promise<void> {
    const now = Date.now();
    const sessionsToAbandon: string[] = [];
    
    // Check active sessions in memory
    for (const [sessionId, session] of this.activeSessions) {
      if (session.info.status === 'running' && 
          now - session.info.lastHeartbeat > this.GRACE_PERIOD) {
        
        // Check if process is still alive
        if (session.info.pid && !this.isProcessAlive(session.info.pid)) {
          sessionsToAbandon.push(sessionId);
        } else if (now - session.info.lastHeartbeat > this.GRACE_PERIOD * 2) {
          // Double grace period for processes that might still be alive
          sessionsToAbandon.push(sessionId);
        }
      }
    }
    
    // Mark sessions as abandoned
    for (const sessionId of sessionsToAbandon) {
      await this.markAsAbandoned(sessionId);
    }
    
    // Also check sessions on disk that might not be in memory
    await this.cleanupDiskSessions();
  }
  
  /**
   * Check if a process is still alive
   */
  private static isProcessAlive(pid: number): boolean {
    try {
      // Sending signal 0 checks if process exists without killing it
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * Save a session checkpoint for recovery
   */
  static async saveCheckpoint(checkpoint: SessionCheckpoint): Promise<void> {
    const checkpointFile = path.join(this.CHECKPOINTS_DIR, `${checkpoint.sessionId}.json`);
    await SafeFileWriter.writeFile(checkpointFile, JSON.stringify(checkpoint, null, 2));
  }
  
  /**
   * Load a session checkpoint
   */
  static async loadCheckpoint(sessionId: string): Promise<SessionCheckpoint | null> {
    const checkpointFile = path.join(this.CHECKPOINTS_DIR, `${sessionId}.json`);
    try {
      const content = await fs.readFile(checkpointFile, 'utf8');
      return JSON.parse(content);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }
  
  /**
   * Delete a session checkpoint
   */
  static async deleteCheckpoint(sessionId: string): Promise<void> {
    const checkpointFile = path.join(this.CHECKPOINTS_DIR, `${sessionId}.json`);
    try {
      await fs.unlink(checkpointFile);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        this.logger.error('Failed to delete checkpoint for session', error, { sessionId });
      }
    }
  }
  
  /**
   * Persist session info to disk
   */
  private static async persistSession(sessionInfo: SessionInfo): Promise<void> {
    const sessionFile = path.join(this.SESSIONS_ROOT, 'active', `${sessionInfo.sessionId}.json`);
    await SafeFileWriter.writeFile(sessionFile, JSON.stringify(sessionInfo, null, 2));
  }
  
  /**
   * Load session info from disk
   */
  private static async loadSession(sessionId: string): Promise<SessionInfo | null> {
    const sessionFile = path.join(this.SESSIONS_ROOT, 'active', `${sessionId}.json`);
    try {
      const content = await fs.readFile(sessionFile, 'utf8');
      return JSON.parse(content);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }
  
  /**
   * Load active sessions from disk on startup
   */
  private static async loadActiveSessions(): Promise<void> {
    const activeDir = path.join(this.SESSIONS_ROOT, 'active');
    
    try {
      await fs.mkdir(activeDir, { recursive: true });
      const files = await fs.readdir(activeDir);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const content = await fs.readFile(path.join(activeDir, file), 'utf8');
            const sessionInfo: SessionInfo = JSON.parse(content);
            
            // Only load sessions that are still running
            if (sessionInfo.status === 'running') {
              // Check if session is abandoned
              const now = Date.now();
              if (now - sessionInfo.lastHeartbeat > this.GRACE_PERIOD) {
                await this.markAsAbandoned(sessionInfo.sessionId);
              } else {
                // Restore session to active list
                this.activeSessions.set(sessionInfo.sessionId, { info: sessionInfo });
                // Restart heartbeat
                await this.startHeartbeat(sessionInfo.sessionId);
              }
            }
          } catch (error) {
            this.logger.error('Failed to load session from file', error, { file });
          }
        }
      }
    } catch (error) {
      this.logger.error('Failed to load active sessions', error);
    }
  }
  
  /**
   * Clean up old session files on disk
   */
  private static async cleanupDiskSessions(): Promise<void> {
    const activeDir = path.join(this.SESSIONS_ROOT, 'active');
    
    try {
      const files = await fs.readdir(activeDir);
      const now = Date.now();
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const sessionId = file.replace('.json', '');
          
          // Skip if session is in memory
          if (this.activeSessions.has(sessionId)) {
            continue;
          }
          
          try {
            const filePath = path.join(activeDir, file);
            const content = await fs.readFile(filePath, 'utf8');
            const sessionInfo: SessionInfo = JSON.parse(content);
            
            // Clean up old completed/failed/abandoned sessions (older than 24 hours)
            if (sessionInfo.status !== 'running' && sessionInfo.endTime) {
              if (now - sessionInfo.endTime > 24 * 60 * 60 * 1000) {
                await fs.unlink(filePath);
                await this.deleteCheckpoint(sessionId);
              }
            }
            // Mark abandoned if running but no recent heartbeat
            else if (sessionInfo.status === 'running' && 
                     now - sessionInfo.lastHeartbeat > this.GRACE_PERIOD) {
              await this.markAsAbandoned(sessionId);
            }
          } catch (error) {
            this.logger.error('Failed to process session file', error, { file });
          }
        }
      }
    } catch (error) {
      this.logger.error('Failed to cleanup disk sessions', error);
    }
  }
  
  /**
   * Get all active sessions
   */
  static getActiveSessions(): SessionInfo[] {
    return Array.from(this.activeSessions.values()).map(s => s.info);
  }
  
  /**
   * Get session by ID
   */
  static async getSession(sessionId: string): Promise<SessionInfo | null> {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      return session.info;
    }
    
    // Try to load from disk
    return this.loadSession(sessionId);
  }
  
  /**
   * Get session statistics
   */
  static async getStats(): Promise<{
    totalSessions: number;
    activeSessions: number;
    runningSessions: number;
    completedSessions: number;
    failedSessions: number;
    abandonedSessions: number;
  }> {
    const activeSessions = this.getActiveSessions();
    
    return {
      totalSessions: activeSessions.length,
      activeSessions: activeSessions.length,
      runningSessions: activeSessions.filter(s => s.status === 'running').length,
      completedSessions: activeSessions.filter(s => s.status === 'completed').length,
      failedSessions: activeSessions.filter(s => s.status === 'failed').length,
      abandonedSessions: activeSessions.filter(s => s.status === 'abandoned').length
    };
  }

  /**
   * Shutdown the session manager
   */
  static async shutdown(): Promise<void> {
    // Stop cleanup timer
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    
    // Stop all heartbeats
    for (const sessionId of this.activeSessions.keys()) {
      this.stopHeartbeat(sessionId);
    }
    
    // Persist all sessions
    for (const [, session] of this.activeSessions) {
      await this.persistSession(session.info);
    }
  }
}