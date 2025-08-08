export interface SystemInfo {
  // Essential System Info
  machineId: string;         // unique machine identifier
  hostname: string;          // os.hostname()
  platform: string;         // os.platform()
  arch: string;              // os.arch()
  release: string;           // os.release()
  totalMemory: number;       // os.totalmem()
  cpuCores: number;          // os.cpus().length
  
  // Development Environment
  nodeVersion: string;       // process.version
  shell?: string;            // process.env.SHELL
  terminal?: string;         // process.env.TERM_PROGRAM
  gitVersion?: string;       // git --version
  
  // Project Context
  projectName?: string;      // project name from package.json, etc.
  projectLanguage?: string;  // detected from package.json, etc.
  projectType?: string;      // npm, cargo, gradle, etc.
  gitBranch?: string;        // current git branch
  gitStatus?: 'clean' | 'dirty'; // git working tree status
  projectFileCount?: number; // approximate file count
}

export interface AnalyticsSession {
  sessionId: string;
  agentName: string;
  startTime: number;
  endTime: number | null;
  duration: number | null;
  status?: 'active' | 'terminated';
  executionMode?: 'sandbox' | 'local';
  inputBytes: number;
  outputBytes: number;
  commands: Array<{
    command: string;
    args: string[];
    timestamp: number;
  }>;
  exitCode: number | null;
  filesChanged: string[];
  filesCreated: string[];
  filesDeleted: string[];
  errors: string[];
  warnings: string[];
  systemInfo: SystemInfo;
}

export interface AnalyticsSummary {
  totalSessions: number;
  activeSessions: number;
  totalDuration: number;
  averageDuration: number;
  successfulSessions: number;
  successRate: number;
  totalFilesChanged: number;
  totalErrors: number;
  totalWarnings: number;
  topErrors: Array<{ error: string; count: number }>;
  agentBreakdown: Record<string, {
    sessions: number;
    duration: number;
    successfulSessions: number;
    successRate: number;
    averageDuration: number;
  }>;
  // System environment breakdown
  machineBreakdown: Record<string, number>;
  hostnameBreakdown: Record<string, number>;
  platformBreakdown: Record<string, number>;
  nodeVersionBreakdown: Record<string, number>;
  projectLanguageBreakdown: Record<string, number>;
  terminalBreakdown: Record<string, number>;
}