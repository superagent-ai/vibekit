import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { SessionManager, SessionInfo, SessionCheckpoint } from './session-manager';
import { SessionLogger } from './session-logger';

export interface RecoveryState {
  sessionId: string;
  sessionStatus: 'active' | 'recovered' | 'completed' | 'abandoned';
  lastLineNumber: number;
  lastTimestamp: number;
  resumePoint: number;
  checkpoint?: SessionCheckpoint;
  metadata?: any;
}

export interface RecoveryOptions {
  autoRecover?: boolean;
  restoreHeartbeat?: boolean;
  cleanupOrphaned?: boolean;
}

/**
 * SessionRecovery handles recovery of sessions after crashes or restarts
 * 
 * Features:
 * - Smart session state detection from logs
 * - Checkpoint-based recovery
 * - Dashboard restart handling
 * - Partial write recovery
 * - Client reconnection support
 */
export class SessionRecovery {
  private static readonly SESSIONS_ROOT = path.join(os.homedir(), '.vibekit', 'sessions');
  private static readonly RECOVERY_STATE_FILE = path.join(SessionRecovery.SESSIONS_ROOT, 'recovery-state.json');
  
  private static recoveryStates = new Map<string, RecoveryState>();
  
  /**
   * Recover a specific session
   * @param sessionId - Session ID to recover
   * @param options - Recovery options
   * @returns Recovery state
   */
  static async recoverSession(
    sessionId: string,
    options: RecoveryOptions = {}
  ): Promise<RecoveryState | null> {
    try {
      console.log(`[Recovery] Attempting to recover session ${sessionId}`);
      
      // 1. Try to load checkpoint first
      const checkpoint = await SessionManager.loadCheckpoint(sessionId);
      
      // 2. Try to read session data
      let sessionData;
      try {
        sessionData = await SessionLogger.readSession(sessionId);
      } catch (error: any) {
        if (error.message?.includes('not found')) {
          console.log(`[Recovery] Session ${sessionId} not found in logs`);
          
          // If we have a checkpoint but no logs, session might be starting
          if (checkpoint) {
            return {
              sessionId,
              sessionStatus: 'recovered',
              lastLineNumber: checkpoint.lastProcessedLine,
              lastTimestamp: checkpoint.lastEventSent,
              resumePoint: checkpoint.lastProcessedLine,
              checkpoint: checkpoint || undefined,
              metadata: {}
            };
          }
          
          return null;
        }
        throw error;
      }
      
      // 3. Determine session state from logs
      const logs = sessionData.logs || [];
      const lastLog = logs[logs.length - 1];
      const hasEndLog = logs.some(log => log.type === 'end');
      const isActive = !hasEndLog && lastLog?.type !== 'end';
      
      // 4. Calculate recovery point
      const recoveryState: RecoveryState = {
        sessionId,
        sessionStatus: isActive ? 'recovered' : 'completed',
        lastLineNumber: logs.length,
        lastTimestamp: lastLog?.timestamp || Date.now(),
        resumePoint: checkpoint?.lastProcessedLine || logs.length,
        checkpoint: checkpoint || undefined,
        metadata: sessionData.metadata
      };
      
      // 5. Store recovery state
      this.recoveryStates.set(sessionId, recoveryState);
      await this.persistRecoveryState();
      
      // 6. If active and requested, restart heartbeat
      if (isActive && options.restoreHeartbeat) {
        const sessionInfo = await SessionManager.getSession(sessionId);
        if (sessionInfo && sessionInfo.status === 'running') {
          console.log(`[Recovery] Restarting heartbeat for active session ${sessionId}`);
          await SessionManager.updateHeartbeat(sessionId);
        }
      }
      
      console.log(`[Recovery] Successfully recovered session ${sessionId}:`, {
        status: recoveryState.sessionStatus,
        lastLine: recoveryState.lastLineNumber,
        resumePoint: recoveryState.resumePoint
      });
      
      return recoveryState;
      
    } catch (error) {
      console.error(`[Recovery] Failed to recover session ${sessionId}:`, error);
      throw error;
    }
  }
  
  /**
   * Recover all sessions on dashboard restart
   * @param options - Recovery options
   * @returns Array of recovered sessions
   */
  static async onDashboardRestart(
    options: RecoveryOptions = { autoRecover: true, restoreHeartbeat: true, cleanupOrphaned: true }
  ): Promise<RecoveryState[]> {
    console.log('[Recovery] Starting dashboard recovery process');
    const recoveredSessions: RecoveryState[] = [];
    
    try {
      // 1. Initialize SessionManager to load active sessions
      await SessionManager.initialize();
      
      // 2. Get today's sessions from logs
      const todaysSessions = await this.getTodaysSessions();
      console.log(`[Recovery] Found ${todaysSessions.size} sessions from today`);
      
      // 3. Process each session
      for (const [sessionId, sessionMeta] of todaysSessions) {
        try {
          // Check if session is in active list
          const sessionInfo = await SessionManager.getSession(sessionId);
          
          if (sessionInfo && sessionInfo.status === 'running') {
            // Session is marked as running, attempt recovery
            const recovered = await this.recoverSession(sessionId, options);
            if (recovered) {
              recoveredSessions.push(recovered);
              
              // Prepare for client reconnection
              await this.prepareForReconnection(sessionId, recovered);
            }
          } else if (!sessionInfo && options.cleanupOrphaned) {
            // Session not in active list, check if it needs cleanup
            const recovered = await this.recoverSession(sessionId, { autoRecover: false });
            if (recovered && recovered.sessionStatus === 'active') {
              // Mark orphaned active session as abandoned
              console.log(`[Recovery] Marking orphaned session ${sessionId} as abandoned`);
              await SessionManager.markAsAbandoned(sessionId);
            }
          }
        } catch (error) {
          console.error(`[Recovery] Failed to process session ${sessionId}:`, error);
        }
      }
      
      // 4. Clean up old checkpoints
      if (options.cleanupOrphaned) {
        await this.cleanupOldCheckpoints();
      }
      
      console.log(`[Recovery] Dashboard recovery complete. Recovered ${recoveredSessions.length} sessions`);
      return recoveredSessions;
      
    } catch (error) {
      console.error('[Recovery] Dashboard recovery failed:', error);
      throw error;
    }
  }
  
  /**
   * Get all sessions from today's log file
   */
  private static async getTodaysSessions(): Promise<Map<string, any>> {
    const sessions = new Map<string, any>();
    const today = new Date().toISOString().split('T')[0];
    const dailyLogFile = path.join(this.SESSIONS_ROOT, `${today}.jsonl`);
    
    try {
      const content = await fs.readFile(dailyLogFile, 'utf8');
      const lines = content.split('\n').filter(line => line.trim());
      
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          if (entry.sessionId) {
            // Store first occurrence of each session with its metadata
            if (!sessions.has(entry.sessionId)) {
              sessions.set(entry.sessionId, {
                firstSeen: entry.timestamp,
                type: entry.type,
                metadata: entry.metadata
              });
            }
          }
        } catch {
          // Skip malformed lines
        }
      }
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        console.error('Failed to read today\'s sessions:', error);
      }
    }
    
    return sessions;
  }
  
  /**
   * Prepare session for client reconnection
   * @param sessionId - Session ID
   * @param recoveryState - Recovery state
   */
  static async prepareForReconnection(
    sessionId: string,
    recoveryState: RecoveryState
  ): Promise<void> {
    // Update checkpoint with recovery information
    if (recoveryState.checkpoint) {
      const updatedCheckpoint: SessionCheckpoint = {
        ...recoveryState.checkpoint,
        lastProcessedLine: recoveryState.resumePoint,
        lastEventSent: recoveryState.lastTimestamp,
        lastFlushTime: Date.now()
      };
      
      await SessionManager.saveCheckpoint(updatedCheckpoint);
    }
    
    console.log(`[Recovery] Session ${sessionId} prepared for reconnection at line ${recoveryState.resumePoint}`);
  }
  
  /**
   * Handle partial write recovery
   * @param filepath - Path to file that may have partial writes
   * @returns true if file was recovered
   */
  static async recoverPartialWrite(filepath: string): Promise<boolean> {
    try {
      // Check if file ends with incomplete JSON line
      const content = await fs.readFile(filepath, 'utf8');
      const lines = content.split('\n');
      
      let lastValidLine = -1;
      let hasCorruption = false;
      
      // Validate each line
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        try {
          JSON.parse(line);
          lastValidLine = i;
        } catch {
          hasCorruption = true;
          console.log(`[Recovery] Found corrupted line ${i} in ${filepath}`);
          break;
        }
      }
      
      // If corruption found, truncate file to last valid line
      if (hasCorruption && lastValidLine >= 0) {
        const validLines = lines.slice(0, lastValidLine + 1);
        const recoveredContent = validLines.join('\n') + '\n';
        
        // Create backup
        const backupPath = `${filepath}.backup.${Date.now()}`;
        await fs.copyFile(filepath, backupPath);
        
        // Write recovered content with secure permissions
        await fs.writeFile(filepath, recoveredContent, { mode: 0o600 });
        
        console.log(`[Recovery] Recovered ${filepath} to line ${lastValidLine}. Backup saved to ${backupPath}`);
        return true;
      }
      
      return false;
      
    } catch (error) {
      console.error(`[Recovery] Failed to recover partial write in ${filepath}:`, error);
      return false;
    }
  }
  
  /**
   * Clean up old checkpoint files
   */
  private static async cleanupOldCheckpoints(): Promise<void> {
    const checkpointsDir = path.join(this.SESSIONS_ROOT, 'checkpoints');
    
    try {
      const files = await fs.readdir(checkpointsDir);
      const now = Date.now();
      const MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(checkpointsDir, file);
          const stats = await fs.stat(filePath);
          
          // Delete checkpoints older than 7 days
          if (now - stats.mtime.getTime() > MAX_AGE) {
            await fs.unlink(filePath);
            console.log(`[Recovery] Deleted old checkpoint: ${file}`);
          }
        }
      }
    } catch (error) {
      console.error('[Recovery] Failed to cleanup old checkpoints:', error);
    }
  }
  
  /**
   * Get recovery state for a session
   * @param sessionId - Session ID
   * @returns Recovery state or null
   */
  static getRecoveryState(sessionId: string): RecoveryState | null {
    return this.recoveryStates.get(sessionId) || null;
  }
  
  /**
   * Clear recovery state for a session
   * @param sessionId - Session ID
   */
  static clearRecoveryState(sessionId: string): void {
    this.recoveryStates.delete(sessionId);
  }
  
  /**
   * Persist recovery states to disk
   */
  private static async persistRecoveryState(): Promise<void> {
    const states = Array.from(this.recoveryStates.entries()).map(([id, state]) => ({
      ...state,
      id
    }));
    
    try {
      await fs.mkdir(path.dirname(this.RECOVERY_STATE_FILE), { recursive: true });
      await fs.writeFile(this.RECOVERY_STATE_FILE, JSON.stringify(states, null, 2), { mode: 0o600 });
    } catch (error) {
      console.error('[Recovery] Failed to persist recovery state:', error);
    }
  }
  
  /**
   * Load recovery states from disk
   */
  static async loadRecoveryStates(): Promise<void> {
    try {
      const content = await fs.readFile(this.RECOVERY_STATE_FILE, 'utf8');
      const states = JSON.parse(content);
      
      this.recoveryStates.clear();
      for (const state of states) {
        this.recoveryStates.set(state.id, state);
      }
      
      console.log(`[Recovery] Loaded ${this.recoveryStates.size} recovery states`);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        console.error('[Recovery] Failed to load recovery states:', error);
      }
    }
  }
  
  /**
   * Validate session integrity
   * @param sessionId - Session ID to validate
   * @returns true if session data is valid
   */
  static async validateSessionIntegrity(sessionId: string): Promise<boolean> {
    try {
      // Try to read session data
      const sessionData = await SessionLogger.readSession(sessionId);
      
      // Check for required fields
      if (!sessionData.metadata || !sessionData.logs) {
        console.error(`[Recovery] Session ${sessionId} missing required fields`);
        return false;
      }
      
      // Check log ordering
      let lastTimestamp = 0;
      for (const log of sessionData.logs) {
        if (log.timestamp < lastTimestamp) {
          console.error(`[Recovery] Session ${sessionId} has out-of-order logs`);
          return false;
        }
        lastTimestamp = log.timestamp;
      }
      
      return true;
      
    } catch (error) {
      console.error(`[Recovery] Failed to validate session ${sessionId}:`, error);
      return false;
    }
  }
  
  /**
   * Get recovery statistics
   */
  static getStats() {
    const activeRecoveries = Array.from(this.recoveryStates.values()).filter(
      s => s.sessionStatus === 'recovered'
    );
    
    return {
      totalRecoveryStates: this.recoveryStates.size,
      activeRecoveries: activeRecoveries.length,
      recoveredSessions: Array.from(this.recoveryStates.keys())
    };
  }
}