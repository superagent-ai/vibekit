import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

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
  taskTitle?: string;
  subtaskId?: string;
  subtaskTitle?: string;
  startTime: number;
  endTime?: number;
  status: 'running' | 'completed' | 'failed';
  exitCode?: number;
}

export class SessionLogger {
  private sessionId: string;
  private sessionDir: string;
  private logFile: string;
  private metadataFile: string;
  private metadata: SessionMetadata;
  private logBuffer: LogEntry[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  private isClosed = false;

  constructor(
    sessionId: string,
    agentName: string,
    metadata?: {
      projectId?: string;
      projectRoot?: string;
      taskId?: string;
      taskTitle?: string;
      subtaskId?: string;
      subtaskTitle?: string;
    }
  ) {
    this.sessionId = sessionId;
    
    // Create session directory structure
    const sessionsRoot = path.join(os.homedir(), '.vibekit', 'sessions');
    this.sessionDir = path.join(sessionsRoot, sessionId);
    this.logFile = path.join(this.sessionDir, 'execution.log');
    this.metadataFile = path.join(this.sessionDir, 'metadata.json');
    
    // Initialize metadata
    this.metadata = {
      sessionId,
      agentName,
      startTime: Date.now(),
      status: 'running',
      ...metadata
    };
  }

  async initialize(): Promise<void> {
    // Ensure session directory exists
    await fs.mkdir(this.sessionDir, { recursive: true });
    
    // Write initial metadata
    await this.saveMetadata();
    
    // Add start log entry
    await this.log('start', `Session ${this.sessionId} started for agent ${this.metadata.agentName}`, {
      agentName: this.metadata.agentName,
      projectId: this.metadata.projectId,
      taskId: this.metadata.taskId,
      subtaskId: this.metadata.subtaskId
    });
    
    // Start periodic flush every 100ms for faster real-time updates
    this.flushInterval = setInterval(() => {
      this.flush().catch(err => console.error('Failed to flush logs:', err));
    }, 100);
  }

  async log(type: LogEntry['type'], data: string, metadata?: LogEntry['metadata']): Promise<void> {
    if (this.isClosed) {
      console.warn('Attempting to log to closed session:', this.sessionId);
      return;
    }

    const entry: LogEntry = {
      timestamp: Date.now(),
      type,
      data,
      metadata
    };
    
    this.logBuffer.push(entry);
    
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

  private detectAndLogCommands(output: string): void {
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
        matches.forEach(match => {
          this.logBuffer.push({
            timestamp: Date.now(),
            type: 'command',
            data: match,
            metadata: { command, detected: true }
          });
        });
      }
    }
  }

  async captureUpdate(update: string): Promise<void> {
    console.log(`[SessionLogger] Capturing update for session ${this.sessionId}:`, update.substring(0, 200));
    
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
    if (this.logBuffer.length === 0 || this.isClosed) {
      return;
    }

    const entriesToFlush = [...this.logBuffer];
    this.logBuffer = [];

    try {
      // Append to log file with sync flag for immediate write
      const logLines = entriesToFlush.map(entry => JSON.stringify(entry)).join('\n') + '\n';
      await fs.appendFile(this.logFile, logLines, { flag: 'a' });
      
      // Force file system sync for immediate visibility
      const fileHandle = await fs.open(this.logFile, 'r+');
      await fileHandle.sync();
      await fileHandle.close();
      
      console.log(`[SessionLogger] Flushed ${entriesToFlush.length} logs for session ${this.sessionId}`, 
        entriesToFlush.map(e => `${e.type}: ${e.data.substring(0, 50)}`));
    } catch (error) {
      console.error('Failed to write logs:', error);
      // Put entries back if write failed
      this.logBuffer.unshift(...entriesToFlush);
    }
  }

  private async saveMetadata(): Promise<void> {
    await fs.writeFile(this.metadataFile, JSON.stringify(this.metadata, null, 2));
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

    // Add end log entry
    await this.log('end', `Session ${this.sessionId} ended with exit code ${exitCode}`, {
      exitCode,
      duration: this.metadata.endTime - this.metadata.startTime
    });

    // Final flush
    await this.flush();

    // Save final metadata
    await this.saveMetadata();

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
    const sessionsRoot = path.join(os.homedir(), '.vibekit', 'sessions');
    const sessionDir = path.join(sessionsRoot, sessionId);
    const logFile = path.join(sessionDir, 'execution.log');
    const metadataFile = path.join(sessionDir, 'metadata.json');

    // Read metadata
    const metadataContent = await fs.readFile(metadataFile, 'utf8');
    const metadata = JSON.parse(metadataContent) as SessionMetadata;

    // Read logs
    const logContent = await fs.readFile(logFile, 'utf8');
    const logs = logContent
      .split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line) as LogEntry);

    return { metadata, logs };
  }

  // Static method to list recent sessions
  static async listSessions(limit = 10): Promise<SessionMetadata[]> {
    const sessionsRoot = path.join(os.homedir(), '.vibekit', 'sessions');
    
    try {
      await fs.access(sessionsRoot);
    } catch {
      return [];
    }

    const sessionDirs = await fs.readdir(sessionsRoot);
    const sessions: SessionMetadata[] = [];

    for (const dir of sessionDirs) {
      try {
        const metadataFile = path.join(sessionsRoot, dir, 'metadata.json');
        const content = await fs.readFile(metadataFile, 'utf8');
        sessions.push(JSON.parse(content));
      } catch {
        // Skip invalid sessions
      }
    }

    // Sort by start time descending and limit
    return sessions
      .sort((a, b) => b.startTime - a.startTime)
      .slice(0, limit);
  }

  // Static method to tail session logs (for real-time updates)
  static async tailSession(sessionId: string, fromLine = 0): Promise<{ logs: LogEntry[]; nextLine: number }> {
    const sessionsRoot = path.join(os.homedir(), '.vibekit', 'sessions');
    const logFile = path.join(sessionsRoot, sessionId, 'execution.log');

    try {
      const content = await fs.readFile(logFile, 'utf8');
      const lines = content.split('\n').filter(line => line.trim());
      
      if (fromLine >= lines.length) {
        return { logs: [], nextLine: lines.length };
      }

      const newLogs = lines
        .slice(fromLine)
        .map(line => JSON.parse(line) as LogEntry);

      return { logs: newLogs, nextLine: lines.length };
    } catch {
      return { logs: [], nextLine: fromLine };
    }
  }
}