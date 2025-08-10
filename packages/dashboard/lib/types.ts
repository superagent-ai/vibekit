export interface Project {
  id: string;
  name: string;
  projectRoot: string;
  agentName?: string;
  sandboxId?: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  lastAccessed?: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

export interface ProjectsConfig {
  version: string;
  projects: Project[];
  currentProjectId?: string;
}

export interface ProjectCreateInput {
  name: string;
  projectRoot: string;
  agentName?: string;
  sandboxId?: string;
  description?: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

export interface ProjectUpdateInput {
  name?: string;
  projectRoot?: string;
  agentName?: string;
  sandboxId?: string;
  description?: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

export interface AnalyticsSession {
  id: string;
  sessionId: string;
  projectId?: string;
  projectName?: string;
  agentName: string;
  executionMode?: 'sandbox' | 'local';
  status: 'active' | 'completed' | 'error';
  startTime: number;
  endTime?: number;
  duration?: number;
  exitCode?: number;
  filesChanged?: string[];
  filesCreated?: string[];
  filesDeleted?: string[];
  errors?: Array<{ message: string; timestamp: number }>;
  warnings?: Array<{ message: string; timestamp: number }>;
  commands?: Array<{ command: string; timestamp: number }>;
  systemInfo?: {
    gitBranch?: string;
    projectName?: string;
    workingDir?: string;
    hostname?: string;
  };
}

export interface AnalyticsSummary {
  totalSessions: number;
  activeSessions: number;
  totalDuration: number;
  averageDuration: number;
  successfulSessions: number;
  successRate: number;
  totalFilesChanged: number;
  totalFilesCreated: number;
  totalFilesDeleted: number;
  totalErrors: number;
  totalWarnings: number;
  dailyActivity: Array<{ date: string; sessions: number }>;
  recentSessions: AnalyticsSession[];
  mostChangedFiles: Array<{ file: string; changes: number }>;
  commonCommands: Array<{ command: string; count: number }>;
  agentBreakdown: Record<string, number>;
}