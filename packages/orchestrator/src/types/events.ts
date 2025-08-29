export interface OrchestrationEvent {
  id: string;
  type: string;
  timestamp: string;
  sessionId?: string;
  correlationId?: string;
  data: any;
  relationships?: {
    epicId?: string;
    taskId?: string;
    agentId?: string;
    worktreeId?: string;
    containerId?: string;
    prNumber?: number;
    issueNumber?: number;
  };
}

export interface ReadOptions {
  filter?: (event: OrchestrationEvent) => boolean;
  since?: Date;
  until?: Date;
  limit?: number;
}

// Event types for different orchestration activities
export enum OrchestrationEventType {
  // Session events
  SESSION_CREATED = 'session.created',
  SESSION_STARTED = 'session.started',
  SESSION_PAUSED = 'session.paused',
  SESSION_RESUMED = 'session.resumed',
  SESSION_COMPLETED = 'session.completed',
  SESSION_FAILED = 'session.failed',
  
  // Task events
  TASK_STARTED = 'task.started',
  TASK_ASSIGNED_TO_AGENT = 'task.assigned',
  TASK_PROGRESS = 'task.progress',
  TASK_COMPLETED = 'task.completed',
  TASK_FAILED = 'task.failed',
  
  // Agent events
  AGENT_SPAWNED = 'agent.spawned',
  AGENT_STARTED = 'agent.started',
  AGENT_EXECUTING = 'agent.executing',
  AGENT_OUTPUT = 'agent.output',
  AGENT_COMPLETED = 'agent.completed',
  AGENT_FAILED = 'agent.failed',
  
  // Worktree events
  WORKTREE_CREATED = 'worktree.created',
  WORKTREE_UPDATED = 'worktree.updated',
  WORKTREE_COMMITTED = 'worktree.committed',
  WORKTREE_MERGED = 'worktree.merged',
  WORKTREE_DELETED = 'worktree.deleted',
  
  // Container events
  CONTAINER_STARTED = 'container.started',
  CONTAINER_PAUSED = 'container.paused',
  CONTAINER_RESUMED = 'container.resumed',
  CONTAINER_STOPPED = 'container.stopped',
  CONTAINER_FAILED = 'container.failed',
  
  // Sandbox events
  SANDBOX_INITIALIZED = 'sandbox.initialized',
  SANDBOX_CLEANUP = 'sandbox.cleanup',
  
  // GitHub events
  ISSUE_CREATED = 'github.issue.created',
  ISSUE_UPDATED = 'github.issue.updated',
  PR_CREATED = 'github.pr.created',
  PR_MERGED = 'github.pr.merged',
  PR_CLOSED = 'github.pr.closed',
  
  // Provider events
  PROVIDER_CONNECTED = 'provider.connected',
  PROVIDER_ERROR = 'provider.error',
  PROVIDER_SYNC = 'provider.sync'
}