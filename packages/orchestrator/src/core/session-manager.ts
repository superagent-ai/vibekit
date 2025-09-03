import { JSONStateStore } from '../storage/json-state-store';
import { JSONLEventStore } from '../storage/jsonl-event-store';
import { 
  OrchestratorSession, 
  SessionSummary, 
  SessionIndex, 
  SessionCheckpoint,
  CreateSessionOptions,
  SessionFilters
} from '../types/session';
import { OrchestrationEventType } from '../types/events';

export class SessionManager {
  private stateStore = new JSONStateStore();
  private eventStore = new JSONLEventStore();

  async createSession(options: CreateSessionOptions): Promise<OrchestratorSession> {
    const sessionId = this.generateSessionId();
    const now = new Date();

    // Handle task creation if requested
    let taskId = options.taskId;
    let taskName = options.taskName;
    
    if (options.createNewTask && !taskId) {
      const newTask = await this.createNewTask(options.createNewTask, options.provider);
      taskId = newTask.id;
      taskName = newTask.title;
    } else if (taskId && !taskName) {
      taskName = await this.getTaskName(taskId, options.provider);
    }

    if (!taskId) {
      throw new Error('Either taskId or createNewTask must be provided');
    }

    const session: OrchestratorSession = {
      id: sessionId,
      taskId: taskId,
      taskName: taskName || `Task ${taskId}`,
      taskTag: options.taskTag,
      startedAt: now,
      lastActiveAt: now,
      status: 'active',
      
      checkpoint: {
        id: this.generateCheckpointId(),
        timestamp: now,
        completedTasks: [],
        inProgressTasks: [],
        pendingTasks: [],
        lastSyncedAt: now,
        gitCommits: new Map(),
        pullRequests: new Map(),
        issueNumbers: new Map()
      },
      
      worktrees: [],
      containers: [],
      
      provider: options.provider,
      
      volumes: {
        workspace: `vibekit-workspace-${sessionId}`,
        gitCache: `vibekit-git-${sessionId}`,
        state: `vibekit-state-${sessionId}`,
        agentCache: `vibekit-agents-${sessionId}`
      }
    };

    // Save session
    await this.saveSession(session);

    // Log creation event
    await this.eventStore.appendEvent(`sessions/${sessionId}`, {
      id: this.generateEventId(),
      type: OrchestrationEventType.SESSION_CREATED,
      timestamp: now.toISOString(),
      sessionId: sessionId,
      data: { 
        taskId: session.taskId,
        taskName: session.taskName,
        taskTag: session.taskTag,
        provider: options.provider.type,
        volumes: session.volumes
      }
    });

    return session;
  }

  async saveSession(session: OrchestratorSession): Promise<void> {
    // Update last active timestamp
    session.lastActiveAt = new Date();

    // Save main session state
    await this.stateStore.saveState(`sessions/${session.id}/state`, session);

    // Update session index
    await this.updateSessionIndex(session);

    // Log session update event
    await this.eventStore.appendEvent(`sessions/${session.id}`, {
      id: this.generateEventId(),
      type: 'session.updated',
      timestamp: new Date().toISOString(),
      sessionId: session.id,
      data: { 
        status: session.status,
        progress: this.calculateProgress(session)
      }
    });
  }

  async loadSession(sessionId: string): Promise<OrchestratorSession | null> {
    const session = await this.stateStore.loadState<OrchestratorSession>(`sessions/${sessionId}/state`);
    if (!session) return null;
    
    // Ensure dates are properly restored
    return this.ensureDatesRestored(session);
  }

  private ensureDatesRestored(session: any): OrchestratorSession {
    // Restore top-level dates
    if (typeof session.startedAt === 'string') {
      session.startedAt = new Date(session.startedAt);
    }
    if (typeof session.lastActiveAt === 'string') {
      session.lastActiveAt = new Date(session.lastActiveAt);
    }
    if (session.pausedAt && typeof session.pausedAt === 'string') {
      session.pausedAt = new Date(session.pausedAt);
    }
    if (session.completedAt && typeof session.completedAt === 'string') {
      session.completedAt = new Date(session.completedAt);
    }

    // Restore checkpoint dates
    if (session.checkpoint) {
      if (typeof session.checkpoint.timestamp === 'string') {
        session.checkpoint.timestamp = new Date(session.checkpoint.timestamp);
      }
      if (typeof session.checkpoint.lastSyncedAt === 'string') {
        session.checkpoint.lastSyncedAt = new Date(session.checkpoint.lastSyncedAt);
      }

      // Restore task progress dates
      if (session.checkpoint.inProgressTasks) {
        session.checkpoint.inProgressTasks.forEach((task: any) => {
          if (task.startedAt && typeof task.startedAt === 'string') {
            task.startedAt = new Date(task.startedAt);
          }
          if (task.pausedAt && typeof task.pausedAt === 'string') {
            task.pausedAt = new Date(task.pausedAt);
          }
          if (task.completedAt && typeof task.completedAt === 'string') {
            task.completedAt = new Date(task.completedAt);
          }

          // Restore checkpoint dates
          if (task.checkpoints) {
            task.checkpoints.forEach((checkpoint: any) => {
              if (typeof checkpoint.timestamp === 'string') {
                checkpoint.timestamp = new Date(checkpoint.timestamp);
              }
            });
          }
        });
      }
    }

    // Restore worktree dates
    if (session.worktrees) {
      session.worktrees.forEach((worktree: any) => {
        if (typeof worktree.createdAt === 'string') {
          worktree.createdAt = new Date(worktree.createdAt);
        }
        if (typeof worktree.lastActiveAt === 'string') {
          worktree.lastActiveAt = new Date(worktree.lastActiveAt);
        }
      });
    }

    // Restore container dates
    if (session.containers) {
      session.containers.forEach((container: any) => {
        if (typeof container.createdAt === 'string') {
          container.createdAt = new Date(container.createdAt);
        }
        if (typeof container.lastActiveAt === 'string') {
          container.lastActiveAt = new Date(container.lastActiveAt);
        }
      });
    }

    return session as OrchestratorSession;
  }

  async pauseSession(sessionId: string): Promise<void> {
    const session = await this.loadSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (session.status === 'paused') {
      return; // Already paused
    }

    const now = new Date();
    session.status = 'paused';
    session.pausedAt = now;
    session.lastActiveAt = now;

    // Create checkpoint before pausing
    await this.createCheckpoint(session);

    await this.saveSession(session);

    // Log pause event
    await this.eventStore.appendEvent(`sessions/${sessionId}`, {
      id: this.generateEventId(),
      type: OrchestrationEventType.SESSION_PAUSED,
      timestamp: now.toISOString(),
      sessionId,
      data: { checkpointId: session.checkpoint.id }
    });
  }

  async resumeSession(sessionId: string): Promise<OrchestratorSession> {
    const session = await this.loadSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (session.status === 'active') {
      return session; // Already active
    }

    const now = new Date();
    const resumedFrom = session.pausedAt;
    session.status = 'active';
    session.pausedAt = undefined;
    session.lastActiveAt = now;

    await this.saveSession(session);

    // Log resume event
    await this.eventStore.appendEvent(`sessions/${sessionId}`, {
      id: this.generateEventId(),
      type: OrchestrationEventType.SESSION_RESUMED,
      timestamp: now.toISOString(),
      sessionId,
      data: { 
        checkpointId: session.checkpoint.id,
        resumedFrom: resumedFrom ? resumedFrom.toISOString() : undefined
      }
    });

    return session;
  }

  async completeSession(sessionId: string): Promise<void> {
    const session = await this.loadSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const now = new Date();
    session.status = 'completed';
    session.completedAt = now;
    session.lastActiveAt = now;

    // Create final checkpoint
    await this.createCheckpoint(session);

    await this.saveSession(session);

    // Log completion event
    await this.eventStore.appendEvent(`sessions/${sessionId}`, {
      id: this.generateEventId(),
      type: OrchestrationEventType.SESSION_COMPLETED,
      timestamp: now.toISOString(),
      sessionId,
      data: { 
        duration: now.getTime() - session.startedAt.getTime(),
        finalCheckpointId: session.checkpoint.id,
        progress: this.calculateProgress(session)
      }
    });
  }

  async failSession(sessionId: string, reason: string): Promise<void> {
    const session = await this.loadSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const now = new Date();
    session.status = 'failed';
    session.lastActiveAt = now;

    // Create checkpoint with failure state
    await this.createCheckpoint(session);

    await this.saveSession(session);

    // Log failure event
    await this.eventStore.appendEvent(`sessions/${sessionId}`, {
      id: this.generateEventId(),
      type: OrchestrationEventType.SESSION_FAILED,
      timestamp: now.toISOString(),
      sessionId,
      data: { 
        reason,
        checkpointId: session.checkpoint.id,
        progress: this.calculateProgress(session)
      }
    });
  }

  async deleteSession(sessionId: string): Promise<void> {
    const session = await this.loadSession(sessionId);
    if (!session) {
      return; // Session doesn't exist
    }

    // Delete all session-related state
    await this.stateStore.deleteState(`sessions/${sessionId}/state`);
    
    // Delete checkpoints
    const checkpoints = await this.stateStore.listStates(`checkpoints/${sessionId}/`);
    for (const checkpointKey of checkpoints) {
      await this.stateStore.deleteState(checkpointKey);
    }

    // Remove from session index
    const index = await this.stateStore.loadState<SessionIndex>('sessions/index') || { 
      sessions: [], 
      lastUpdated: new Date() 
    };
    
    index.sessions = index.sessions.filter(s => s.id !== sessionId);
    index.lastUpdated = new Date();
    
    await this.stateStore.saveState('sessions/index', index);

    // Log deletion event (to a global stream, not session-specific)
    await this.eventStore.appendEvent('system/sessions', {
      id: this.generateEventId(),
      type: 'session.deleted',
      timestamp: new Date().toISOString(),
      sessionId,
      data: { taskId: session.taskId, taskName: session.taskName, taskTag: session.taskTag }
    });
  }

  async listSessions(filters?: SessionFilters): Promise<SessionSummary[]> {
    const index = await this.stateStore.loadState<SessionIndex>('sessions/index') || { 
      sessions: [], 
      lastUpdated: new Date() 
    };
    
    let sessions = [...index.sessions];

    // Apply filters
    if (filters) {
      if (filters.status) {
        sessions = sessions.filter(s => s.status === filters.status);
      }
      if (filters.provider) {
        sessions = sessions.filter(s => s.provider === filters.provider);
      }
      if (filters.taskId) {
        sessions = sessions.filter(s => s.taskId === filters.taskId);
      }
      if (filters.taskTag) {
        sessions = sessions.filter(s => s.taskTag === filters.taskTag);
      }
      if (filters.since) {
        sessions = sessions.filter(s => new Date(s.startedAt) >= filters.since!);
      }
      if (filters.until) {
        sessions = sessions.filter(s => new Date(s.startedAt) <= filters.until!);
      }
    }

    return sessions;
  }

  async createCheckpoint(session: OrchestratorSession): Promise<SessionCheckpoint> {
    const checkpointId = this.generateCheckpointId();
    const now = new Date();

    const checkpoint: SessionCheckpoint = {
      id: checkpointId,
      timestamp: now,
      completedTasks: [...session.checkpoint.completedTasks],
      inProgressTasks: [...session.checkpoint.inProgressTasks],
      pendingTasks: [...session.checkpoint.pendingTasks],
      lastSyncedAt: now,
      gitCommits: new Map(session.checkpoint.gitCommits),
      pullRequests: new Map(session.checkpoint.pullRequests),
      issueNumbers: new Map(session.checkpoint.issueNumbers)
    };

    // Save checkpoint
    await this.stateStore.saveState(`checkpoints/${session.id}/${checkpointId}`, checkpoint);

    // Update session's current checkpoint
    session.checkpoint = checkpoint;
    session.lastCheckpointId = checkpointId;

    // Log checkpoint creation
    await this.eventStore.appendEvent(`sessions/${session.id}`, {
      id: this.generateEventId(),
      type: 'session.checkpoint_created',
      timestamp: now.toISOString(),
      sessionId: session.id,
      data: { 
        checkpointId,
        progress: this.calculateProgress(session)
      }
    });

    return checkpoint;
  }

  async restoreFromCheckpoint(sessionId: string, checkpointId: string): Promise<OrchestratorSession> {
    const session = await this.loadSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const checkpoint = await this.stateStore.loadState<SessionCheckpoint>(
      `checkpoints/${sessionId}/${checkpointId}`
    );
    if (!checkpoint) {
      throw new Error(`Checkpoint ${checkpointId} not found for session ${sessionId}`);
    }

    // Restore checkpoint
    session.checkpoint = checkpoint;
    session.lastCheckpointId = checkpointId;
    session.lastActiveAt = new Date();

    await this.saveSession(session);

    // Log restoration
    await this.eventStore.appendEvent(`sessions/${sessionId}`, {
      id: this.generateEventId(),
      type: 'session.checkpoint_restored',
      timestamp: new Date().toISOString(),
      sessionId,
      data: { 
        checkpointId,
        restoredAt: checkpoint.timestamp.toISOString()
      }
    });

    return session;
  }

  async listCheckpoints(sessionId: string): Promise<SessionCheckpoint[]> {
    const checkpointKeys = await this.stateStore.listStates(`checkpoints/${sessionId}/`);
    const checkpoints: SessionCheckpoint[] = [];

    for (const key of checkpointKeys) {
      const checkpoint = await this.stateStore.loadState<SessionCheckpoint>(key);
      if (checkpoint) {
        checkpoints.push(checkpoint);
      }
    }

    // Sort by timestamp (newest first)
    return checkpoints.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  private async updateSessionIndex(session: OrchestratorSession): Promise<void> {
    const index = await this.stateStore.loadState<SessionIndex>('sessions/index') || { 
      sessions: [], 
      lastUpdated: new Date() 
    };
    
    const summary: SessionSummary = {
      id: session.id,
      taskId: session.taskId,
      taskName: session.taskName,
      taskTag: session.taskTag,
      status: session.status,
      startedAt: session.startedAt,
      lastActiveAt: session.lastActiveAt,
      pausedAt: session.pausedAt,
      completedAt: session.completedAt,
      progress: this.calculateProgress(session),
      provider: session.provider.type
    };
    
    const existingIndex = index.sessions.findIndex(s => s.id === session.id);
    if (existingIndex >= 0) {
      index.sessions[existingIndex] = summary;
    } else {
      index.sessions.push(summary);
    }
    
    // Sort by last active (newest first)
    index.sessions.sort((a, b) => 
      new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime()
    );

    index.lastUpdated = new Date();
    
    await this.stateStore.saveState('sessions/index', index);
  }

  private calculateProgress(session: OrchestratorSession) {
    const completed = session.checkpoint.completedTasks.length;
    const inProgress = session.checkpoint.inProgressTasks.length;
    const pending = session.checkpoint.pendingTasks.length;
    const total = completed + inProgress + pending;

    return { completed, inProgress, pending, total };
  }

  private generateSessionId(): string {
    return `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateCheckpointId(): string {
    return `chkpt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private async getTaskName(taskId: string, provider: any): Promise<string> {
    // Get task name from provider
    try {
      const task = await provider.getTask?.(taskId);
      return task?.title || `Task ${taskId}`;
    } catch {
      return `Task ${taskId}`;
    }
  }

  private async createNewTask(taskData: { title: string; description: string; tag?: string }, provider: any): Promise<{ id: string; title: string }> {
    // Create new task via provider
    try {
      const task = await provider.createTask({
        title: taskData.title,
        description: taskData.description,
        tags: taskData.tag ? [taskData.tag] : undefined,
        priority: 'medium',
        status: 'pending'
      });
      return { id: task.id, title: task.title };
    } catch (error) {
      throw new Error(`Failed to create task: ${error instanceof Error ? error.message : error}`);
    }
  }
}