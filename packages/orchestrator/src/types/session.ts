export interface OrchestratorSession {
  id: string;
  epicId: string;
  epicName: string;
  startedAt: Date;
  lastActiveAt: Date;
  pausedAt?: Date;
  completedAt?: Date;
  status: 'active' | 'paused' | 'completed' | 'failed';
  
  // Progress tracking
  checkpoint: SessionCheckpoint;
  
  // Container and worktree state
  worktrees: WorktreeState[];
  containers: ContainerState[];
  
  // Configuration
  provider: {
    type: string;
    config: any;
  };
  
  // Metadata
  lastCheckpointId?: string;
  volumes: {
    workspace: string;
    gitCache: string;
    state: string;
    agentCache: string;
  };
}

export interface SessionCheckpoint {
  id: string;
  timestamp: Date;
  completedTasks: string[];
  inProgressTasks: TaskProgress[];
  pendingTasks: string[];
  lastSyncedAt: Date;
  gitCommits: Map<string, string>; // taskId -> commitHash
  pullRequests: Map<string, number>; // taskId -> PR number
  issueNumbers: Map<string, number>; // taskId -> Issue number
}

export interface TaskProgress {
  taskId: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'paused';
  startedAt?: Date;
  pausedAt?: Date;
  completedAt?: Date;
  checkpoints: TaskCheckpoint[];
  currentStep: number;
  totalSteps: number;
  percentComplete: number;
  artifacts: {
    commits: string[];
    files: string[];
    tests: TestResult[];
  };
  agentId?: string;
  worktreeId?: string;
  containerId?: string;
}

export interface TaskCheckpoint {
  id: string;
  timestamp: Date;
  step: number;
  description: string;
  artifacts: string[];
  gitCommit?: string;
}

export interface WorktreeState {
  id: string;
  path: string;
  branch: string;
  taskId: string;
  status: 'active' | 'completed' | 'merged' | 'abandoned';
  lastCommit?: string;
  uncommittedFiles?: string[];
  createdAt: Date;
  lastActiveAt: Date;
}

export interface ContainerState {
  id: string;
  taskId: string;
  agentType: string;
  image: string;
  status: 'running' | 'paused' | 'stopped' | 'failed';
  createdAt: Date;
  lastActiveAt: Date;
  resources: {
    cpu?: string;
    memory?: string;
    network?: boolean;
  };
  environment: Record<string, string>;
}

export interface TestResult {
  name: string;
  status: 'pass' | 'fail' | 'skip';
  duration?: number;
  error?: string;
}

export interface SessionSummary {
  id: string;
  epicId: string;
  epicName: string;
  status: string;
  startedAt: Date;
  lastActiveAt: Date;
  pausedAt?: Date;
  completedAt?: Date;
  progress: {
    completed: number;
    inProgress: number;
    pending: number;
    total: number;
  };
  provider: string;
}

export interface SessionIndex {
  sessions: SessionSummary[];
}