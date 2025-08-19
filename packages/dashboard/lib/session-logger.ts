import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { SafeFileWriter } from './safe-file-writer';
import { 
  createSafeVibeKitPath, 
  validateDailyLogFilename, 
  validateSessionId,
  sanitizeForLogging,
  ValidationError 
} from './security-utils';
import { SessionManager, SessionCheckpoint } from './session-manager';
import { SessionIdGenerator } from './session-id-generator';
import { createLogger, LogTimer } from './structured-logger';
import { LogLevel } from './logger-config';

export interface LogEntry {
  timestamp: number;
  type: 'update' | 'stdout' | 'stderr' | 'error' | 'command' | 'info' | 'start' | 'end';
  data: string;
  metadata?: {
    command?: string;
    args?: string[];
    exitCode?: number;
    duration?: number;
    [key: string]: any;
  };
}

export interface SessionMetadata {
  sessionId: string;
  agentName: string;
  projectId?: string;
  projectRoot?: string;
  taskId?: string;
  subtaskId?: string;
  startTime: number;
  endTime?: number;
  status: 'running' | 'completed' | 'failed';
  exitCode?: number;
}

export interface SessionLogEntry {
  sessionId: string;
  type: 'metadata' | 'log';
  timestamp: number;
  logType?: LogEntry['type'];
  data?: string;
  metadata?: LogEntry['metadata'] | SessionMetadata;
}

export class SessionLogger {
  public readonly sessionId: string;
  private dailyLogFile: string;
  private metadata: SessionMetadata;
  private logBuffer: SessionLogEntry[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  private isClosed = false;
  private isFlushInProgress = false;
  private pendingFlushPromise: Promise<void> | null = null;
  private logger = createLogger('SessionLogger');
  
  // Production improvements and resource limits
  private static readonly MAX_BUFFER_SIZE = 1000; // Maximum entries in buffer
  private static readonly MAX_BUFFER_BYTES = 10 * 1024 * 1024; // 10MB max buffer size
  private static readonly MAX_LOG_ENTRY_SIZE = 100 * 1024; // 100KB max per log entry
  private static readonly MAX_TOTAL_LOG_ENTRIES = 50000; // Maximum total entries per session
  private static readonly FLUSH_INTERVAL = 100; // ms
  private bufferSizeBytes = 0;
  private lastFlushTime = Date.now();
  private logCount = 0;

  constructor(
    sessionId: string,
    agentName: string,
    metadata?: {
      projectId?: string;
      projectRoot?: string;
      taskId?: string;
      subtaskId?: string;
    }
  ) {
    // Validate session ID
    try {
      validateSessionId(sessionId);
      this.sessionId = sessionId;
    } catch (error) {
      // Generate a new session ID if validation fails
      this.sessionId = SessionIdGenerator.generate();
      this.logger.warn('Invalid session ID provided, generated new one', {
        originalSessionId: sessionId,
        newSessionId: this.sessionId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
    
    // Create logger with session context
    this.logger = createLogger('SessionLogger', { 
      sessionId: this.sessionId,
      agentName,
      projectId: metadata?.projectId
    });
    
    // Create daily log file path with security validation
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const filename = `${today}.jsonl`;
    validateDailyLogFilename(filename);
    this.dailyLogFile = createSafeVibeKitPath(filename, 'sessions');
    
    // Initialize metadata
    this.metadata = {
      sessionId: this.sessionId, // Use the validated/corrected session ID
      agentName,
      startTime: Date.now(),
      status: 'running',
      ...metadata
    };
  }

  async initialize(): Promise<void> {
    // Debug path information
    this.logger.info('Initializing session', { sessionId: this.sessionId });
    this.logger.debug('Daily log file path', { path: this.dailyLogFile, sessionId: this.sessionId });
    this.logger.debug('Home directory', { homeDir: require('os').homedir(), sessionId: this.sessionId });
    
    // Ensure sessions directory exists
    const sessionsRoot = path.dirname(this.dailyLogFile);
    this.logger.debug('Sessions root directory', { sessionsRoot, sessionId: this.sessionId });
    await fs.mkdir(sessionsRoot, { recursive: true });
    
    // Initialize SessionManager for this session
    await SessionManager.initialize();
    await SessionManager.createSession(this.metadata.agentName, {
      sessionId: this.sessionId,
      projectId: this.metadata.projectId,
      projectRoot: this.metadata.projectRoot,
      taskId: this.metadata.taskId,
      subtaskId: this.metadata.subtaskId
    });
    
    // Write initial metadata as first entry
    await this.addLogEntry({
      sessionId: this.sessionId,
      type: 'metadata',
      timestamp: this.metadata.startTime,
      metadata: this.metadata
    });
    
    // Add start log entry
    await this.log('start', `Session ${this.sessionId} started for agent ${this.metadata.agentName}`, {
      agentName: this.metadata.agentName,
      projectId: this.metadata.projectId,
      taskId: this.metadata.taskId,
      subtaskId: this.metadata.subtaskId
    });
    
    // Immediately flush the initial metadata and start log to ensure they're written to disk
    // This prevents race conditions where the UI starts streaming before the session exists
    await this.flush();
    
    // Start periodic flush with production improvements
    this.flushInterval = setInterval(() => {
      this.flush().catch(err => this.logger.error('Failed to flush logs', err, { sessionId: this.sessionId }));
    }, SessionLogger.FLUSH_INTERVAL);
  }

  async log(type: LogEntry['type'], data: string, metadata?: LogEntry['metadata']): Promise<void> {
    if (this.isClosed) {
      this.logger.warn('Attempting to log to closed session', { sessionId: this.sessionId });
      return;
    }

    await this.addLogEntry({
      sessionId: this.sessionId,
      type: 'log',
      timestamp: Date.now(),
      logType: type,
      data,
      metadata
    });
    
    // Parse for commands if it's stdout/stderr
    if ((type === 'stdout' || type === 'stderr') && data) {
      this.detectAndLogCommands(data);
    }
    
    // Immediate flush for critical events to ensure real-time visibility
    const criticalTypes = ['start', 'end', 'error', 'command', 'update', 'info'];
    if (criticalTypes.includes(type)) {
      await this.flush();
    }
  }
  
  private async addLogEntry(entry: SessionLogEntry): Promise<void> {
    // Resource limit checks
    if (this.logCount >= SessionLogger.MAX_TOTAL_LOG_ENTRIES) {
      this.logger.warn('Maximum log entries reached, ignoring new entries', {
        currentCount: this.logCount,
        maxEntries: SessionLogger.MAX_TOTAL_LOG_ENTRIES
      });
      return;
    }
    
    // Validate entry size to prevent memory attacks
    const entryJson = JSON.stringify(entry);
    const entrySize = Buffer.byteLength(entryJson);
    
    if (entrySize > SessionLogger.MAX_LOG_ENTRY_SIZE) {
      this.logger.warn('Log entry too large, truncating', {
        entrySize,
        maxSize: SessionLogger.MAX_LOG_ENTRY_SIZE,
        entryType: entry.logType || entry.type
      });
      // Truncate the data field if it's too large
      if (entry.data && entry.data.length > SessionLogger.MAX_LOG_ENTRY_SIZE / 2) {
        entry.data = entry.data.substring(0, SessionLogger.MAX_LOG_ENTRY_SIZE / 2) + '... [TRUNCATED]';
      }
    }
    
    // Check buffer limits and flush if needed
    if (this.logBuffer.length >= SessionLogger.MAX_BUFFER_SIZE ||
        this.bufferSizeBytes + entrySize >= SessionLogger.MAX_BUFFER_BYTES) {
      await this.flush();
    }
    
    this.logBuffer.push(entry);
    this.logCount++;
    this.bufferSizeBytes += entrySize;
  }

  private async detectAndLogCommands(output: string): Promise<void> {
    // Detect common commands in output - enhanced with more Git operations
    const commandPatterns = [
      // Git operations - comprehensive list
      { pattern: /git clone\s+[\S]+/gi, command: 'git clone' },
      { pattern: /git init/gi, command: 'git init' },
      { pattern: /git add\s+[\S]+/gi, command: 'git add' },
      { pattern: /git add\s+\./gi, command: 'git add' },
      { pattern: /git add\s+--all/gi, command: 'git add' },
      { pattern: /git commit\s+-m\s+["'].*?["']/gi, command: 'git commit' },
      { pattern: /git commit\s+--amend/gi, command: 'git commit' },
      { pattern: /git status/gi, command: 'git status' },
      { pattern: /git diff/gi, command: 'git diff' },
      { pattern: /git log/gi, command: 'git log' },
      { pattern: /git branch/gi, command: 'git branch' },
      { pattern: /git checkout\s+[\S]+/gi, command: 'git checkout' },
      { pattern: /git checkout\s+-b\s+[\S]+/gi, command: 'git checkout -b' },
      { pattern: /git merge\s+[\S]+/gi, command: 'git merge' },
      { pattern: /git rebase\s+[\S]+/gi, command: 'git rebase' },
      { pattern: /git pull/gi, command: 'git pull' },
      { pattern: /git push/gi, command: 'git push' },
      { pattern: /git fetch/gi, command: 'git fetch' },
      { pattern: /git remote/gi, command: 'git remote' },
      { pattern: /git stash/gi, command: 'git stash' },
      { pattern: /git tag/gi, command: 'git tag' },
      { pattern: /git reset/gi, command: 'git reset' },
      { pattern: /git revert/gi, command: 'git revert' },
      { pattern: /git config/gi, command: 'git config' },
      { pattern: /git show/gi, command: 'git show' },
      { pattern: /git blame/gi, command: 'git blame' },
      { pattern: /git cherry-pick/gi, command: 'git cherry-pick' },
      { pattern: /git submodule/gi, command: 'git submodule' },
      { pattern: /git worktree/gi, command: 'git worktree' },
      { pattern: /git ls-files/gi, command: 'git ls-files' },
      { pattern: /git rev-parse/gi, command: 'git rev-parse' },
      { pattern: /git describe/gi, command: 'git describe' },
      { pattern: /git shortlog/gi, command: 'git shortlog' },
      { pattern: /git reflog/gi, command: 'git reflog' },
      { pattern: /git bisect/gi, command: 'git bisect' },
      { pattern: /git clean/gi, command: 'git clean' },
      { pattern: /git archive/gi, command: 'git archive' },
      { pattern: /git mv/gi, command: 'git mv' },
      { pattern: /git rm/gi, command: 'git rm' },
      
      // GitHub CLI operations
      { pattern: /gh pr create/gi, command: 'gh pr create' },
      { pattern: /gh pr list/gi, command: 'gh pr list' },
      { pattern: /gh pr view/gi, command: 'gh pr view' },
      { pattern: /gh pr merge/gi, command: 'gh pr merge' },
      { pattern: /gh issue create/gi, command: 'gh issue create' },
      { pattern: /gh repo clone/gi, command: 'gh repo clone' },
      { pattern: /gh auth login/gi, command: 'gh auth login' },
      
      // Package managers
      { pattern: /npm install/gi, command: 'npm install' },
      { pattern: /npm run\s+[\S]+/gi, command: 'npm run' },
      { pattern: /npm test/gi, command: 'npm test' },
      { pattern: /npm build/gi, command: 'npm build' },
      { pattern: /yarn install/gi, command: 'yarn install' },
      { pattern: /yarn\s+[\S]+/gi, command: 'yarn' },
      { pattern: /pnpm install/gi, command: 'pnpm install' },
      { pattern: /pip install\s+[\S]+/gi, command: 'pip install' },
      { pattern: /cargo build/gi, command: 'cargo build' },
      { pattern: /cargo run/gi, command: 'cargo run' },
      
      // Container operations
      { pattern: /docker build/gi, command: 'docker build' },
      { pattern: /docker run/gi, command: 'docker run' },
      { pattern: /docker push/gi, command: 'docker push' },
      { pattern: /docker pull/gi, command: 'docker pull' },
      { pattern: /docker-compose/gi, command: 'docker-compose' },
      
      // File operations
      { pattern: /curl\s+[\S]+/gi, command: 'curl' },
      { pattern: /wget\s+[\S]+/gi, command: 'wget' },
      { pattern: /mkdir\s+[\S]+/gi, command: 'mkdir' },
      { pattern: /cp\s+[\S]+\s+[\S]+/gi, command: 'cp' },
      { pattern: /mv\s+[\S]+\s+[\S]+/gi, command: 'mv' },
      { pattern: /rm\s+-?[\S]*\s+[\S]+/gi, command: 'rm' },
      { pattern: /touch\s+[\S]+/gi, command: 'touch' },
      { pattern: /cat\s+[\S]+/gi, command: 'cat' },
      { pattern: /ls\s+[\S]*/gi, command: 'ls' },
      { pattern: /pwd/gi, command: 'pwd' },
      { pattern: /cd\s+[\S]+/gi, command: 'cd' },
      { pattern: /chmod\s+[\S]+/gi, command: 'chmod' },
      { pattern: /chown\s+[\S]+/gi, command: 'chown' },
      { pattern: /tar\s+[\S]+/gi, command: 'tar' },
      { pattern: /unzip\s+[\S]+/gi, command: 'unzip' },
      { pattern: /zip\s+[\S]+/gi, command: 'zip' },
    ];

    for (const { pattern, command } of commandPatterns) {
      const matches = output.match(pattern);
      if (matches) {
        for (const match of matches) {
          await this.addLogEntry({
            sessionId: this.sessionId,
            type: 'log',
            timestamp: Date.now(),
            logType: 'command',
            data: match,
            metadata: { command, detected: true }
          });
        }
      }
    }
  }

  async captureUpdate(update: string): Promise<void> {
    this.logger.debug('Capturing agent update', {
      updateLength: update.length,
      updatePreview: update.substring(0, 100) + (update.length > 100 ? '...' : ''),
      operation: 'captureUpdate'
    });
    
    // Store ONLY the raw update to preserve original format without any transformation
    await this.log('update', update);
    
    // Note: Removed all additional processing to preserve exact VibeKit SDK output
    // The UI will handle parsing and display formatting, but logs should contain raw data
  }

  async captureStdout(data: string): Promise<void> {
    // Store raw stdout data without any transformation
    await this.log('stdout', data);
  }

  async captureStderr(data: string): Promise<void> {
    // Store raw stderr data without any transformation
    await this.log('stderr', data);
  }

  async captureError(error: string): Promise<void> {
    await this.log('error', error);
  }

  async captureInfo(info: string, metadata?: any): Promise<void> {
    await this.log('info', info, metadata);
  }

  private async flush(): Promise<void> {
    // Prevent concurrent flush operations
    if (this.isFlushInProgress) {
      // If there's already a flush in progress, wait for it to complete
      if (this.pendingFlushPromise) {
        await this.pendingFlushPromise;
      }
      return;
    }
    
    if (this.logBuffer.length === 0 || this.isClosed) {
      return;
    }

    // Mark flush as in progress and create promise for other callers to await
    this.isFlushInProgress = true;
    this.pendingFlushPromise = this.performFlush();
    
    try {
      await this.pendingFlushPromise;
    } finally {
      this.isFlushInProgress = false;
      this.pendingFlushPromise = null;
    }
  }
  
  private async performFlush(): Promise<void> {
    const entriesToFlush = [...this.logBuffer];
    this.logBuffer = [];
    const previousBufferSize = this.bufferSizeBytes;
    this.bufferSizeBytes = 0;

    try {
      // Use SafeFileWriter for atomic operations
      const logLines = entriesToFlush.map(entry => JSON.stringify(entry)).join('\n') + '\n';
      await SafeFileWriter.appendFile(this.dailyLogFile, logLines);
      
      // Update checkpoint for recovery
      const checkpoint: SessionCheckpoint = {
        sessionId: this.sessionId,
        lastProcessedLine: this.logCount,
        lastEventSent: Date.now(),
        lastFlushTime: Date.now(),
        bufferSize: 0,
        clientConnections: [],
        terminalPid: process.pid
      };
      await SessionManager.saveCheckpoint(checkpoint);
      
      this.lastFlushTime = Date.now();
      
      this.logger.debug('Logs flushed successfully', {
        entriesCount: entriesToFlush.length,
        bufferSizeBytes: this.bufferSizeBytes,
        operation: 'flush'
      });
    } catch (error) {
      this.logger.logError('Failed to write logs to file', error as Error, {
        entriesCount: entriesToFlush.length,
        operation: 'flush'
      });
      
      // Put entries back if write failed, but only if the buffer is not full
      if (this.logBuffer.length + entriesToFlush.length <= SessionLogger.MAX_BUFFER_SIZE) {
        this.logBuffer.unshift(...entriesToFlush);
        this.bufferSizeBytes = previousBufferSize;
        this.logger.info('Log entries restored to buffer after failed write', {
          entriesRestored: entriesToFlush.length
        });
      } else {
        this.logger.warn('Buffer full, dropping log entries', {
          entriesDropped: entriesToFlush.length,
          bufferSize: this.logBuffer.length,
          maxBufferSize: SessionLogger.MAX_BUFFER_SIZE
        });
      }
      
      // Re-throw error to notify caller
      throw error;
    }
  }

  private async updateMetadata(): Promise<void> {
    // Find and update the metadata entry in the buffer
    const metadataIndex = this.logBuffer.findIndex(entry => 
      entry.sessionId === this.sessionId && entry.type === 'metadata'
    );
    
    if (metadataIndex !== -1) {
      this.logBuffer[metadataIndex] = {
        ...this.logBuffer[metadataIndex],
        metadata: this.metadata
      };
    } else {
      // Add new metadata entry if not found
      await this.addLogEntry({
        sessionId: this.sessionId,
        type: 'metadata',
        timestamp: Date.now(),
        metadata: this.metadata
      });
    }
  }

  async finalize(exitCode: number): Promise<void> {
    if (this.isClosed) {
      return;
    }

    // Stop periodic flush
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }

    // Update metadata
    this.metadata.endTime = Date.now();
    this.metadata.exitCode = exitCode;
    this.metadata.status = exitCode === 0 ? 'completed' : 'failed';

    // Update metadata in buffer
    await this.updateMetadata();

    // Add end log entry
    await this.log('end', `Session ${this.sessionId} ended with exit code ${exitCode}`, {
      exitCode,
      duration: this.metadata.endTime - this.metadata.startTime
    });

    // Final flush
    await this.flush();
    
    // Complete session in SessionManager
    await SessionManager.completeSession(this.sessionId, exitCode);
    
    // Clean up checkpoint
    await SessionManager.deleteCheckpoint(this.sessionId);

    this.isClosed = true;
  }

  getSessionId(): string {
    return this.sessionId;
  }

  getMetadata(): SessionMetadata {
    return { ...this.metadata };
  }

  // Static method to read session logs
  static async readSession(sessionId: string): Promise<{ metadata: SessionMetadata; logs: LogEntry[] }> {
    // Validate session ID
    validateSessionId(sessionId);
    
    const sessionsRoot = createSafeVibeKitPath('', 'sessions');
    // Use static logger since this is a static method
    const logger = createLogger('SessionLogger');
    logger.debug('Searching for session', { sessionId, sessionsRoot });
    logger.debug('Home directory', { homeDir: require('os').homedir() });
    
    // Read all daily log files to find the session
    const files = await fs.readdir(sessionsRoot);
    const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));
    
    let metadata: SessionMetadata | null = null;
    const logs: LogEntry[] = [];
    
    for (const file of jsonlFiles) {
      try {
        // Validate filename before using it
        validateDailyLogFilename(file);
        const filePath = createSafeVibeKitPath(file, 'sessions');
        const content = await fs.readFile(filePath, 'utf8');
        const lines = content.split('\n').filter(line => line.trim());
        
        for (const line of lines) {
          const entry = JSON.parse(line) as SessionLogEntry;
          
          if (entry.sessionId === sessionId) {
            if (entry.type === 'metadata') {
              metadata = entry.metadata as SessionMetadata;
            } else if (entry.type === 'log' && entry.logType && entry.data !== undefined) {
              logs.push({
                timestamp: entry.timestamp,
                type: entry.logType,
                data: entry.data,
                metadata: entry.metadata as LogEntry['metadata']
              });
            }
          }
        }
      } catch (error) {
        logger.error('Failed to read session file', error, { file });
      }
    }
    
    if (!metadata) {
      throw new Error(`Session ${sessionId} not found`);
    }
    
    return { metadata, logs };
  }

  // Static method to list recent sessions
  static async listSessions(limit = 10, projectId?: string): Promise<SessionMetadata[]> {
    const logger = createLogger('SessionLogger');
    const sessionsRoot = path.join(os.homedir(), '.vibekit', 'sessions');
    
    try {
      await fs.access(sessionsRoot);
    } catch {
      return [];
    }

    const files = await fs.readdir(sessionsRoot);
    const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));
    const sessions: SessionMetadata[] = [];

    for (const file of jsonlFiles) {
      try {
        const filePath = path.join(sessionsRoot, file);
        const content = await fs.readFile(filePath, 'utf8');
        const lines = content.split('\n').filter(line => line.trim());
        
        for (const line of lines) {
          const entry = JSON.parse(line) as SessionLogEntry;
          
          if (entry.type === 'metadata' && entry.metadata) {
            const sessionMetadata = entry.metadata as SessionMetadata;
            
            // Filter by projectId if provided
            if (projectId && sessionMetadata.projectId !== projectId) {
              continue;
            }
            
            sessions.push(sessionMetadata);
          }
        }
      } catch (error) {
        logger.error('Failed to read session file', error, { file });
      }
    }

    // Sort by start time descending and limit
    return sessions
      .sort((a, b) => b.startTime - a.startTime)
      .slice(0, limit);
  }

  // Static method to tail session logs (for real-time updates)
  static async tailSession(sessionId: string, fromLine = 0): Promise<{ logs: LogEntry[]; nextLine: number }> {
    const logger = createLogger('SessionLogger');
    const sessionsRoot = path.join(os.homedir(), '.vibekit', 'sessions');
    
    // Read all daily log files to find the session logs
    const files = await fs.readdir(sessionsRoot);
    const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));
    
    const allSessionLogs: LogEntry[] = [];
    
    for (const file of jsonlFiles) {
      try {
        const filePath = path.join(sessionsRoot, file);
        const content = await fs.readFile(filePath, 'utf8');
        const lines = content.split('\n').filter(line => line.trim());
        
        for (const line of lines) {
          const entry = JSON.parse(line) as SessionLogEntry;
          
          if (entry.sessionId === sessionId && entry.type === 'log' && 
              entry.logType && entry.data !== undefined) {
            allSessionLogs.push({
              timestamp: entry.timestamp,
              type: entry.logType,
              data: entry.data,
              metadata: entry.metadata as LogEntry['metadata']
            });
          }
        }
      } catch (error) {
        logger.error('Failed to read session file', error, { file });
      }
    }
    
    // Sort by timestamp
    allSessionLogs.sort((a, b) => a.timestamp - b.timestamp);
    
    if (fromLine >= allSessionLogs.length) {
      return { logs: [], nextLine: allSessionLogs.length };
    }

    const newLogs = allSessionLogs.slice(fromLine);
    return { logs: newLogs, nextLine: allSessionLogs.length };
  }
}